module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`[Bot] No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[Bot] Error executing /${interaction.commandName}:`, error);
        const reply = { content: '❌ There was an error executing this command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
      return;
    }

    // Handle string select menus (for bingo-start set selection)
    if (interaction.isStringSelectMenu()) {
      // Look for a handler on the originating command
      const customId = interaction.customId;
      if (customId.startsWith('bingo-start-sets:')) {
        const command = interaction.client.commands.get('bingo-start');
        if (command && command.handleSelectMenu) {
          try {
            await command.handleSelectMenu(interaction);
          } catch (error) {
            console.error('[Bot] Error handling select menu:', error);
            await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
          }
        }
      }
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith('bingo-join:')) {
        const command = interaction.client.commands.get('bingo');
        if (command && command.handleButton) {
          try {
            await command.handleButton(interaction);
          } catch (error) {
            console.error('[Bot] Error handling button:', error);
            await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
          }
        }
      }
      return;
    }

    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command && command.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(`[Bot] Autocomplete error for /${interaction.commandName}:`, error);
        }
      }
      return;
    }
  },
};
