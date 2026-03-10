/**
 * Random agent name generator — pure functions, no deps.
 * Format: adjective-noun-N  e.g. "swift-mantis-7"
 */

const ADJECTIVES = [
  'swift', 'bold', 'calm', 'keen', 'warm', 'dark', 'sharp', 'bright',
  'soft', 'hard', 'deep', 'fast', 'cool', 'wild', 'clear', 'quick',
  'still', 'loud', 'wise', 'brave',
];

const NOUNS = [
  'mantis', 'falcon', 'heron', 'raven', 'lynx', 'viper', 'crane',
  'gecko', 'panda', 'bison', 'cobra', 'finch', 'hyena', 'ibis',
  'jackal', 'kite', 'lemur', 'mink', 'newt', 'orca',
];

/** 20 visually distinct CSS hex colours for agent badges */
export const COLOR_PALETTE = [
  '#a855f7', '#22c55e', '#3b82f6', '#ef4444', '#f59e0b',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#8b5cf6',
  '#14b8a6', '#e11d48', '#0ea5e9', '#d97706', '#7c3aed',
  '#16a34a', '#dc2626', '#2563eb', '#d946ef', '#ca8a04',
];

/**
 * @param {() => number} [random]  injectable for testing
 * @returns {string}
 */
export function randomAgentName(random = Math.random) {
  const adj = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(random() * NOUNS.length)];
  const n = Math.floor(random() * 100);
  return `${adj}-${noun}-${n}`;
}

/**
 * @param {() => number} [random]  injectable for testing
 * @returns {string}  CSS hex colour
 */
export function randomColor(random = Math.random) {
  return COLOR_PALETTE[Math.floor(random() * COLOR_PALETTE.length)];
}
