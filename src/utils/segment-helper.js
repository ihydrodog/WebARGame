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
