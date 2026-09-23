const { EmbedBuilder } = require('discord.js');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS welcome_config (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message TEXT NOT NULL,
  ping INTEGER DEFAULT 0,
  image_url TEXT
);
`);

function getWelcomeConfig(guildId) {
  return db.prepare('SELECT * FROM welcome_config WHERE guild_id = ?').get(guildId);
}

async function welcomePanel(interaction) {
  const channel = interaction.options.getChannel('channel', true);
  const message =
    interaction.options.getString('message') ||
    'Welcome {user} to {server}! We now have {membercount} members.';
  const ping = interaction.options.getBoolean('ping') || false;
  const image = interaction.options.getString('image') || null;

  db.prepare(`
    INSERT INTO welcome_config (guild_id, channel_id, message, ping, image_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message = excluded.message,
      ping = excluded.ping,
      image_url = excluded.image_url
  `).run(interaction.guild.id, channel.id, message, ping ? 1 : 0, image);

  return interaction.reply({
    content: `✅ Welcome messages will be sent in ${channel}.`,
    ephemeral: true
  });
}

function buildWelcomeText(template, member) {
  return template
    .replaceAll('{user}', member.toString())
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{membercount}', member.guild.memberCount.toString());
}

async function sendWelcomeMessage(member) {
  const config = getWelcomeConfig(member.guild.id);
  if (!config) return;

  const channel = await member.guild.channels.fetch(config.channel_id).catch(() => null);
  if (!channel) return;

  const text = buildWelcomeText(config.message, member);

  const embed = new EmbedBuilder()
    .setDescription(text)
    .setColor(0x5865f2)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  if (config.image_url) {
    embed.setImage(config.image_url);
  }

  await channel.send({
    content: config.ping ? member.toString() : undefined,
    embeds: [embed]
  }).catch(() => {});
}

module.exports = {
  welcomePanel,
  sendWelcomeMessage
};
