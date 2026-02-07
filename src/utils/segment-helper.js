/**
 * Segment-based detection (bbox 대신 세그먼트). 매칭된 모든 클래스에 세그먼트 표시.
 * body-segmentation은 person 마스크만 제공; IoU로 예측과 매칭하여 해당 영역에 빗금 등으로 그림.
 */

let segmenter = null;
let segmenterLoadPromise = null;

/**
 * Check if body-segmentation is available on window (script loaded).
 * @returns {boolean}
 */
export function isSegmentAvailable() {
  return typeof window !== 'undefined' && typeof window.bodySegmentation !== 'undefined';
}

/**
 * 해당 클래스에 대해 세그먼트 기반 히트/bbox 사용 가능 여부 (현재 person만 세그먼터 모델 지원).
 * @param {string} className - e.g. 'person', 'cell phone'
 * @returns {boolean}
 */
export function isSegmentAvailableForClass(className) {
  return className === 'person' && isSegmentAvailable();
}

/**
 * Load segmenter (BodyPix or MediaPipe). Resolves to null if not available or load fails.
 * @returns {Promise<object|null>}
 */
export async function loadSegmenter() {
  if (segmenter) return segmenter;
  if (segmenterLoadPromise) return segmenterLoadPromise;
  segmenterLoadPromise = (async () => {
    if (!isSegmentAvailable()) return null;
    try {
      const bodySegmentation = window.bodySegmentation;
      const BodyPix = bodySegmentation.SupportedModels?.BodyPix;
      const MediaPipe = bodySegmentation.SupportedModels?.MediaPipeSelfieSegmentation;
      const model = BodyPix ?? MediaPipe;
      if (!model) return null;
      const config = BodyPix
        ? { architecture: 'MobileNetV1', outputStride: 16, multiplier: 0.75 }
        : { runtime: 'tfjs', modelType: 'general' };
      segmenter = await bodySegmentation.createSegmenter(model, config);
      return segmenter;
    } catch (e) {
      console.warn('Segmenter load failed:', e);
      return null;
    }
  })();
  return segmenterLoadPromise;
}

/**
 * Get ImageData from a segmentation mask (mask may have toImageData or similar).
 * @param {object} segmentation - one element from segmentPeople()
 * @returns {Promise<ImageData|null>}
 */
async function maskToImageData(segmentation) {
  const mask = segmentation?.mask;
  if (!mask) return null;
  if (typeof mask.toImageData === 'function') {
    const out = mask.toImageData();
    return out && typeof out.then === 'function' ? out : Promise.resolve(out);
  }
  if (typeof mask.getUnderlyingType === 'function' && mask.getUnderlyingType() === 'imagedata') {
    return mask;
  }
  return null;
}

/**
 * Compute bbox [x, y, width, height] from mask ImageData (pixels where alpha > 0).
 * @param {ImageData} imageData
 * @param {number} width
 * @param {number} height
 * @returns {number[]|null} [x, y, w, h] or null if empty
 */
function maskToBbox(imageData, width, height) {
  const data = imageData.data;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasPixel = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (alpha > 128) {
        hasPixel = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!hasPixel) return null;
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

/**
 * Check if (px, py) is inside mask (alpha > 0).
 * @param {ImageData} imageData
 * @param {number} width
 * @param {number} height
 * @param {number} px
 * @param {number} py
 * @returns {boolean}
 */
function isPointInMask(imageData, width, height, px, py) {
  const x = Math.floor(px);
  const y = Math.floor(py);
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  const i = (y * width + x) * 4;
  return imageData.data[i + 3] > 128;
}

/**
 * Get all segment masks for the image (e.g. all persons). For UI drawing.
 * @param {HTMLCanvasElement|HTMLImageElement} image
 * @returns {Promise<Array<{ mask: ImageData, bbox: number[] }>>}
 */
export async function getSegmentMasks(image) {
  const seg = await loadSegmenter();
  if (!seg || typeof seg.segmentPeople !== 'function') return [];
  try {
    let people;
    try {
      people = await seg.segmentPeople(image, { multiSegmentation: true });
    } catch (_) {
      people = await seg.segmentPeople(image);
    }
    if (!people || !people.length) return [];
    const width = image.width || image.naturalWidth || image.videoWidth;
    const height = image.height || image.naturalHeight || image.videoHeight;
    const result = [];
    for (let i = 0; i < people.length; i++) {
      const idata = await maskToImageData(people[i]);
      if (!idata) continue;
      const bbox = maskToBbox(idata, width, height);
      if (bbox) result.push({ mask: idata, bbox });
    }
    return result;
  } catch (e) {
    console.warn('getSegmentMasks failed:', e);
    return [];
  }
}

/**
 * Normalize mask ImageData: invert if convention is background=opaque (so we only tint foreground).
 * Optionally resizes to target dimensions if different.
 * @param {ImageData} idata
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {ImageData} ImageData with foreground = alpha > 128
 */
function normalizeMaskForDraw(idata, targetWidth, targetHeight) {
  const w = idata.width;
  const h = idata.height;
  const data = idata.data;
  let opaqueCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 128) opaqueCount++;
  }
  const total = w * h;
  const invert = opaqueCount > total * 0.5; // background=opaque → invert so person is filled
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

/** Diagonal hatch line spacing (display px) */
const HATCH_SPACING = 10;

/**
 * Draw one segment mask: diagonal hatch (빗금) only — no fill, so image stays fully visible.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ImageData} maskImageData - mask same size as source image (or will be scaled)
 * @param {number} imgWidth
 * @param {number} imgHeight
 * @param {number} displayWidth
 * @param {number} displayHeight}
 * @param {number[]} bbox - [x, y, w, h] in image coords
 * @param {string} fillStyle - unused (kept for API compatibility)
 * @param {string} strokeStyle - used for hatch lines and outline
 */
export function drawSegmentMask(ctx, maskImageData, imgWidth, imgHeight, displayWidth, displayHeight, bbox, fillStyle = 'rgba(99, 102, 241, 0.12)', strokeStyle = '#6366f1') {
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
  // Draw mask, then only inside it: hatch lines (no fill)
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

/**
 * Draw segment mask as a filled overlay (no contour scan). Simpler and faster.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ImageData} maskImageData
 * @param {number} imgWidth
 * @param {number} imgHeight
 * @param {number} displayWidth
 * @param {number} displayHeight
 * @param {string} fillStyle
 * @param {string} strokeStyle
 */
export function drawSegmentMaskSimple(ctx, maskImageData, imgWidth, imgHeight, displayWidth, displayHeight, fillStyle = 'rgba(99, 102, 241, 0.4)', strokeStyle = '#6366f1') {
  if (!maskImageData || !imgWidth || !imgHeight) return;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = imgWidth;
  maskCanvas.height = imgHeight;
  maskCanvas.getContext('2d').putImageData(maskImageData, 0, 0);
  ctx.save();
  ctx.drawImage(maskCanvas, 0, 0, imgWidth, imgHeight, 0, 0, displayWidth, displayHeight);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, displayWidth, displayHeight);
  ctx.restore();
}

/**
 * Match COCO-SSD predictions to segment masks by bbox overlap (IoU). All predictions matched to best mask.
 * @param {Array<{ class: string, bbox: number[] }>} predictions
 * @param {Array<{ mask: ImageData, bbox: number[] }>} segmentMasks
 * @returns {Map<number, number>} prediction index -> segment mask index (only for matched)
 */
export function matchPredictionsToSegmentMasks(predictions, segmentMasks) {
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

/**
 * 공통: 예측 목록을 세그먼트(가능 시) 또는 bbox로 그리기. Setup/Game DRY용.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{ class: string, bbox: number[], score: number }>} predictions
 * @param {Array<{ mask: ImageData, bbox: number[] }>} segmentMasks
 * @param {object} opts
 * @param {number} opts.sourceWidth - 원본 이미지 너비
 * @param {number} opts.sourceHeight - 원본 이미지 높이
 * @param {number} opts.displayWidth - 캔버스 표시 너비
 * @param {number} opts.displayHeight - 캔버스 표시 높이
 * @param {function(string): string} [opts.translateClass] - 클래스명 → 라벨
 * @param {number} [opts.scoreThreshold=0.5] - 최소 점수
 * @param {boolean} [opts.withIndex=false] - 라벨에 "1. 사람 (90%)" 형식 사용
 * @param {function(object, number): { fillStyle: string, strokeStyle: string }} [opts.getStyle] - (pred, index) => 스타일 (선택 강조용)
 */
export function drawPredictionsWithSegments(ctx, predictions, segmentMasks, opts = {}) {
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

/**
 * Run person segmentation on image/canvas; find which instance contains (px, py) and return its mask bbox.
 * Use this when targetObject === 'person' to get a segment-based bbox instead of COCO-SSD bbox.
 * @param {HTMLCanvasElement|HTMLImageElement} image
 * @param {number} px - x in image coordinates
 * @param {number} py - y in image coordinates
 * @returns {Promise<{ bbox: number[], index: number }|null>} bbox [x,y,w,h] and instance index, or null
 */
export async function getSegmentHitAndBbox(image, px, py) {
  const seg = await loadSegmenter();
  if (!seg || typeof seg.segmentPeople !== 'function') return null;
  try {
    let people;
    try {
      people = await seg.segmentPeople(image, { multiSegmentation: true });
    } catch (_) {
      people = await seg.segmentPeople(image);
    }
    if (!people || !people.length) return null;
    const width = image.width || image.naturalWidth || image.videoWidth;
    const height = image.height || image.naturalHeight || image.videoHeight;
    for (let i = 0; i < people.length; i++) {
      const idata = await maskToImageData(people[i]);
      if (!idata) continue;
      if (isPointInMask(idata, width, height, px, py)) {
        const bbox = maskToBbox(idata, width, height);
        if (bbox) return { bbox, index: i };
      }
    }
    return null;
  } catch (e) {
    console.warn('Segment people failed:', e);
    return null;
  }
}
