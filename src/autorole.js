const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS autoroles (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);
`);

function getAutoroles(guildId) {
  return db.prepare('SELECT role_id FROM autoroles WHERE guild_id = ?').all(guildId).map(r => r.role_id);
}

async function autoroleAdd(interaction) {
  const role = interaction.options.getRole('role', true);

  const existing = db
    .prepare('SELECT * FROM autoroles WHERE guild_id = ? AND role_id = ?')
    .get(interaction.guild.id, role.id);

  if (existing) {
    return interaction.reply({
      content: `⚠️ ${role} is already an autorole.`,
      ephemeral: true
    });
  }

  db.prepare('INSERT INTO autoroles (guild_id, role_id) VALUES (?, ?)')
    .run(interaction.guild.id, role.id);

  return interaction.reply({
    content: `✅ ${role} will now be given to new members automatically.`,
    ephemeral: true
  });
}

async function autoroleAddAll(interaction) {
  const role = interaction.options.getRole('role', true);

  await interaction.deferReply({ ephemeral: true });

  const existing = db
    .prepare('SELECT * FROM autoroles WHERE guild_id = ? AND role_id = ?')
    .get(interaction.guild.id, role.id);

  if (!existing) {
    db.prepare('INSERT INTO autoroles (guild_id, role_id) VALUES (?, ?)')
      .run(interaction.guild.id, role.id);
  }

  const members = await interaction.guild.members.fetch();
  let added = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (member.roles.cache.has(role.id)) continue;

    try {
      await member.roles.add(role);
      added++;
    } catch {
      failed++;
    }
  }

  return interaction.editReply({
    content: `✅ Added ${role} to **${added}** members.${failed > 0 ? ` (${failed} failed, likely due to role hierarchy)` : ''} This role is now also set as an autorole for future joins.`
  });
}

async function handleMemberJoinAutorole(member) {
  const roleIds = getAutoroles(member.guild.id);
  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    if (role) {
      await member.roles.add(role).catch(() => {});
    }
  }
}

module.exports = {
  autoroleAdd,
  autoroleAddAll,
  handleMemberJoinAutorole
};
