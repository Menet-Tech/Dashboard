import { Client, Events, GatewayIntentBits } from 'discord.js';
import { getDiscordConfig } from './config.js';
import { handleCommand } from './commands.js';
import { execute } from './db.js';

const { token } = await getDiscordConfig();

if (!token) {
  console.error('Discord bot token belum diisi di pengaturan atau .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Discord bot aktif sebagai ${readyClient.user.tag}`);
  await heartbeat(readyClient.user.tag);
  setInterval(() => heartbeat(readyClient.user.tag).catch(console.error), 5 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    await handleCommand(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'Terjadi error saat menjalankan command.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Terjadi error saat menjalankan command.', ephemeral: true });
    }
  }
});

await client.login(token);

async function heartbeat(tag) {
  const message = `online ${new Date().toISOString()} (${tag})`;
  await execute(
    `INSERT INTO pengaturan (\`key\`, \`value\`, \`description\`)
     VALUES ('discord_bot_status_last_check', ?, 'Heartbeat terakhir Discord bot')
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), \`description\` = VALUES(\`description\`)`,
    [message]
  );
  await execute(
    `INSERT INTO system_health_checks (service_name, status, message)
     VALUES ('discord_bot', 'ok', ?)`,
    [message]
  );
}
