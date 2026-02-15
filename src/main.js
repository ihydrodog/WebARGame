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
import { loadLevels, setActiveLevelId } from './data/default-treasures.js';

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
      startPlay(document.getElementById('game-container'), () => switchMode('home'));
      break;
    default:
      renderHome();
  }
}

/**
 * Start play: show level picker if 2+ levels, else go straight to game
 * @param {HTMLElement} gameContainer
 * @param {Function} backToHome
 */
function startPlay(gameContainer, backToHome) {
  const { levels } = loadLevels();
  const sorted = [...levels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (sorted.length === 0) {
    gameContainer.innerHTML = `
      <div class="no-treasures" style="padding: 2rem; text-align: center;">
        <h2>보물이 없습니다</h2>
        <p>게임 설정에서 레벨과 보물을 추가해주세요.</p>
        <button class="btn btn-primary" id="btn-back">돌아가기</button>
      </div>
    `;
    gameContainer.querySelector('#btn-back')?.addEventListener('click', backToHome);
    return;
  }

  if (sorted.length === 1) {
    setActiveLevelId(sorted[0].id);
    initGame(gameContainer, backToHome);
    return;
  }

  gameContainer.innerHTML = `
    <div class="level-picker">
      <h1>레벨 선택</h1>
      <p class="hint-text">플레이할 레벨을 선택하세요.</p>
      <div class="level-picker-list">
        ${sorted.map((level) => `
          <button class="level-picker-btn" data-level-id="${level.id}">
            <span class="level-picker-name">${level.name || '레벨'}</span>
            <span class="level-picker-meta">보물 ${(level.items || []).length}개</span>
          </button>
        `).join('')}
      </div>
      <button class="btn btn-secondary" id="btn-picker-back">돌아가기</button>
    </div>
  `;
  gameContainer.querySelector('#btn-picker-back').addEventListener('click', backToHome);
  gameContainer.querySelectorAll('.level-picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.levelId;
      setActiveLevelId(id);
      gameContainer.innerHTML = '';
      initGame(gameContainer, backToHome);
    });
  });
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    initApp();
  } catch (err) {
    console.error('App init error:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="home-screen" style="padding: 2rem; text-align: center;">
          <h1>오류가 발생했습니다</h1>
          <p style="color: #c00; margin: 1rem 0; font-family: monospace; word-break: break-all;">${String(err?.message || err)}</p>
          <button class="btn btn-primary" onclick="location.reload()">새로고침</button>
        </div>
      `;
    }
  }
});
