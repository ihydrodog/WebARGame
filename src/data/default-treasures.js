/**
 * Levels & Treasures Data Model
 *
 * Stored structure:
 * {
 *   levels: Level[],
 *   activeLevelId: string | null
 * }
 *
 * Level:
 * {
 *   id: string,
 *   name: string,
 *   order: number,
 *   initialScore: number,
 *   scoreDecayPerSecond: number,
 *   items: Treasure[]
 * }
 *
 * Treasure: (unchanged)
 * {
 *   id, order, name, detectedObject?, featureLabel?, featureEmbedding?, marker,
 *   capturedImage?, riddle?, riddleId?, hint
 * }
 */

const STORAGE_KEY = 'webar_treasures';

const defaultLevelConfig = {
  initialScore: 1000,
  scoreDecayPerSecond: 1,
  items: []
};

/**
 * Load raw data from localStorage (with migration from legacy single-treasures format)
 * @returns {{ levels: Array, activeLevelId: string|null }}
 */
function loadRaw() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { levels: [], activeLevelId: null };
    }
    const parsed = JSON.parse(stored);
    // Legacy: root has items (no levels array) -> migrate to levels
    if (Array.isArray(parsed.items) && !Array.isArray(parsed.levels)) {
      const level = {
        id: 'default',
        name: '기본',
        order: 0,
        initialScore: parsed.initialScore ?? defaultLevelConfig.initialScore,
        scoreDecayPerSecond: parsed.scoreDecayPerSecond ?? defaultLevelConfig.scoreDecayPerSecond,
        items: parsed.items || []
      };
      return { levels: [level], activeLevelId: 'default' };
    }
    return {
      levels: Array.isArray(parsed.levels) ? parsed.levels : [],
      activeLevelId: parsed.activeLevelId ?? null
    };
  } catch (e) {
    console.error('Failed to load levels:', e);
    return { levels: [], activeLevelId: null };
  }
}

/**
 * Save full levels data
 * @param {{ levels: Array, activeLevelId: string|null }} data
 */
function saveRaw(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save levels:', e);
  }
}

/**
 * Load levels and activeLevelId
 * @returns {{ levels: Level[], activeLevelId: string|null }}
 */
export function loadLevels() {
  return loadRaw();
}

/**
 * Save levels and activeLevelId
 * @param {{ levels: Array, activeLevelId: string|null }} data
 */
export function saveLevels(data) {
  saveRaw(data);
}

/**
 * Get a level by id
 * @param {string} id
 * @returns {Object|null} Level or null
 */
export function getLevel(id) {
  const { levels } = loadRaw();
  return levels.find((l) => l.id === id) ?? null;
}

/**
 * Get the active level (by activeLevelId). Returns legacy shape for game/setup.
 * @returns {{ initialScore: number, scoreDecayPerSecond: number, items: Treasure[] }|null}
 */
export function getActiveLevel() {
  const { levels, activeLevelId } = loadRaw();
  if (!activeLevelId) {
    if (levels.length > 0) {
      const first = levels.find((l) => l.order === 0) ?? levels[0];
      return toLegacyShape(first);
    }
    return null;
  }
  const level = levels.find((l) => l.id === activeLevelId);
  return level ? toLegacyShape(level) : null;
}

function toLegacyShape(level) {
  if (!level) return null;
  return {
    initialScore: level.initialScore ?? defaultLevelConfig.initialScore,
    scoreDecayPerSecond: level.scoreDecayPerSecond ?? defaultLevelConfig.scoreDecayPerSecond,
    items: level.items || []
  };
}

/**
 * Save a single level (by id). Merges into levels array and saves.
 * @param {Object} level - Full level object with id
 */
export function saveLevel(level) {
  const data = loadRaw();
  const idx = data.levels.findIndex((l) => l.id === level.id);
  const levels = [...data.levels];
  if (idx >= 0) {
    levels[idx] = { ...levels[idx], ...level };
  } else {
    levels.push(level);
  }
  saveRaw({ ...data, levels });
}

/**
 * Create a new level and return it
 * @param {string} [name] - Level name
 * @returns {Object} New level
 */
export function createLevel(name = '새 레벨') {
  const data = loadRaw();
  const order = data.levels.length;
  const id = `level-${Date.now()}`;
  const level = {
    id,
    name,
    order,
    initialScore: defaultLevelConfig.initialScore,
    scoreDecayPerSecond: defaultLevelConfig.scoreDecayPerSecond,
    items: []
  };
  const levels = [...data.levels, level];
  saveRaw({ ...data, levels });
  return level;
}

/**
 * Delete a level by id
 * @param {string} id
 */
export function deleteLevel(id) {
  const data = loadRaw();
  const levels = data.levels.filter((l) => l.id !== id);
  const activeLevelId = data.activeLevelId === id ? (levels[0]?.id ?? null) : data.activeLevelId;
  saveRaw({ levels, activeLevelId });
}

/**
 * Reorder levels by array of ids (order becomes index)
 * @param {string[]} orderedIds
 */
export function reorderLevels(orderedIds) {
  const data = loadRaw();
  const byId = new Map(data.levels.map((l) => [l.id, l]));
  const levels = orderedIds.map((id, order) => {
    const level = byId.get(id);
    return level ? { ...level, order } : null;
  }).filter(Boolean);
  const rest = data.levels.filter((l) => !orderedIds.includes(l.id));
  const reordered = [...levels, ...rest].sort((a, b) => a.order - b.order);
  saveRaw({ ...data, levels: reordered });
}

/**
 * Set active level id (e.g. after user selects level to play)
 * @param {string|null} id
 */
export function setActiveLevelId(id) {
  const data = loadRaw();
  saveRaw({ ...data, activeLevelId: id });
}

// --- Compatibility: single "treasures" shape for game and setup ---

/**
 * Load treasures in legacy shape for game/setup.
 * Uses activeLevelId; if none, first level.
 * @returns {{ initialScore: number, scoreDecayPerSecond: number, items: Treasure[] }}
 */
export function loadTreasures() {
  const level = getActiveLevel();
  if (level) return level;
  return { ...defaultLevelConfig };
}

/**
 * Save current level data (legacy shape). Finds level by activeLevelId or first level.
 * @param {Object} legacy - { initialScore, scoreDecayPerSecond, items }
 */
export function saveTreasures(legacy) {
  const data = loadRaw();
  const targetId = data.activeLevelId ?? data.levels[0]?.id;
  if (!targetId) {
    const newLevel = createLevel('기본');
    saveLevel({
      id: newLevel.id,
      name: newLevel.name,
      order: 0,
      initialScore: legacy.initialScore ?? defaultLevelConfig.initialScore,
      scoreDecayPerSecond: legacy.scoreDecayPerSecond ?? defaultLevelConfig.scoreDecayPerSecond,
      items: legacy.items || []
    });
    saveRaw({ levels: loadRaw().levels, activeLevelId: newLevel.id });
    return;
  }
  const level = getLevel(targetId);
  if (level) {
    saveLevel({
      ...level,
      initialScore: legacy.initialScore ?? level.initialScore,
      scoreDecayPerSecond: legacy.scoreDecayPerSecond ?? level.scoreDecayPerSecond,
      items: legacy.items ?? level.items
    });
  }
}

// --- Sample / export / import (operate on full store or active level) ---

const sampleTreasures = {
  initialScore: 1000,
  scoreDecayPerSecond: 1,
  items: [
    {
      id: 'treasure-1',
      order: 1,
      name: '냉장고 안 보물',
      marker: { type: 'pattern', patternUrl: '/markers/marker-0.patt' },
      riddleId: 'math-001',
      hint: { type: 'text', config: { value: '차가운 곳을 찾아봐! 음식을 보관하는 곳이야.' } }
    },
    {
      id: 'treasure-2',
      order: 2,
      name: '신발장 보물',
      marker: { type: 'pattern', patternUrl: '/markers/marker-1.patt' },
      riddleId: 'nonsense-001',
      hint: { type: 'text', config: { value: '밖에 나갈 때 신는 것을 보관하는 곳이야!' } }
    },
    {
      id: 'treasure-3',
      order: 3,
      name: '책상 서랍 보물',
      marker: { type: 'pattern', patternUrl: '/markers/marker-2.patt' },
      riddle: {
        type: 'choice',
        config: {
          question: '하늘의 색깔은?',
          options: ['빨강', '파랑', '노랑', '초록'],
          answerIndex: 1
        }
      },
      hint: { type: 'text', config: { value: '축하해! 마지막 보물을 찾았어!' } }
    }
  ]
};

/**
 * Load sample treasures into a new level (for demo)
 * @returns {Object} Level with sample items
 */
export function loadSampleTreasures() {
  const level = createLevel('샘플 레벨');
  saveLevel({
    ...level,
    initialScore: sampleTreasures.initialScore,
    scoreDecayPerSecond: sampleTreasures.scoreDecayPerSecond,
    items: sampleTreasures.items
  });
  setActiveLevelId(level.id);
  return getLevel(level.id);
}

/**
 * Clear all levels
 */
export function clearTreasures() {
  saveRaw({ levels: [], activeLevelId: null });
}

/**
 * Export data as JSON (full levels structure)
 */
export function exportTreasures() {
  const data = loadRaw();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'webar-levels.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import from JSON file (full levels or legacy single level)
 * @param {File} file
 * @returns {Promise<Object>}
 */
export function importTreasures(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (Array.isArray(parsed.levels)) {
          saveRaw({ levels: parsed.levels, activeLevelId: parsed.activeLevelId ?? null });
          resolve(loadRaw());
        } else if (Array.isArray(parsed.items)) {
          const level = {
            id: `level-${Date.now()}`,
            name: '가져온 레벨',
            order: 0,
            initialScore: parsed.initialScore ?? defaultLevelConfig.initialScore,
            scoreDecayPerSecond: parsed.scoreDecayPerSecond ?? defaultLevelConfig.scoreDecayPerSecond,
            items: parsed.items
          };
          const data = loadRaw();
          const levels = [...data.levels, level];
          saveRaw({ levels, activeLevelId: level.id });
          resolve(getLevel(level.id));
        } else {
          reject(new Error('Invalid format'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
