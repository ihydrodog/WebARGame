/**
 * 뷰: 모델(이미지 소스 + 검출 상태)에 맞게 렌더링.
 * 스트림 / 정지 이미지 모두 지원. 미디어 레이어 + bbox 오버레이 한 컨테이너.
 */
import { DetectionOverlayView } from './viewers.js';

export class MediaDetectionView {
  /**
   * @param {HTMLElement} parent - 뷰가 마운트될 부모
   * @param {object} store - cameraDetectionStore (getState, subscribe)
   * @param {{ translateClass?: (string)=>string, fit?: 'contain'|'cover' }} options
   */
  constructor(parent, store, options = {}) {
    this.store = store;
    this.translateClass = options.translateClass || ((c) => c);
    this.fit = options.fit || 'contain';

    const root = document.createElement('div');
    root.className = 'media-detection-view';
    root.style.position = 'relative';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.minHeight = '120px';

    const video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.className = 'preview-source';
    video.style.position = 'absolute';
    video.style.inset = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.display = 'none';

    const img = document.createElement('img');
    img.alt = '';
    img.className = 'preview-source';
    img.style.position = 'absolute';
    img.style.inset = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.display = 'none';

    const overlay = document.createElement('canvas');
    overlay.className = 'detection-overlay';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';

    const debugEl = document.createElement('div');
    debugEl.className = 'media-detection-debug';
    debugEl.style.cssText =
      'position:absolute;top:0;left:0;z-index:10;background:rgba(0,0,0,0.85);color:#e5e7eb;font-size:11px;font-family:monospace;padding:6px 8px;white-space:pre;max-width:100%;pointer-events:none;';
    debugEl.style.display = 'none';
    root.appendChild(debugEl);

    root.appendChild(video);
    root.appendChild(img);
    root.appendChild(overlay);
    parent.appendChild(root);

    this.root = root;
    this.video = video;
    this.img = img;
    this.overlay = overlay;
    this.debugEl = debugEl;
    this.overlayView = new DetectionOverlayView(root, overlay, {
      fit: this.fit,
      translateClass: this.translateClass,
    });

    const onVideoLoadedMetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && h) this.store.getState().setSourceSize(w, h);
    };
    video.addEventListener('loadedmetadata', onVideoLoadedMetadata);

    this._lastStream = null;
    this._lastStillUrl = null;
    this._unsubscribe = this.store.subscribe(() => this.syncFromModel());
    this.syncFromModel();
  }

  /** 모델 상태에 맞게 미디어·오버레이 동기화 (미디어는 소스가 바뀔 때만, 오버레이는 매번) */
  syncFromModel() {
    const state = this.store.getState();
    const hasStream = !!state.stream;
    const still = state.stillImage;
    const stillUrl = still && still.url ? still.url : null;

    if (hasStream) {
      if (this._lastStream !== state.stream) {
        this._lastStream = state.stream;
        this._lastStillUrl = null;
        this.video.srcObject = state.stream;
        this.video.style.display = '';
        this.img.style.display = 'none';
        this.img.removeAttribute('src');
        this.video.play().catch(() => {});
      }
    } else if (stillUrl) {
      if (this._lastStillUrl !== stillUrl) {
        this._lastStream = null;
        this._lastStillUrl = stillUrl;
        this.video.srcObject = null;
        this.video.style.display = 'none';
        this.img.src = stillUrl;
        this.img.style.display = '';
      }
    } else {
      this._lastStream = null;
      this._lastStillUrl = null;
      this.video.srcObject = null;
      this.video.style.display = 'none';
      this.img.style.display = 'none';
      this.img.removeAttribute('src');
    }

    if (state.sourceWidth && state.sourceHeight) {
      this.root.style.aspectRatio = `${state.sourceWidth} / ${state.sourceHeight}`;
    } else {
      this.root.style.aspectRatio = '';
    }

    if (this.debugEl) {
      const q = typeof window !== 'undefined' && window.location && window.location.search;
      const urlDebug = q && (window.location.search.includes('debug=1') || window.location.search.includes('media_debug=1'));
      const show = urlDebug || (typeof window !== 'undefined' && window.__SHOW_MEDIA_DETECTION_DEBUG);
      this.debugEl.style.display = show ? 'block' : 'none';
      if (show) {
        const srcType = state.stream ? 'stream' : state.stillImage ? 'still' : 'null';
        const cw = this.root ? this.root.clientWidth : 0;
        const ch = this.root ? this.root.clientHeight : 0;
        const preds = state.predictions || [];
        const first = preds[0];
        const firstBbox = first && first.bbox ? first.bbox : null;
        this.debugEl.textContent = [
          `sourceType: ${srcType}`,
          `sourceSize: ${state.sourceWidth} x ${state.sourceHeight}`,
          `container: ${cw} x ${ch}`,
          `aspectRatio: ${this.root.style.aspectRatio || '(none)'}`,
          `predictions: ${preds.length}`,
          firstBbox ? `  [0] bbox: [${firstBbox.map((n) => n.toFixed(1)).join(', ')}]` : '',
          `selectedClass: ${state.selectedClass ?? 'null'}`,
          `detectionRunning: ${state.detectionRunning}`,
        ]
          .filter(Boolean)
          .join('\n');
      }
    }

    const selectedClass = state.selectedClass;
    this.overlayView.setSourceSize(state.sourceWidth, state.sourceHeight);
    this.overlayView.setContent(state.predictions, state.segmentMasks, {
      scoreThreshold: 0.5,
      withIndex: false,
      translateClass: this.translateClass,
      getStyle: selectedClass
        ? (pred) =>
            pred.class === selectedClass
              ? { fillStyle: 'rgba(16, 185, 129, 0.25)', strokeStyle: '#10b981', lineWidth: 4 }
              : { fillStyle: 'rgba(99, 102, 241, 0.2)', strokeStyle: '#6366f1', lineWidth: 3 }
        : undefined,
    });
  }

  getVideo() {
    return this.video;
  }

  getImage() {
    return this.img;
  }

  clearOverlay() {
    this.overlayView.clear();
  }

  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this.overlayView.destroy();
    this.debugEl = null;
    this.root.remove();
    this.root = null;
    this.video = null;
    this.img = null;
    this.overlay = null;
    this.overlayView = null;
  }
}
