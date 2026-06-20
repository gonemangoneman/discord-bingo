const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'bingo.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

/**
 * Initialize the database, create tables if they don't exist.
 * Uses Node.js built-in node:sqlite (DatabaseSync).
 */
function initDatabase() {
  if (db) return db;

  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Run schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  console.log('[DB] Database initialized at', DB_PATH);
  return db;
}

/**
 * Get the database instance (must be initialized first).
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// ─── Guild Config ────────────────────────────────────────────

function getGuildConfig(guildId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
}

function upsertGuildConfig(guildId, { eventChannelId, notificationChannelId, bingoLeaderRoleId, autoMarkEnabled }) {
  const db = getDatabase();
  return db.prepare(`
    INSERT INTO guild_config (guild_id, event_channel_id, notification_channel_id, bingo_leader_role_id, auto_mark_enabled)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      event_channel_id = COALESCE(excluded.event_channel_id, event_channel_id),
      notification_channel_id = COALESCE(excluded.notification_channel_id, notification_channel_id),
      bingo_leader_role_id = COALESCE(excluded.bingo_leader_role_id, bingo_leader_role_id),
      auto_mark_enabled = COALESCE(excluded.auto_mark_enabled, auto_mark_enabled)
  `).run(guildId, eventChannelId ?? null, notificationChannelId ?? null, bingoLeaderRoleId ?? null, autoMarkEnabled ?? 1);
}

function updateAutoMark(guildId, enabled) {
  const db = getDatabase();
  return db.prepare('UPDATE guild_config SET auto_mark_enabled = ? WHERE guild_id = ?').run(enabled ? 1 : 0, guildId);
}

// ─── Event Sets ──────────────────────────────────────────────

function createEventSet(guildId, name) {
  const db = getDatabase();
  return db.prepare('INSERT INTO event_sets (guild_id, name) VALUES (?, ?)').run(guildId, name);
}

function getEventSets(guildId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT es.*, COUNT(be.id) as event_count
    FROM event_sets es
    LEFT JOIN bingo_events be ON be.set_id = es.id
    WHERE es.guild_id = ?
    GROUP BY es.id
    ORDER BY es.name
  `).all(guildId);
}

function getEventSet(guildId, name) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM event_sets WHERE guild_id = ? AND name = ?').get(guildId, name);
}

function getEventSetById(setId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM event_sets WHERE id = ?').get(setId);
}

function deleteEventSet(setId) {
  const db = getDatabase();
  return db.prepare('DELETE FROM event_sets WHERE id = ?').run(setId);
}

// ─── Bingo Events ────────────────────────────────────────────

function addBingoEvent(setId, eventText) {
  const db = getDatabase();
  return db.prepare('INSERT INTO bingo_events (set_id, event_text) VALUES (?, ?)').run(setId, eventText);
}

function removeBingoEvent(setId, eventText) {
  const db = getDatabase();
  return db.prepare('DELETE FROM bingo_events WHERE set_id = ? AND event_text = ?').run(setId, eventText);
}

function getEventsInSet(setId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM bingo_events WHERE set_id = ? ORDER BY event_text').all(setId);
}

function getEventsForSets(setIds) {
  const db = getDatabase();
  if (!setIds.length) return [];
  const placeholders = setIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM bingo_events WHERE set_id IN (${placeholders}) ORDER BY event_text`).all(...setIds);
}

// ─── Game Sessions ───────────────────────────────────────────

function createGameSession(guildId, channelId, setIds) {
  const db = getDatabase();

  // node:sqlite doesn't have .transaction() — use manual BEGIN/COMMIT
  db.exec('BEGIN');
  try {
    const result = db.prepare('INSERT INTO game_sessions (guild_id, channel_id) VALUES (?, ?)').run(guildId, channelId);
    const sessionId = result.lastInsertRowid;

    const insertSet = db.prepare('INSERT INTO session_sets (session_id, set_id) VALUES (?, ?)');
    for (const setId of setIds) {
      insertSet.run(sessionId, setId);
    }

    db.exec('COMMIT');
    return sessionId;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getActiveSession(guildId) {
  const db = getDatabase();
  return db.prepare("SELECT * FROM game_sessions WHERE guild_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1").get(guildId);
}

function endGameSession(sessionId) {
  const db = getDatabase();
  return db.prepare("UPDATE game_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
}

function getSessionSets(sessionId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT es.* FROM event_sets es
    JOIN session_sets ss ON ss.set_id = es.id
    WHERE ss.session_id = ?
  `).all(sessionId);
}

// ─── Session Event Messages ──────────────────────────────────

function addSessionEventMessage(sessionId, eventId, messageId) {
  const db = getDatabase();
  return db.prepare('INSERT INTO session_event_messages (session_id, event_id, message_id) VALUES (?, ?, ?)').run(sessionId, eventId, messageId);
}

function getSessionEventByMessageId(messageId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT sem.*, be.event_text, be.set_id
    FROM session_event_messages sem
    JOIN bingo_events be ON be.id = sem.event_id
    WHERE sem.message_id = ?
  `).get(messageId);
}

function triggerSessionEvent(sessionId, eventId, triggeredBy) {
  const db = getDatabase();
  return db.prepare(`
    UPDATE session_event_messages
    SET triggered = 1, triggered_by = ?, triggered_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND event_id = ?
  `).run(triggeredBy, sessionId, eventId);
}

function getTriggeredEvents(sessionId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT sem.*, be.event_text
    FROM session_event_messages sem
    JOIN bingo_events be ON be.id = sem.event_id
    WHERE sem.session_id = ? AND sem.triggered = 1
  `).all(sessionId);
}

function getSessionEventMessages(sessionId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM session_event_messages WHERE session_id = ?').all(sessionId);
}

// ─── Player Boards ───────────────────────────────────────────

function createPlayerBoard(sessionId, userId, boardLayout) {
  const db = getDatabase();
  return db.prepare(`
    INSERT INTO player_boards (session_id, user_id, board_layout, marked_cells)
    VALUES (?, ?, ?, '[]')
  `).run(sessionId, userId, JSON.stringify(boardLayout));
}

function getPlayerBoard(sessionId, userId) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM player_boards WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
  if (row) {
    row.board_layout = JSON.parse(row.board_layout);
    row.marked_cells = JSON.parse(row.marked_cells);
  }
  return row;
}

function updateMarkedCells(sessionId, userId, markedCells) {
  const db = getDatabase();
  return db.prepare('UPDATE player_boards SET marked_cells = ? WHERE session_id = ? AND user_id = ?')
    .run(JSON.stringify(markedCells), sessionId, userId);
}

function getSessionPlayers(sessionId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM player_boards WHERE session_id = ?').all(sessionId).map(row => ({
    ...row,
    board_layout: JSON.parse(row.board_layout),
    marked_cells: JSON.parse(row.marked_cells),
  }));
}

// ─── Bingos ──────────────────────────────────────────────────

function recordBingo(sessionId, userId, bingoType, globalPosition, pointsAwarded) {
  const db = getDatabase();
  return db.prepare(`
    INSERT INTO bingos (session_id, user_id, bingo_type, global_position, points_awarded)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, bingoType, globalPosition, pointsAwarded);
}

function getSessionBingos(sessionId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM bingos WHERE session_id = ? ORDER BY achieved_at ASC').all(sessionId);
}

function getPlayerBingos(sessionId, userId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM bingos WHERE session_id = ? AND user_id = ?').all(sessionId, userId);
}

function getBingoCount(sessionId) {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) as count FROM bingos WHERE session_id = ?').get(sessionId);
  return row.count;
}

// ─── Leaderboard ─────────────────────────────────────────────

function updateLeaderboard(guildId, userId, pointsToAdd, bingosToAdd) {
  const db = getDatabase();
  return db.prepare(`
    INSERT INTO leaderboard (guild_id, user_id, total_points, games_played, total_bingos)
    VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      total_points = total_points + excluded.total_points,
      total_bingos = total_bingos + excluded.total_bingos
  `).run(guildId, userId, pointsToAdd, bingosToAdd);
}

function incrementGamesPlayed(guildId, userId) {
  const db = getDatabase();
  return db.prepare(`
    INSERT INTO leaderboard (guild_id, user_id, total_points, games_played, total_bingos)
    VALUES (?, ?, 0, 1, 0)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      games_played = games_played + 1
  `).run(guildId, userId);
}

function getLeaderboard(guildId, limit = 10) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM leaderboard WHERE guild_id = ? ORDER BY total_points DESC LIMIT ?').all(guildId, limit);
}

function getSessionScores(sessionId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT user_id, SUM(points_awarded) as total_points, COUNT(*) as bingo_count
    FROM bingos
    WHERE session_id = ?
    GROUP BY user_id
    ORDER BY total_points DESC
  `).all(sessionId);
}

module.exports = {
  initDatabase,
  getDatabase,
  // Guild config
  getGuildConfig,
  upsertGuildConfig,
  updateAutoMark,
  // Event sets
  createEventSet,
  getEventSets,
  getEventSet,
  getEventSetById,
  deleteEventSet,
  // Bingo events
  addBingoEvent,
  removeBingoEvent,
  getEventsInSet,
  getEventsForSets,
  // Game sessions
  createGameSession,
  getActiveSession,
  endGameSession,
  getSessionSets,
  // Session event messages
  addSessionEventMessage,
  getSessionEventByMessageId,
  triggerSessionEvent,
  getTriggeredEvents,
  getSessionEventMessages,
  // Player boards
  createPlayerBoard,
  getPlayerBoard,
  updateMarkedCells,
  getSessionPlayers,
  // Bingos
  recordBingo,
  getSessionBingos,
  getPlayerBingos,
  getBingoCount,
  // Leaderboard
  updateLeaderboard,
  incrementGamesPlayed,
  getLeaderboard,
  getSessionScores,
};
