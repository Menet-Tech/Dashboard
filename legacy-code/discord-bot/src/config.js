import { getSetting } from './db.js';

export async function getDiscordConfig() {
  const token = await getSetting('discord_bot_token', process.env.DISCORD_BOT_TOKEN || '');
  const applicationId = await getSetting('discord_application_id', process.env.DISCORD_APPLICATION_ID || '');
  const guildId = await getSetting('discord_guild_id', process.env.DISCORD_GUILD_ID || '');

  return { token, applicationId, guildId };
}
