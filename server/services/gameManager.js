/**
 * Game Manager
 *
 * Orchestrates game logic between the database, scoring engine, and Socket.io.
 */
const {
  getActiveSession,
  getPlayerBoard,
  createPlayerBoard,
  updateMarkedCells,
  getPlayerBingos,
  getBingoCount,
  recordBingo,
  getEventsForSets,
  getSessionSets,
  getTriggeredEvents,
} = require('../db/database');
const { generateBoard } = require('./boardGenerator');
const { detectNewBingos, calculatePoints } = require('./scoringEngine');

/**
 * Get or create a player's board for the active session.
 */
function getOrCreateBoard(sessionId, userId, guildId) {
  let board = getPlayerBoard(sessionId, userId);
  if (board) return board;

  // Generate a new board
  const sessionSets = getSessionSets(sessionId);
  const setIds = sessionSets.map(s => s.id);
  const events = getEventsForSets(setIds);

  const layout = generateBoard(events, sessionId, userId);
  createPlayerBoard(sessionId, userId, layout);

  board = getPlayerBoard(sessionId, userId);
  return board;
}

/**
 * Build the full board data with event texts for the client.
 */
function buildBoardData(board, events) {
  const eventMap = {};
  for (const e of events) {
    eventMap[e.id] = e;
  }

  const cells = [];
  for (let row = 0; row < 5; row++) {
    cells[row] = [];
    for (let col = 0; col < 5; col++) {
      const eventId = board.board_layout[row][col];
      if (eventId === -1) {
        cells[row][col] = { eventId: -1, text: '★ FREE ★', isFree: true };
      } else {
        const event = eventMap[eventId];
        cells[row][col] = {
          eventId,
          text: event ? event.event_text : 'Unknown',
          isFree: false,
        };
      }
    }
  }

  return {
    sessionId: board.session_id,
    userId: board.user_id,
    cells,
    markedCells: board.marked_cells,
  };
}

/**
 * Mark a cell on a player's board (for manual mode).
 * Returns { success, newBingos, markedCells }
 */
function markCell(sessionId, userId, row, col, io) {
  const board = getPlayerBoard(sessionId, userId);
  if (!board) return { success: false, error: 'No board found' };

  // Check if already marked
  const alreadyMarked = board.marked_cells.some(([r, c]) => r === row && c === col);
  if (alreadyMarked) return { success: false, error: 'Already marked' };

  // Check if this event has been triggered
  const eventId = board.board_layout[row][col];
  if (eventId === -1) return { success: false, error: 'Cannot mark free space' };

  const triggered = getTriggeredEvents(sessionId);
  const isTriggered = triggered.some(t => t.event_id === eventId);
  if (!isTriggered) return { success: false, error: 'Event not triggered yet' };

  // Mark it
  const markedCells = [...board.marked_cells, [row, col]];
  updateMarkedCells(sessionId, userId, markedCells);

  // Check for new bingos
  const existingBingos = getPlayerBingos(sessionId, userId);
  const newBingos = detectNewBingos(board.board_layout, markedCells, existingBingos);

  const awardedBingos = [];
  for (const bingo of newBingos) {
    const globalPos = getBingoCount(sessionId) + 1;
    const playerBingoIndex = existingBingos.length + awardedBingos.length;
    const points = calculatePoints(globalPos, playerBingoIndex);

    recordBingo(sessionId, userId, bingo.type, globalPos, points);
    awardedBingos.push({ ...bingo, globalPosition: globalPos, points });

    if (io) {
      io.to(`session:${sessionId}`).emit('bingo-achieved', {
        userId,
        bingoType: bingo.type,
        globalPosition: globalPos,
        points,
      });
    }
  }

  return { success: true, markedCells, newBingos: awardedBingos };
}

module.exports = {
  getOrCreateBoard,
  buildBoardData,
  markCell,
};
