import { io } from 'socket.io-client';

let socket = null;

export function connectSocket() {
  if (socket) return socket;

  // In the Discord activity iframe, we need to connect through the proxy
  const url = window.location.origin;
  socket = io(url, {
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function joinSession(sessionId, userId) {
  if (socket) {
    socket.emit('join-session', { sessionId, userId });
  }
}

export function emitMarkCell(sessionId, userId, row, col) {
  if (socket) {
    socket.emit('mark-cell', { sessionId, userId, row, col });
  }
}
