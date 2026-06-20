import { showNotification } from './notifications.js';
import { emitMarkCell } from './socket.js';

let boardState = null;
let autoMark = true;

/**
 * Render the 5x5 bingo board.
 */
export function renderBoard(boardData, isAutoMark) {
  boardState = boardData;
  autoMark = isAutoMark;

  const container = document.getElementById('board-container');
  if (!container) return;

  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'bingo-grid';
  grid.id = 'bingo-grid';

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cell = boardData.cells[row][col];
      const isMarked = cell.isFree || boardData.markedCells.some(([r, c]) => r === row && c === col);

      const el = document.createElement('button');
      el.className = 'bingo-cell';
      el.dataset.row = row;
      el.dataset.col = col;
      el.dataset.eventId = cell.eventId;
      el.id = `cell-${row}-${col}`;

      if (cell.isFree) {
        el.classList.add('free');
        el.innerHTML = '<span class="cell-text">★<br>FREE<br>★</span>';
      } else {
        el.innerHTML = `<span class="cell-text">${escapeHtml(cell.text)}</span>`;
      }

      if (isMarked) {
        el.classList.add('marked');
      }

      if (cell.triggered && !isMarked) {
        el.classList.add('called');
      }

      // Click handler for manual marking
      if (!cell.isFree && !isMarked && cell.triggered) {
        el.addEventListener('click', () => handleCellClick(row, col));
      }

      // Stagger animation
      el.style.animationDelay = `${(row * 5 + col) * 40}ms`;

      grid.appendChild(el);
    }
  }

  container.appendChild(grid);
}

/**
 * Handle cell click (manual mode or clicking a called event).
 */
function handleCellClick(row, col) {
  if (!boardState) return;

  const cell = boardState.cells[row][col];
  if (cell.isFree) return;
  if (!cell.triggered) {
    showNotification('This event hasn\'t been called yet!', 'warning');
    return;
  }

  const alreadyMarked = boardState.markedCells.some(([r, c]) => r === row && c === col);
  if (alreadyMarked) return;

  if (!autoMark) {
    // Manual mode — emit mark event
    emitMarkCell(boardState.sessionId, boardState.userId, row, col);
  }

  // Optimistic local update
  boardState.markedCells.push([row, col]);
  const el = document.getElementById(`cell-${row}-${col}`);
  if (el) {
    el.classList.remove('called');
    el.classList.add('marked', 'just-marked');
    setTimeout(() => el.classList.remove('just-marked'), 600);
  }
}

/**
 * Update the board when an event is triggered.
 */
export function onEventTriggered(eventId, eventText, affectedPlayers, userId) {
  if (!boardState) return;

  // Find and update cells with this event
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cell = boardState.cells[row][col];
      if (cell.eventId === eventId) {
        cell.triggered = true;
        const el = document.getElementById(`cell-${row}-${col}`);

        if (autoMark) {
          // Auto-mark: check if this player was affected
          const affected = affectedPlayers?.find(p => p.userId === userId && p.row === row && p.col === col);
          if (affected) {
            boardState.markedCells.push([row, col]);
            if (el) {
              el.classList.add('marked', 'just-marked');
              setTimeout(() => el.classList.remove('just-marked'), 600);
            }
          }
        } else {
          // Manual mode: highlight as called (clickable)
          if (el) {
            el.classList.add('called');
            el.addEventListener('click', () => handleCellClick(row, col));
          }
        }
      }
    }
  }

  showNotification(`🎯 ${eventText}`, 'event');
}

/**
 * Update board when cells are marked (from server).
 */
export function onBoardUpdate(userId, markedCells) {
  if (!boardState || boardState.userId !== userId) return;

  boardState.markedCells = markedCells;

  for (const [row, col] of markedCells) {
    const el = document.getElementById(`cell-${row}-${col}`);
    if (el && !el.classList.contains('marked')) {
      el.classList.add('marked', 'just-marked');
      setTimeout(() => el.classList.remove('just-marked'), 600);
    }
  }
}

/**
 * Highlight a bingo line.
 */
export function highlightBingo(bingoType) {
  const cells = getBingoCells(bingoType);
  for (const [row, col] of cells) {
    const el = document.getElementById(`cell-${row}-${col}`);
    if (el) {
      el.classList.add('bingo-line');
    }
  }
}

function getBingoCells(type) {
  if (type.startsWith('row-')) {
    const r = parseInt(type.split('-')[1]);
    return [[r,0],[r,1],[r,2],[r,3],[r,4]];
  }
  if (type.startsWith('col-')) {
    const c = parseInt(type.split('-')[1]);
    return [[0,c],[1,c],[2,c],[3,c],[4,c]];
  }
  if (type === 'diag-main') {
    return [[0,0],[1,1],[2,2],[3,3],[4,4]];
  }
  if (type === 'diag-anti') {
    return [[0,4],[1,3],[2,2],[3,1],[4,0]];
  }
  return [];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
