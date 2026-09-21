require('dotenv').config();

const { REST, Routes } = require('discord.js');
const commands = require('./commands');

(async () => {
  try {
    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        )
      : Routes.applicationCommands(process.env.CLIENT_ID);

    const commandData = commands
      .slice(0, 100)
      .map(command => command.toJSON());

    console.log(`Registering ${commandData.length} commands...`);

    await rest.put(route, {
      body: commandData
    });

    console.log('✅ Slash commands registered successfully.');
  } catch (error) {
    console.error('⚠️ Slash command registration failed:');
    console.error(error);
    console.log('⚠️ Continuing startup so NeoByMe can come online.');
  }
})();
