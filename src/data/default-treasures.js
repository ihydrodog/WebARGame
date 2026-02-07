/**
 * Default Treasures Data Model
 * 
 * Structure:
 * {
 *   initialScore: number,        // Starting score (e.g., 1000)
 *   scoreDecayPerSecond: number, // Points deducted per second (e.g., 1)
 *   items: Treasure[]            // Array of treasures
 * }
 * 
 * Treasure:
 * {
 *   id: string,                  // Unique identifier
 *   order: number,               // Sequence order (1..n)
 *   name: string,                // Display name
 *   detectedObject?: string,     // COCO-SSD class (e.g. "person")
 *   featureLabel?: string,       // Optional: specific target label (e.g. "엄마", "아빠")
 *   featureEmbedding?: number[], // Optional: reference embedding for feature match
 *   marker: {
 *     type: 'pattern' | 'nft',
 *     patternUrl?: string,       // .patt file URL (for pattern)
 *     nftUrlPrefix?: string      // NFT descriptor prefix (for NFT)
 *   },
 *   capturedImage?: string,      // Base64 captured image (optional)
 *   riddle?: {                   // Inline riddle definition
 *     type: string,              // Component type (text, choice, etc.)
 *     config: object             // Component-specific config
 *   },
 *   riddleId?: string,           // Reference to riddle bank
 *   hint: {                      // Hint for next treasure
 *     type: string,              // Component type (text, image, etc.)
 *     config: object             // Component-specific config
 *   }
 * }
 */

const STORAGE_KEY = 'webar_treasures';

/**
 * Default game configuration
 */
const defaultConfig = {
  initialScore: 1000,
  scoreDecayPerSecond: 1,
  items: []
};

/**
 * Sample treasures for demo
 */
const sampleTreasures = {
  initialScore: 1000,
  scoreDecayPerSecond: 1,
  items: [
    {
      id: 'treasure-1',
      order: 1,
      name: '냉장고 안 보물',
      marker: {
        type: 'pattern',
        patternUrl: '/markers/marker-0.patt'
      },
      riddleId: 'math-001',
      hint: {
        type: 'text',
        config: {
          value: '차가운 곳을 찾아봐! 음식을 보관하는 곳이야.'
        }
      }
    },
    {
      id: 'treasure-2',
      order: 2,
      name: '신발장 보물',
      marker: {
        type: 'pattern',
        patternUrl: '/markers/marker-1.patt'
      },
      riddleId: 'nonsense-001',
      hint: {
        type: 'text',
        config: {
          value: '밖에 나갈 때 신는 것을 보관하는 곳이야!'
        }
      }
    },
    {
      id: 'treasure-3',
      order: 3,
      name: '책상 서랍 보물',
      marker: {
        type: 'pattern',
        patternUrl: '/markers/marker-2.patt'
      },
      riddle: {
        type: 'choice',
        config: {
          question: '하늘의 색깔은?',
          options: ['빨강', '파랑', '노랑', '초록'],
          answerIndex: 1
        }
      },
      hint: {
        type: 'text',
        config: {
          value: '축하해! 마지막 보물을 찾았어!'
        }
      }
    }
  ]
};

/**
 * Load treasures from localStorage
 * @returns {Object} Treasures data
 */
export function loadTreasures() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load treasures:', e);
  }
  
  return { ...defaultConfig };
}

/**
 * Save treasures to localStorage
 * @param {Object} data - Treasures data
 */
export function saveTreasures(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save treasures:', e);
  }
}

/**
 * Load sample treasures (for demo)
 */
export function loadSampleTreasures() {
  saveTreasures(sampleTreasures);
  return sampleTreasures;
}

/**
 * Clear all treasures
 */
export function clearTreasures() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export treasures as JSON file
 */
export function exportTreasures() {
  const data = loadTreasures();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'treasures.json';
  a.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Import treasures from JSON file
 * @param {File} file - JSON file
 * @returns {Promise<Object>} Imported data
 */
export function importTreasures(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        saveTreasures(data);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
