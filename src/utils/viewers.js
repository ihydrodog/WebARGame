/**
 * 뷰어 통합 모듈
 * - TreasureInfoViewer: 보물 목록·카드 UI
 * - DetectionOverlayView: bbox + 이미지(비디오) 오버레이 (contain/cover, ResizeObserver, 예측·세그먼트 그리기)
 */

// --- TreasureInfoViewer ---

function escapeHtml(str) {
  if (str == null || typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 보물 정보 뷰어: 보물 목록·카드 UI 렌더링
 */
export class TreasureInfoViewer {
  static renderCard(treasure, index) {
    const order = index + 1;
    const thumb = treasure.capturedImage
      ? `<img class="treasure-card-thumb" src="${escapeHtml(treasure.capturedImage)}" alt="">`
      : '<div class="treasure-card-thumb placeholder">📷</div>';
    const name = escapeHtml(treasure.name || `보물 ${order}`);
    const objectLine = treasure.detectedObject
      ? `<span class="treasure-object">🎯 ${escapeHtml(treasure.detectedObject)}</span>`
      : '';

    return `
    <div class="treasure-card" data-index="${index}">
      <div class="treasure-card-body">
        ${thumb}
        <div class="treasure-card-info">
          <span class="treasure-order">${order}</span>
          <span class="treasure-name">${name}</span>
          ${objectLine}
        </div>
      </div>
      <div class="treasure-card-actions">
        <button class="btn btn-secondary btn-small btn-edit">수정</button>
        <button class="btn btn-danger btn-small btn-delete">삭제</button>
      </div>
    </div>
  `;
  }

  static renderList(items, emptyMessage = '등록된 보물이 없습니다.') {
    if (!items || items.length === 0) {
      return `<p class="empty-message">${escapeHtml(emptyMessage)}</p>`;
    }
    return items.map((treasure, index) => TreasureInfoViewer.renderCard(treasure, index)).join('');
  }
}

// --- DetectionOverlayView (bbox-overlay) ---

const MAX_LAYOUT_RETRIES = 60;
const HATCH_SPACING = 10;

function normalizeMaskForDraw(idata, targetWidth, targetHeight) {
  const w = idata.width;
  const h = idata.height;
  const data = idata.data;
  let opaqueCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 128) opaqueCount++;
  }
  const total = w * h;
  const invert = opaqueCount > total * 0.5;
  const needResize = w !== targetWidth || h !== targetHeight;
  if (!invert && !needResize) return idata;

  const out = new ImageData(targetWidth, targetHeight);
  const outData = out.data;
  if (!needResize) {
    for (let i = 0; i < data.length; i += 4) {
      outData[i] = 0;
      outData[i + 1] = 0;
      outData[i + 2] = 0;
      outData[i + 3] = invert ? 255 - data[i + 3] : data[i + 3];
    }
    return out;
  }
  const scaleX = (w - 1) / Math.max(1, targetWidth - 1);
  const scaleY = (h - 1) / Math.max(1, targetHeight - 1);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(Math.floor(x * scaleX), w - 1);
      const sy = Math.min(Math.floor(y * scaleY), h - 1);
      const i = (sy * w + sx) * 4;
      let a = data[i + 3];
      if (invert) a = 255 - a;
      const o = (y * targetWidth + x) * 4;
      outData[o] = 0;
      outData[o + 1] = 0;
      outData[o + 2] = 0;
      outData[o + 3] = a;
    }
  }
  return out;
}

function drawSegmentMask(ctx, maskImageData, imgWidth, imgHeight, displayWidth, displayHeight, bbox, fillStyle = 'rgba(99, 102, 241, 0.12)', strokeStyle = '#6366f1') {
  if (!maskImageData || !imgWidth || !imgHeight) return;
  const normalized = normalizeMaskForDraw(maskImageData, imgWidth, imgHeight);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = imgWidth;
  maskCanvas.height = imgHeight;
  maskCanvas.getContext('2d').putImageData(normalized, 0, 0);
  const scaleX = displayWidth / imgWidth;
  const scaleY = displayHeight / imgHeight;
  const d = Math.hypot(displayWidth, displayHeight);

  ctx.save();
  ctx.drawImage(maskCanvas, 0, 0, imgWidth, imgHeight, 0, 0, displayWidth, displayHeight);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.5;
  for (let i = -d; i <= d; i += HATCH_SPACING) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + d, d);
    ctx.stroke();
  }
  ctx.restore();

  if (bbox && bbox.length >= 4) {
    const [x, y, w, h] = bbox;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
  }
}

function iouOf(a, b) {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const ix = Math.max(ax, bx);
  const iy = Math.max(ay, by);
  const iw = Math.max(0, Math.min(ax + aw, bx + bw) - ix);
  const ih = Math.max(0, Math.min(ay + ah, by + bh) - iy);
  const inter = iw * ih;
  const areaA = aw * ah;
  const areaB = bw * bh;
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

function matchPredictionsToSegmentMasks(predictions, segmentMasks) {
  const map = new Map();
  if (!segmentMasks.length) return map;
  const used = new Set();
  for (let i = 0; i < predictions.length; i++) {
    const predBox = predictions[i].bbox;
    let bestJ = -1;
    let bestIoU = 0;
    for (let j = 0; j < segmentMasks.length; j++) {
      if (used.has(j)) continue;
      const iou = iouOf(predBox, segmentMasks[j].bbox);
      if (iou > bestIoU) {
        bestIoU = iou;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestIoU > 0.2) {
      map.set(i, bestJ);
      used.add(bestJ);
    }
  }
  return map;
}

function drawPredictionsWithSegments(ctx, predictions, segmentMasks, opts = {}) {
  const sourceWidth = opts.sourceWidth || 1;
  const sourceHeight = opts.sourceHeight || 1;
  const displayWidth = opts.displayWidth || 1;
  const displayHeight = opts.displayHeight || 1;
  const translateClass = opts.translateClass || (c => c);
  const scoreThreshold = opts.scoreThreshold ?? 0.5;
  const withIndex = opts.withIndex === true;
  const getStyle = opts.getStyle || null;

  const filtered = (predictions || []).filter(p => (p.score ?? 1) >= scoreThreshold);
  if (!filtered.length) return;

  const scaleX = displayWidth / sourceWidth;
  const scaleY = displayHeight / sourceHeight;
  const predToSegment = matchPredictionsToSegmentMasks(filtered, segmentMasks || []);

  filtered.forEach((pred, idx) => {
    const segmentIdx = predToSegment.get(idx);
    const hasSegment = segmentIdx !== undefined && segmentMasks?.[segmentIdx];
    const style = getStyle ? getStyle(pred, idx) : { fillStyle: 'rgba(99, 102, 241, 0.35)', strokeStyle: '#6366f1' };
    const fillStyle = style?.fillStyle ?? 'rgba(99, 102, 241, 0.35)';
    const strokeStyle = style?.strokeStyle ?? '#6366f1';

    if (hasSegment) {
      const { mask, bbox } = segmentMasks[segmentIdx];
      drawSegmentMask(ctx, mask, sourceWidth, sourceHeight, displayWidth, displayHeight, bbox, fillStyle, strokeStyle);
    } else {
      const [x, y, width, height] = pred.bbox;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = style?.lineWidth ?? 3;
      ctx.strokeRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
    }

    const [x, y, width, height] = pred.bbox;
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const scaledHeight = height * scaleY;
    const scorePct = Math.round((pred.score ?? 0) * 100);
    const label = withIndex
      ? `${idx + 1}. ${translateClass(pred.class)} (${scorePct}%)`
      : `${translateClass(pred.class)} ${scorePct}%`;
    ctx.font = 'bold 14px sans-serif';
    const labelWidth = ctx.measureText(label).width + 10;
    const labelY = scaledY > 25 ? scaledY - 5 : scaledY + scaledHeight + 20;
    ctx.fillStyle = strokeStyle;
    ctx.fillRect(scaledX, labelY - 20, labelWidth, 25);
    ctx.fillStyle = 'white';
    ctx.fillText(label, scaledX + 5, labelY - 2);
  });
}

export function getContainDisplayRect(clientW, clientH, sourceW, sourceH) {
  if (!sourceW || !sourceH) return { displayWidth: clientW, displayHeight: clientH, offsetX: 0, offsetY: 0 };
  const scale = Math.min(clientW / sourceW, clientH / sourceH);
  const w = sourceW * scale;
  const h = sourceH * scale;
  return {
    displayWidth: w,
    displayHeight: h,
    offsetX: (clientW - w) / 2,
    offsetY: (clientH - h) / 2
  };
}

export function getCoverDisplayRect(clientW, clientH, sourceW, sourceH) {
  if (!sourceW || !sourceH) return { scale: 1, srcX: 0, srcY: 0, displayWidth: clientW, displayHeight: clientH };
  const scale = Math.max(clientW / sourceW, clientH / sourceH);
  const displayW = sourceW * scale;
  const displayH = sourceH * scale;
  const srcX = (sourceW - clientW / scale) / 2;
  const srcY = (sourceH - clientH / scale) / 2;
  return { scale, srcX, srcY, displayWidth: displayW, displayHeight: displayH };
}

/**
 * bbox + 이미지(비디오) 오버레이. ResizeObserver·레이아웃 재시도·예측·세그먼트 그리기 포함.
 */
export class DetectionOverlayView {
  constructor(container, overlayCanvas, options = {}) {
    this.container = container;
    this.overlay = overlayCanvas;
    this.fit = options.fit || 'contain';
    this.translateClass = options.translateClass || (c => c);
    this.sourceWidth = 0;
    this.sourceHeight = 0;
    this.predictions = [];
    this.segmentMasks = [];
    this.drawOpts = {};
    this._layoutRetries = 0;
    this.resizeObserver = new ResizeObserver(() => this.render());
    if (container) this.resizeObserver.observe(container);
  }

  setSourceSize(width, height) {
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.render();
  }

  setContent(predictions, segmentMasks, drawOpts = {}) {
    this.predictions = predictions || [];
    this.segmentMasks = segmentMasks || [];
    this.drawOpts = drawOpts;
    this.render();
  }

  render() {
    if (!this.overlay || !this.container) return;
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    if (!cw || !ch) {
      if (this._layoutRetries < MAX_LAYOUT_RETRIES) {
        this._layoutRetries++;
        requestAnimationFrame(() => this.render());
      }
      return;
    }
    this._layoutRetries = 0;
    const ctx = this.overlay.getContext('2d');
    this.overlay.width = cw;
    this.overlay.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    if (!this.sourceWidth || !this.sourceHeight) return;

    const opts = {
      ...this.drawOpts,
      translateClass: this.translateClass,
      sourceWidth: this.sourceWidth,
      sourceHeight: this.sourceHeight
    };

    if (this.fit === 'contain') {
      const rect = getContainDisplayRect(cw, ch, this.sourceWidth, this.sourceHeight);
      ctx.save();
      ctx.translate(rect.offsetX, rect.offsetY);
      ctx.beginPath();
      ctx.rect(0, 0, rect.displayWidth, rect.displayHeight);
      ctx.clip();
      drawPredictionsWithSegments(ctx, this.predictions, this.segmentMasks, {
        ...opts,
        displayWidth: rect.displayWidth,
        displayHeight: rect.displayHeight
      });
      ctx.restore();
    } else {
      const rect = getCoverDisplayRect(cw, ch, this.sourceWidth, this.sourceHeight);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.clip();
      ctx.translate(-rect.srcX * rect.scale, -rect.srcY * rect.scale);
      drawPredictionsWithSegments(ctx, this.predictions, this.segmentMasks, {
        ...opts,
        displayWidth: rect.displayWidth,
        displayHeight: rect.displayHeight
      });
      ctx.restore();
    }
  }

  clear() {
    if (!this.overlay) return;
    const cw = this.overlay.width;
    const ch = this.overlay.height;
    if (cw && ch) {
      const ctx = this.overlay.getContext('2d');
      ctx.clearRect(0, 0, cw, ch);
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.container = null;
    this.overlay = null;
  }
}
