/**
 * Setup Module
 * Handles level list, level edit (treasure list + game settings), and treasure editor
 */

import Sortable from 'sortablejs';
import {
  loadLevels,
  saveLevels,
  getLevel,
  setActiveLevelId,
  createLevel,
  deleteLevel,
  reorderLevels,
  saveLevel,
  loadTreasures,
  saveTreasures
} from './data/default-treasures.js';
import { riddleBank, getRiddlesByCategory, getRiddlesByDifficulty } from './data/riddles/index.js';
import { getEmbeddingFromCrop } from './utils/feature-embedding.js';
import { loadDetectionModel, runDetection } from './utils/detection.js';
import { getSegmentMasks, isSegmentAvailableForClass } from './utils/segment-helper.js';
import { DetectionOverlayView, TreasureInfoViewer } from './utils/viewers.js';

/**
 * Resolves when the video has valid dimensions and at least one frame has been painted (avoids first-frame no detection).
 * @param {HTMLVideoElement} video
 * @returns {Promise<void>}
 */
function waitForVideoReady(video) {
  return new Promise((resolve) => {
    function check() {
      if (video.videoWidth && video.videoHeight && video.clientWidth && video.clientHeight) {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
        return;
      }
      requestAnimationFrame(check);
    }
    if (video.readyState >= 2) check();
    else video.onloadeddata = check;
  });
}

let container = null;
let onBack = null;
let treasures = [];
let currentTreasureIndex = 0;
/** When in level-edit screen, the level we're editing */
let currentLevelId = null;

/**
 * Initialize setup screen
 * @param {HTMLElement} containerEl - Container element
 * @param {Function} backCallback - Callback to return to home
 */
export function initSetup(containerEl, backCallback) {
  container = containerEl;
  onBack = backCallback;
  renderLevelList();
  loadObjectDetectionModel(true).catch(() => {});
}

/**
 * Load COCO-SSD model for object detection (공통 detection 모듈 사용)
 * @param {boolean} [silent=false] - If true, preload without showing loading overlay
 */
async function loadObjectDetectionModel(silent = false) {
  try {
    if (!silent) showLoadingOverlay('AI 모델 로딩 중...');
    const model = await loadDetectionModel();
    if (!silent) hideLoadingOverlay();
    return model;
  } catch (err) {
    if (!silent) hideLoadingOverlay();
    return null;
  }
}

/**
 * Show loading overlay
 */
function showLoadingOverlay(message) {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p class="loading-text">${message}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.querySelector('.loading-text').textContent = message;
    overlay.style.display = 'flex';
  }
}

/**
 * Hide loading overlay
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Render level list (1단계) — list UI with drag to reorder
 */
function renderLevelList() {
  currentLevelId = null;
  const { levels } = loadLevels();
  const sortedLevels = [...levels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  container.innerHTML = `
    <div class="setup-screen">
      <header class="setup-header">
        <button class="btn btn-secondary" id="btn-back">← 돌아가기</button>
        <h1>레벨 목록</h1>
      </header>
      <div class="setup-content">
        <section class="level-list card">
          <h2>레벨</h2>
          <p class="hint-text">레벨을 선택해 편집하거나, 새 레벨을 추가하세요.</p>
          <div id="levels-container" class="level-list-container">
            ${sortedLevels.length === 0 ? '<p class="empty-message">등록된 레벨이 없습니다.</p>' : ''}
            ${sortedLevels.map((level, index) => `
              <div class="level-item" data-level-id="${level.id}">
                <span class="level-order">${index + 1}</span>
                <div class="level-info">
                  <span class="level-name">${level.name || `레벨 ${index + 1}`}</span>
                  <span class="level-meta">보물 ${(level.items || []).length}개</span>
                </div>
                <div class="level-actions">
                  <button class="btn btn-secondary btn-small btn-edit-level">편집</button>
                  <button class="btn btn-danger btn-small btn-delete-level">삭제</button>
                </div>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-primary" id="btn-add-level" style="width: 100%; margin-top: 1rem;">+ 레벨 추가</button>
        </section>
      </div>
    </div>
  `;

  addSetupStyles();

  document.getElementById('btn-back').addEventListener('click', onBack);
  document.getElementById('btn-add-level').addEventListener('click', () => {
    const level = createLevel('새 레벨');
    renderLevelEdit(level.id);
  });

  sortedLevels.forEach((level) => {
    const el = container.querySelector(`[data-level-id="${level.id}"]`);
    if (!el) return;
    el.querySelector('.btn-edit-level')?.addEventListener('click', () => renderLevelEdit(level.id));
    el.querySelector('.btn-delete-level')?.addEventListener('click', () => {
      if (confirm(`"${level.name || '이 레벨'}"을(를) 삭제하시겠습니까?`)) {
        deleteLevel(level.id);
        renderLevelList();
      }
    });
  });

  const levelsContainer = document.getElementById('levels-container');
  if (levelsContainer && sortedLevels.length > 0) {
    new Sortable(levelsContainer, {
      animation: 150,
      handle: '.level-item',
      onEnd(evt) {
        const ids = Array.from(levelsContainer.querySelectorAll('.level-item')).map((n) => n.dataset.levelId);
        reorderLevels(ids);
      }
    });
  }
}

/**
 * Enter level edit (2단계): set current level and render level-edit screen
 * @param {string} levelId
 */
function renderLevelEdit(levelId) {
  currentLevelId = levelId;
  setActiveLevelId(levelId);
  treasures = loadTreasures();
  renderLevelEditScreen();
}

/**
 * Render level edit screen — treasure list (cards) + game settings
 */
function renderLevelEditScreen() {
  const level = currentLevelId ? getLevel(currentLevelId) : null;
  const levelName = level?.name || '레벨 편집';

  container.innerHTML = `
    <div class="setup-screen">
      <header class="setup-header">
        <button class="btn btn-secondary" id="btn-back-level">← 레벨 목록으로</button>
        <h1>${levelName}</h1>
      </header>
      <div class="setup-content">
        <section class="treasure-list card">
          <h2>보물 목록</h2>
          <p class="hint-text">보물을 추가하여 게임을 만들어보세요!</p>
          <div id="treasures-container" class="treasure-cards-container">
            ${TreasureInfoViewer.renderList(treasures.items)}
          </div>
          <button class="btn btn-primary" id="btn-add-treasure" style="width: 100%; margin-top: 1rem;">+ 보물 추가</button>
        </section>
        <section class="game-settings card" style="margin-top: 1rem;">
          <h2>게임 설정</h2>
          <div class="form-group">
            <label class="form-label">시작 점수</label>
            <input type="number" class="form-input" id="initial-score" 
                   value="${treasures.initialScore || 1000}" min="100" step="100">
          </div>
          <div class="form-group">
            <label class="form-label">초당 차감 점수</label>
            <input type="number" class="form-input" id="score-decay" 
                   value="${treasures.scoreDecayPerSecond || 1}" min="0" step="0.5">
          </div>
          <button class="btn btn-success" id="btn-save-settings" style="width: 100%; margin-top: 1rem;">설정 저장</button>
        </section>
      </div>
    </div>
  `;

  addSetupStyles();

  document.getElementById('btn-back-level').addEventListener('click', () => renderLevelList());
  document.getElementById('btn-add-treasure').addEventListener('click', () => {
    currentTreasureIndex = treasures.items ? treasures.items.length : 0;
    renderTreasureEditor(null);
  });
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  document.querySelectorAll('.treasure-card').forEach((card, index) => {
    const item = treasures.items?.[index];
    if (!item) return;
    card.querySelector('.btn-edit')?.addEventListener('click', () => {
      currentTreasureIndex = index;
      renderTreasureEditor(treasures.items[index]);
    });
    card.querySelector('.btn-delete')?.addEventListener('click', () => deleteTreasure(index));
  });

  const treasuresContainer = document.getElementById('treasures-container');
  if (treasuresContainer && treasures.items?.length > 0) {
    new Sortable(treasuresContainer, {
      animation: 150,
      handle: '.treasure-card',
      onEnd(evt) {
        if (evt.oldIndex == null || evt.newIndex == null) return;
        const items = [...treasures.items];
        const [moved] = items.splice(evt.oldIndex, 1);
        items.splice(evt.newIndex, 0, moved);
        treasures.items = items.map((t, i) => ({ ...t, order: i + 1 }));
        saveTreasures(treasures);
        renderLevelEditScreen();
      }
    });
  }
}

/**
 * Render treasure editor
 */
function renderTreasureEditor(treasure) {
  const isNew = !treasure;
  treasure = treasure || {
    id: `treasure-${Date.now()}`,
    order: currentTreasureIndex + 1,
    name: '',
    marker: { type: 'pattern', patternUrl: '' },
    riddle: null,
    hint: { type: 'text', config: { value: '' } }
  };
  
  container.innerHTML = `
    <div class="setup-screen">
      <header class="setup-header">
        <button class="btn btn-secondary" id="btn-back">← 목록으로</button>
        <h1>${isNew ? '새 보물 추가' : '보물 수정'}</h1>
      </header>
      
      <div class="setup-content">
        <!-- Basic Info -->
        <section class="card">
          <h2>기본 정보</h2>
          <div class="form-group">
            <label class="form-label">보물 이름</label>
            <input type="text" class="form-input" id="treasure-name" readonly
                   value="${treasure.name || ''}" placeholder="아래에서 보물 대상을 선택하면 자동으로 입력됩니다">
          </div>
        </section>
        
        <!-- 촬영 & 오브젝트 선택 -->
        <section class="card" style="margin-top: 1rem;">
          <h2>촬영 & 보물 대상 선택</h2>
          <p class="hint-text">촬영 후 표시된 오브젝트 중 하나를 선택하세요.</p>
          
          <!-- Fullscreen camera modal (mobile) / inline (desktop). 캡처 결과도 같은 공간에 표시 -->
          <div id="camera-fullscreen-modal" class="camera-modal">
            <div class="camera-modal-inner">
              <div class="webcam-container" id="webcam-container">
                <video id="webcam-preview" autoplay playsinline class="preview-source"></video>
                <img id="captured-image" alt="캡처" class="preview-source" style="display: none;">
                <canvas id="detection-overlay" class="detection-overlay"></canvas>
                <canvas id="capture-canvas" style="display: none;"></canvas>
                <canvas id="detection-canvas" style="display: none;"></canvas>
                <div id="room-info-overlay" class="room-info-overlay" style="display: none;">
                  <div class="room-info-room"><span id="room-icon">🏠</span> <span id="room-name">감지 중...</span></div>
                  <div class="room-info-objects" id="room-objects"></div>
                </div>
                <button class="cam-switch-btn" id="btn-switch-camera" style="display: none;" title="카메라 전환">🔄</button>
                <span id="zoom-level" class="cam-zoom-badge" style="display: none;">1.0x</span>
                <button type="button" class="captured-view-close" id="btn-captured-close" style="display: none;" title="다시 찍기">✕</button>
              </div>
              <div class="camera-modal-controls">
                <button class="cam-modal-close" id="btn-camera-close" title="닫기">✕</button>
                <button class="cam-modal-capture" id="btn-capture" title="촬영">📷</button>
                <div class="cam-modal-spacer"></div>
              </div>
            </div>
          </div>
          
          <div id="detected-objects" style="display: none;">
            <p class="detected-objects-label">오브젝트 선택 <span id="selected-object-name" class="selected-name-inline"></span></p>
            <div id="objects-list" class="objects-grid"></div>
            <label class="form-label checkbox-label checkbox-inline">
              <input type="checkbox" id="feature-limit-checkbox" ${(isNew || treasure.featureEmbedding?.length) ? 'checked' : ''}>
              <span>같은 종류 중 선택한 대상만 인정</span>
            </label>
          </div>
          
          <div class="webcam-controls">
            <button class="btn btn-primary" id="btn-start-webcam">카메라 시작</button>
            <button class="btn btn-success desktop-only-capture" id="btn-capture-desktop" style="display: none;">📷 촬영</button>
          </div>
        </section>
        
        <!-- Riddle Selection (Improved) -->
        <section class="card" style="margin-top: 1rem;">
          <h2>수수께끼</h2>
          
          <div class="form-group">
            <label class="form-label">문제 선택 방식</label>
            <select class="form-input" id="riddle-mode">
              <option value="bank" ${treasure.riddleId ? 'selected' : ''}>문제 뱅크에서 선택</option>
              <option value="custom" ${treasure.riddle && !treasure.riddleId ? 'selected' : ''}>직접 입력</option>
            </select>
          </div>
          
          <!-- Bank Selection (Improved) -->
          <div id="riddle-bank-section">
            <div class="riddle-filters">
              <div class="form-group" style="flex: 1;">
                <label class="form-label">카테고리</label>
                <select class="form-input" id="riddle-category">
                  <option value="">전체</option>
                  <option value="math">🔢 사칙연산</option>
                  <option value="nonsense">😄 넌센스</option>
                  <option value="idiom">📚 사자성어</option>
                  <option value="english">🔤 영어</option>
                  <option value="minigame">🎮 미니게임</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label class="form-label">난이도</label>
                <select class="form-input" id="riddle-difficulty">
                  <option value="">전체</option>
                  <option value="easy">⭐ 쉬움</option>
                  <option value="medium">⭐⭐ 보통</option>
                  <option value="hard">⭐⭐⭐ 어려움</option>
                </select>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">문제 목록 <span id="riddle-count" class="riddle-count"></span></label>
              <div id="riddle-cards" class="riddle-cards"></div>
            </div>
          </div>
          
          <!-- Custom Input -->
          <div id="riddle-custom-section" style="display: none;">
            <div class="form-group">
              <label class="form-label">문제 유형</label>
              <select class="form-input" id="custom-riddle-type">
                <option value="text">텍스트 입력</option>
                <option value="choice">4지선다</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">문제</label>
              <input type="text" class="form-input" id="custom-question" 
                     value="${treasure.riddle?.config?.question || ''}" placeholder="문제를 입력하세요">
            </div>
            <div class="form-group">
              <label class="form-label">정답</label>
              <input type="text" class="form-input" id="custom-answer" 
                     value="${treasure.riddle?.config?.answer || ''}" placeholder="정답을 입력하세요">
            </div>
          </div>
        </section>
        
        <!-- Save Button -->
        <button class="btn btn-success btn-large" id="btn-save-treasure" style="width: 100%; margin-top: 1rem;">
          ${isNew ? '보물 추가' : '저장'}
        </button>
      </div>
    </div>
  `;
  
  addSetupStyles();
  setupEditorEvents(treasure, isNew);
}

/**
 * Setup editor event listeners
 */
function setupEditorEvents(treasure, isNew) {
  let webcamStream = null;
  let capturedImageData = treasure.capturedImage || null;
  let detectedObjects = [];
  let selectedObject = treasure.detectedObject || null;
  let selectedDetectionIndex = null; // which detection (e.g. which person) when multiple same class
  let captureWidth = 0;
  let captureHeight = 0;
  let lastSegmentMasksForCaptured = []; // segment masks for captured image (UI 그리기용)
  let selectedRiddleId = treasure.riddleId || null;
  let isMirroredCamera = false; // Track if camera is mirrored (front-facing)
  
  // Back button
  document.getElementById('btn-back').addEventListener('click', () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    renderLevelEditScreen();
  });
  
  // Webcam controls
  const video = document.getElementById('webcam-preview');
  const canvas = document.getElementById('capture-canvas');
  const capturedImage = document.getElementById('captured-image');
  const detectionOverlay = document.getElementById('detection-overlay');
  const btnStartWebcam = document.getElementById('btn-start-webcam');
  const btnCapture = document.getElementById('btn-capture');
  const btnCaptureDesktop = document.getElementById('btn-capture-desktop');
  const btnCapturedClose = document.getElementById('btn-captured-close');
  const detectedObjectsSection = document.getElementById('detected-objects');
  const objectsList = document.getElementById('objects-list');
  const selectedObjectName = document.getElementById('selected-object-name');
  const featureLimitCheckbox = document.getElementById('feature-limit-checkbox');

  let liveDetectionRunning = false;
  let liveDetectionModel = null;
  let lastLivePredictions = []; // Store last live detection results
  let currentFacingMode = 'environment'; // 'environment' = rear, 'user' = front
  let currentZoom = 1;
  let zoomCapabilities = { min: 1, max: 1, step: 0 }; // Populated after camera starts
  
  const btnSwitchCamera = document.getElementById('btn-switch-camera');
  const zoomLevel = document.getElementById('zoom-level');
  const webcamContainer = document.getElementById('webcam-container');
  const cameraModal = document.getElementById('camera-fullscreen-modal');
  const btnCameraClose = document.getElementById('btn-camera-close');
  const isMobile = /Android|iPhone|iPod|Windows Phone/i.test(navigator.userAgent);

  const detectionOverlayView = new DetectionOverlayView(webcamContainer, detectionOverlay, { translateClass });
  
  function openCameraModal() {
    if (isMobile) {
      cameraModal.classList.add('fullscreen');
      document.body.style.overflow = 'hidden';
    }
  }
  
  function closeCameraModal() {
    cameraModal.classList.remove('fullscreen');
    document.body.style.overflow = '';
  }
  
  async function startCamera(facingMode) {
    // Stop existing stream
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    stopLiveDetection();
    openCameraModal();
    
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      video.srcObject = webcamStream;
      currentFacingMode = facingMode;
      
      const track = webcamStream.getVideoTracks()[0];
      const settings = track.getSettings();
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      console.log('Camera settings:', settings);
      console.log('Camera capabilities:', capabilities);
      
      // Setup zoom capabilities
      if (capabilities.zoom) {
        zoomCapabilities = {
          min: capabilities.zoom.min || 1,
          max: capabilities.zoom.max || 1,
          step: capabilities.zoom.step || 0.1
        };
      } else {
        zoomCapabilities = { min: 1, max: 1, step: 0 };
      }
      currentZoom = settings.zoom || 1;
      zoomLevel.style.display = 'none';
      zoomLevel.textContent = `${currentZoom.toFixed(1)}x`;
      
      // Check if multiple cameras available for switch button
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      btnSwitchCamera.style.display = videoDevices.length > 1 ? 'flex' : 'none';
      
      // Show controls
      btnStartWebcam.style.display = 'none';
      if (!isMobile) {
        btnCaptureDesktop.style.display = 'inline-flex';
      }
      
      // Start live detection when video is ready (dimensions + 1 paint frame). Single async pipeline.
      waitForVideoReady(video)
        .then(() => loadObjectDetectionModel())
        .then((model) => {
          if (model) {
            liveDetectionModel = model;
            startLiveDetection();
          }
        })
        .catch(() => {});
    } catch (err) {
      alert('카메라 접근 권한이 필요합니다.');
      console.error('Webcam error:', err);
    }
  }
  
  let zoomBadgeTimeout = null;
  
  async function applyZoom(zoom) {
    if (!webcamStream || zoomCapabilities.max <= 1) return;
    const track = webcamStream.getVideoTracks()[0];
    const clamped = Math.max(zoomCapabilities.min, Math.min(zoomCapabilities.max, zoom));
    try {
      await track.applyConstraints({ advanced: [{ zoom: clamped }] });
      currentZoom = clamped;
      zoomLevel.textContent = `${clamped.toFixed(1)}x`;
      zoomLevel.style.display = 'inline-block';
      // Auto-hide after 1.5s
      clearTimeout(zoomBadgeTimeout);
      zoomBadgeTimeout = setTimeout(() => { zoomLevel.style.display = 'none'; }, 1500);
    } catch (err) {
      console.warn('Zoom not supported:', err);
    }
  }
  
  btnStartWebcam.addEventListener('click', () => startCamera(currentFacingMode));
  
  btnCameraClose.addEventListener('click', () => {
    stopLiveDetection();
    closeCameraModal();
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    switchToLiveView();
    btnStartWebcam.style.display = '';
    btnCaptureDesktop.style.display = 'none';
  });
  
  btnSwitchCamera.addEventListener('click', () => {
    const newMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    startCamera(newMode);
  });
  
  // Pinch-to-zoom on webcam container
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  
  webcamContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartZoom = currentZoom;
    }
  }, { passive: false });
  
  webcamContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / pinchStartDist;
      applyZoom(pinchStartZoom * scale);
    }
  }, { passive: false });
  
  // Mouse wheel zoom (desktop fallback)
  webcamContainer.addEventListener('wheel', (e) => {
    if (!webcamStream || zoomCapabilities.max <= 1) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    applyZoom(currentZoom + delta);
  }, { passive: false });
  
  // Live detection loop
  function startLiveDetection() {
    liveDetectionRunning = true;
    
    async function detectFrame() {
      if (!liveDetectionRunning || !liveDetectionModel || video.paused || video.ended) {
        return;
      }
      
      // Wait for video to have dimensions and at least one frame (fixes first run no detection)
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        requestAnimationFrame(detectFrame);
        return;
      }
      
      try {
        const predictions = await runDetection(liveDetectionModel, video, { scoreThreshold: 0.5 });
        lastLivePredictions = predictions;
        let segmentMasks = [];
        if (isSegmentAvailableForClass('person')) {
          try {
            segmentMasks = await getSegmentMasks(video);
          } catch (_) {}
        }
        drawLiveDetections(predictions, segmentMasks);
      } catch (err) {
        console.error('Live detection error:', err);
      }
      
      // Continue loop (throttle to ~10fps for performance)
      setTimeout(() => requestAnimationFrame(detectFrame), 100);
    }
    
    detectFrame();
  }
  
  function stopLiveDetection() {
    liveDetectionRunning = false;
    detectionOverlayView.clear();
    document.getElementById('room-info-overlay').style.display = 'none';
  }

  const roomInfoOverlay = document.getElementById('room-info-overlay');
  const roomIcon = document.getElementById('room-icon');
  const roomName = document.getElementById('room-name');
  const roomObjects = document.getElementById('room-objects');

  function drawLiveDetections(predictions, segmentMasks = []) {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (!videoWidth || !videoHeight) {
      updateRoomInfo(predictions);
      return;
    }
    detectionOverlayView.setSourceSize(videoWidth, videoHeight);
    detectionOverlayView.setContent(predictions, segmentMasks, {
      scoreThreshold: 0.5,
      withIndex: false
    });
    updateRoomInfo(predictions);
  }
  
  function updateRoomInfo(predictions) {
    const room = inferRoom(predictions);
    const filtered = predictions.filter(p => p.score > 0.5);
    
    if (filtered.length === 0) {
      roomInfoOverlay.style.display = 'none';
      return;
    }
    
    roomInfoOverlay.style.display = 'block';
    
    if (room) {
      roomIcon.textContent = room.icon;
      roomName.textContent = room.name;
    } else {
      roomIcon.textContent = '📷';
      roomName.textContent = '감지 중...';
    }
    
    // Deduplicate and show object counts
    const objCounts = {};
    filtered.forEach(p => {
      const name = translateClass(p.class);
      objCounts[name] = (objCounts[name] || 0) + 1;
    });
    roomObjects.innerHTML = Object.entries(objCounts)
      .map(([name, count]) => `<span class="room-obj-tag">${name}${count > 1 ? ' ×' + count : ''}</span>`)
      .join('');
  }
  
  async function performCapture() {
    // Stop live detection first
    stopLiveDetection();
    
    // Store video dimensions before stopping
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    // Capture image
    captureWidth = videoWidth;
    captureHeight = videoHeight;
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
    capturedImage.src = capturedImageData;
    video.style.display = 'none';
    capturedImage.style.display = 'block';
    if (btnCapture) btnCapture.style.display = 'none';
    if (btnCapturedClose) btnCapturedClose.style.display = 'block';
    btnCaptureDesktop.style.display = 'none';

    // Stop webcam
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    
    // Use live detection results directly (no re-detection needed)
    detectedObjects = lastLivePredictions;
    
    if (detectedObjects.length === 0) {
      objectsList.innerHTML = '<p class="no-objects">검출된 오브젝트가 없습니다. 다시 촬영해보세요.</p>';
      detectedObjectsSection.style.display = 'block';
      return;
    }
    
    // Wait for image to load
    await new Promise(resolve => {
      if (capturedImage.complete) resolve();
      else capturedImage.onload = resolve;
    });
    // Wait for displayed dimensions (layout after display:block) so bbox drawing works first time
    await new Promise((resolve) => {
      let frames = 0;
      const maxFrames = 60;
      function check() {
        if (capturedImage.clientWidth > 0 && capturedImage.clientHeight > 0) {
          resolve();
          return;
        }
        if (++frames >= maxFrames) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (isSegmentAvailableForClass('person')) {
      try {
        lastSegmentMasksForCaptured = await getSegmentMasks(capturedImage);
      } catch (_) {
        lastSegmentMasksForCaptured = [];
      }
    } else {
      lastSegmentMasksForCaptured = [];
    }
    drawCapturedDetections(detectedObjects, videoWidth, videoHeight, lastSegmentMasksForCaptured);
    // Show detected objects list
    renderDetectedObjects(detectedObjects);
    detectedObjectsSection.style.display = 'block';
  }
  
  btnCapture.addEventListener('click', performCapture);
  btnCaptureDesktop.addEventListener('click', performCapture);

  function getStyleForPred(pred) {
    const isSelected = selectedObject === pred.class;
    return {
      fillStyle: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(99, 102, 241, 0.2)',
      strokeStyle: isSelected ? '#10b981' : '#6366f1',
      lineWidth: isSelected ? 4 : 3
    };
  }

  function drawCapturedDetections(predictions, originalWidth, originalHeight, segmentMasks = []) {
    detectionOverlayView.setSourceSize(originalWidth, originalHeight);
    detectionOverlayView.setContent(predictions, segmentMasks, {
      scoreThreshold: 0,
      getStyle: getStyleForPred
    });
  }
  
  async function detectObjects(imageElement) {
    showLoadingOverlay('AI 오브젝트 검출 중...');
    
    const model = await loadObjectDetectionModel();
    if (!model) {
      hideLoadingOverlay();
      alert('AI 모델 로딩에 실패했습니다.');
      return;
    }
    
    try {
      // Wait for image to load
      await new Promise(resolve => {
        if (imageElement.complete) resolve();
        else imageElement.onload = resolve;
      });
      
      const predictions = await runDetection(model, imageElement, { scoreThreshold: 0.3 });
      hideLoadingOverlay();
      detectedObjects = predictions;
      
      if (detectedObjects.length === 0) {
        objectsList.innerHTML = '<p class="no-objects">검출된 오브젝트가 없습니다. 다시 촬영해보세요.</p>';
        detectedObjectsSection.style.display = 'block';
        return;
      }
      
      // Wait for layout to be calculated after display change
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (isSegmentAvailableForClass('person')) {
        try {
          lastSegmentMasksForCaptured = await getSegmentMasks(imageElement);
        } catch (_) {
          lastSegmentMasksForCaptured = [];
        }
      } else {
        lastSegmentMasksForCaptured = [];
      }
      drawDetections(detectionOverlay, detectedObjects);
      
      // Show detected objects list
      renderDetectedObjects(detectedObjects);
      detectedObjectsSection.style.display = 'block';
      
    } catch (err) {
      hideLoadingOverlay();
      console.error('Object detection error:', err);
      alert('오브젝트 검출 중 오류가 발생했습니다.');
    }
  }
  
  function drawDetections(_canvas, predictions) {
    const nw = capturedImage.naturalWidth;
    const nh = capturedImage.naturalHeight;
    if (!nw || !nh) return;
    detectionOverlayView.setSourceSize(nw, nh);
    detectionOverlayView.setContent(predictions, lastSegmentMasksForCaptured || [], {
      scoreThreshold: 0,
      getStyle: (pred) => ({ ...getStyleForPred(pred), lineWidth: selectedObject === pred.class ? 4 : 2 })
    });
  }
  
  function renderDetectedObjects(predictions) {
    objectsList.innerHTML = predictions.map((pred, index) => `
      <button class="object-card ${selectedObject === pred.class ? 'selected' : ''}" 
              data-class="${pred.class}" data-index="${index}">
        <span class="object-number">${index + 1}</span>
        <span class="object-name">${translateClass(pred.class)}</span>
        <span class="object-score">${Math.round(pred.score * 100)}%</span>
      </button>
    `).join('');
    
    // Add click handlers
    objectsList.querySelectorAll('.object-card').forEach(card => {
      card.addEventListener('click', () => {
        const objectClass = card.dataset.class;
        const index = card.dataset.index != null ? parseInt(card.dataset.index, 10) : null;
        selectObject(objectClass, index);
      });
    });
  }
  
  function selectObject(objectClass, index) {
    selectedObject = objectClass;
    selectedDetectionIndex = index;
    
    objectsList.querySelectorAll('.object-card').forEach(card => {
      const match = card.dataset.class === objectClass && parseInt(card.dataset.index, 10) === index;
      card.classList.toggle('selected', match);
    });
    
    if (selectedObjectName) selectedObjectName.textContent = ` · 선택: ${translateClass(objectClass)}`;
    
    drawDetections(detectionOverlay, detectedObjects);
    
    const nameInput = document.getElementById('treasure-name');
    if (nameInput) nameInput.value = translateClass(objectClass);
  }
  
  function switchToLiveView() {
    if (video) video.style.display = '';
    if (capturedImage) capturedImage.style.display = 'none';
    if (btnCapture) btnCapture.style.display = '';
    if (btnCapturedClose) btnCapturedClose.style.display = 'none';
    btnCaptureDesktop.style.display = 'inline-flex';
  }

  async function handleRetake() {
    capturedImageData = null;
    selectedObject = null;
    selectedDetectionIndex = null;
    captureWidth = 0;
    captureHeight = 0;
    detectedObjects = [];
    lastLivePredictions = [];
    switchToLiveView();
    detectedObjectsSection.style.display = 'none';
    if (selectedObjectName) selectedObjectName.textContent = '';
    await startCamera(currentFacingMode);
  }

  btnCapturedClose?.addEventListener('click', handleRetake);

  /** 보물 수정 시: 저장된 캡처 이미지와 선택 오브젝트를 표시 */
  async function restoreExistingCapture() {
    if (!capturedImageData) return;
    video.style.display = 'none';
    capturedImage.style.display = 'block';
    capturedImage.src = capturedImageData;
    if (btnCapture) btnCapture.style.display = 'none';
    if (btnCapturedClose) btnCapturedClose.style.display = 'block';
    btnStartWebcam.style.display = 'none';
    btnCaptureDesktop.style.display = 'none';

    await new Promise((resolve) => {
      if (capturedImage.complete) resolve();
      else capturedImage.onload = resolve;
    });
    captureWidth = capturedImage.naturalWidth;
    captureHeight = capturedImage.naturalHeight;

    const model = await loadObjectDetectionModel();
    if (!model) return;
    const predictions = await runDetection(model, capturedImage, { scoreThreshold: 0.3 });
    detectedObjects = predictions;
    if (detectedObjects.length === 0) return;

    if (selectedObject) {
      const idx = detectedObjects.findIndex((p) => p.class === selectedObject);
      if (idx >= 0) selectedDetectionIndex = idx;
    }
    if (isSegmentAvailableForClass('person')) {
      try {
        lastSegmentMasksForCaptured = await getSegmentMasks(capturedImage);
      } catch (_) {
        lastSegmentMasksForCaptured = [];
      }
    } else {
      lastSegmentMasksForCaptured = [];
    }

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    detectionOverlayView.setSourceSize(captureWidth, captureHeight);
    detectionOverlayView.setContent(detectedObjects, lastSegmentMasksForCaptured, {
      scoreThreshold: 0,
      getStyle: getStyleForPred
    });
    detectedObjectsSection.style.display = 'block';
    renderDetectedObjects(detectedObjects);
    if (selectedObjectName && selectedObject) {
      selectedObjectName.textContent = ` · 선택: ${translateClass(selectedObject)}`;
    }
  }
  restoreExistingCapture().catch(() => {});

  // Riddle mode toggle
  const riddleMode = document.getElementById('riddle-mode');
  const bankSection = document.getElementById('riddle-bank-section');
  const customSection = document.getElementById('riddle-custom-section');
  
  // Riddle filters - declare before using
  const riddleCategory = document.getElementById('riddle-category');
  const riddleDifficulty = document.getElementById('riddle-difficulty');
  const riddleCards = document.getElementById('riddle-cards');
  const riddleCount = document.getElementById('riddle-count');
  
  function updateRiddleCards() {
    const category = riddleCategory.value;
    const difficulty = riddleDifficulty.value;
    
    let riddles = [...riddleBank];
    
    if (category) {
      riddles = riddles.filter(r => r.category === category);
    }
    if (difficulty) {
      riddles = riddles.filter(r => r.difficulty === difficulty);
    }
    
    riddleCount.textContent = `(${riddles.length}개)`;
    
    if (riddles.length === 0) {
      riddleCards.innerHTML = '<p class="no-riddles">조건에 맞는 문제가 없습니다.</p>';
      return;
    }
    
    riddleCards.innerHTML = riddles.map(r => `
      <div class="riddle-card ${selectedRiddleId === r.id ? 'selected' : ''}" data-id="${r.id}">
        <div class="riddle-card-header">
          <span class="riddle-type-badge ${r.type}">${getTypeBadge(r.type)}</span>
          <span class="riddle-difficulty">${getDifficultyStars(r.difficulty)}</span>
        </div>
        <p class="riddle-question">${r.config.question || r.config.instruction || '(미니게임)'}</p>
        <div class="riddle-card-footer">
          <span class="riddle-category">${getCategoryLabel(r.category)}</span>
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    riddleCards.querySelectorAll('.riddle-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedRiddleId = card.dataset.id;
        riddleCards.querySelectorAll('.riddle-card').forEach(c => {
          c.classList.toggle('selected', c.dataset.id === selectedRiddleId);
        });
      });
    });
  }
  
  riddleCategory.addEventListener('change', updateRiddleCards);
  riddleDifficulty.addEventListener('change', updateRiddleCards);
  
  // Riddle mode UI update function
  function updateRiddleModeUI() {
    if (riddleMode.value === 'bank') {
      bankSection.style.display = 'block';
      customSection.style.display = 'none';
      updateRiddleCards();
    } else {
      bankSection.style.display = 'none';
      customSection.style.display = 'block';
    }
  }
  
  riddleMode.addEventListener('change', updateRiddleModeUI);
  updateRiddleModeUI();
  
  // Save treasure
  document.getElementById('btn-save-treasure').addEventListener('click', async () => {
    const name = document.getElementById('treasure-name').value.trim();
    
    if (!name) {
      showSetupToast('보물 이름을 입력하세요.', 'error');
      return;
    }
    
    // Build riddle
    let riddle = null;
    let riddleId = null;
    
    if (riddleMode.value === 'bank') {
      if (!selectedRiddleId) {
        showSetupToast('문제를 선택하세요.', 'error');
        return;
      }
      riddleId = selectedRiddleId;
    } else {
      const question = document.getElementById('custom-question').value.trim();
      const answer = document.getElementById('custom-answer').value.trim();
      const type = document.getElementById('custom-riddle-type').value;
      
      if (!question || !answer) {
        showSetupToast('문제와 정답을 입력하세요.', 'error');
        return;
      }
      
      riddle = {
        type: type,
        config: { question, answer }
      };
    }
    
    // Hint = 다음 보물 이름으로 자동 설정
    const nextName = treasures.items?.[currentTreasureIndex + 1]?.name ?? '';
    const hint = { type: 'text', config: { value: nextName } };

    const featureLimitEnabled = document.getElementById('feature-limit-checkbox')?.checked ?? true;

    const newTreasure = {
      id: treasure.id || `treasure-${Date.now()}`,
      order: currentTreasureIndex + 1,
      name: name,
      marker: { type: 'pattern', patternUrl: `/markers/marker-${currentTreasureIndex}.patt` },
      capturedImage: capturedImageData,
      detectedObject: selectedObject,
      riddle: riddle,
      riddleId: riddleId,
      hint: hint
    };

    if (featureLimitEnabled) {
      if (selectedDetectionIndex != null && detectedObjects[selectedDetectionIndex] && capturedImageData) {
        try {
          if (!capturedImage.complete) {
            await new Promise(resolve => {
              capturedImage.onload = resolve;
              capturedImage.onerror = resolve;
            });
          }
          const w = captureWidth || capturedImage.naturalWidth;
          const h = captureHeight || capturedImage.naturalHeight;
          if (w && h) {
            const refCanvas = document.createElement('canvas');
            refCanvas.width = w;
            refCanvas.height = h;
            const refCtx = refCanvas.getContext('2d');
            refCtx.drawImage(capturedImage, 0, 0);
            newTreasure.featureEmbedding = await getEmbeddingFromCrop(
              refCanvas,
              detectedObjects[selectedDetectionIndex].bbox,
              w,
              h
            );
          } else if (treasure.featureEmbedding) {
            newTreasure.featureEmbedding = treasure.featureEmbedding;
          }
        } catch (err) {
          console.warn('Feature embedding failed:', err);
          if (treasure.featureEmbedding) newTreasure.featureEmbedding = treasure.featureEmbedding;
        }
      } else if (treasure.featureEmbedding) {
        newTreasure.featureEmbedding = treasure.featureEmbedding;
      }
    }

    if (!treasures.items) {
      treasures.items = [];
    }
    if (isNew) {
      treasures.items.push(newTreasure);
    } else {
      treasures.items[currentTreasureIndex] = newTreasure;
    }
    saveTreasures(treasures);

    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    renderLevelEditScreen();
  });
}

/**
 * Translate COCO class names to Korean
 */
function translateClass(className) {
  const translations = {
    'person': '사람',
    'bicycle': '자전거',
    'car': '자동차',
    'motorcycle': '오토바이',
    'airplane': '비행기',
    'bus': '버스',
    'train': '기차',
    'truck': '트럭',
    'boat': '보트',
    'traffic light': '신호등',
    'fire hydrant': '소화전',
    'stop sign': '정지 표지판',
    'parking meter': '주차 미터기',
    'bench': '벤치',
    'bird': '새',
    'cat': '고양이',
    'dog': '강아지',
    'horse': '말',
    'sheep': '양',
    'cow': '소',
    'elephant': '코끼리',
    'bear': '곰',
    'zebra': '얼룩말',
    'giraffe': '기린',
    'backpack': '백팩',
    'umbrella': '우산',
    'handbag': '핸드백',
    'tie': '넥타이',
    'suitcase': '여행가방',
    'frisbee': '프리스비',
    'skis': '스키',
    'snowboard': '스노보드',
    'sports ball': '공',
    'kite': '연',
    'baseball bat': '야구 배트',
    'baseball glove': '야구 글러브',
    'skateboard': '스케이트보드',
    'surfboard': '서핑보드',
    'tennis racket': '테니스 라켓',
    'bottle': '병',
    'wine glass': '와인잔',
    'cup': '컵',
    'fork': '포크',
    'knife': '나이프',
    'spoon': '숟가락',
    'bowl': '그릇',
    'banana': '바나나',
    'apple': '사과',
    'sandwich': '샌드위치',
    'orange': '오렌지',
    'broccoli': '브로콜리',
    'carrot': '당근',
    'hot dog': '핫도그',
    'pizza': '피자',
    'donut': '도넛',
    'cake': '케이크',
    'chair': '의자',
    'couch': '소파',
    'potted plant': '화분',
    'bed': '침대',
    'dining table': '식탁',
    'toilet': '화장실',
    'tv': 'TV',
    'laptop': '노트북',
    'mouse': '마우스',
    'remote': '리모컨',
    'keyboard': '키보드',
    'cell phone': '휴대폰',
    'microwave': '전자레인지',
    'oven': '오븐',
    'toaster': '토스터',
    'sink': '싱크대',
    'refrigerator': '냉장고',
    'book': '책',
    'clock': '시계',
    'vase': '꽃병',
    'scissors': '가위',
    'teddy bear': '테디베어',
    'hair drier': '헤어드라이어',
    'toothbrush': '칫솔'
  };
  return translations[className] || className;
}

/**
 * Infer room type from detected objects
 */
function inferRoom(predictions) {
  const classes = predictions.filter(p => p.score > 0.4).map(p => p.class);
  const has = (...items) => items.some(i => classes.includes(i));

  const scores = {
    kitchen:    0,
    livingRoom: 0,
    bedroom:    0,
    bathroom:   0,
    office:     0,
    dining:     0,
  };

  // Kitchen signals
  if (has('refrigerator'))  scores.kitchen += 3;
  if (has('oven'))          scores.kitchen += 3;
  if (has('microwave'))     scores.kitchen += 2;
  if (has('toaster'))       scores.kitchen += 2;
  if (has('sink'))          scores.kitchen += 1;
  if (has('bottle'))        scores.kitchen += 1;
  if (has('bowl', 'cup'))   scores.kitchen += 1;
  if (has('knife', 'fork', 'spoon')) scores.kitchen += 1;

  // Living room signals
  if (has('couch'))         scores.livingRoom += 3;
  if (has('tv'))            scores.livingRoom += 2;
  if (has('remote'))        scores.livingRoom += 2;
  if (has('potted plant'))  scores.livingRoom += 1;
  if (has('vase'))          scores.livingRoom += 1;
  if (has('clock'))         scores.livingRoom += 1;

  // Bedroom signals
  if (has('bed'))           scores.bedroom += 4;
  if (has('teddy bear'))    scores.bedroom += 2;
  if (has('clock'))         scores.bedroom += 1;
  if (has('book'))          scores.bedroom += 1;

  // Bathroom signals
  if (has('toilet'))        scores.bathroom += 4;
  if (has('sink'))          scores.bathroom += 2;
  if (has('toothbrush'))    scores.bathroom += 3;
  if (has('hair drier'))    scores.bathroom += 2;

  // Office signals
  if (has('laptop'))        scores.office += 3;
  if (has('keyboard'))      scores.office += 2;
  if (has('mouse'))         scores.office += 2;
  if (has('cell phone'))    scores.office += 1;
  if (has('book'))          scores.office += 1;
  if (has('chair'))         scores.office += 1;

  // Dining signals
  if (has('dining table'))  scores.dining += 3;
  if (has('chair'))         scores.dining += 1;
  if (has('bowl', 'cup'))   scores.dining += 1;
  if (has('wine glass'))    scores.dining += 2;
  if (has('fork', 'knife', 'spoon')) scores.dining += 2;

  const roomMap = {
    kitchen:    { name: '주방',     icon: '🍳' },
    livingRoom: { name: '거실',     icon: '🛋️' },
    bedroom:    { name: '침실',     icon: '🛏️' },
    bathroom:   { name: '욕실',     icon: '🚿' },
    office:     { name: '서재/작업실', icon: '💻' },
    dining:     { name: '식당',     icon: '🍽️' },
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] >= 2) {
    return roomMap[best[0]];
  }
  
  // Fallback: if objects detected but no room match
  if (classes.length > 0) {
    return { name: '실내', icon: '🏠' };
  }
  return null;
}

/**
 * Get type badge text
 */
function getTypeBadge(type) {
  const badges = {
    'text': '✏️ 입력',
    'choice': '🔘 선택',
    'sequence': '🔢 순서',
    'memory': '🃏 기억',
    'connect': '🔗 연결'
  };
  return badges[type] || type;
}

/**
 * Get difficulty stars
 */
function getDifficultyStars(difficulty) {
  const stars = { 'easy': '⭐', 'medium': '⭐⭐', 'hard': '⭐⭐⭐' };
  return stars[difficulty] || '';
}

/**
 * Get category label
 */
function getCategoryLabel(category) {
  const labels = {
    'math': '🔢 사칙연산',
    'nonsense': '😄 넌센스',
    'idiom': '📚 사자성어',
    'english': '🔤 영어',
    'minigame': '🎮 미니게임'
  };
  return labels[category] || category;
}

/**
 * Delete treasure
 */
function deleteTreasure(index) {
  if (confirm('이 보물을 삭제하시겠습니까?')) {
    treasures.items.splice(index, 1);
    treasures.items.forEach((t, i) => t.order = i + 1);
    saveTreasures(treasures);
    renderLevelEditScreen();
  }
}

/**
 * Show toast message (setup screen)
 */
function showSetupToast(message, type = '') {
  document.querySelector('.setup-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `setup-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

/**
 * Save game settings
 */
function saveSettings() {
  const btn = document.getElementById('btn-save-settings');
  if (!btn) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '저장 중...';
  try {
    treasures.initialScore = parseInt(document.getElementById('initial-score').value) || 1000;
    treasures.scoreDecayPerSecond = parseFloat(document.getElementById('score-decay').value) || 1;
    saveTreasures(treasures);
    showSetupToast('설정이 저장되었습니다.', 'success');
  } catch (err) {
    console.error('Save settings error:', err);
    showSetupToast('저장에 실패했습니다. 다시 시도해주세요.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/**
 * Add setup-specific styles
 */
function addSetupStyles() {
  if (document.getElementById('setup-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'setup-styles';
  style.textContent = `
    .setup-toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.75rem 1.5rem;
      border-radius: var(--border-radius, 8px);
      background: #1e293b;
      color: white;
      font-size: 0.95rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: setup-toast-in 0.25s ease;
    }
    .setup-toast.success { background: #059669; }
    .setup-toast.error { background: #dc2626; }
    @keyframes setup-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .setup-screen {
      min-height: 100vh;
      background: var(--bg-color);
    }
    
    .setup-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: white;
      box-shadow: var(--shadow);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    
    .setup-header h1 {
      font-size: 1.25rem;
      flex: 1;
    }
    
    .setup-content {
      padding: 1rem;
      max-width: 600px;
      margin: 0 auto;
    }
    
    .hint-text {
      color: var(--text-light);
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    
    .empty-message, .no-objects, .no-riddles {
      text-align: center;
      color: var(--text-light);
      padding: 2rem;
    }
    
    .level-list-container { min-height: 2rem; }
    .level-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
      cursor: grab;
    }
    .level-item:last-child { border-bottom: none; }
    .level-order {
      width: 28px;
      height: 28px;
      background: var(--primary-color);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.9rem;
      flex-shrink: 0;
    }
    .level-info { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
    .level-name { font-weight: 500; }
    .level-meta { font-size: 0.8rem; color: var(--text-light); }
    .level-actions { display: flex; gap: 0.5rem; }
    
    .treasure-cards-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.75rem;
    }
    .treasure-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: var(--border-radius, 8px);
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      cursor: grab;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .treasure-card:hover { border-color: var(--primary-color); }
    .treasure-card-body { display: flex; flex-direction: column; gap: 0.5rem; }
    .treasure-card-thumb {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: 6px;
      background: #e2e8f0;
    }
    .treasure-card-thumb.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
    }
    .treasure-card-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .treasure-card-info .treasure-order {
      width: 22px;
      height: 22px;
      background: var(--primary-color);
      color: white;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.8rem;
    }
    .treasure-card-info .treasure-name { font-weight: 500; font-size: 0.9rem; }
    .treasure-object { font-size: 0.75rem; color: var(--success-color); }
    .treasure-card-actions { display: flex; gap: 0.5rem; margin-top: auto; }
    
    .btn-small {
      padding: 0.4rem 0.8rem;
      font-size: 0.85rem;
    }
    
    /* Camera modal - inline by default */
    .camera-modal {
      position: relative;
    }
    
    /* Fullscreen mode (mobile) */
    .camera-modal.fullscreen {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: #000;
      display: flex;
      flex-direction: column;
    }
    
    .camera-modal.fullscreen .camera-modal-inner {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    .camera-modal.fullscreen .webcam-container {
      flex: 1;
      border-radius: 0;
      margin-bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .camera-modal.fullscreen .webcam-container video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .camera-modal-controls {
      display: none;
    }
    
    .camera-modal.fullscreen .camera-modal-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      padding-bottom: max(16px, env(safe-area-inset-bottom));
      background: #000;
    }
    
    .cam-modal-close {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: rgba(255,255,255,0.15);
      color: white;
      font-size: 1.2rem;
      cursor: pointer;
    }
    
    .cam-modal-capture {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 4px solid white;
      background: rgba(255,255,255,0.2);
      color: white;
      font-size: 1.5rem;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .cam-modal-capture:active {
      transform: scale(0.9);
      background: rgba(255,255,255,0.4);
    }
    
    .cam-modal-spacer {
      width: 44px;
    }
    
    @media (pointer: coarse) {
      .desktop-only-capture {
        display: none !important;
      }
    }
    
    .webcam-container {
      position: relative;
      width: 100%;
      min-height: 240px;
      aspect-ratio: 4/3;
      background: #000;
      border-radius: var(--border-radius);
      overflow: hidden;
      margin-bottom: 1rem;
    }
    
    .captured-view-close {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      z-index: 10;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.5);
      color: white;
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .captured-view-close:hover {
      background: rgba(0, 0, 0, 0.7);
    }
    .webcam-container .preview-source {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .webcam-container .detection-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    
    .webcam-controls {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .room-info-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 8px 12px;
      background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%);
      z-index: 5;
      pointer-events: none;
    }
    
    .room-info-room {
      font-size: 1rem;
      font-weight: 700;
      color: white;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      margin-bottom: 4px;
    }
    
    .room-info-objects {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    
    .room-obj-tag {
      font-size: 0.7rem;
      color: white;
      background: rgba(99, 102, 241, 0.7);
      padding: 1px 6px;
      border-radius: 8px;
      white-space: nowrap;
    }
    
    .cam-switch-btn {
      position: absolute;
      bottom: 12px;
      right: 12px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.5);
      color: white;
      font-size: 1.2rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
      z-index: 10;
      transition: background 0.2s;
    }
    .cam-switch-btn:hover {
      background: rgba(0, 0, 0, 0.7);
    }
    
    .cam-zoom-badge {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.85rem;
      font-weight: 700;
      color: white;
      background: rgba(0, 0, 0, 0.55);
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      z-index: 10;
      pointer-events: none;
      backdrop-filter: blur(4px);
    }
    
    /* Object Detection */
    .objects-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    
    .object-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.75rem;
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: var(--border-radius);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .object-card:hover {
      border-color: var(--primary-color);
      background: #f8fafc;
    }
    
    .object-card.selected {
      border-color: var(--success-color);
      background: #d1fae5;
    }
    
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }
    .checkbox-label input[type="checkbox"] {
      width: 1.1rem;
      height: 1.1rem;
    }
    
    .object-number {
      width: 24px;
      height: 24px;
      background: var(--primary-color);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    
    .object-name {
      font-weight: 600;
      font-size: 0.9rem;
    }
    
    .object-score {
      font-size: 0.75rem;
      color: var(--text-light);
    }
    
    .detected-objects-label {
      font-size: 0.9rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }
    .selected-name-inline {
      color: var(--success-color);
      font-weight: 600;
    }
    .checkbox-inline {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.75rem;
      font-size: 0.85rem;
      color: var(--text-light);
    }
    .checkbox-inline input { flex-shrink: 0; }
    
    /* Riddle Cards */
    .riddle-filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .riddle-count {
      font-size: 0.85rem;
      color: var(--text-light);
    }
    
    .riddle-cards {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 400px;
      overflow-y: auto;
    }
    
    .riddle-card {
      padding: 1rem;
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: var(--border-radius);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .riddle-card:hover {
      border-color: var(--primary-color);
      box-shadow: var(--shadow);
    }
    
    .riddle-card.selected {
      border-color: var(--success-color);
      background: #f0fdf4;
    }
    
    .riddle-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    
    .riddle-type-badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      background: #e2e8f0;
    }
    
    .riddle-type-badge.text { background: #dbeafe; }
    .riddle-type-badge.choice { background: #fef3c7; }
    .riddle-type-badge.sequence { background: #d1fae5; }
    .riddle-type-badge.memory { background: #ede9fe; }
    .riddle-type-badge.connect { background: #fce7f3; }
    
    .riddle-question {
      font-weight: 500;
      line-height: 1.4;
      margin-bottom: 0.5rem;
    }
    
    .riddle-card-footer {
      display: flex;
      justify-content: flex-end;
    }
    
    .riddle-category {
      font-size: 0.75rem;
      color: var(--text-light);
    }
    
    /* Loading Overlay */
    #loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    
    .loading-content {
      text-align: center;
      color: white;
    }
    
    .loading-spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .loading-text {
      font-size: 1rem;
    }
    
    textarea.form-input {
      resize: vertical;
      min-height: 80px;
    }
  `;
  document.head.appendChild(style);
}
