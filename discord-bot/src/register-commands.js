import { REST, Routes } from 'discord.js';
import { getDiscordConfig } from './config.js';
import { commands } from './commands.js';

const { token, applicationId, guildId } = await getDiscordConfig();

if (!token || !applicationId || !guildId) {
  console.error('discord_bot_token, discord_application_id, atau discord_guild_id belum lengkap.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

await rest.put(
  Routes.applicationGuildCommands(applicationId, guildId),
  { body: commands.map((command) => command.toJSON()) }
);

console.log('Slash command berhasil diregistrasi ke guild Discord.');
