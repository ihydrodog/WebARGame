/**
 * Setup Module
 * Handles treasure location setup with webcam capture and object detection
 */

import { loadTreasures, saveTreasures } from './data/default-treasures.js';
import { riddleBank, getRiddlesByCategory, getRiddlesByDifficulty } from './data/riddles/index.js';

let container = null;
let onBack = null;
let treasures = [];
let currentTreasureIndex = 0;
let cocoModel = null;

/**
 * Initialize setup screen
 * @param {HTMLElement} containerEl - Container element
 * @param {Function} backCallback - Callback to return to home
 */
export function initSetup(containerEl, backCallback) {
  container = containerEl;
  onBack = backCallback;
  treasures = loadTreasures();
  
  renderSetupHome();
}

/**
 * Load COCO-SSD model for object detection
 */
async function loadObjectDetectionModel() {
  if (cocoModel) return cocoModel;
  
  try {
    showLoadingOverlay('AI 모델 로딩 중...');
    cocoModel = await cocoSsd.load();
    hideLoadingOverlay();
    return cocoModel;
  } catch (err) {
    hideLoadingOverlay();
    console.error('Failed to load COCO-SSD model:', err);
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
 * Render setup home screen
 */
function renderSetupHome() {
  container.innerHTML = `
    <div class="setup-screen">
      <header class="setup-header">
        <button class="btn btn-secondary" id="btn-back">← 돌아가기</button>
        <h1>게임 설정</h1>
      </header>
      
      <div class="setup-content">
        <section class="treasure-list card">
          <h2>보물 목록</h2>
          <p class="hint-text">보물을 추가하여 게임을 만들어보세요!</p>
          
          <div id="treasures-container">
            ${renderTreasureList()}
          </div>
          
          <button class="btn btn-primary" id="btn-add-treasure" style="width: 100%; margin-top: 1rem;">
            + 보물 추가
          </button>
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
          
          <button class="btn btn-success" id="btn-save-settings" style="width: 100%; margin-top: 1rem;">
            설정 저장
          </button>
        </section>
      </div>
    </div>
  `;
  
  addSetupStyles();
  
  document.getElementById('btn-back').addEventListener('click', onBack);
  document.getElementById('btn-add-treasure').addEventListener('click', () => {
    currentTreasureIndex = treasures.items ? treasures.items.length : 0;
    renderTreasureEditor(null);
  });
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  
  document.querySelectorAll('.treasure-item').forEach((item, index) => {
    item.querySelector('.btn-edit')?.addEventListener('click', () => {
      currentTreasureIndex = index;
      renderTreasureEditor(treasures.items[index]);
    });
    item.querySelector('.btn-delete')?.addEventListener('click', () => {
      deleteTreasure(index);
    });
  });
}

/**
 * Render treasure list HTML
 */
function renderTreasureList() {
  if (!treasures.items || treasures.items.length === 0) {
    return '<p class="empty-message">등록된 보물이 없습니다.</p>';
  }
  
  return treasures.items.map((treasure, index) => `
    <div class="treasure-item" data-index="${index}">
      <div class="treasure-info">
        <span class="treasure-order">${index + 1}</span>
        <div class="treasure-details">
          <span class="treasure-name">${treasure.name || `보물 ${index + 1}`}</span>
          ${treasure.detectedObject ? `<span class="treasure-object">🎯 ${treasure.detectedObject}</span>` : ''}
        </div>
      </div>
      <div class="treasure-actions">
        <button class="btn btn-secondary btn-small btn-edit">수정</button>
        <button class="btn btn-danger btn-small btn-delete">삭제</button>
      </div>
    </div>
  `).join('');
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
            <input type="text" class="form-input" id="treasure-name" 
                   value="${treasure.name || ''}" placeholder="예: 냉장고 안 보물">
          </div>
        </section>
        
        <!-- Webcam Capture with Object Detection -->
        <section class="card" style="margin-top: 1rem;">
          <h2>위치 촬영 (웹캠) + AI 오브젝트 검출</h2>
          <p class="hint-text">촬영 후 AI가 오브젝트를 검출합니다. 원하는 오브젝트를 선택하세요!</p>
          
          <div class="webcam-container" id="webcam-container">
            <video id="webcam-preview" autoplay playsinline></video>
            <canvas id="capture-canvas" style="display: none;"></canvas>
            <canvas id="detection-canvas" style="display: none;"></canvas>
          </div>
          
          <div id="captured-preview" style="display: none;">
            <div class="detection-image-container">
              <img id="captured-image" alt="캡처된 이미지">
              <canvas id="overlay-canvas"></canvas>
            </div>
          </div>
          
          <!-- Detected Objects -->
          <div id="detected-objects" style="display: none;">
            <label class="form-label">검출된 오브젝트 (클릭하여 선택)</label>
            <div id="objects-list" class="objects-grid"></div>
          </div>
          
          <!-- Selected Object -->
          <div id="selected-object-info" style="display: none;">
            <div class="selected-object-badge">
              <span>🎯 선택됨:</span>
              <strong id="selected-object-name"></strong>
              <button class="btn btn-small btn-secondary" id="btn-clear-selection">취소</button>
            </div>
          </div>
          
          <div class="webcam-controls">
            <button class="btn btn-primary" id="btn-start-webcam">카메라 시작</button>
            <button class="btn btn-success" id="btn-capture" style="display: none;">📷 촬영 + AI 검출</button>
            <button class="btn btn-secondary" id="btn-retake" style="display: none;">다시 찍기</button>
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
        
        <!-- Hint -->
        <section class="card" style="margin-top: 1rem;">
          <h2>다음 보물 힌트</h2>
          
          <div class="form-group">
            <label class="form-label">힌트 유형</label>
            <select class="form-input" id="hint-type">
              <option value="text" ${treasure.hint?.type === 'text' ? 'selected' : ''}>텍스트</option>
              <option value="image" ${treasure.hint?.type === 'image' ? 'selected' : ''}>이미지</option>
            </select>
          </div>
          
          <div id="hint-text-section" style="${treasure.hint?.type === 'text' || !treasure.hint?.type ? '' : 'display: none;'}">
            <div class="form-group">
              <label class="form-label">힌트 문구</label>
              <textarea class="form-input" id="hint-text" rows="3" 
                        placeholder="다음 보물 위치에 대한 힌트를 입력하세요">${treasure.hint?.config?.value || ''}</textarea>
            </div>
          </div>
          
          <div id="hint-image-section" style="${treasure.hint?.type === 'image' ? '' : 'display: none;'}">
            <div class="form-group">
              <label class="form-label">힌트 이미지</label>
              <input type="file" class="form-input" id="hint-image-file" accept="image/*">
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
  let selectedRiddleId = treasure.riddleId || null;
  
  // Back button
  document.getElementById('btn-back').addEventListener('click', () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    renderSetupHome();
  });
  
  // Webcam controls
  const video = document.getElementById('webcam-preview');
  const canvas = document.getElementById('capture-canvas');
  const overlayCanvas = document.getElementById('overlay-canvas');
  const capturedPreview = document.getElementById('captured-preview');
  const capturedImage = document.getElementById('captured-image');
  const btnStartWebcam = document.getElementById('btn-start-webcam');
  const btnCapture = document.getElementById('btn-capture');
  const btnRetake = document.getElementById('btn-retake');
  const detectedObjectsSection = document.getElementById('detected-objects');
  const objectsList = document.getElementById('objects-list');
  const selectedObjectInfo = document.getElementById('selected-object-info');
  const selectedObjectName = document.getElementById('selected-object-name');
  
  btnStartWebcam.addEventListener('click', async () => {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      video.srcObject = webcamStream;
      btnStartWebcam.style.display = 'none';
      btnCapture.style.display = 'inline-flex';
      
      // Preload model
      loadObjectDetectionModel();
    } catch (err) {
      alert('카메라 접근 권한이 필요합니다.');
      console.error('Webcam error:', err);
    }
  });
  
  btnCapture.addEventListener('click', async () => {
    // Capture image
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
    capturedImage.src = capturedImageData;
    
    // Setup overlay canvas
    overlayCanvas.width = video.videoWidth;
    overlayCanvas.height = video.videoHeight;
    
    video.style.display = 'none';
    capturedPreview.style.display = 'block';
    btnCapture.style.display = 'none';
    btnRetake.style.display = 'inline-flex';
    
    // Stop webcam
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    
    // Run object detection
    await detectObjects(capturedImage, overlayCanvas);
  });
  
  async function detectObjects(imageElement, overlayCanvas) {
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
      
      const predictions = await model.detect(imageElement);
      hideLoadingOverlay();
      
      detectedObjects = predictions.filter(p => p.score > 0.5);
      
      if (detectedObjects.length === 0) {
        objectsList.innerHTML = '<p class="no-objects">검출된 오브젝트가 없습니다. 다시 촬영해보세요.</p>';
        detectedObjectsSection.style.display = 'block';
        return;
      }
      
      // Draw bounding boxes
      drawDetections(overlayCanvas, detectedObjects);
      
      // Show detected objects list
      renderDetectedObjects(detectedObjects);
      detectedObjectsSection.style.display = 'block';
      
    } catch (err) {
      hideLoadingOverlay();
      console.error('Object detection error:', err);
      alert('오브젝트 검출 중 오류가 발생했습니다.');
    }
  }
  
  function drawDetections(canvas, predictions) {
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match the displayed image size
    const displayedWidth = capturedImage.clientWidth;
    const displayedHeight = capturedImage.clientHeight;
    
    canvas.width = displayedWidth;
    canvas.height = displayedHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Scale factor: displayed size / natural size
    const scaleX = displayedWidth / capturedImage.naturalWidth;
    const scaleY = displayedHeight / capturedImage.naturalHeight;
    
    predictions.forEach((pred, index) => {
      const [x, y, width, height] = pred.bbox;
      const isSelected = selectedObject === pred.class;
      
      // Scale bbox coordinates to match displayed image
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;
      
      // Draw box
      ctx.strokeStyle = isSelected ? '#10b981' : '#6366f1';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      
      // Draw label background
      ctx.fillStyle = isSelected ? '#10b981' : '#6366f1';
      const label = `${index + 1}. ${translateClass(pred.class)} (${Math.round(pred.score * 100)}%)`;
      ctx.font = 'bold 14px sans-serif';
      const labelWidth = ctx.measureText(label).width + 10;
      const labelY = scaledY > 25 ? scaledY - 5 : scaledY + scaledHeight + 20;
      ctx.fillRect(scaledX, labelY - 20, labelWidth, 25);
      
      // Draw label text
      ctx.fillStyle = 'white';
      ctx.fillText(label, scaledX + 5, labelY - 2);
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
        selectObject(objectClass);
      });
    });
  }
  
  function selectObject(objectClass) {
    selectedObject = objectClass;
    
    // Update UI
    objectsList.querySelectorAll('.object-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.class === objectClass);
    });
    
    // Show selected info
    selectedObjectInfo.style.display = 'flex';
    selectedObjectName.textContent = translateClass(objectClass);
    
    // Redraw detections with selection highlight
    drawDetections(overlayCanvas, detectedObjects);
    
    // Auto-fill treasure name if empty
    const nameInput = document.getElementById('treasure-name');
    if (!nameInput.value) {
      nameInput.value = `${translateClass(objectClass)} 보물`;
    }
  }
  
  document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
    selectedObject = null;
    selectedObjectInfo.style.display = 'none';
    objectsList.querySelectorAll('.object-card').forEach(card => {
      card.classList.remove('selected');
    });
    drawDetections(overlayCanvas, detectedObjects);
  });
  
  btnRetake.addEventListener('click', async () => {
    capturedImageData = null;
    selectedObject = null;
    detectedObjects = [];
    capturedPreview.style.display = 'none';
    detectedObjectsSection.style.display = 'none';
    selectedObjectInfo.style.display = 'none';
    video.style.display = 'block';
    btnRetake.style.display = 'none';
    
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      video.srcObject = webcamStream;
      btnCapture.style.display = 'inline-flex';
    } catch (err) {
      alert('카메라 접근 권한이 필요합니다.');
    }
  });
  
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
  
  // Hint type toggle
  const hintType = document.getElementById('hint-type');
  const hintTextSection = document.getElementById('hint-text-section');
  const hintImageSection = document.getElementById('hint-image-section');
  
  hintType.addEventListener('change', () => {
    if (hintType.value === 'text') {
      hintTextSection.style.display = 'block';
      hintImageSection.style.display = 'none';
    } else {
      hintTextSection.style.display = 'none';
      hintImageSection.style.display = 'block';
    }
  });
  
  // Save treasure
  document.getElementById('btn-save-treasure').addEventListener('click', () => {
    const name = document.getElementById('treasure-name').value.trim();
    
    if (!name) {
      alert('보물 이름을 입력하세요.');
      return;
    }
    
    // Build riddle
    let riddle = null;
    let riddleId = null;
    
    if (riddleMode.value === 'bank') {
      if (!selectedRiddleId) {
        alert('문제를 선택하세요.');
        return;
      }
      riddleId = selectedRiddleId;
    } else {
      const question = document.getElementById('custom-question').value.trim();
      const answer = document.getElementById('custom-answer').value.trim();
      const type = document.getElementById('custom-riddle-type').value;
      
      if (!question || !answer) {
        alert('문제와 정답을 입력하세요.');
        return;
      }
      
      riddle = {
        type: type,
        config: { question, answer }
      };
    }
    
    // Build hint
    const hintTypeValue = hintType.value;
    let hint = { type: hintTypeValue, config: {} };
    
    if (hintTypeValue === 'text') {
      hint.config.value = document.getElementById('hint-text').value.trim();
    }
    
    // Create treasure object
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
    
    // Save
    if (!treasures.items) {
      treasures.items = [];
    }
    
    if (isNew) {
      treasures.items.push(newTreasure);
    } else {
      treasures.items[currentTreasureIndex] = newTreasure;
    }
    
    saveTreasures(treasures);
    
    // Stop webcam
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    
    renderSetupHome();
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
    renderSetupHome();
  }
}

/**
 * Save game settings
 */
function saveSettings() {
  treasures.initialScore = parseInt(document.getElementById('initial-score').value) || 1000;
  treasures.scoreDecayPerSecond = parseFloat(document.getElementById('score-decay').value) || 1;
  saveTreasures(treasures);
  alert('설정이 저장되었습니다.');
}

/**
 * Add setup-specific styles
 */
function addSetupStyles() {
  if (document.getElementById('setup-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'setup-styles';
  style.textContent = `
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
    
    .treasure-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .treasure-item:last-child {
      border-bottom: none;
    }
    
    .treasure-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .treasure-details {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    
    .treasure-object {
      font-size: 0.75rem;
      color: var(--success-color);
    }
    
    .treasure-order {
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
    
    .treasure-actions {
      display: flex;
      gap: 0.5rem;
    }
    
    .btn-small {
      padding: 0.4rem 0.8rem;
      font-size: 0.85rem;
    }
    
    .webcam-container {
      position: relative;
      width: 100%;
      aspect-ratio: 16/9;
      background: #000;
      border-radius: var(--border-radius);
      overflow: hidden;
      margin-bottom: 1rem;
    }
    
    .webcam-container video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    #captured-preview {
      margin-bottom: 1rem;
    }
    
    .detection-image-container {
      position: relative;
      width: 100%;
      border-radius: var(--border-radius);
      overflow: hidden;
    }
    
    .detection-image-container img {
      width: 100%;
      display: block;
    }
    
    .detection-image-container canvas {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      /* Canvas size is set dynamically in JS to match displayed image */
    }
    
    .webcam-controls {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      flex-wrap: wrap;
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
    
    .selected-object-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: #d1fae5;
      border-radius: var(--border-radius);
      margin-top: 0.5rem;
    }
    
    .selected-object-badge span:first-child {
      color: var(--success-color);
    }
    
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
