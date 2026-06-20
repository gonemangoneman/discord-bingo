const express = require('express');
const {
  getActiveSession,
  getEventsForSets,
  getSessionSets,
  getTriggeredEvents,
  getGuildConfig,
} = require('../db/database');
const { getOrCreateBoard, buildBoardData, markCell } = require('../services/gameManager');

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

  return router;
};
