let currentPoints = 0;
let bingoCount = 0;

/**
 * Render the score panel.
 */
export function renderScorePanel() {
  const container = document.getElementById('score-panel');
  if (!container) return;

  container.innerHTML = `
    <div class="score-card">
      <div class="score-item">
        <span class="score-label">Your Points</span>
        <span class="score-value" id="score-points">0</span>
      </div>
      <div class="score-item">
        <span class="score-label">Bingos</span>
        <span class="score-value" id="score-bingos">0</span>
      </div>
    </div>
    <div class="leaderboard-mini" id="leaderboard-mini">
      <h3 class="leaderboard-title">🏆 Session Leaderboard</h3>
      <div class="leaderboard-entries" id="leaderboard-entries">
        <p class="leaderboard-empty">No scores yet</p>
      </div>
    </div>
  `;
}

/**
 * Update the score display when points change.
 */
export function updateScore(points, bingos) {
  const pointsEl = document.getElementById('score-points');
  const bingosEl = document.getElementById('score-bingos');

  if (pointsEl) {
    currentPoints = Math.round(points);
    pointsEl.textContent = currentPoints;
  }

  if (bingosEl) {
    bingoCount = bingos;
    bingosEl.textContent = bingos;
    bingosEl.classList.add('score-bump');
    setTimeout(() => bingosEl.classList.remove('score-bump'), 300);
  }
}

/**
 * Update the mini leaderboard.
 */
export function updateLeaderboard(scores) {
  const container = document.getElementById('leaderboard-entries');
  if (!container) return;

  if (!scores || scores.length === 0) {
    container.innerHTML = '<p class="leaderboard-empty">No scores yet</p>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = scores.slice(0, 5).map((s, i) => {
    const medal = medals[i] || `${i + 1}.`;
    return `
      <div class="leaderboard-entry ${s.isCurrentPlayer ? 'current-player' : ''}">
        <span class="entry-rank">${medal}</span>
        <span class="entry-name">${escapeHtml(s.displayName || s.userId)}</span>
        <span class="entry-points">${Math.round(s.total_points)} pts</span>
      </div>
    `;
  }).join('');
}

function animateNumber(el, from, to) {
  const duration = 500;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(from + (to - from) * eased);
    el.textContent = current;

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
