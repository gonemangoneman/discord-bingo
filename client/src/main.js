import './styles/index.css';
import './styles/board.css';
import './styles/animations.css';

import { initDiscordSdk, getUser, getGuildId } from './discord.js';
import { connectSocket, joinSession } from './socket.js';
import { renderBoard, onEventTriggered, onBoardUpdate, highlightBingo, checkForPotentialBingo } from './board.js';
import { renderScorePanel, updateScore, updateLeaderboard } from './scoring.js';
import { showNotification, showBingoNotification, showGameOver } from './notifications.js';

async function main() {
  const app = document.getElementById('app');

  try {
    // Initialize Discord SDK
    updateLoadingText('Authenticating...');
    const { discordSdk, auth } = await initDiscordSdk();
    const user = getUser();
    const guildId = getGuildId();

    updateLoadingText('Finding active game...');

    // Fetch active session
    let sessionRes;
    try {
      sessionRes = await fetch(`/.proxy/api/game/${guildId}/active`);
    } catch {
      sessionRes = await fetch(`/api/game/${guildId}/active`);
    }
    const sessionData = await sessionRes.json();

    if (!sessionData.active) {
      showNoGameScreen(app);
      return;
    }

    const session = sessionData.session;
    const autoMark = sessionData.autoMark;

    updateLoadingText('Loading your board...');

    // Fetch player's board
    let boardRes;
    try {
      boardRes = await fetch(`/.proxy/api/game/${session.id}/board/${user.id}`);
    } catch {
      boardRes = await fetch(`/api/game/${session.id}/board/${user.id}`);
    }
    const boardData = await boardRes.json();

    // Register display name with server
    const displayName = user.global_name || user.username;
    try {
      await fetch('/.proxy/api/game/register-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId, userId: user.id, displayName }),
      });
    } catch {
      try {
        await fetch('/api/game/register-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId, userId: user.id, displayName }),
        });
      } catch (e) { /* ignore */ }
    }

    // Build the UI
    app.innerHTML = `
      <div class="app-layout">
        <header class="app-header">
          <div class="header-left">
            <h1 class="app-title">🎯 Stream Bingo</h1>
            <span class="session-badge">Session #${session.id}</span>
          </div>
          <div class="header-right">
            <span class="user-name">${user.global_name || user.username}</span>
            <img class="user-avatar" src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=32" alt="" />
          </div>
        </header>
        <main class="app-main">
          <div id="board-container" class="board-container"></div>
          <div class="board-actions">
            <button id="bingo-claim-btn" class="bingo-claim-btn" disabled>
              🎯 BINGO!
            </button>
          </div>
          <aside id="score-panel" class="score-panel"></aside>
        </main>
      </div>
    `;

    // Wire up the BINGO button
    const bingoBtn = document.getElementById('bingo-claim-btn');
    bingoBtn.addEventListener('click', () => claimBingo(session.id, user.id, guildId));

    // Render board and score panel
    renderBoard(boardData, autoMark);
    renderScorePanel();

    // Connect Socket.io
    const socket = connectSocket();
    joinSession(session.id, user.id);

    // Listen for real-time events
    socket.on('event-triggered', (data) => {
      onEventTriggered(data.eventId, data.eventText, data.affectedPlayers, user.id);
    });

    socket.on('board-update', (data) => {
      if (data.userId === user.id) {
        onBoardUpdate(data.userId, data.markedCells);
      }
    });

    socket.on('bingo-achieved', (data) => {
      const isMe = data.userId === user.id;
      if (isMe) {
        highlightBingo(data.bingoType);
      }
      const name = isMe ? 'You' : (data.displayName || data.userId);
      showBingoNotification(name, data.points, isMe);

      // Refresh leaderboard
      fetchLeaderboard(session.id, guildId, user.id);
    });

    socket.on('score-update', (data) => {
      const myScore = data.scores?.find(s => s.user_id === user.id);
      if (myScore) {
        updateScore(myScore.total_points, myScore.bingo_count);
      }
      updateLeaderboard(data.scores);
    });

    socket.on('game-ended', (data) => {
      showGameOver(data.scores || []);
    });

    // Initial leaderboard fetch
    fetchLeaderboard(session.id, guildId, user.id);

  } catch (err) {
    console.error('[App] Initialization error:', err);
    app.innerHTML = `
      <div class="error-screen">
        <h2>😵 Something went wrong</h2>
        <p>${err.message || 'Failed to initialize the activity.'}</p>
        <p class="error-hint">Make sure you're opening this from within Discord.</p>
      </div>
    `;
  }
}

async function fetchLeaderboard(sessionId, guildId, userId) {
  try {
    let res;
    try {
      res = await fetch(`/.proxy/api/leaderboard/${guildId}/session/${sessionId}`);
    } catch {
      res = await fetch(`/api/leaderboard/${guildId}/session/${sessionId}`);
    }
    const scores = await res.json();

    // Mark current player and use display names from server
    const enhanced = scores.map(s => ({
      ...s,
      isCurrentPlayer: s.user_id === userId,
      displayName: s.display_name || s.user_id,
    }));

    updateLeaderboard(enhanced);

    // Update own score
    const myScore = enhanced.find(s => s.isCurrentPlayer);
    if (myScore) {
      updateScore(myScore.total_points, myScore.bingo_count);
    }
  } catch (err) {
    console.warn('[App] Leaderboard fetch failed:', err);
  }
}

function showNoGameScreen(app) {
  app.innerHTML = `
    <div class="no-game-screen">
      <div class="no-game-icon">🎯</div>
      <h2>No Active Game</h2>
      <p>A Bingo Leader needs to start a game with <code>/bingo-start</code></p>
      <p class="no-game-hint">Once a game starts, reopen this activity to join!</p>
    </div>
  `;
}

function updateLoadingText(text) {
  const el = document.querySelector('.loader-text');
  if (el) el.textContent = text;
}

async function claimBingo(sessionId, userId, guildId) {
  const btn = document.getElementById('bingo-claim-btn');
  if (!btn || btn.disabled) return;

  // Check locally first
  if (!checkForPotentialBingo()) {
    showNotification('❌ You don\'t have a bingo yet!', 'warning');
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 500);
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Claiming...';

  try {
    let res;
    try {
      res = await fetch(`/.proxy/api/game/${sessionId}/claim-bingo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, guildId }),
      });
    } catch {
      res = await fetch(`/api/game/${sessionId}/claim-bingo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, guildId }),
      });
    }

    const data = await res.json();

    if (data.claimed && data.claimed.length > 0) {
      for (const b of data.claimed) {
        highlightBingo(b.bingoType);
      }
      showNotification(`🎉 BINGO! +${data.claimed.reduce((s, b) => s + Math.round(b.points), 0)} points!`, 'bingo');
    } else if (data.error) {
      showNotification(`❌ ${data.error}`, 'warning');
    } else {
      showNotification('No new bingos to claim.', 'info');
    }
  } catch (err) {
    console.error('[App] Claim bingo failed:', err);
    showNotification('❌ Failed to claim bingo.', 'error');
  }

  btn.textContent = '🎯 BINGO!';
  // Re-enable after a short cooldown
  setTimeout(() => {
    btn.disabled = false;
  }, 2000);
}

// Boot!
main();
