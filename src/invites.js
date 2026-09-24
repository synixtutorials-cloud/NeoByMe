const { EmbedBuilder } = require('discord.js');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS member_invites (
  guild_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  inviter_id TEXT,
  is_fake INTEGER DEFAULT 0,
  left_server INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, member_id)
);
`);

const inviteCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    invites.forEach(inv => map.set(inv.code, inv.uses));
    inviteCache.set(guild.id, map);
  } catch {
    inviteCache.set(guild.id, new Map());
  }
}

async function cacheAllGuildInvites(client) {
  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
}

async function handleMemberJoinInvite(member) {
  const guild = member.guild;
  const before = inviteCache.get(guild.id) || new Map();

  let usedInvite = null;
  try {
    const after = await guild.invites.fetch();
    for (const inv of after.values()) {
      const beforeUses = before.get(inv.code) || 0;
      if (inv.uses > beforeUses) {
        usedInvite = inv;
        break;
      }
    }
    const newMap = new Map();
    after.forEach(inv => newMap.set(inv.code, inv.uses));
    inviteCache.set(guild.id, newMap);
  } catch {
    // missing permissions or fetch failed
  }

  const accountAgeMs = Date.now() - member.user.createdTimestamp;
  const isFake = accountAgeMs < 7 * 24 * 60 * 60 * 1000 ? 1 : 0;

  db.prepare(`
    INSERT INTO member_invites (guild_id, member_id, inviter_id, is_fake, left_server)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(guild_id, member_id) DO UPDATE SET
      inviter_id = excluded.inviter_id,
      is_fake = excluded.is_fake,
      left_server = 0
  `).run(guild.id, member.id, usedInvite ? usedInvite.inviter?.id || null : null, isFake);
}

function handleMemberLeaveInvite(member) {
  db.prepare('UPDATE member_invites SET left_server = 1 WHERE guild_id = ? AND member_id = ?')
    .run(member.guild.id, member.id);
}

function getInviteStats(guildId, userId) {
  const rows = db
    .prepare('SELECT * FROM member_invites WHERE guild_id = ? AND inviter_id = ?')
    .all(guildId, userId);

  const regular = rows.filter(r => !r.is_fake && !r.left_server).length;
  const fake = rows.filter(r => r.is_fake).length;
  const left = rows.filter(r => r.left_server && !r.is_fake).length;
  const total = rows.length;

  return { regular, fake, left, total };
}

async function showInfo(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  const stats = getInviteStats(interaction.guild.id, target.id);

  let messageCount = 0;
  try {
    const levelRow = db
      .prepare('SELECT message_count FROM levels WHERE guild_id = ? AND user_id = ?')
      .get(interaction.guild.id, target.id);
    if (levelRow) messageCount = levelRow.message_count;
  } catch {
    // leveling table might not exist yet
  }

  const embed = new EmbedBuilder()
    .setTitle(`ℹ️ ${target.username}'s Info`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: 'Name', value: target.tag, inline: true },
      { name: 'ID', value: target.id, inline: true },
      { name: 'Messages', value: `${messageCount}`, inline: true },
      { name: 'Invites (Regular)', value: `${stats.regular}`, inline: true },
      { name: 'Invites (Fake)', value: `${stats.fake}`, inline: true },
      { name: 'Invites (Left)', value: `${stats.left}`, inline: true },
      { name: 'Total Joins Invited', value: `${stats.total}`, inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  if (member) {
    embed.addFields({
      name: 'Joined Server',
      value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
      inline: true
    });
  }

  return interaction.reply({ embeds: [embed] });
}

module.exports = {
  cacheGuildInvites,
  cacheAllGuildInvites,
  handleMemberJoinInvite,
  handleMemberLeaveInvite,
  showInfo
};
