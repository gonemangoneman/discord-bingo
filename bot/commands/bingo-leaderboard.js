const { SlashCommandBuilder } = require('discord.js');
const { getLeaderboard } = require('../../server/db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo-leaderboard')
    .setDescription('View the all-time bingo leaderboard'),

  async execute(interaction) {
    const entries = getLeaderboard(interaction.guildId, 15);

    if (entries.length === 0) {
      return interaction.reply({
        embeds: [{
          title: '🏅 Bingo Leaderboard',
          description: '_No games have been played yet!_',
          color: 0x5865F2,
        }],
      });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = entries.map((e, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} <@${e.user_id}> — **${Math.round(e.total_points)} pts** | ${e.total_bingos} bingos | ${e.games_played} games`;
    });

    await interaction.reply({
      embeds: [{
        title: '🏅 All-Time Bingo Leaderboard',
        description: lines.join('\n'),
        color: 0xFEE75C,
        footer: { text: `Top ${entries.length} players` },
        timestamp: new Date().toISOString(),
      }],
    });
  },
};
