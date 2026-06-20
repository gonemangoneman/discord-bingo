const express = require('express');
const router = express.Router();
const { getLeaderboard, getSessionScores } = require('../db/database');

// GET /api/leaderboard/:guildId — All-time leaderboard
router.get('/:guildId', (req, res) => {
  const entries = getLeaderboard(req.params.guildId, 20);
  res.json(entries);
});

// GET /api/leaderboard/:guildId/session/:sessionId — Session scores
router.get('/:guildId/session/:sessionId', (req, res) => {
  const scores = getSessionScores(Number(req.params.sessionId));
  res.json(scores);
});

module.exports = router;
