const NOTIFICATION_DURATION = 5000;

/**
 * Show a toast notification.
 * @param {string} message - Notification text
 * @param {'event'|'bingo'|'info'|'warning'|'gameover'} type
 */
export function showNotification(message, type = 'info') {
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${getIcon(type)}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-enter');
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, NOTIFICATION_DURATION);
}

function getIcon(type) {
  switch (type) {
    case 'event': return '🎯';
    case 'bingo': return '🎉';
    case 'gameover': return '🏆';
    case 'warning': return '⚠️';
    default: return 'ℹ️';
  }
}

/**
 * Show a big celebratory bingo notification with confetti.
 */
export function showBingoNotification(playerName, points, isCurrentPlayer) {
  if (isCurrentPlayer) {
    showNotification(`YOU GOT BINGO! +${Math.round(points)} points!`, 'bingo');
  } else {
    showNotification(`${playerName} got a BINGO! (+${Math.round(points)} pts)`, 'bingo');
  }
}

/**
 * Show game over screen.
 */
export function showGameOver(scores) {
  showNotification('Game Over! Final scores are in!', 'gameover');

  const overlay = document.createElement('div');
  overlay.className = 'game-over-overlay';
  overlay.innerHTML = `
    <div class="game-over-card">
      <h2 class="game-over-title">🏆 Game Over!</h2>
      <div class="game-over-scores">
        ${scores.length > 0
          ? scores.map((s, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const medal = medals[i] || `${i + 1}.`;
              return `<div class="game-over-entry">${medal} ${s.display_name || s.user_id || 'Unknown'} — <strong>${Math.round(s.total_points)} pts</strong></div>`;
            }).join('')
          : '<p>No bingos were achieved!</p>'
        }
      </div>
    </div>
  `;

  document.getElementById('app').appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

/**
 * Launch confetti particles.
 */
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const particles = [];
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
    });
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.rotation += p.rotSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    frame++;
    if (frame < 120) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }

  animate();
}
