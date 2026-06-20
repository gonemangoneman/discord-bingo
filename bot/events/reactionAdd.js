const {
  getGuildConfig,
  getActiveSession,
  getSessionEventByMessageId,
  triggerSessionEvent,
  getSessionPlayers,
  updateMarkedCells,
} = require('../../server/db/database');

const SERVER_URL = `http://localhost:${process.env.PORT || 3001}`;

/**
 * Notify the server process via HTTP so it can emit Socket.io events
 */
async function notifyServer(path, body) {
  try {
    await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('[Bot] Could not notify server:', err.message);
  }
}

module.exports = {
  name: 'messageReactionAdd',
  once: false,

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
      }
    }

    // Notify server to emit Socket.io event-triggered event
    await notifyServer(`/api/game/${session.id}/event-triggered`, {
      eventId: sessionEvent.event_id,
      eventText: sessionEvent.event_text,
      triggeredBy: user.id,
      affectedPlayers,
    });

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
