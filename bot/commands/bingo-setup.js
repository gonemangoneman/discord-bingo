const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { upsertGuildConfig, createEventSet, getEventSet } = require('../../server/db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo-setup')
    .setDescription('Configure Stream Bingo for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('event-channel')
        .setDescription('Channel where the bot posts events for the bingo leader to react to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('bingo-leader-role')
        .setDescription('Role that can start/end games and trigger events')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('notification-channel')
        .setDescription('Channel where the bot posts game announcements (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const eventChannel = interaction.options.getChannel('event-channel');
    const bingoLeaderRole = interaction.options.getRole('bingo-leader-role');
    const notificationChannel = interaction.options.getChannel('notification-channel') || interaction.channel;

    // Save config
    upsertGuildConfig(interaction.guildId, {
      eventChannelId: eventChannel.id,
      notificationChannelId: notificationChannel.id,
      bingoLeaderRoleId: bingoLeaderRole.id,
      autoMarkEnabled: 1,
    });

    // Create a default "General" set if none exist
    const existing = getEventSet(interaction.guildId, 'General');
    if (!existing) {
      createEventSet(interaction.guildId, 'General');
    }

    await interaction.reply({
      embeds: [{
        title: '✅ Stream Bingo Configured!',
        color: 0x57F287,
        fields: [
          { name: '📋 Event Channel', value: `${eventChannel}`, inline: true },
          { name: '🔔 Notification Channel', value: `${notificationChannel}`, inline: true },
          { name: '👑 Bingo Leader Role', value: `${bingoLeaderRole}`, inline: true },
          { name: '🎯 Auto-Mark', value: 'Enabled (default)', inline: true },
        ],
        description: 'Use `/bingo-set create <name>` to create event sets, then `/bingo-set add <set> <event>` to add events.\n\nA **General** set has been created for you to get started!',
        footer: { text: 'Stream Bingo Bot' },
        timestamp: new Date().toISOString(),
      }],
      ephemeral: false,
    });
  },
};
