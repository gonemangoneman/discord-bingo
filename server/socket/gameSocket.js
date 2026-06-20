/**
 * Socket.io Game Handlers
 */
module.exports = function (io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Player joins a game session room
    socket.on('join-session', ({ sessionId, userId }) => {
      const room = `session:${sessionId}`;
      socket.join(room);
      socket.data.sessionId = sessionId;
      socket.data.userId = userId;
      console.log(`[Socket] ${userId} joined session ${sessionId}`);
    });

    // Player manually marks a cell (for manual mode)
    socket.on('mark-cell', async ({ sessionId, userId, row, col }) => {
      const { markCell } = require('../services/gameManager');
      const result = markCell(sessionId, userId, row, col, io);

      if (result.success) {
        // Notify the marking player
        socket.emit('board-update', {
          userId,
          markedCells: result.markedCells,
        });
      } else {
        socket.emit('mark-error', { error: result.error });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
};
