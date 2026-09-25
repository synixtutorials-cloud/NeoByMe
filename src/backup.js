const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS backups (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, name)
);
`);

async function createBackup(interaction) {
  const name = interaction.options.getString('name', true);

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;

  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => ({
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      permissions: r.permissions.bitfield.toString(),
      mentionable: r.mentionable,
      position: r.position
    }));

  const categories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map(c => ({
      name: c.name,
      position: c.position
    }));

  const channels = guild.channels.cache
    .filter(c => c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .map(c => ({
      name: c.name,
      type: c.type,
      position: c.position,
      parentName: c.parent ? c.parent.name : null,
      topic: c.topic || null
    }));

  const backupData = { roles, categories, channels };

  db.prepare(`
    INSERT INTO backups (guild_id, name, data, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, name) DO UPDATE SET data = excluded.data, created_at = excluded.created_at
  `).run(guild.id, name, JSON.stringify(backupData), Date.now());

  return interaction.editReply({
    content: `✅ Backup **${name}** created with **${roles.length}** roles, **${categories.length}** categories, **${channels.length}** channels.`
  });
}

async function listBackups(interaction) {
  const backups = db
    .prepare('SELECT name, created_at FROM backups WHERE guild_id = ? ORDER BY created_at DESC')
    .all(interaction.guild.id);

  if (backups.length === 0) {
    return interaction.reply({ content: 'No backups found for this server.', ephemeral: true });
  }

  const lines = backups.map(b => `**${b.name}** — <t:${Math.floor(b.created_at / 1000)}:R>`);

  return interaction.reply({
    content: `📦 **Backups (${backups.length} total)**\n\n${lines.join('\n')}`,
    ephemeral: true
  });
}

async function restoreBackup(interaction) {
  const name = interaction.options.getString('name', true);

  const row = db.prepare('SELECT * FROM backups WHERE guild_id = ? AND name = ?').get(interaction.guild.id, name);

  if (!row) {
    return interaction.reply({ content: `❌ No backup found named **${name}**.`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const data = JSON.parse(row.data);
  const guild = interaction.guild;

  const roleNameToId = new Map();

  for (const roleData of data.roles) {
    try {
      const created = await guild.roles.create({
        name: roleData.name,
        color: roleData.color,
        hoist: roleData.hoist,
        permissions: BigInt(roleData.permissions),
        mentionable: roleData.mentionable
      });
      roleNameToId.set(roleData.name, created.id);
    } catch (err) {
      console.error('RESTORE ROLE ERROR:', err);
    }
  }

  const categoryNameToId = new Map();

  for (const catData of data.categories) {
    try {
      const created = await guild.channels.create({
        name: catData.name,
        type: ChannelType.GuildCategory
      });
      categoryNameToId.set(catData.name, created.id);
    } catch (err) {
      console.error('RESTORE CATEGORY ERROR:', err);
    }
  }

  for (const chData of data.channels) {
    try {
      await guild.channels.create({
        name: chData.name,
        type: chData.type,
        parent: chData.parentName ? categoryNameToId.get(chData.parentName) || null : null,
        topic: chData.topic || undefined
      });
    } catch (err) {
      console.error('RESTORE CHANNEL ERROR:', err);
    }
  }

  return interaction.editReply({
    content: `✅ Backup **${name}** restored: **${data.roles.length}** roles, **${data.categories.length}** categories, **${data.channels.length}** channels recreated.`
  });
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup
};
