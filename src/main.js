import './style.css';

// body-segmentation 전역 노출 (segment-helper가 person 세그먼트 사용)
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
if (typeof window !== 'undefined') {
  window.bodySegmentation = bodySegmentation;
}

// Import components
import './components/riddles/index.js';
import './components/hints/index.js';
import './components/ui/index.js';

// Import game modules
import { initSetup } from './setup.js';
import { initGame } from './game.js';

/**
 * App Mode
 * - 'home': Home screen with mode selection
 * - 'setup': Treasure setup screen
 * - 'play': AR game play screen
 */
let currentMode = 'home';

/**
 * Initialize app
 */
function initApp() {
  renderHome();
}

/**
 * Render home screen
 */
function renderHome() {
  currentMode = 'home';
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="home-screen">
      <h1 class="game-title">보물찾기 AR</h1>
      <p class="game-subtitle">집 안 곳곳에 숨겨진 보물을 찾아라!</p>
      
      <div class="menu-buttons">
        <button class="menu-btn setup-btn" id="btn-setup">
          <span class="btn-icon">⚙️</span>
          <span class="btn-text">게임 설정</span>
        </button>
        <button class="menu-btn play-btn" id="btn-play">
          <span class="btn-icon">🎮</span>
          <span class="btn-text">게임 시작</span>
        </button>
      </div>
      
      <p class="game-info">
        부모님이 먼저 보물 위치를 설정하고,<br>
        아이들이 AR로 보물을 찾는 게임입니다.
      </p>
    </div>
  `;

  document.getElementById('btn-setup').addEventListener('click', () => {
    switchMode('setup');
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    switchMode('play');
  });
}

/**
 * Switch app mode
 * @param {string} mode - 'home' | 'setup' | 'play'
 */
export function switchMode(mode) {
  currentMode = mode;
  const app = document.getElementById('app');
  
  switch (mode) {
    case 'home':
      renderHome();
      break;
    case 'setup':
      app.innerHTML = '<div id="setup-container"></div>';
      initSetup(document.getElementById('setup-container'), () => switchMode('home'));
      break;
    case 'play':
      app.innerHTML = '<div id="game-container"></div>';
      initGame(document.getElementById('game-container'), () => switchMode('home'));
      break;
    default:
      renderHome();
  }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
