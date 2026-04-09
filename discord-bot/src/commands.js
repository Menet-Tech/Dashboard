import { SlashCommandBuilder } from 'discord.js';
import { query, getSetting } from './db.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('summary')
    .setDescription('Lihat ringkasan operasional dashboard'),
  new SlashCommandBuilder()
    .setName('tagihan')
    .setDescription('Lihat ringkasan tagihan per periode')
    .addStringOption((option) =>
      option.setName('periode').setDescription('Format YYYY-MM').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('pelanggan')
    .setDescription('Cari pelanggan berdasarkan nama atau PPPoE')
    .addStringOption((option) =>
      option.setName('keyword').setDescription('Nama / PPPoE / WA').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('health')
    .setDescription('Lihat status integrasi utama sistem')
];

export async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case 'summary':
      return sendSummary(interaction);
    case 'tagihan':
      return sendTagihan(interaction);
    case 'pelanggan':
      return sendPelanggan(interaction);
    case 'health':
      return sendHealth(interaction);
    default:
      return interaction.reply({ content: 'Command belum dikenali.', ephemeral: true });
  }
}

async function sendSummary(interaction) {
  const summaryRows = await query('SELECT * FROM view_pelanggan_summary');
  const tagihanRows = await query("SELECT SUM(CASE WHEN status = 'belum_bayar' THEN 1 ELSE 0 END) AS total_tunggakan, SUM(CASE WHEN status = 'lunas' THEN harga ELSE 0 END) AS pendapatan_lunas FROM tagihan");
  const summary = summaryRows[0] || {};
  const bills = tagihanRows[0] || {};
  const ispName = await getSetting('nama_isp', 'Menet-Tech');

  return interaction.reply({
    content: [
      `**${ispName}**`,
      `Pelanggan aktif: **${summary.total_active || 0}**`,
      `Pelanggan limit: **${summary.total_limit || 0}**`,
      `Tunggakan: **${bills.total_tunggakan || 0}**`,
      `Pendapatan lunas: **Rp ${Number(bills.pendapatan_lunas || 0).toLocaleString('id-ID')}**`
    ].join('\n')
  });
}

async function sendTagihan(interaction) {
  const periodeInput = interaction.options.getString('periode') || new Date().toISOString().slice(0, 7);
  const rows = await query(
    `SELECT 
      COUNT(*) AS total_tagihan,
      SUM(CASE WHEN status = 'belum_bayar' THEN 1 ELSE 0 END) AS belum_bayar,
      SUM(CASE WHEN status = 'lunas' THEN 1 ELSE 0 END) AS lunas,
      SUM(harga) AS potensi,
      SUM(CASE WHEN status = 'lunas' THEN harga ELSE 0 END) AS terkumpul
     FROM tagihan
     WHERE DATE_FORMAT(periode, '%Y-%m') = ?`,
    [periodeInput]
  );
  const row = rows[0] || {};

  return interaction.reply({
    content: [
      `**Ringkasan Tagihan ${periodeInput}**`,
      `Total tagihan: **${row.total_tagihan || 0}**`,
      `Belum bayar: **${row.belum_bayar || 0}**`,
      `Lunas: **${row.lunas || 0}**`,
      `Potensi: **Rp ${Number(row.potensi || 0).toLocaleString('id-ID')}**`,
      `Terkumpul: **Rp ${Number(row.terkumpul || 0).toLocaleString('id-ID')}**`
    ].join('\n')
  });
}

async function sendPelanggan(interaction) {
  const keyword = interaction.options.getString('keyword', true);
  const rows = await query(
    `SELECT p.id, p.nama, p.user_pppoe, p.no_wa, p.status, pk.nama_paket
     FROM pelanggan p
     JOIN paket pk ON pk.id = p.id_paket
     WHERE p.deleted_at IS NULL
       AND (p.nama LIKE ? OR p.user_pppoe LIKE ? OR p.no_wa LIKE ?)
     ORDER BY p.nama ASC
     LIMIT 5`,
    [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
  );

  if (rows.length === 0) {
    return interaction.reply({ content: `Tidak ada pelanggan yang cocok dengan kata kunci **${keyword}**.` });
  }

  const lines = rows.map((row) => `• **${row.nama}** | ${row.nama_paket} | ${row.user_pppoe} | ${row.status} | ${row.no_wa}`);
  return interaction.reply({ content: [`**Hasil pencarian pelanggan**`, ...lines].join('\n') });
}

async function sendHealth(interaction) {
  const waUrl = await getSetting('wa_gateway_url', process.env.WA_GATEWAY_URL || '');
  const waApiKey = await getSetting('wa_api_key', process.env.WA_API_KEY || '');
  const discordAlert = await getSetting('discord_alert_url', process.env.DISCORD_ALERT_URL || '');
  const mikrotikHost = await getSetting('mikrotik_host', process.env.MIKROTIK_HOST || '');
  const botToken = await getSetting('discord_bot_token', process.env.DISCORD_BOT_TOKEN || '');

  return interaction.reply({
    content: [
      '**Health Integrasi**',
      `Discord bot token: **${botToken ? 'ada' : 'kosong'}**`,
      `Discord alert webhook: **${discordAlert ? 'ada' : 'kosong'}**`,
      `WhatsApp gateway URL: **${waUrl || '-'}**`,
      `WhatsApp API key: **${waApiKey ? 'ada' : 'kosong'}**`,
      `MikroTik host: **${mikrotikHost || '-'}**`
    ].join('\n'),
    ephemeral: true
  });
}
