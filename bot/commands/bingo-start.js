const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const {
  getGuildConfig,
  getEventSets,
  getEventsForSets,
  getActiveSession,
  createGameSession,
  addSessionEventMessage,
} = require('../../server/db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo-start')
    .setDescription('Start a new bingo game session'),

  async execute(interaction) {
    const config = getGuildConfig(interaction.guildId);
    if (!config) {
      return interaction.reply({ content: '❌ Run `/bingo-setup` first!', ephemeral: true });
    }

    // Check bingo leader role
    const hasRole = interaction.member.roles.cache.has(config.bingo_leader_role_id)
      || interaction.member.permissions.has('ManageGuild');
    if (!hasRole) {
      return interaction.reply({ content: '❌ You need the Bingo Leader role.', ephemeral: true });
    }

    // Check for existing active session
    const activeSession = getActiveSession(interaction.guildId);
    if (activeSession) {
      return interaction.reply({ content: '❌ A game is already active! Use `/bingo-end` first.', ephemeral: true });
    }

    // Get all event sets
    const sets = getEventSets(interaction.guildId);
    if (sets.length === 0) {
      return interaction.reply({ content: '❌ No event sets found. Create some with `/bingo-set create` first!', ephemeral: true });
    }

    // Build select menu for set selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`bingo-start-sets:${interaction.user.id}`)
      .setPlaceholder('Select event sets to include...')
      .setMinValues(1)
      .setMaxValues(sets.length)
      .addOptions(
        sets.map(s =>
          new StringSelectMenuOptionBuilder()
            .setLabel(s.name)
            .setDescription(`${s.event_count} event(s)`)
            .setValue(s.id.toString())
        )
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      embeds: [{
        title: '🎯 Start Bingo Game',
        description: 'Select which event sets to include in this session.\n\nYou can pick multiple sets — they\'ll be merged into one pool.',
        color: 0x5865F2,
      }],
      components: [row],
      ephemeral: true,
    });
  },

  // Handle the select menu response
  async handleSelectMenu(interaction) {
    const config = getGuildConfig(interaction.guildId);
    const selectedSetIds = interaction.values.map(Number);

    // Get events from selected sets
    const events = getEventsForSets(selectedSetIds);
    if (events.length < 24) {
      return interaction.update({
        embeds: [{
          title: '⚠️ Not Enough Events',
          description: `The selected sets have **${events.length}** events, but you need at least **24** for a 5×5 board.\n\nAdd more events or select additional sets.`,
          color: 0xFEE75C,
        }],
        components: [],
      });
    }

    await interaction.update({
      embeds: [{
        title: '⏳ Starting Game...',
        description: 'Setting up the event channel and creating the session...',
        color: 0x5865F2,
      }],
      components: [],
    });

    // Create the game session
    const sessionId = createGameSession(interaction.guildId, interaction.channelId, selectedSetIds);

    // Clear the event channel and post events
    let eventPostError = null;
    try {
      const eventChannel = await interaction.client.channels.fetch(config.event_channel_id);
      if (eventChannel) {
        // Try to bulk delete old messages
        try {
          const oldMessages = await eventChannel.messages.fetch({ limit: 100 });
          if (oldMessages.size > 0) {
            await eventChannel.bulkDelete(oldMessages, true);
          }
        } catch (err) {
          console.warn('[Bot] Could not clear event channel:', err.message);
        }

        // Group events by set
        const setMap = {};
        for (const event of events) {
          if (!setMap[event.set_id]) setMap[event.set_id] = [];
          setMap[event.set_id].push(event);
        }

        // Post events grouped by set
        const sets = getEventSets(interaction.guildId);
        const setLookup = {};
        for (const s of sets) setLookup[s.id] = s;

        for (const setId of selectedSetIds) {
          const set = setLookup[setId];
          const setEvents = setMap[setId] || [];
          if (setEvents.length === 0) continue;

          // Post set header
          await eventChannel.send({
            embeds: [{
              description: `━━━ **${set.name}** ━━━`,
              color: 0x5865F2,
            }],
          });

          // Post each event as its own message (for reaction triggering)
          for (const event of setEvents) {
            const msg = await eventChannel.send(`⬜ ${event.event_text}`);
            addSessionEventMessage(sessionId, event.id, msg.id);
          }
        }
      }
    } catch (err) {
      console.error('[Bot] Error posting to event channel:', err.message);
      eventPostError = `⚠️ Could not post events to <#${config.event_channel_id}>. Make sure the bot has **Send Messages** and **View Channel** permissions there.`;
    }

    // Post game announcement in the notification channel
    try {
      const notifChannel = await interaction.client.channels.fetch(config.notification_channel_id);
      if (notifChannel) {
        const setNames = selectedSetIds.map(id => {
          const sets2 = getEventSets(interaction.guildId);
          return sets2.find(s => s.id === id)?.name || 'Unknown';
        }).join(', ');

        await notifChannel.send({
          embeds: [{
            title: '🎯 BINGO GAME STARTED!',
            description: `A new bingo game has begun!\n\n**Event Sets:** ${setNames}\n**Events in Pool:** ${events.length}\n\nUse \`/bingo\` to launch the activity and get your board!`,
            color: 0x57F287,
            footer: { text: `Session #${sessionId} • Started by ${interaction.user.displayName}` },
            timestamp: new Date().toISOString(),
          }],
        });
      }
    } catch (err) {
      console.warn('[Bot] Could not post to notification channel:', err.message);
    }

    // Update the original ephemeral message
    const description = eventPostError
      ? `Session **#${sessionId}** created but:\n\n${eventPostError}`
      : `Session **#${sessionId}** is live with **${events.length}** events.\n\nReact to events in <#${config.event_channel_id}> to trigger them!`;

    await interaction.editReply({
      embeds: [{
        title: eventPostError ? '⚠️ Game Started (with issues)' : '✅ Game Started!',
        description,
        color: eventPostError ? 0xFEE75C : 0x57F287,
      }],
      components: [],
    });
  },
};
