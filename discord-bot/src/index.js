import { Client, Events, GatewayIntentBits } from 'discord.js';
import { getDiscordConfig } from './config.js';
import { handleCommand } from './commands.js';

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
