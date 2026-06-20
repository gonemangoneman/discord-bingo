const { SlashCommandBuilder } = require('discord.js');
const { getGuildConfig, getActiveSession } = require('../../server/db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo')
    .setDescription('Launch the bingo board activity'),

  async execute(interaction) {
    const config = getGuildConfig(interaction.guildId);
    if (!config) {
      return interaction.reply({ content: '❌ Bingo hasn\'t been set up yet. Ask an admin to run `/bingo-setup`!', ephemeral: true });
    }

    const session = getActiveSession(interaction.guildId);
    if (!session) {
      return interaction.reply({ content: '❌ No bingo game is currently running. A Bingo Leader needs to start one with `/bingo-start`!', ephemeral: true });
    }

    // For now, send users to the activity URL
    // When the Embedded App SDK is configured, this will launch the activity
    const appId = process.env.DISCORD_CLIENT_ID;

    await interaction.reply({
      embeds: [{
        title: '🎯 Stream Bingo',
        description: `**Session #${session.id}** is live!\n\nClick the button below to open your bingo board.`,
        color: 0x5865F2,
        footer: { text: 'Stream Bingo Bot' },
      }],
      // The activity launcher - this is a special embed action that launches the embedded app
      components: [{
        type: 1, // ACTION_ROW
        components: [{
          type: 2, // BUTTON
          label: '🎯 Open Bingo Board',
          style: 5, // LINK
          url: `https://discord.com/activities/${appId}`,
        }],
      }],
    });
  },
};
