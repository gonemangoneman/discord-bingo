const express = require('express');
const {
  getActiveSession,
  getEventsForSets,
  getSessionSets,
  getTriggeredEvents,
  getGuildConfig,
  upsertDisplayName,
  getDisplayName,
  getPlayerBoard,
  getPlayerBingos,
  getBingoCount,
  recordBingo,
  updateMarkedCells,
} = require('../db/database');
const { getOrCreateBoard, buildBoardData, markCell } = require('../services/gameManager');
const { detectNewBingos, calculatePoints } = require('../services/scoringEngine');

module.exports = function (io) {
  const router = express.Router();

  // GET /api/game/:guildId/active — Get current active session
  router.get('/:guildId/active', (req, res) => {
    const session = getActiveSession(req.params.guildId);
    if (!session) {
      return res.json({ active: false });
    }

    const config = getGuildConfig(req.params.guildId);

    res.json({
      active: true,
      session: {
        id: session.id,
        guildId: session.guild_id,
        channelId: session.channel_id,
        startedAt: session.started_at,
      },
      autoMark: config ? !!config.auto_mark_enabled : true,
    });
  });

  // GET /api/game/:sessionId/board/:userId — Get or create a player's board
  router.get('/:sessionId/board/:userId', (req, res) => {
    const { sessionId, userId } = req.params;

    try {
      const board = getOrCreateBoard(Number(sessionId), userId);
      const sessionSets = getSessionSets(Number(sessionId));
      const setIds = sessionSets.map(s => s.id);
      const events = getEventsForSets(setIds);
      const triggered = getTriggeredEvents(Number(sessionId));
      const triggeredEventIds = new Set(triggered.map(t => t.event_id));

      const boardData = buildBoardData(board, events);

      // Add triggered status to each cell
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          boardData.cells[row][col].triggered = boardData.cells[row][col].isFree || triggeredEventIds.has(boardData.cells[row][col].eventId);
        }
      }

      res.json(boardData);
    } catch (err) {
      console.error('[Game] Error getting board:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/game/:sessionId/events — Get all triggered events
  router.get('/:sessionId/events', (req, res) => {
    const triggered = getTriggeredEvents(Number(req.params.sessionId));
    res.json(triggered);
  });

  // POST /api/game/:sessionId/mark — Manually mark a cell
  router.post('/:sessionId/mark', (req, res) => {
    const { userId, row, col } = req.body;
    const sessionId = Number(req.params.sessionId);

    const result = markCell(sessionId, userId, row, col, io);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Emit board update to the player
    io.to(`session:${sessionId}`).emit('board-update', {
      userId,
      markedCells: result.markedCells,
    });

    res.json(result);
  });

  // POST /api/game/register-name — Client registers its display name
  router.post('/register-name', (req, res) => {
    const { guildId, userId, displayName } = req.body;
    if (!guildId || !userId || !displayName) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    upsertDisplayName(guildId, userId, displayName);
    res.json({ ok: true });
  });

  // POST /api/game/:sessionId/claim-bingo — Player claims a bingo
  router.post('/:sessionId/claim-bingo', (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { userId, guildId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const board = getPlayerBoard(sessionId, userId);
    if (!board) {
      return res.status(404).json({ error: 'No board found' });
    }

    // Ensure all triggered events are marked on this player's board
    // (handles cross-process sync delays between bot and server)
    const triggered = getTriggeredEvents(sessionId);
    const triggeredEventIds = new Set(triggered.map(t => t.event_id));
    const markedCells = [...board.marked_cells];
    let updated = false;

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const eventId = board.board_layout[row][col];
        if (eventId !== -1 && triggeredEventIds.has(eventId)) {
          const alreadyMarked = markedCells.some(([r, c]) => r === row && c === col);
          if (!alreadyMarked) {
            markedCells.push([row, col]);
            updated = true;
          }
        }
      }
    }

    if (updated) {
      updateMarkedCells(sessionId, userId, markedCells);
    }

    // Check for new bingos using the fully up-to-date marks
    const existingBingos = getPlayerBingos(sessionId, userId);
    const newBingos = detectNewBingos(board.board_layout, markedCells, existingBingos);

    if (newBingos.length === 0) {
      return res.json({ claimed: [], error: 'No new bingos to claim!' });
    }

    const claimed = [];
    for (const bingo of newBingos) {
      const globalPos = getBingoCount(sessionId) + 1;
      const playerBingoIndex = existingBingos.length + claimed.length;
      const points = calculatePoints(globalPos, playerBingoIndex);

      recordBingo(sessionId, userId, bingo.type, globalPos, points);
      claimed.push({
        bingoType: bingo.type,
        globalPosition: globalPos,
        points,
      });

      const playerName = getDisplayName(guildId || '', userId);

      console.log(`[Game] BINGO claimed! ${playerName} got ${bingo.type} (global #${globalPos}, ${points} pts)`);

      // Broadcast to all activity clients
      io.to(`session:${sessionId}`).emit('bingo-achieved', {
        userId,
        displayName: playerName,
        bingoType: bingo.type,
        globalPosition: globalPos,
        points,
      });
    }

    res.json({ claimed });
  });

  // ─── Bot → Server bridge (called by the bot process to emit Socket.io events) ───

  // POST /api/game/:sessionId/event-triggered — Bot notifies server that an event was triggered
  router.post('/:sessionId/event-triggered', (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { eventId, eventText, triggeredBy, affectedPlayers } = req.body;

    console.log(`[Game] Broadcasting event-triggered: "${eventText}" to session ${sessionId}`);

    io.to(`session:${sessionId}`).emit('event-triggered', {
      eventId,
      eventText,
      triggeredBy,
      affectedPlayers,
    });

    res.json({ ok: true });
  });

  // POST /api/game/:sessionId/bingo-achieved — Bot notifies server of a bingo
  router.post('/:sessionId/bingo-achieved', (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { userId, bingoType, globalPosition, points } = req.body;

    console.log(`[Game] Broadcasting bingo-achieved: ${userId} got ${bingoType} in session ${sessionId}`);

    io.to(`session:${sessionId}`).emit('bingo-achieved', {
      userId,
      displayName: req.body.displayName || userId,
      bingoType,
      globalPosition,
      points,
    });

    res.json({ ok: true });
  });

  // POST /api/game/:sessionId/game-ended — Bot notifies server that the game ended
  router.post('/:sessionId/game-ended', (req, res) => {
    const sessionId = Number(req.params.sessionId);
    const { scores } = req.body;

    console.log(`[Game] Broadcasting game-ended for session ${sessionId}`);

    io.to(`session:${sessionId}`).emit('game-ended', { sessionId, scores });

    res.json({ ok: true });
  });

  return router;
};
