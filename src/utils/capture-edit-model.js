/**
 * 캡처/보물 편집 모델: 이미지·bbox(검출)·선택 상태
 * 뷰는 이 모델을 구독하여 오버레이·오브젝트 목록 등을 동기화한다.
 */

export class CaptureEditModel {
  constructor() {
    this._imageData = null;
    this._sourceWidth = 0;
    this._sourceHeight = 0;
    this._predictions = [];
    this._segmentMasks = [];
    this._selectedIndex = null;
    this._selectedClass = null;
    this._listeners = new Set();
  }

  get imageData() { return this._imageData; }
  get sourceWidth() { return this._sourceWidth; }
  get sourceHeight() { return this._sourceHeight; }
  get predictions() { return this._predictions; }
  get segmentMasks() { return this._segmentMasks; }
  get selectedIndex() { return this._selectedIndex; }
  get selectedClass() { return this._selectedClass; }

  hasImage() {
    return this._imageData != null && this._imageData.length > 0;
  }

  hasDetections() {
    return this._predictions.length > 0;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach(fn => fn());
  }

  /** 촬영 직후: 이미지 + 검출 결과 한 번에 설정 */
  setFromCapture(imageData, sourceWidth, sourceHeight, predictions, segmentMasks = []) {
    this._imageData = imageData;
    this._sourceWidth = sourceWidth;
    this._sourceHeight = sourceHeight;
    this._predictions = predictions || [];
    this._segmentMasks = segmentMasks || [];
    this._selectedIndex = null;
    this._selectedClass = null;
    this._notify();
  }

  /**
   * 보물 추가/수정 공통: treasure 기준으로 초기 상태 설정.
   * - 수정 모드(treasure.capturedImage 있음): loadFromTreasure 호출
   * - 추가 모드(treasure 없거나 capturedImage 없음): 비움
   */
  initFromTreasure(treasure) {
    if (treasure?.capturedImage) {
      this.loadFromTreasure(treasure);
    } else {
      this._imageData = null;
      this._sourceWidth = 0;
      this._sourceHeight = 0;
      this._predictions = [];
      this._segmentMasks = [];
      this._selectedIndex = null;
      this._selectedClass = null;
      this._notify();
    }
  }

  /** 보물 수정 시: 저장된 이미지·bbox(있으면) 복원. predictions 없으면 runDetectionAsync로 검출 */
  loadFromTreasure(treasure) {
    this._imageData = treasure.capturedImage || null;
    const savedW = treasure.sourceWidth;
    const savedH = treasure.sourceHeight;
    const savedPreds = Array.isArray(treasure.predictions) ? treasure.predictions : [];
    this._sourceWidth = savedW || 0;
    this._sourceHeight = savedH || 0;
    this._predictions = savedPreds;
    this._segmentMasks = Array.isArray(treasure.segmentMasks) ? treasure.segmentMasks : [];
    this._selectedIndex = null;
    this._selectedClass = treasure.detectedObject || null;
    if (this._selectedClass && this._predictions.length > 0) {
      const idx = this._predictions.findIndex((p) => p.class === this._selectedClass);
      this._selectedIndex = idx >= 0 ? idx : null;
    }
    this._notify();
  }

  /** 이미지 엘리먼트로 검출 실행 후 모델 갱신 (보물 수정 시 호출) */
  async runDetectionAsync(imageElement, { loadDetectionModel, runDetection, getSegmentMasks, isSegmentAvailableForClass }) {
    if (!this._imageData || !imageElement) return;
    const model = await loadDetectionModel();
    if (!model) return;
    const predictions = await runDetection(model, imageElement, { scoreThreshold: 0.3 });
    if (predictions.length === 0) return;

    const w = imageElement.naturalWidth;
    const h = imageElement.naturalHeight;
    let segmentMasks = [];
    if (isSegmentAvailableForClass?.('person')) {
      try {
        segmentMasks = await getSegmentMasks(imageElement);
      } catch (_) {}
    }

    this._sourceWidth = w;
    this._sourceHeight = h;
    this._predictions = predictions;
    this._segmentMasks = segmentMasks;
    if (this._selectedClass) {
      const idx = predictions.findIndex(p => p.class === this._selectedClass);
      this._selectedIndex = idx >= 0 ? idx : null;
    } else {
      this._selectedIndex = null;
    }
    this._notify();
  }

  setSelectedIndex(index) {
    this._selectedIndex = index;
    this._selectedClass = index != null && this._predictions[index] ? this._predictions[index].class : null;
    this._notify();
  }

  setSelectedByClass(objectClass, index) {
    this._selectedClass = objectClass;
    this._selectedIndex = index;
    this._notify();
  }

  clear() {
    this._imageData = null;
    this._sourceWidth = 0;
    this._sourceHeight = 0;
    this._predictions = [];
    this._segmentMasks = [];
    this._selectedIndex = null;
    this._selectedClass = null;
    this._notify();
  }

  /** 저장 시 treasure 객체에 넣을 값 */
  getCapturePayload() {
    return {
      capturedImage: this._imageData,
      detectedObject: this._selectedClass,
      predictions: this._predictions,
      segmentMasks: this._segmentMasks,
      sourceWidth: this._sourceWidth,
      sourceHeight: this._sourceHeight,
      selectedIndex: this._selectedIndex
    };
  }
}
