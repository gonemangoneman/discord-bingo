import { showNotification } from './notifications.js';

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

      const el = document.createElement('div');
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
      } else if (cell.triggered) {
        if (autoMark) {
          // Auto-mark: triggered means marked
          el.classList.add('marked');
          if (!boardData.markedCells.some(([r, c]) => r === row && c === col)) {
            boardData.markedCells.push([row, col]);
          }
        } else {
          // Manual mode: show as called (player needs to click)
          el.classList.add('called');
        }
      }

      // Stagger animation
      el.style.animationDelay = `${(row * 5 + col) * 40}ms`;

      grid.appendChild(el);
    }
  }

  container.appendChild(grid);

  // Check if a bingo line is already complete on load
  setTimeout(() => updateBingoButtonState(), 0);
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
          // Auto-mark: triggered = marked, always
          boardState.markedCells.push([row, col]);
          if (el) {
            el.classList.add('marked', 'just-marked');
            el.classList.remove('called');
            setTimeout(() => el.classList.remove('just-marked'), 600);
          }
        } else {
          // Manual mode: highlight as called
          if (el) {
            el.classList.add('called');
          }
        }
      }
    }
  }

  showNotification(`🎯 ${eventText}`, 'event');

  // Check if any bingo line is now complete and update the button glow
  updateBingoButtonState();
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

  updateBingoButtonState();
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

/**
 * Check if the current board has any unclaimed bingo.
 * Used to make the BINGO button glow when a line is complete.
 */
export function checkForPotentialBingo() {
  if (!boardState) return false;

  const BINGO_LINES = [
    [[0,0],[0,1],[0,2],[0,3],[0,4]],
    [[1,0],[1,1],[1,2],[1,3],[1,4]],
    [[2,0],[2,1],[2,2],[2,3],[2,4]],
    [[3,0],[3,1],[3,2],[3,3],[3,4]],
    [[4,0],[4,1],[4,2],[4,3],[4,4]],
    [[0,0],[1,0],[2,0],[3,0],[4,0]],
    [[0,1],[1,1],[2,1],[3,1],[4,1]],
    [[0,2],[1,2],[2,2],[3,2],[4,2]],
    [[0,3],[1,3],[2,3],[3,3],[4,3]],
    [[0,4],[1,4],[2,4],[3,4],[4,4]],
    [[0,0],[1,1],[2,2],[3,3],[4,4]],
    [[0,4],[1,3],[2,2],[3,1],[4,0]],
  ];

  const markedSet = new Set(boardState.markedCells.map(([r,c]) => `${r},${c}`));
  // Free space is always marked
  markedSet.add('2,2');

  for (const line of BINGO_LINES) {
    const complete = line.every(([r,c]) => markedSet.has(`${r},${c}`));
    if (complete) return true;
  }
  return false;
}

/**
 * Update the BINGO button's visual state based on whether a bingo is available.
 */
function updateBingoButtonState() {
  const btn = document.getElementById('bingo-claim-btn');
  if (!btn) return;

  if (checkForPotentialBingo()) {
    btn.classList.add('bingo-ready');
    btn.disabled = false;
  } else {
    btn.classList.remove('bingo-ready');
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
