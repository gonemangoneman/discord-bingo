const { SlashCommandBuilder } = require('discord.js');
const {
  getGuildConfig,
  getActiveSession,
  endGameSession,
  getSessionScores,
  getSessionBingos,
  getSessionEventMessages,
  updateLeaderboard,
  incrementGamesPlayed,
  getSessionPlayers,
  getLeaderboard,
} = require('../../server/db/database');

// Reference to the global Socket.io instance (set by server)
let io = null;
function setSocketIO(socketIO) { io = socketIO; }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo-end')
    .setDescription('End the current bingo game session'),

  setSocketIO,

  async execute(interaction) {
    const config = getGuildConfig(interaction.guildId);
    if (!config) {
      return interaction.reply({ content: '❌ Run `/bingo-setup` first!', ephemeral: true });
    }

    const hasRole = interaction.member.roles.cache.has(config.bingo_leader_role_id)
      || interaction.member.permissions.has('ManageGuild');
    if (!hasRole) {
      return interaction.reply({ content: '❌ You need the Bingo Leader role.', ephemeral: true });
    }

    const session = getActiveSession(interaction.guildId);
    if (!session) {
      return interaction.reply({ content: '❌ No active game session.', ephemeral: true });
    }

    await interaction.deferReply();

    // End the session
    endGameSession(session.id);

    // Calculate final scores and update leaderboard
    const scores = getSessionScores(session.id);
    const players = getSessionPlayers(session.id);

    // Update leaderboard for each player
    for (const player of players) {
      incrementGamesPlayed(interaction.guildId, player.user_id);
    }
    for (const score of scores) {
      updateLeaderboard(interaction.guildId, score.user_id, score.total_points, score.bingo_count);
    }

    // Clean up event channel messages
    try {
      const eventChannel = await interaction.client.channels.fetch(config.event_channel_id);
      if (eventChannel) {
        const messages = await eventChannel.messages.fetch({ limit: 100 });
        if (messages.size > 0) {
          await eventChannel.bulkDelete(messages, true);
        }
      }
    } catch (err) {
      console.warn('[Bot] Could not clean event channel:', err.message);
    }

    // Notify activity clients
    if (io) {
      io.to(`session:${session.id}`).emit('game-ended', { sessionId: session.id, scores });
    }

    // Build results embed
    const bingos = getSessionBingos(session.id);
    let scoreBoard = '';
    if (scores.length > 0) {
      const medals = ['🥇', '🥈', '🥉'];
      scoreBoard = scores.map((s, i) => {
        const medal = medals[i] || `${i + 1}.`;
        return `${medal} <@${s.user_id}> — **${Math.round(s.total_points)} pts** (${s.bingo_count} bingo${s.bingo_count !== 1 ? 's' : ''})`;
      }).join('\n');
    } else {
      scoreBoard = '_No bingos were achieved this session._';
    }

    // All-time leaderboard top 5
    const allTime = getLeaderboard(interaction.guildId, 5);
    let allTimeBoard = '';
    if (allTime.length > 0) {
      allTimeBoard = allTime.map((l, i) => {
        return `${i + 1}. <@${l.user_id}> — **${Math.round(l.total_points)} pts** (${l.total_bingos} bingos, ${l.games_played} games)`;
      }).join('\n');
    }

    const embeds = [{
      title: '🏆 Game Over!',
      color: 0xFEE75C,
      fields: [
        { name: '📊 Session Scores', value: scoreBoard },
        { name: '📈 Stats', value: `Players: **${players.length}** | Total Bingos: **${bingos.length}**`, inline: true },
      ],
      footer: { text: `Session #${session.id}` },
      timestamp: new Date().toISOString(),
    }];

    if (allTimeBoard) {
      embeds[0].fields.push({ name: '🏅 All-Time Top 5', value: allTimeBoard });
    }

    // Post to notification channel
    const notifChannel = await interaction.client.channels.fetch(config.notification_channel_id);
    if (notifChannel && notifChannel.id !== interaction.channelId) {
      await notifChannel.send({ embeds });
    }

    await interaction.editReply({ embeds });
  },
};
