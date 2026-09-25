const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS modlog_config (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT
);
`);

function getModLogChannel(guildId) {
  const row = db.prepare('SELECT channel_id FROM modlog_config WHERE guild_id = ?').get(guildId);
  return row ? row.channel_id : null;
}

async function setModLogChannel(interaction) {
  const channel = interaction.options.getChannel('channel', true);

  db.prepare(`
    INSERT INTO modlog_config (guild_id, channel_id)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id
  `).run(interaction.guild.id, channel.id);

  return interaction.reply({ content: `✅ Mod-log channel set to ${channel}.`, ephemeral: true });
}

async function logAction(guild, embed) {
  const channelId = getModLogChannel(guild.id);
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

async function warnUser(interaction) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);

  db.prepare(`
    INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(interaction.guild.id, target.id, interaction.user.id, reason, Date.now());

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Member Warned')
    .addFields(
      { name: 'User', value: `${target.tag} (${target.id})` },
      { name: 'Moderator', value: `${interaction.user.tag}` },
      { name: 'Reason', value: reason }
    )
    .setColor(0xffa500)
    .setTimestamp();

  await logAction(interaction.guild, embed);

  return interaction.reply({ content: `✅ Warned ${target}. Reason: ${reason}` });
}

async function showWarnings(interaction) {
  const target = interaction.options.getUser('user', true);

  const rows = db
    .prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC')
    .all(interaction.guild.id, target.id);

  if (rows.length === 0) {
    return interaction.reply({ content: `${target.tag} has no warnings.`, ephemeral: true });
  }

  const lines = rows.map((w, idx) =>
    `**${idx + 1}.** ${w.reason} — <t:${Math.floor(w.created_at / 1000)}:R>`
  );

  const embed = new EmbedBuilder()
    .setTitle(`⚠️ Warnings for ${target.tag}`)
    .setDescription(lines.join('\n'))
    .setColor(0xffa500);

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function kickUser(interaction) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: '❌ Could not find that member.', ephemeral: true });
  }

  if (!member.kickable) {
    return interaction.reply({ content: '❌ I cannot kick this member (role hierarchy).', ephemeral: true });
  }

  await member.kick(reason);

  const embed = new EmbedBuilder()
    .setTitle('👢 Member Kicked')
    .addFields(
      { name: 'User', value: `${target.tag} (${target.id})` },
      { name: 'Moderator', value: `${interaction.user.tag}` },
      { name: 'Reason', value: reason }
    )
    .setColor(0xed4245)
    .setTimestamp();

  await logAction(interaction.guild, embed);

  return interaction.reply({ content: `✅ Kicked ${target.tag}. Reason: ${reason}` });
}

async function banUser(interaction) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  if (member && !member.bannable) {
    return interaction.reply({ content: '❌ I cannot ban this member (role hierarchy).', ephemeral: true });
  }

  await interaction.guild.members.ban(target.id, { reason });

  const embed = new EmbedBuilder()
    .setTitle('🔨 Member Banned')
    .addFields(
      { name: 'User', value: `${target.tag} (${target.id})` },
      { name: 'Moderator', value: `${interaction.user.tag}` },
      { name: 'Reason', value: reason }
    )
    .setColor(0xed4245)
    .setTimestamp();

  await logAction(interaction.guild, embed);

  return interaction.reply({ content: `✅ Banned ${target.tag}. Reason: ${reason}` });
}

function parseDuration(str) {
  const match = String(str).match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * mult[unit];
}

async function muteUser(interaction) {
  const target = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    return interaction.reply({ content: '❌ Invalid duration. Use something like 10m, 1h, or 1d.', ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: '❌ Could not find that member.', ephemeral: true });
  }

  await member.timeout(durationMs, reason).catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle('🔇 Member Muted')
    .addFields(
      { name: 'User', value: `${target.tag} (${target.id})` },
      { name: 'Moderator', value: `${interaction.user.tag}` },
      { name: 'Duration', value: durationStr },
      { name: 'Reason', value: reason }
    )
    .setColor(0xffa500)
    .setTimestamp();

  await logAction(interaction.guild, embed);

  return interaction.reply({ content: `✅ Muted ${target.tag} for ${durationStr}. Reason: ${reason}` });
}

async function sayMessage(interaction) {
  const message = interaction.options.getString('message', true);

  await interaction.channel.send(message);

  return interaction.reply({ content: '✅ Message sent.', ephemeral: true });
}

module.exports = {
  setModLogChannel,
  warnUser,
  showWarnings,
  kickUser,
  banUser,
  muteUser,
  sayMessage
};
