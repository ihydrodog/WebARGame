/**
 * Game Module
 * Handles AR gameplay, score tracking, and riddle flow
 */

import { loadTreasures } from './data/default-treasures.js';
import { getRiddleById } from './data/riddles/index.js';
import { getCocoLabel } from './utils/coco-labels.js';
import {
  getEmbeddingFromCrop,
  cosineSimilarity,
  FEATURE_SIMILARITY_THRESHOLD
} from './utils/feature-embedding.js';
import { loadDetectionModel, runDetection, isDetectionAvailable, pickDetectionAt } from './utils/detection.js';
import { isSegmentAvailableForClass, getSegmentMasks } from './utils/segment-helper.js';
import { DetectionOverlayView } from './utils/viewers.js';
import { cameraDetectionStore } from './stores/camera-detection.js';

let container = null;
let onBack = null;
let gameData = null;
let currentTreasureIndex = 0;
let score = 0;
let scoreTimer = null;
let isGameActive = false;

let arOverlayView = null;

/**
 * Initialize game
 * @param {HTMLElement} containerEl - Container element
 * @param {Function} backCallback - Callback to return to home
 */
export function initGame(containerEl, backCallback) {
  container = containerEl;
  onBack = backCallback;
  gameData = loadTreasures();
  
  if (!gameData.items || gameData.items.length === 0) {
    renderNoTreasures();
    return;
  }
  
  startGame();
}

/**
 * Render no treasures message
 */
function renderNoTreasures() {
  container.innerHTML = `
    <div class="no-treasures">
      <h2>보물이 없습니다</h2>
      <p>먼저 게임 설정에서 보물을 추가해주세요.</p>
      <button class="btn btn-primary" id="btn-back">돌아가기</button>
    </div>
  `;
  
  addGameStyles();
  document.getElementById('btn-back').addEventListener('click', onBack);
}

/**
 * Start the game
 */
function startGame() {
  currentTreasureIndex = 0;
  score = gameData.initialScore || 1000;
  isGameActive = true;
  
  renderGameScreen();
  startScoreTimer();
}

/**
 * Render game screen with AR and HUD
 */
function renderGameScreen() {
  const currentTreasure = gameData.items[currentTreasureIndex];
  
  container.innerHTML = `
    <!-- HUD -->
    <div class="hud">
      <div class="hud-score">
        <span class="score-label">점수</span>
        <span class="score-value" id="score-display">${score}</span>
      </div>
      <div class="hud-progress">
        <span id="progress-display">${currentTreasureIndex + 1} / ${gameData.items.length}</span>
      </div>
      <button class="btn btn-secondary btn-small" id="btn-pause">일시정지</button>
    </div>
    
    <!-- Hint Area -->
    <div class="hint-container">
      <div class="hint-label">현재 힌트</div>
      <div id="hint-display"></div>
    </div>
    
    <!-- AR Scene Container -->
    <div id="ar-container">
      <div class="ar-placeholder">
        <div class="ar-message">
          <span class="ar-icon">📷</span>
          <p>힌트를 참고하여 보물 위치를 찾아<br>카메라로 비춰보세요!</p>
          <button class="btn btn-primary" id="btn-start-ar">AR 카메라 시작</button>
        </div>
      </div>
    </div>
    
    <!-- Riddle Modal -->
    <div class="modal-overlay" id="riddle-modal" style="display: none;">
      <div class="modal-content riddle-modal">
        <div class="riddle-header">
          <span class="riddle-icon">🔐</span>
          <h2>수수께끼!</h2>
        </div>
        <div id="riddle-container"></div>
      </div>
    </div>
    
    <!-- Success Screen -->
    <div class="success-overlay" id="success-screen" style="display: none;">
      <div class="success-content">
        <div class="success-icon">🎉</div>
        <h1>축하합니다!</h1>
        <p>모든 보물을 찾았습니다!</p>
        <div class="final-score">
          <span class="final-score-label">최종 점수</span>
          <span class="final-score-value" id="final-score">0</span>
        </div>
        <button class="btn btn-primary btn-large" id="btn-finish">홈으로</button>
      </div>
    </div>
  `;
  
  addGameStyles();
  setupGameEvents();
  showCurrentHint();
}

/**
 * Setup game event listeners
 */
function setupGameEvents() {
  // Pause button
  document.getElementById('btn-pause').addEventListener('click', () => {
    pauseGame();
  });
  
  // Start AR button
  document.getElementById('btn-start-ar').addEventListener('click', () => {
    startARMode();
  });
  
  // Finish button
  document.getElementById('btn-finish').addEventListener('click', () => {
    stopGame();
    onBack();
  });
}

/**
 * Show current treasure's hint
 */
function showCurrentHint() {
  const currentTreasure = gameData.items[currentTreasureIndex];
  const hintDisplay = document.getElementById('hint-display');
  
  if (!currentTreasure.hint) {
    hintDisplay.innerHTML = '<p>힌트가 없습니다.</p>';
    return;
  }
  
  const hint = currentTreasure.hint;
  const tagName = `hint-${hint.type}`;
  const el = document.createElement(tagName);
  
  // Set attributes from config
  if (hint.config) {
    for (const [key, val] of Object.entries(hint.config)) {
      const attrName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      if (typeof val === 'boolean') {
        if (val) el.setAttribute(attrName, '');
      } else {
        el.setAttribute(attrName, typeof val === 'object' ? JSON.stringify(val) : val);
      }
    }
  }
  
  hintDisplay.innerHTML = '';
  hintDisplay.appendChild(el);
}

/**
 * Stop AR mode (stop camera stream and overlay)
 */
function stopARMode() {
  if (arOverlayView) {
    arOverlayView.destroy();
    arOverlayView = null;
  }
  cameraDetectionStore.getState().cleanup();
}

/**
 * Start AR mode: webcam + magnifying glass overlay. Tap to detect & select treasure.
 */
function startARMode() {
  const arContainer = document.getElementById('ar-container');

  if (arOverlayView) {
    arOverlayView.destroy();
    arOverlayView = null;
  }
  stopARMode();

  arContainer.innerHTML = `
    <div class="ar-view">
      <video id="ar-video" autoplay playsinline></video>
      <canvas id="ar-detection-canvas" class="ar-detection-canvas" aria-hidden="true"></canvas>
      <div class="ar-touch-layer" id="ar-touch-layer">
        <div class="magnifier-glass ar-glass" id="ar-magnifier-glass" aria-hidden="true"></div>
      </div>
      <div class="ar-overlay">
        <p class="ar-instruction">돋보기로 보물을 가리킨 뒤 터치하세요</p>
      </div>
    </div>
  `;

  const video = document.getElementById('ar-video');
  const detectionCanvas = document.getElementById('ar-detection-canvas');
  const touchLayer = document.getElementById('ar-touch-layer');
  const glass = document.getElementById('ar-magnifier-glass');
  const arView = arContainer.querySelector('.ar-view');
  glass.style.display = 'none';

  arOverlayView = new DetectionOverlayView(arView, detectionCanvas, {
    fit: 'cover',
    translateClass: getCocoLabel
  });

  const store = cameraDetectionStore.getState();
  store.setDetectionRunning(true);
  (async function detectionLoop() {
    const st = cameraDetectionStore.getState();
    if (!st.detectionRunning || !video || !arOverlayView) return;
    if (!isDetectionAvailable()) {
      setTimeout(detectionLoop, 200);
      return;
    }
    try {
      if (video.readyState < 2 || !video.videoWidth) {
        setTimeout(detectionLoop, 100);
        return;
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      let model = st.detectionModel;
      if (!model) {
        model = await loadDetectionModel();
        if (model) cameraDetectionStore.getState().setDetectionModel(model);
      }
      const predictions = await runDetection(model, video, { scoreThreshold: 0.5 });
      let segmentMasks = [];
      if (isSegmentAvailableForClass('person')) {
        try {
          segmentMasks = await getSegmentMasks(video);
        } catch (_) {}
      }
      arOverlayView.setSourceSize(vw, vh);
      arOverlayView.setContent(predictions, segmentMasks, {
        translateClass: getCocoLabel,
        scoreThreshold: 0.5,
        withIndex: false
      });
    } catch (err) {
      console.warn('AR detection loop:', err);
    }
    setTimeout(detectionLoop, 100);
  })();

  let glassVisible = false;
  function moveGlass(e) {
    const rect = touchLayer.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
    const y = (e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top;
    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      glass.style.left = x + 'px';
      glass.style.top = y + 'px';
      glass.style.display = 'block';
      glassVisible = true;
    } else if (glassVisible) {
      glass.style.display = 'none';
      glassVisible = false;
    }
  }

  function onTap(e) {
    const clientX = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const clientY = e.clientY ?? e.changedTouches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;
    tryFindTreasure(video, { clientX, clientY });
  }

  touchLayer.addEventListener('mousemove', moveGlass);
  touchLayer.addEventListener('mouseleave', () => {
    glass.style.display = 'none';
    glassVisible = false;
  });
  touchLayer.addEventListener('click', (e) => {
    e.preventDefault();
    onTap(e);
  });
  touchLayer.addEventListener('touchmove', (e) => {
    if (e.touches.length) {
      e.preventDefault();
      moveGlass(e);
    }
  }, { passive: false });
  touchLayer.addEventListener('touchend', (e) => {
    if (e.changedTouches.length) {
      e.preventDefault();
      onTap(e);
    }
  }, { passive: false });

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  }).then(stream => {
    cameraDetectionStore.getState().setStream(stream);
    video.srcObject = stream;
  }).catch(err => {
    console.error('Camera error:', err);
    alert('카메라 접근 권한이 필요합니다.');
  });
}

/**
 * Tap on AR view: if treasure has detectedObject, run detection and pick at click position; else go to riddle
 * clickEvent: { clientX, clientY } (captured at tap time)
 */
async function tryFindTreasure(video, clickEvent) {
  const currentTreasure = gameData.items[currentTreasureIndex];
  const targetObject = currentTreasure?.detectedObject || null;

  if (!targetObject) {
    onMarkerFound(null);
    return;
  }

  const rect = video.getBoundingClientRect();
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const clientX = clickEvent?.clientX ?? 0;
  const clientY = clickEvent?.clientY ?? 0;

  if (!isDetectionAvailable()) {
    showToast('오브젝트 선택을 사용할 수 없어요.', 'error');
    return;
  }

  showToast('검출 중...', '');
  const store = cameraDetectionStore.getState();
  let model = store.detectionModel;
  try {
    if (!model) {
      model = await loadDetectionModel();
      if (model) store.setDetectionModel(model);
    }
  } catch (err) {
    console.warn('COCO-SSD load failed:', err);
    showToast('오브젝트 선택을 불러올 수 없어요.', 'error');
    return;
  }
  if (!model) {
    showToast('오브젝트 선택을 불러올 수 없어요.', 'error');
    return;
  }

  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = vw;
  captureCanvas.height = vh;
  captureCanvas.getContext('2d').drawImage(video, 0, 0, vw, vh);

  const filtered = await runDetection(model, captureCanvas, { scoreThreshold: 0.5 });

  if (filtered.length === 0) {
    showToast('보물이 보이지 않아요. 더 가까이 가서 다시 시도해보세요!', 'error');
    return;
  }

  const hit = await pickDetectionAt(captureCanvas, rect, vw, vh, clientX, clientY, filtered, targetObject);
  if (hit == null) {
    showToast('그곳에는 보물이 없어요. 오브젝트 위를 눌러보세요. 🔍', 'error');
    return;
  }
  if (hit.class !== targetObject) {
    showToast('그건 아니에요! 다시 찾아보세요. 🔍', 'error');
    return;
  }
  const refEmbedding = currentTreasure?.featureEmbedding;
  if (refEmbedding && Array.isArray(refEmbedding) && refEmbedding.length > 0) {
    showToast('대상 확인 중...', '');
    try {
      const candidateEmbedding = await getEmbeddingFromCrop(
        captureCanvas, hit.bbox, vw, vh
      );
      const sim = cosineSimilarity(refEmbedding, candidateEmbedding);
      if (sim >= FEATURE_SIMILARITY_THRESHOLD) {
        onMarkerFound(targetObject);
      } else {
        showToast(
          currentTreasure.featureLabel
            ? `다른 ${getCocoLabel(targetObject)}이에요. (${currentTreasure.featureLabel}을/를 찾아보세요!)`
            : '그건 아니에요! 다시 찾아보세요. 🔍',
          'error'
        );
      }
    } catch (err) {
      console.warn('Feature check failed, allowing class match:', err);
      onMarkerFound(targetObject);
    }
  } else {
    onMarkerFound(targetObject);
  }
}

/**
 * Play short success sound (Web Audio API, no file required)
 */
function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.setValueAtTime(659.25, now + 0.12);
    osc.frequency.setValueAtTime(783.99, now + 0.24);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (_) {}
}

/**
 * Show treasure-found overlay: discovered object, matching visualization, sound; then particles + riddle
 */
function showTreasureFoundOverlay(foundObjectClass) {
  const label = foundObjectClass ? getCocoLabel(foundObjectClass) : null;
  const overlay = document.createElement('div');
  overlay.className = 'treasure-found-overlay';
  overlay.innerHTML = `
    <div class="treasure-found-card">
      <div class="treasure-found-title">보물 발견! 🎁</div>
      <div class="treasure-found-object">${label != null ? `발견된 대상: <strong>${label}</strong>` : '보물을 찾았어요!'}</div>
      ${label != null ? `
        <div class="treasure-found-match" id="treasure-found-match">
          <span class="match-label">선택한 대상</span>
          <span class="match-value">${label}</span>
          <span class="match-equals">=</span>
          <span class="match-label">보물</span>
          <span class="match-value">${label}</span>
          <span class="match-check" id="treasure-match-check">✓ 매칭 성공</span>
        </div>
      ` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  addTreasureFoundStyles();

  playSuccessSound();

  const matchEl = document.getElementById('treasure-match-check');
  if (matchEl) {
    matchEl.classList.add('match-visible');
  }

  setTimeout(() => {
    overlay.classList.add('treasure-found-out');
    setTimeout(() => {
      overlay.remove();
      showParticles();
      setTimeout(() => showRiddleModal(), 500);
    }, 400);
  }, 1800);
}

function addTreasureFoundStyles() {
  if (document.getElementById('treasure-found-styles')) return;
  const style = document.createElement('style');
  style.id = 'treasure-found-styles';
  style.textContent = `
    .treasure-found-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 3000;
      animation: treasure-found-bg-in 0.3s ease;
    }
    .treasure-found-overlay.treasure-found-out {
      animation: treasure-found-bg-out 0.4s ease forwards;
    }
    @keyframes treasure-found-bg-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes treasure-found-bg-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    .treasure-found-card {
      background: linear-gradient(145deg, #1e293b 0%, #334155 100%);
      color: white;
      padding: 1.75rem 2rem;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      text-align: center;
      max-width: 90%;
      animation: treasure-found-card-in 0.4s ease;
    }
    @keyframes treasure-found-card-in {
      from { opacity: 0; transform: scale(0.9) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .treasure-found-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }
    .treasure-found-object {
      font-size: 1.1rem;
      margin-bottom: 1rem;
      opacity: 0.95;
    }
    .treasure-found-object strong {
      color: #fbbf24;
    }
    .treasure-found-match {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.35rem 0.5rem;
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: rgba(255,255,255,0.08);
      border-radius: 12px;
      font-size: 0.95rem;
    }
    .treasure-found-match .match-label {
      color: rgba(255,255,255,0.7);
    }
    .treasure-found-match .match-value {
      font-weight: 600;
      color: #a5b4fc;
    }
    .treasure-found-match .match-equals {
      color: rgba(255,255,255,0.5);
      margin: 0 0.15rem;
    }
    .treasure-found-match .match-check {
      width: 100%;
      margin-top: 0.5rem;
      font-weight: 700;
      color: #34d399;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 0.35s ease, transform 0.35s ease;
    }
    .treasure-found-match .match-check.match-visible {
      opacity: 1;
      transform: scale(1);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Handle marker found event (correct object selected or no object required)
 * @param {string|null} foundObjectClass - COCO class of found object, or null if no object required
 */
function onMarkerFound(foundObjectClass) {
  showTreasureFoundOverlay(foundObjectClass);
}

/**
 * Show riddle modal
 */
function showRiddleModal() {
  const currentTreasure = gameData.items[currentTreasureIndex];
  const riddleContainer = document.getElementById('riddle-container');
  const modal = document.getElementById('riddle-modal');
  
  // Get riddle data
  let riddleData = currentTreasure.riddle;
  
  if (currentTreasure.riddleId) {
    const bankRiddle = getRiddleById(currentTreasure.riddleId);
    if (bankRiddle) {
      riddleData = { type: bankRiddle.type, config: bankRiddle.config };
    }
  }
  
  if (!riddleData) {
    // Default simple riddle
    riddleData = { type: 'text', config: { question: '1 + 1 = ?', answer: '2' } };
  }
  
  // Create riddle component
  const tagName = `riddle-${riddleData.type}`;
  const el = document.createElement(tagName);
  
  // Set attributes from config
  for (const [key, val] of Object.entries(riddleData.config)) {
    const attrName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (typeof val === 'object') {
      el.setAttribute(attrName, JSON.stringify(val));
    } else {
      el.setAttribute(attrName, val);
    }
  }
  
  // Listen for answer submit
  el.addEventListener('answer-submit', (e) => {
    handleAnswerSubmit(e.detail);
  });
  
  riddleContainer.innerHTML = '';
  riddleContainer.appendChild(el);
  modal.style.display = 'flex';
}

/**
 * Handle answer submit from riddle component
 */
function handleAnswerSubmit(detail) {
  const { correct, feedback } = detail;
  
  if (correct) {
    // Correct answer
    showToast(feedback || '정답! 🎉', 'success');
    showParticles();
    
    // Add bonus score
    const bonus = Math.max(10, Math.floor(score * 0.1));
    score += bonus;
    updateScoreDisplay();
    
    // Close modal and proceed
    setTimeout(() => {
      document.getElementById('riddle-modal').style.display = 'none';
      proceedToNext();
    }, 1500);
  } else {
    // Wrong answer
    showToast(feedback || '다시 생각해봐요! 💭', 'error');
    
    // Shake animation
    const riddleContainer = document.getElementById('riddle-container');
    riddleContainer.classList.add('shake');
    setTimeout(() => riddleContainer.classList.remove('shake'), 500);
  }
}

/**
 * Proceed to next treasure or show success
 */
function proceedToNext() {
  currentTreasureIndex++;
  
  if (currentTreasureIndex >= gameData.items.length) {
    // Game complete!
    showSuccessScreen();
  } else {
    // Show next hint
    document.getElementById('progress-display').textContent = 
      `${currentTreasureIndex + 1} / ${gameData.items.length}`;
    showCurrentHint();
    
    // Stop AR detection and camera before replacing view
    stopARMode();
    // Reset AR view
    const arContainer = document.getElementById('ar-container');
    arContainer.innerHTML = `
      <div class="ar-placeholder">
        <div class="ar-message">
          <span class="ar-icon">📷</span>
          <p>다음 보물을 찾아보세요!</p>
          <button class="btn btn-primary" id="btn-start-ar">AR 카메라 시작</button>
        </div>
      </div>
    `;
    
    document.getElementById('btn-start-ar').addEventListener('click', () => {
      startARMode();
    });
  }
}

/**
 * Show success screen
 */
function showSuccessScreen() {
  stopScoreTimer();
  isGameActive = false;
  
  document.getElementById('final-score').textContent = Math.max(0, Math.floor(score));
  document.getElementById('success-screen').style.display = 'flex';
  
  showParticles();
}

/**
 * Start score decay timer
 */
function startScoreTimer() {
  const decay = gameData.scoreDecayPerSecond || 1;
  
  scoreTimer = setInterval(() => {
    if (isGameActive) {
      score -= decay;
      updateScoreDisplay();
    }
  }, 1000);
}

/**
 * Stop score timer
 */
function stopScoreTimer() {
  if (scoreTimer) {
    clearInterval(scoreTimer);
    scoreTimer = null;
  }
}

/**
 * Update score display
 */
function updateScoreDisplay() {
  const display = document.getElementById('score-display');
  if (display) {
    display.textContent = Math.max(0, Math.floor(score));
  }
}

/**
 * Pause game
 */
function pauseGame() {
  isGameActive = false;
  
  if (confirm('게임을 종료하시겠습니까?')) {
    stopGame();
    onBack();
  } else {
    isGameActive = true;
  }
}

/**
 * Stop game
 */
function stopGame() {
  stopScoreTimer();
  isGameActive = false;
  stopARMode();
}

/**
 * Show toast notification
 */
function showToast(message, type = '') {
  // Remove existing toast
  document.querySelector('.toast')?.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 2000);
}

/**
 * Show celebration particles
 */
function showParticles() {
  const container = document.createElement('div');
  container.className = 'particles';
  document.body.appendChild(container);
  
  const colors = ['#f59e0b', '#10b981', '#6366f1', '#ef4444', '#ec4899'];
  
  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 50}%`;
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.animationDelay = `${Math.random() * 0.5}s`;
    container.appendChild(particle);
  }
  
  setTimeout(() => container.remove(), 1500);
}

/**
 * Add game-specific styles
 */
function addGameStyles() {
  if (document.getElementById('game-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'game-styles';
  style.textContent = `
    .no-treasures {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
      text-align: center;
    }
    
    .no-treasures h2 {
      margin-bottom: 1rem;
    }
    
    .no-treasures p {
      color: var(--text-light);
      margin-bottom: 2rem;
    }
    
    #ar-container {
      position: fixed;
      top: 60px;
      left: 0;
      right: 0;
      bottom: 100px;
    }
    
    .ar-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    }
    
    .ar-message {
      text-align: center;
      color: white;
    }
    
    .ar-icon {
      font-size: 4rem;
      display: block;
      margin-bottom: 1rem;
    }
    
    .ar-message p {
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    
    .ar-view {
      width: 100%;
      height: 100%;
      position: relative;
    }
    
    .ar-view video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .ar-detection-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      object-fit: cover;
    }
    
    .ar-touch-layer {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      cursor: crosshair;
      touch-action: none;
    }
    
    .ar-touch-layer .ar-glass {
      position: absolute;
      width: 72px;
      height: 72px;
      transform: translate(-50%, -50%);
      margin: 0;
      border-radius: 50%;
      pointer-events: none;
      border: 4px solid rgba(30, 41, 59, 0.7);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.9), inset 0 0 24px rgba(255,255,255,0.25);
      background: radial-gradient(circle at 32% 32%, rgba(255,255,255,0.35), transparent 55%);
      box-sizing: border-box;
    }
    
    .ar-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 1rem;
      background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
      text-align: center;
      pointer-events: none;
    }
    
    .ar-instruction {
      color: white;
      margin: 0;
    }
    
    .object-select-modal {
      width: 90%;
      max-width: 380px;
      text-align: center;
    }
    
    .magnifier-modal {
      max-width: min(420px, 95vw);
    }
    
    .object-select-title {
      font-size: 1.15rem;
      margin-bottom: 0.5rem;
      line-height: 1.5;
    }
    
    .magnifier-hint {
      font-size: 0.9rem;
      color: #64748b;
      margin-bottom: 1rem;
    }
    
    .magnifier-stage {
      position: relative;
      display: inline-block;
      margin-bottom: 1rem;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      cursor: crosshair;
    }
    
    .magnifier-canvas {
      display: block;
      max-width: 100%;
      height: auto;
      vertical-align: top;
    }
    
    .magnifier-glass {
      position: absolute;
      width: 72px;
      height: 72px;
      left: 0;
      top: 0;
      transform: translate(-50%, -50%);
      margin-left: 0;
      margin-top: 0;
      border-radius: 50%;
      pointer-events: none;
      border: 4px solid rgba(30, 41, 59, 0.7);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.9), inset 0 0 24px rgba(255,255,255,0.25);
      background: radial-gradient(circle at 32% 32%, rgba(255,255,255,0.35), transparent 55%);
      box-sizing: border-box;
    }
    
    .riddle-modal {
      width: 90%;
      max-width: 400px;
    }
    
    .riddle-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    
    .riddle-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 0.5rem;
    }
    
    .success-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }
    
    .success-content {
      text-align: center;
      color: white;
      padding: 2rem;
    }
    
    .success-icon {
      font-size: 5rem;
      margin-bottom: 1rem;
      animation: bounce 1s ease infinite;
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
    
    .success-content h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    
    .success-content p {
      margin-bottom: 2rem;
      opacity: 0.9;
    }
    
    .final-score {
      background: rgba(255,255,255,0.2);
      border-radius: var(--border-radius);
      padding: 1.5rem 3rem;
      margin-bottom: 2rem;
    }
    
    .final-score-label {
      display: block;
      font-size: 0.9rem;
      opacity: 0.8;
      margin-bottom: 0.5rem;
    }
    
    .final-score-value {
      font-size: 3rem;
      font-weight: 800;
    }
    
    .hud {
      padding: 0.75rem 1rem;
    }
    
    .hud-score {
      display: flex;
      flex-direction: column;
    }
    
    .score-label {
      font-size: 0.7rem;
      opacity: 0.8;
    }
    
    .score-value {
      font-size: 1.5rem;
      font-weight: 700;
    }
    
    .hint-container {
      padding: 0.75rem 1rem;
    }
  `;
  document.head.appendChild(style);
}
