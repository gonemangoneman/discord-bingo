const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getGuildConfig,
  createEventSet,
  getEventSets,
  getEventSet,
  deleteEventSet,
  addBingoEvent,
  removeBingoEvent,
  getEventsInSet,
} = require('../../server/db/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo-set')
    .setDescription('Manage bingo event sets')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new event set')
        .addStringOption(opt => opt.setName('name').setDescription('Set name (e.g. "Minecraft")').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add an event to a set')
        .addStringOption(opt => opt.setName('set').setDescription('Set name').setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName('event').setDescription('Event text for the bingo space').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove an event from a set')
        .addStringOption(opt => opt.setName('set').setDescription('Set name').setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName('event').setDescription('Event text to remove').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all sets or events in a specific set')
        .addStringOption(opt => opt.setName('set').setDescription('Set name (leave empty to list all sets)').setRequired(false).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete an entire event set')
        .addStringOption(opt => opt.setName('name').setDescription('Set name to delete').setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const guildId = interaction.guildId;

    if (focused.name === 'set' || focused.name === 'name') {
      const sets = getEventSets(guildId);
      const filtered = sets
        .filter(s => s.name.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25);
      await interaction.respond(filtered.map(s => ({ name: `${s.name} (${s.event_count} events)`, value: s.name })));
    } else if (focused.name === 'event') {
      const setName = interaction.options.getString('set');
      const set = getEventSet(guildId, setName);
      if (!set) {
        return interaction.respond([]);
      }
      const events = getEventsInSet(set.id);
      const filtered = events
        .filter(e => e.event_text.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25);
      await interaction.respond(filtered.map(e => ({ name: e.event_text.slice(0, 100), value: e.event_text })));
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // Check permissions: must have Manage Guild or the bingo leader role
    const config = getGuildConfig(guildId);
    if (!config) {
      return interaction.reply({ content: '❌ Run `/bingo-setup` first!', ephemeral: true });
    }

    const hasPermission = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
      || interaction.member.roles.cache.has(config.bingo_leader_role_id);

    if (!hasPermission) {
      return interaction.reply({ content: '❌ You need the Bingo Leader role or Manage Server permission.', ephemeral: true });
    }

    switch (sub) {
      case 'create': {
        const name = interaction.options.getString('name').trim();
        if (!name) {
          return interaction.reply({ content: '❌ Set name cannot be empty.', ephemeral: true });
        }
        const existing = getEventSet(guildId, name);
        if (existing) {
          return interaction.reply({ content: `❌ Set **${name}** already exists.`, ephemeral: true });
        }
        createEventSet(guildId, name);
        await interaction.reply({
          embeds: [{
            title: '✅ Event Set Created',
            description: `**${name}** is ready! Add events with:\n\`/bingo-set add set:${name} event:Your event text\``,
            color: 0x57F287,
          }],
        });
        break;
      }

      case 'add': {
        const setName = interaction.options.getString('set');
        const eventText = interaction.options.getString('event').trim();
        const set = getEventSet(guildId, setName);
        if (!set) {
          return interaction.reply({ content: `❌ Set **${setName}** not found.`, ephemeral: true });
        }
        try {
          addBingoEvent(set.id, eventText);
          const count = getEventsInSet(set.id).length;
          await interaction.reply({
            embeds: [{
              title: '✅ Event Added',
              description: `Added to **${setName}**: "${eventText}"`,
              color: 0x57F287,
              footer: { text: `${setName} now has ${count} event(s)` },
            }],
          });
        } catch (err) {
          if (err.message?.includes('UNIQUE constraint')) {
            return interaction.reply({ content: `❌ That event already exists in **${setName}**.`, ephemeral: true });
          }
          throw err;
        }
        break;
      }

      case 'remove': {
        const setName = interaction.options.getString('set');
        const eventText = interaction.options.getString('event');
        const set = getEventSet(guildId, setName);
        if (!set) {
          return interaction.reply({ content: `❌ Set **${setName}** not found.`, ephemeral: true });
        }
        const result = removeBingoEvent(set.id, eventText);
        if (result.changes === 0) {
          return interaction.reply({ content: `❌ Event not found in **${setName}**.`, ephemeral: true });
        }
        await interaction.reply({
          embeds: [{
            title: '🗑️ Event Removed',
            description: `Removed from **${setName}**: "${eventText}"`,
            color: 0xED4245,
          }],
        });
        break;
      }

      case 'list': {
        const setName = interaction.options.getString('set');
        if (setName) {
          // List events in a specific set
          const set = getEventSet(guildId, setName);
          if (!set) {
            return interaction.reply({ content: `❌ Set **${setName}** not found.`, ephemeral: true });
          }
          const events = getEventsInSet(set.id);
          if (events.length === 0) {
            return interaction.reply({
              embeds: [{
                title: `📋 ${setName}`,
                description: '_No events yet. Add some with `/bingo-set add`!_',
                color: 0x5865F2,
              }],
            });
          }
          const eventList = events.map((e, i) => `${i + 1}. ${e.event_text}`).join('\n');
          await interaction.reply({
            embeds: [{
              title: `📋 ${setName} — ${events.length} event(s)`,
              description: eventList.slice(0, 4000),
              color: 0x5865F2,
            }],
          });
        } else {
          // List all sets
          const sets = getEventSets(guildId);
          if (sets.length === 0) {
            return interaction.reply({
              embeds: [{
                title: '📋 Event Sets',
                description: '_No event sets yet. Create one with `/bingo-set create`!_',
                color: 0x5865F2,
              }],
            });
          }
          const setList = sets.map(s => `• **${s.name}** — ${s.event_count} event(s)`).join('\n');
          await interaction.reply({
            embeds: [{
              title: `📋 Event Sets — ${sets.length} set(s)`,
              description: setList,
              color: 0x5865F2,
            }],
          });
        }
        break;
      }

      case 'delete': {
        const name = interaction.options.getString('name');
        const set = getEventSet(guildId, name);
        if (!set) {
          return interaction.reply({ content: `❌ Set **${name}** not found.`, ephemeral: true });
        }
        const events = getEventsInSet(set.id);
        deleteEventSet(set.id);
        await interaction.reply({
          embeds: [{
            title: '🗑️ Event Set Deleted',
            description: `Deleted **${name}** and its ${events.length} event(s).`,
            color: 0xED4245,
          }],
        });
        break;
      }
    }
  },
};
