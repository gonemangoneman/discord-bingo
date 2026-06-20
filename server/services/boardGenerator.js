/**
 * Board Generator
 *
 * Generates a unique 5x5 bingo board for a player from the event pool.
 * Uses a seeded random to ensure the same player gets the same board
 * within the same session, but different boards between players.
 */

/**
 * Simple seeded PRNG (mulberry32)
 */
function seededRandom(seed) {
  let t = seed + 0x6D2B79F5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a number for seeding
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash);
}

/**
 * Fisher-Yates shuffle with seeded random
 */
function seededShuffle(array, rng) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate a 5x5 bingo board for a player.
 *
 * @param {Array} events - Array of event objects from the DB (must have .id property)
 * @param {number} sessionId - Current game session ID
 * @param {string} userId - Discord user ID
 * @returns {number[][]} 5x5 array of event IDs, with -1 at center (FREE space)
 */
function generateBoard(events, sessionId, userId) {
  if (events.length < 24) {
    throw new Error(`Need at least 24 events, got ${events.length}`);
  }

  // Create a deterministic seed from session + user
  const seed = hashString(`${sessionId}:${userId}`);
  const rng = seededRandom(seed);

  // Shuffle and pick 24 events
  const shuffled = seededShuffle(events, rng);
  const selected = shuffled.slice(0, 24);

  // Build 5x5 grid with FREE center
  const board = [];
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    board[row] = [];
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) {
        board[row][col] = -1; // FREE space
      } else {
        board[row][col] = selected[idx].id;
        idx++;
      }
    }
  }

  return board;
}

module.exports = { generateBoard };
