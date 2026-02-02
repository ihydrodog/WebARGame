/**
 * Game Module
 * Handles AR gameplay, score tracking, and riddle flow
 */

import { loadTreasures } from './data/default-treasures.js';
import { getRiddleById } from './data/riddles/index.js';

let container = null;
let onBack = null;
let gameData = null;
let currentTreasureIndex = 0;
let score = 0;
let scoreTimer = null;
let isGameActive = false;

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
 * Start AR mode (simplified - marker detection simulation)
 */
function startARMode() {
  const arContainer = document.getElementById('ar-container');
  
  // For prototype, we'll simulate AR with webcam + click to find
  arContainer.innerHTML = `
    <div class="ar-view">
      <video id="ar-video" autoplay playsinline></video>
      <div class="ar-overlay">
        <p class="ar-instruction">보물 위치를 찾으면 화면을 터치하세요!</p>
        <button class="btn btn-success btn-large" id="btn-found">보물 발견!</button>
      </div>
    </div>
  `;
  
  // Start webcam
  const video = document.getElementById('ar-video');
  navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' } 
  }).then(stream => {
    video.srcObject = stream;
  }).catch(err => {
    console.error('Camera error:', err);
    alert('카메라 접근 권한이 필요합니다.');
  });
  
  // Found button (simulates marker detection)
  document.getElementById('btn-found').addEventListener('click', () => {
    onMarkerFound();
  });
}

/**
 * Handle marker found event
 */
function onMarkerFound() {
  // Show toast
  showToast('보물 발견! 🎁', 'success');
  
  // Show particles
  showParticles();
  
  // Show riddle modal after short delay
  setTimeout(() => {
    showRiddleModal();
  }, 500);
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
  
  // Stop any webcam streams
  const video = document.querySelector('#ar-video');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
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
    
    .ar-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 1rem;
      background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
      text-align: center;
    }
    
    .ar-instruction {
      color: white;
      margin-bottom: 1rem;
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
