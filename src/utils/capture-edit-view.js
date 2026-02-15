/**
 * 캡처/보물 편집 뷰: CaptureEditModel 상태를 스토어·오브젝트 목록·버튼에 반영
 * 미디어+bbox는 MediaDetectionView가 스토어에 맞게 렌더링.
 */

export class CaptureEditView {
  /**
   * @param {object} elements - store, webcamContainer, mediaDetectionView, objectsList, detectedObjectsSection, selectedObjectName, treasureNameInput, btnCapture, btnCapturedClose, btnStartWebcam, btnCaptureDesktop
   * @param {{ translateClass: (string)=>string }} opts
   */
  constructor(elements, opts = {}) {
    this.el = elements;
    this.translateClass = opts.translateClass || ((c) => c);
    this._model = null;
    this._unsubscribe = null;
  }

  bindModel(model) {
    if (this._unsubscribe) this._unsubscribe();
    this._model = model;
    this._unsubscribe = model.subscribe(() => this.update());
    this.update();
  }

  unbind() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._model = null;
  }

  update() {
    const m = this._model;
    const store = this.el.store?.getState ? this.el.store.getState() : null;
    const { objectsList, detectedObjectsSection, selectedObjectName, treasureNameInput, webcamContainer } = this.el;

    if (!m || !m.hasImage()) {
      if (store) {
        store.setStillImage(null);
        store.setPredictions([]);
        store.setSegmentMasks([]);
        store.setSelectedClass(null);
      }
      if (detectedObjectsSection) detectedObjectsSection.style.display = 'none';
      if (selectedObjectName) selectedObjectName.textContent = '';
      if (treasureNameInput) treasureNameInput.value = '';
      return;
    }

    const w = m.sourceWidth || 0;
    const h = m.sourceHeight || 0;
    if (w > 0 && h > 0 && webcamContainer) {
      webcamContainer.style.aspectRatio = `${w} / ${h}`;
    }
    if (store) {
      store.setStillImage(m.imageData, w, h);
      store.setPredictions(m.predictions);
      store.setSegmentMasks(m.segmentMasks);
      store.setSelectedClass(m.selectedClass);
    }

    if (objectsList) {
      if (m.predictions.length === 0) {
        objectsList.innerHTML = '<p class="no-objects">검출된 오브젝트가 없습니다. 다시 촬영해보세요.</p>';
      } else {
        objectsList.innerHTML = m.predictions
          .map(
            (pred, index) => `
          <button class="object-card ${m.selectedClass === pred.class ? 'selected' : ''}" 
                  data-class="${escapeAttr(pred.class)}" data-index="${index}">
            <span class="object-number">${index + 1}</span>
            <span class="object-name">${escapeHtml(this.translateClass(pred.class))}</span>
            <span class="object-score">${Math.round((pred.score ?? 0) * 100)}%</span>
          </button>
        `
          )
          .join('');
        objectsList.querySelectorAll('.object-card').forEach((card) => {
          card.addEventListener('click', () => {
            const objectClass = card.dataset.class;
            const index = card.dataset.index != null ? parseInt(card.dataset.index, 10) : null;
            if (this._model) this._model.setSelectedByClass(objectClass, index);
          });
        });
      }
    }

    if (detectedObjectsSection) detectedObjectsSection.style.display = m.hasDetections() ? 'block' : 'none';
    if (selectedObjectName) selectedObjectName.textContent = m.selectedClass ? ` · 선택: ${this.translateClass(m.selectedClass)}` : '';
    if (treasureNameInput) treasureNameInput.value = m.selectedClass ? this.translateClass(m.selectedClass) : '';
  }

  /** 캡처 완료 UI: 버튼만 전환 (미디어는 스토어에 이미 반영됨) */
  showCapturedView() {
    const { btnCapture, btnCapturedClose, btnStartWebcam, btnCaptureDesktop } = this.el;
    if (btnCapture) btnCapture.style.display = 'none';
    if (btnCapturedClose) btnCapturedClose.style.display = 'block';
    if (btnStartWebcam) btnStartWebcam.style.display = 'none';
    if (btnCaptureDesktop) btnCaptureDesktop.style.display = 'none';
    this.update();
  }

  /** 라이브(촬영 전) UI: 정지 이미지 클리어, 버튼 전환 */
  showLiveView() {
    const { store, btnCapture, btnCapturedClose, btnCaptureDesktop, webcamContainer } = this.el;
    if (store && store.getState()) {
      store.getState().setStillImage(null);
      store.getState().setSelectedClass(null);
    }
    if (btnCapture) btnCapture.style.display = '';
    if (btnCapturedClose) btnCapturedClose.style.display = 'none';
    if (btnCaptureDesktop) btnCaptureDesktop.style.display = 'inline-flex';
    if (webcamContainer) webcamContainer.style.aspectRatio = '4 / 3';
  }

  setCapturedImageSrc() {
    // 미디어 소스는 스토어/모델 동기화로 처리됨
  }
}

function escapeHtml(str) {
  if (str == null || typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
