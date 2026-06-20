const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, updateAutoMark } = require('../../server/db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo-config')
    .setDescription('Update Stream Bingo settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(option =>
      option
        .setName('auto-mark')
        .setDescription('Automatically mark spaces when events are triggered (true) or let players mark manually (false)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const config = getGuildConfig(interaction.guildId);
    if (!config) {
      return interaction.reply({ content: '❌ Run `/bingo-setup` first!', ephemeral: true });
    }

    const autoMark = interaction.options.getBoolean('auto-mark');
    updateAutoMark(interaction.guildId, autoMark);

    await interaction.reply({
      embeds: [{
        title: '⚙️ Config Updated',
        color: 0x5865F2,
        fields: [
          {
            name: '🎯 Auto-Mark Mode',
            value: autoMark
              ? '**Enabled** — Spaces are automatically marked for all players when triggered'
              : '**Disabled** — Players must click spaces on their board to mark them',
          },
        ],
        footer: { text: 'Stream Bingo Bot' },
      }],
    });
  },
};
