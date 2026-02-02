/**
 * Riddle Bank Loader
 * 
 * Loads and merges all riddle JSON files.
 * Provides utility functions for filtering riddles.
 */

// Import all riddle JSON files
import math from './math.json';
import nonsense from './nonsense.json';
import idiom from './idiom.json';
import english from './english.json';
import minigames from './minigames.json';

/**
 * All riddles merged from all categories
 */
export const riddleBank = [
  ...math,
  ...nonsense,
  ...idiom,
  ...english,
  ...minigames
];

/**
 * Get riddles by category
 * @param {string} category - Category name (math, nonsense, idiom, english, minigame)
 * @returns {Array} Filtered riddles
 */
export function getRiddlesByCategory(category) {
  return riddleBank.filter(r => r.category === category);
}

/**
 * Get riddles by difficulty
 * @param {string} difficulty - Difficulty level (easy, medium, hard)
 * @returns {Array} Filtered riddles
 */
export function getRiddlesByDifficulty(difficulty) {
  return riddleBank.filter(r => r.difficulty === difficulty);
}

/**
 * Get riddle by ID
 * @param {string} id - Riddle ID
 * @returns {Object|undefined} Riddle object or undefined
 */
export function getRiddleById(id) {
  return riddleBank.find(r => r.id === id);
}

/**
 * Get riddles by type
 * @param {string} type - Riddle type (text, choice, sequence, memory, connect, etc.)
 * @returns {Array} Filtered riddles
 */
export function getRiddlesByType(type) {
  return riddleBank.filter(r => r.type === type);
}

/**
 * Get random riddle
 * @param {Object} filters - Optional filters { category, difficulty, type }
 * @returns {Object} Random riddle
 */
export function getRandomRiddle(filters = {}) {
  let riddles = [...riddleBank];
  
  if (filters.category) {
    riddles = riddles.filter(r => r.category === filters.category);
  }
  if (filters.difficulty) {
    riddles = riddles.filter(r => r.difficulty === filters.difficulty);
  }
  if (filters.type) {
    riddles = riddles.filter(r => r.type === filters.type);
  }
  
  if (riddles.length === 0) return null;
  
  const index = Math.floor(Math.random() * riddles.length);
  return riddles[index];
}

/**
 * Get all available categories
 * @returns {string[]} List of category names
 */
export function getCategories() {
  return [...new Set(riddleBank.map(r => r.category))];
}

/**
 * Get riddle count by category
 * @returns {Object} { category: count }
 */
export function getRiddleCountByCategory() {
  return riddleBank.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});
}
