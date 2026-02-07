/**
 * Feature embedding for object/person distinction (e.g. 엄마, 아빠, 할아버지).
 * Uses image crop fingerprint (resize + normalize) with optional MobileNet when available.
 */

let mobilenetModel = null;
let mobilenetLoadPromise = null;

/**
 * Load MobileNet for embedding (if available). Falls back to null.
 * @returns {Promise<object|null>}
 */
export async function loadEmbeddingModel() {
  if (mobilenetModel) return mobilenetModel;
  if (mobilenetLoadPromise) return mobilenetLoadPromise;
  mobilenetLoadPromise = (async () => {
    try {
      if (typeof window.mobilenet !== 'undefined') {
        mobilenetModel = await window.mobilenet.load({ version: 2, alpha: 1 });
        return mobilenetModel;
      }
    } catch (e) {
      console.warn('MobileNet embedding not available:', e);
    }
    return null;
  })();
  return mobilenetLoadPromise;
}

/**
 * Crop region from source canvas and return a new canvas.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number[]} bbox - [x, y, width, height]
 * @param {number} sourceWidth - intrinsic width of the image drawn in sourceCanvas
 * @param {number} sourceHeight - intrinsic height
 * @returns {HTMLCanvasElement}
 */
export function cropToCanvas(sourceCanvas, bbox, sourceWidth, sourceHeight) {
  const [x, y, w, h] = bbox;
  const scaleX = sourceCanvas.width / sourceWidth;
  const scaleY = sourceCanvas.height / sourceHeight;
  const sx = Math.max(0, x * scaleX);
  const sy = Math.max(0, y * scaleY);
  const sw = Math.min(sourceCanvas.width - sx, w * scaleX);
  const sh = Math.min(sourceCanvas.height - sy, h * scaleY);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/**
 * Get embedding from image/canvas. Uses MobileNet if available, else simple fingerprint.
 * @param {HTMLCanvasElement|HTMLImageElement} imageElement
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(imageElement) {
  const tf = window.tf;
  if (!tf) return [];

  if (!mobilenetModel) {
    await loadEmbeddingModel();
  }

  const canvas = imageElement instanceof HTMLCanvasElement
    ? imageElement
    : (() => {
        const c = document.createElement('canvas');
        c.width = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width;
        c.height = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height;
        c.getContext('2d').drawImage(imageElement, 0, 0);
        return c;
      })();

  if (mobilenetModel && typeof mobilenetModel.infer === 'function') {
    try {
      const embedding = mobilenetModel.infer(canvas, true);
      const arr = await embedding.data();
      return Array.from(arr);
    } catch (e) {
      console.warn('MobileNet infer failed, using fingerprint:', e);
    }
  }

  return Promise.resolve(getSimpleFingerprint(canvas, tf));
}

/**
 * Simple visual fingerprint: resize to 32x32, normalize, flatten. Works with tf only.
 * @param {HTMLCanvasElement} canvas
 * @param {object} tf - TensorFlow.js namespace
 * @returns {number[]}
 */
function getSimpleFingerprint(canvas, tf) {
  return tf.tidy(() => {
    const pixels = tf.browser.fromPixels(canvas);
    const resized = tf.image.resizeBilinear(pixels, [32, 32]);
    const normalized = resized.div(255.0);
    const flattened = normalized.flatten();
    return Array.from(flattened.dataSync());
  });
}

/**
 * Get embedding from a crop defined by bbox on the source canvas.
 * @param {HTMLCanvasElement} sourceCanvas - canvas with the full frame
 * @param {number[]} bbox - [x, y, width, height] in source image coordinates
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @returns {Promise<number[]>}
 */
export async function getEmbeddingFromCrop(sourceCanvas, bbox, sourceWidth, sourceHeight) {
  const crop = cropToCanvas(sourceCanvas, bbox, sourceWidth, sourceHeight);
  const embedding = await getEmbedding(crop);
  return embedding;
}

/**
 * Cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} in [0, 1] (1 = identical direction)
 */
export function cosineSimilarity(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 0) return 0;
  const sim = dot / denom;
  return Math.max(0, Math.min(1, (sim + 1) / 2));
}

/** Default threshold: above this similarity we consider it the same target */
export const FEATURE_SIMILARITY_THRESHOLD = 0.65;
