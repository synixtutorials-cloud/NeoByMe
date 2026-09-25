const { db } = require('./db');
const { PermissionFlagsBits } = require('discord.js');

db.exec(`
CREATE TABLE IF NOT EXISTS link_config (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS link_whitelist (
  guild_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  PRIMARY KEY (guild_id, target_id, type)
);
`);

const LINK_REGEX = /https?:\/\/|discord\.gg\/|www\./i;

function isEnabled(guildId) {
  const row = db.prepare('SELECT enabled FROM link_config WHERE guild_id = ?').get(guildId);
  return row ? Boolean(row.enabled) : false;
}

async function enableFilter(interaction) {
  db.prepare(`
    INSERT INTO link_config (guild_id, enabled)
    VALUES (?, 1)
    ON CONFLICT(guild_id) DO UPDATE SET enabled = 1
  `).run(interaction.guild.id);

  return interaction.reply({ content: '✅ Link filter enabled.', ephemeral: true });
}

async function disableFilter(interaction) {
  db.prepare(`
    INSERT INTO link_config (guild_id, enabled)
    VALUES (?, 0)
    ON CONFLICT(guild_id) DO UPDATE SET enabled = 0
  `).run(interaction.guild.id);

  return interaction.reply({ content: '✅ Link filter disabled.', ephemeral: true });
}

async function whitelistAdd(interaction) {
  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({ content: '❌ Provide a user or a role.', ephemeral: true });
  }

  if (user) {
    db.prepare('INSERT OR IGNORE INTO link_whitelist (guild_id, target_id, type) VALUES (?, ?, \'user\')')
      .run(interaction.guild.id, user.id);
  }
  if (role) {
    db.prepare('INSERT OR IGNORE INTO link_whitelist (guild_id, target_id, type) VALUES (?, ?, \'role\')')
      .run(interaction.guild.id, role.id);
  }

  return interaction.reply({
    content: `✅ Whitelisted ${user ? user : ''} ${role ? role : ''} to send links.`,
    ephemeral: true
  });
}

function isWhitelisted(guildId, userId, member) {
  const rows = db.prepare('SELECT * FROM link_whitelist WHERE guild_id = ?').all(guildId);

  for (const row of rows) {
    if (row.type === 'user' && row.target_id === userId) return true;
    if (row.type === 'role' && member && member.roles.cache.has(row.target_id)) return true;
  }

  return false;
}

async function handleLinkFilterMessage(message) {
  if (message.author.bot || !message.guild) return false;
  if (!isEnabled(message.guild.id)) return false;
  if (!LINK_REGEX.test(message.content)) return false;

  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  if (isWhitelisted(message.guild.id, message.author.id, message.member)) return false;

  await message.delete().catch(() => {});
  const warn = await message.channel.send(`${message.author}, you are not allowed to send links here 😡`);
  setTimeout(() => warn.delete().catch(() => {}), 5000);

  return true;
}

module.exports = {
  enableFilter,
  disableFilter,
  whitelistAdd,
  handleLinkFilterMessage
};
