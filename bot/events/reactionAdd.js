const {
  getGuildConfig,
  getActiveSession,
  getSessionEventByMessageId,
  triggerSessionEvent,
  getSessionPlayers,
  getPlayerBoard,
  updateMarkedCells,
  getPlayerBingos,
  getBingoCount,
  recordBingo,
} = require('../../server/db/database');
const { detectNewBingos } = require('../../server/services/scoringEngine');

// Reference to the global Socket.io instance
let io = null;
function setSocketIO(socketIO) { io = socketIO; }

module.exports = {
  name: 'messageReactionAdd',
  once: false,
  setSocketIO,

  async execute(reaction, user) {
    // Ignore bot reactions
    if (user.bot) return;

    // Fetch partial reaction/message if needed
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error('[Bot] Failed to fetch reaction:', err);
        return;
      }
    }
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch (err) {
        console.error('[Bot] Failed to fetch message:', err);
        return;
      }
    }

    const guildId = reaction.message.guildId;
    if (!guildId) return;

    const config = getGuildConfig(guildId);
    if (!config) return;

    // Only process reactions in the event channel
    if (reaction.message.channelId !== config.event_channel_id) return;

    // Check if user has the bingo leader role
    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    if (!member.roles.cache.has(config.bingo_leader_role_id) && !member.permissions.has('ManageGuild')) {
      return;
    }

    // Check for active session
    const session = getActiveSession(guildId);
    if (!session) return;

    // Look up the event by message ID
    const sessionEvent = getSessionEventByMessageId(reaction.message.id);
    if (!sessionEvent) return;

    // Don't trigger if already triggered
    if (sessionEvent.triggered) return;

    // Trigger the event!
    triggerSessionEvent(session.id, sessionEvent.event_id, user.id);

    console.log(`[Bot] Event triggered: "${sessionEvent.event_text}" by ${user.tag}`);

    // Edit the original message to show it's been called
    try {
      await reaction.message.edit(`✅ ~~${sessionEvent.event_text}~~`);
    } catch (err) {
      console.warn('[Bot] Could not edit event message:', err.message);
    }

    // Auto-mark for all players if enabled
    const players = getSessionPlayers(session.id);
    const affectedPlayers = [];

    for (const player of players) {
      const board = player.board_layout;
      const markedCells = [...player.marked_cells];
      let wasMarked = false;

      // Find the cell(s) with this event
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          if (board[row][col] === sessionEvent.event_id) {
            const alreadyMarked = markedCells.some(([r, c]) => r === row && c === col);
            if (!alreadyMarked) {
              if (config.auto_mark_enabled) {
                markedCells.push([row, col]);
                wasMarked = true;
              }
              affectedPlayers.push({ userId: player.user_id, row, col });
            }
          }
        }
      }

      if (wasMarked) {
        updateMarkedCells(session.id, player.user_id, markedCells);

        // Check for new bingos
        const existingBingos = getPlayerBingos(session.id, player.user_id);
        const newBingos = detectNewBingos(board, markedCells, existingBingos);

        for (const bingo of newBingos) {
          const globalPos = getBingoCount(session.id) + 1;
          const playerBingoCount = existingBingos.length + newBingos.indexOf(bingo);
          const points = calculatePoints(globalPos, playerBingoCount);

          recordBingo(session.id, player.user_id, bingo.type, globalPos, points);

          console.log(`[Bot] BINGO! ${player.user_id} got ${bingo.type} (global #${globalPos}, ${points} pts)`);

          // Emit bingo event
          if (io) {
            io.to(`session:${session.id}`).emit('bingo-achieved', {
              userId: player.user_id,
              bingoType: bingo.type,
              globalPosition: globalPos,
              points,
            });
          }

          // Post notification
          try {
            const notifChannel = await reaction.message.guild.channels.fetch(config.notification_channel_id);
            if (notifChannel) {
              await notifChannel.send({
                embeds: [{
                  title: '🎉 BINGO!',
                  description: `<@${player.user_id}> got a bingo! (**${bingo.type}**)\n\n🏆 **+${Math.round(points)} points** (${getOrdinal(globalPos)} bingo this session)`,
                  color: 0xFEE75C,
                }],
              });
            }
          } catch (err) {
            console.warn('[Bot] Could not post bingo notification:', err.message);
          }
        }
      }
    }

    // Emit the event-triggered event to all activity clients
    if (io) {
      io.to(`session:${session.id}`).emit('event-triggered', {
        eventId: sessionEvent.event_id,
        eventText: sessionEvent.event_text,
        triggeredBy: user.id,
        affectedPlayers,
      });
    }

    // Post notification in the notification channel
    try {
      const notifChannel = await reaction.message.guild.channels.fetch(config.notification_channel_id);
      if (notifChannel) {
        await notifChannel.send({
          embeds: [{
            description: `🎯 **${sessionEvent.event_text}** has been called!`,
            color: 0x5865F2,
          }],
        });
      }
    } catch (err) {
      console.warn('[Bot] Could not post event notification:', err.message);
    }
  },
};

/**
 * Calculate points for a bingo based on global position and player's bingo count
 */
function calculatePoints(globalPosition, playerBingoIndex) {
  // Global position base points
  const basePoints = [10, 8, 6, 5, 4];
  const base = globalPosition <= 5 ? basePoints[globalPosition - 1] : 3;

  // Diminishing returns for same player (50% each subsequent)
  const multiplier = Math.pow(0.5, playerBingoIndex);

  return Math.ceil(base * multiplier);
}

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
