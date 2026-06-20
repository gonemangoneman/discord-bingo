/**
 * Scoring Engine
 *
 * Handles bingo detection and point calculation.
 */

// All 12 possible bingo lines on a 5x5 board
const BINGO_LINES = [
  // 5 rows
  { type: 'row-0', cells: [[0,0],[0,1],[0,2],[0,3],[0,4]] },
  { type: 'row-1', cells: [[1,0],[1,1],[1,2],[1,3],[1,4]] },
  { type: 'row-2', cells: [[2,0],[2,1],[2,2],[2,3],[2,4]] },
  { type: 'row-3', cells: [[3,0],[3,1],[3,2],[3,3],[3,4]] },
  { type: 'row-4', cells: [[4,0],[4,1],[4,2],[4,3],[4,4]] },
  // 5 columns
  { type: 'col-0', cells: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
  { type: 'col-1', cells: [[0,1],[1,1],[2,1],[3,1],[4,1]] },
  { type: 'col-2', cells: [[0,2],[1,2],[2,2],[3,2],[4,2]] },
  { type: 'col-3', cells: [[0,3],[1,3],[2,3],[3,3],[4,3]] },
  { type: 'col-4', cells: [[0,4],[1,4],[2,4],[3,4],[4,4]] },
  // 2 diagonals
  { type: 'diag-main', cells: [[0,0],[1,1],[2,2],[3,3],[4,4]] },
  { type: 'diag-anti', cells: [[0,4],[1,3],[2,2],[3,1],[4,0]] },
];

/**
 * Check if a specific line is a bingo.
 * Center cell [2,2] is always considered marked (FREE space).
 */
function isLineComplete(cells, markedCells) {
  return cells.every(([row, col]) => {
    // Free space is always marked
    if (row === 2 && col === 2) return true;
    return markedCells.some(([r, c]) => r === row && c === col);
  });
}

/**
 * Detect all current bingos on a board.
 * Returns array of { type: string } for each completed bingo line.
 */
function detectBingos(board, markedCells) {
  const completedBingos = [];

  for (const line of BINGO_LINES) {
    if (isLineComplete(line.cells, markedCells)) {
      completedBingos.push({ type: line.type });
    }
  }

  return completedBingos;
}

/**
 * Find new bingos that haven't been recorded yet.
 *
 * @param {number[][]} board - 5x5 board layout
 * @param {number[][]} markedCells - Array of [row, col] pairs
 * @param {Array} existingBingos - Previously recorded bingos from DB
 * @returns {Array} Array of new bingo objects { type: string }
 */
function detectNewBingos(board, markedCells, existingBingos) {
  const allBingos = detectBingos(board, markedCells);
  const existingTypes = new Set(existingBingos.map(b => b.bingo_type));
  return allBingos.filter(b => !existingTypes.has(b.type));
}

/**
 * Calculate points for a bingo.
 *
 * @param {number} globalPosition - This bingo's position among all bingos in the session (1-indexed)
 * @param {number} playerBingoIndex - How many bingos this player has already achieved (0-indexed)
 * @returns {number} Points to award (rounded up)
 */
function calculatePoints(globalPosition, playerBingoIndex) {
  const basePoints = [10, 8, 6, 5, 4];
  const base = globalPosition <= 5 ? basePoints[globalPosition - 1] : 3;
  const multiplier = Math.pow(0.5, playerBingoIndex);
  return Math.ceil(base * multiplier);
}

module.exports = {
  BINGO_LINES,
  detectBingos,
  detectNewBingos,
  calculatePoints,
};
