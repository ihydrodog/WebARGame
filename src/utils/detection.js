/**
 * 공통 오브젝트 검출 로직 (보물 추가 & 찾기 DRY)
 * COCO-SSD 로드/실행, 클릭 위치 히트테스트(bbox + 세그먼트)
 */

import {
  isSegmentAvailableForClass,
  getSegmentHitAndBbox
} from './segment-helper.js';

let cachedModel = null;
let loadPromise = null;

/**
 * COCO-SSD 사용 가능 여부
 * @returns {boolean}
 */
export function isDetectionAvailable() {
  return typeof window !== 'undefined' && typeof window.cocoSsd !== 'undefined';
}

/**
 * COCO-SSD 모델 로드 (캐시, 한 번만 로드)
 * @returns {Promise<object|null>} COCO-SSD model or null
 */
export async function loadDetectionModel() {
  if (!isDetectionAvailable()) return null;
  if (cachedModel) return cachedModel;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        cachedModel = await window.cocoSsd.load();
        return cachedModel;
      } catch (err) {
        console.error('COCO-SSD load failed:', err);
        return null;
      }
    })();
  }
  return loadPromise;
}

/**
 * 이미지/비디오에서 오브젝트 검출
 * @param {object} model - COCO-SSD model (loadDetectionModel() 결과)
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image
 * @param {{ scoreThreshold?: number }} [opts]
 * @returns {Promise<Array<{ class: string, bbox: number[], score: number }>>}
 */
export async function runDetection(model, image, opts = {}) {
  if (!model || typeof model.detect !== 'function') return [];
  const scoreThreshold = opts.scoreThreshold ?? 0;
  try {
    const predictions = await model.detect(image);
    return (predictions || []).filter(p => (p.score ?? 0) >= scoreThreshold);
  } catch (err) {
    console.warn('runDetection failed:', err);
    return [];
  }
}

/**
 * 클라이언트 좌표를 소스 이미지 좌표로 변환
 * @param {DOMRect} rect - getBoundingClientRect()
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ px: number, py: number }}
 */
export function clientToSource(rect, sourceWidth, sourceHeight, clientX, clientY) {
  if (!rect.width || !rect.height) return { px: 0, py: 0 };
  const scaleX = sourceWidth / rect.width;
  const scaleY = sourceHeight / rect.height;
  return {
    px: (clientX - rect.left) * scaleX,
    py: (clientY - rect.top) * scaleY
  };
}

/**
 * bbox 기준 히트테스트: (clientX, clientY)에 해당하는 검출 1개 반환 (가장 작은 bbox 우선)
 * @param {DOMRect} rect - 뷰 getBoundingClientRect()
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} clientX
 * @param {number} clientY
 * @param {Array<{ class: string, bbox: number[] }>} predictions
 * @returns {{ class: string, bbox: number[] }|null}
 */
export function pickAtClient(rect, sourceWidth, sourceHeight, clientX, clientY, predictions) {
  if (!rect.width || !rect.height || !predictions?.length) return null;
  const { px, py } = clientToSource(rect, sourceWidth, sourceHeight, clientX, clientY);
  const hit = predictions
    .filter(p => {
      const [x, y, w, h] = p.bbox;
      return px >= x && px <= x + w && py >= y && py <= y + h;
    })
    .sort((a, b) => (a.bbox[2] * a.bbox[3]) - (b.bbox[2] * b.bbox[3]))[0];
  return hit ? { class: hit.class, bbox: hit.bbox } : null;
}

/**
 * 클릭 위치에서 검출 선택: targetClass에 세그먼트가 있으면 세그먼트 히트 먼저, 없으면 bbox 히트
 * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement} image - 검출 소스 이미지
 * @param {DOMRect} rect - 뷰 getBoundingClientRect()
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} clientX
 * @param {number} clientY
 * @param {Array<{ class: string, bbox: number[] }>} predictions
 * @param {string|null} [targetClass] - 찾는 대상 클래스 (있으면 세그먼트 시도)
 * @returns {Promise<{ class: string, bbox: number[] }|null>}
 */
export async function pickDetectionAt(image, rect, sourceWidth, sourceHeight, clientX, clientY, predictions, targetClass = null) {
  const { px, py } = clientToSource(rect, sourceWidth, sourceHeight, clientX, clientY);
  if (targetClass && isSegmentAvailableForClass(targetClass)) {
    const segResult = await getSegmentHitAndBbox(image, px, py);
    if (segResult) return { class: targetClass, bbox: segResult.bbox };
  }
  return pickAtClient(rect, sourceWidth, sourceHeight, clientX, clientY, predictions);
}
