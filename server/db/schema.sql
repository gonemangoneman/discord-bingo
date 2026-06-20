-- Stream Bingo Bot Database Schema
-- SQLite with better-sqlite3

-- Guild-level configuration
CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    event_channel_id TEXT,
    notification_channel_id TEXT,
    bingo_leader_role_id TEXT,
    auto_mark_enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event sets (categories of bingo events)
CREATE TABLE IF NOT EXISTS event_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, name)
);

-- Individual bingo events (belong to a set)
CREATE TABLE IF NOT EXISTS bingo_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER NOT NULL REFERENCES event_sets(id) ON DELETE CASCADE,
    event_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(set_id, event_text)
);

-- Game sessions
CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- Which event sets are active for a session
CREATE TABLE IF NOT EXISTS session_sets (
    session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    set_id INTEGER NOT NULL REFERENCES event_sets(id),
    PRIMARY KEY (session_id, set_id)
);

-- Maps bingo_events to Discord messages posted in the event channel per session
CREATE TABLE IF NOT EXISTS session_event_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    event_id INTEGER NOT NULL REFERENCES bingo_events(id),
    message_id TEXT NOT NULL,
    triggered INTEGER DEFAULT 0,
    triggered_by TEXT,
    triggered_at TIMESTAMP,
    UNIQUE(session_id, event_id)
);

-- Player boards (one per player per session)
CREATE TABLE IF NOT EXISTS player_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    user_id TEXT NOT NULL,
    board_layout TEXT NOT NULL,
    marked_cells TEXT DEFAULT '[]',
    UNIQUE(session_id, user_id)
);

-- Bingos achieved
CREATE TABLE IF NOT EXISTS bingos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    user_id TEXT NOT NULL,
    bingo_type TEXT NOT NULL,
    global_position INTEGER NOT NULL,
    points_awarded REAL NOT NULL,
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- All-time leaderboard
CREATE TABLE IF NOT EXISTS leaderboard (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    total_points REAL DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    total_bingos INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
);

-- Cached display names (updated whenever a player interacts)
CREATE TABLE IF NOT EXISTS user_display_names (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
);
