const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS antinuke_exempt (
  guild_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  PRIMARY KEY (guild_id, target_id, type)
);
`);

const channelDeleteTracker = new Map();
const roleDeleteTracker = new Map();
const WINDOW_MS = 10000;
const THRESHOLD = 2;

function isExempt(guild, userId, member) {
  if (userId === guild.ownerId) return true;

  const exemptRows = db.prepare('SELECT * FROM antinuke_exempt WHERE guild_id = ?').all(guild.id);

  for (const row of exemptRows) {
    if (row.type === 'user' && row.target_id === userId) return true;
    if (row.type === 'role' && member && member.roles.cache.has(row.target_id)) return true;
  }

  return false;
}

async function setExempt(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Only administrators can use this.', ephemeral: true });
  }

  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');

  if (!user && !role) {
    return interaction.reply({ content: '❌ Provide a user or a role.', ephemeral: true });
  }

  if (user) {
    db.prepare('INSERT OR IGNORE INTO antinuke_exempt (guild_id, target_id, type) VALUES (?, ?, \'user\')')
      .run(interaction.guild.id, user.id);
  }
  if (role) {
    db.prepare('INSERT OR IGNORE INTO antinuke_exempt (guild_id, target_id, type) VALUES (?, ?, \'role\')')
      .run(interaction.guild.id, role.id);
  }

  return interaction.reply({
    content: `✅ Exempted ${user ? user : ''} ${role ? role : ''} from anti-nuke detection.`,
    ephemeral: true
  });
}

async function punishUser(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  try {
    await member.roles.set([]);
  } catch {}

  try {
    await member.timeout(24 * 60 * 60 * 1000, 'Anti-nuke: mass deletion detected');
  } catch {}

  const owner = await guild.fetchOwner().catch(() => null);
  if (owner) {
    const embed = new EmbedBuilder()
      .setTitle('🚨 Anti-Nuke Triggered')
      .setDescription(`${member.user.tag} (${member.id}) was detected mass-deleting channels/roles.\n\nAll roles stripped and user timed out for 24 hours.`)
      .setColor(0xff0000)
      .setTimestamp();

    await owner.send({ embeds: [embed] }).catch(() => {});
  }
}

async function trackDeletion(guild, executorId, tracker) {
  const key = `${guild.id}:${executorId}`;
  const now = Date.now();

  const timestamps = (tracker.get(key) || []).filter(t => now - t < WINDOW_MS);
  timestamps.push(now);
  tracker.set(key, timestamps);

  if (timestamps.length >= THRESHOLD) {
    tracker.delete(key);
    await punishUser(guild, executorId);
  }
}

async function handleChannelDelete(channel) {
  if (!channel.guild) return;

  const auditLogs = await channel.guild.fetchAuditLogs({
    type: 12,
    limit: 1
  }).catch(() => null);

  const entry = auditLogs?.entries.first();
  if (!entry || Date.now() - entry.createdTimestamp > 5000) return;

  const executorId = entry.executor.id;
  if (executorId === channel.client.user.id) return;

  const member = await channel.guild.members.fetch(executorId).catch(() => null);
  if (isExempt(channel.guild, executorId, member)) return;

  await trackDeletion(channel.guild, executorId, channelDeleteTracker);
}

async function handleRoleDelete(role) {
  const auditLogs = await role.guild.fetchAuditLogs({
    type: 32,
    limit: 1
  }).catch(() => null);

  const entry = auditLogs?.entries.first();
  if (!entry || Date.now() - entry.createdTimestamp > 5000) return;

  const executorId = entry.executor.id;
  if (executorId === role.client.user.id) return;

  const member = await role.guild.members.fetch(executorId).catch(() => null);
  if (isExempt(role.guild, executorId, member)) return;

  await trackDeletion(role.guild, executorId, roleDeleteTracker);
}

module.exports = {
  setExempt,
  handleChannelDelete,
  handleRoleDelete
};
