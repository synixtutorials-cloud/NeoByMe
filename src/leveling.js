const { EmbedBuilder } = require('discord.js');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS levels (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, guild_id)
);
CREATE TABLE IF NOT EXISTS level_config (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT
);
`);

function xpForLevel(level) {
  return 5 * (level * level) + 50 * level + 100;
}

function getLevelData(guildId, userId) {
  let row = db.prepare('SELECT * FROM levels WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  if (!row) {
    db.prepare('INSERT INTO levels (user_id, guild_id, xp, level, message_count) VALUES (?, ?, 0, 0, 0)')
      .run(userId, guildId);
    row = { user_id: userId, guild_id: guildId, xp: 0, level: 0, message_count: 0 };
  }
  return row;
}

function getLevelChannel(guildId) {
  const row = db.prepare('SELECT channel_id FROM level_config WHERE guild_id = ?').get(guildId);
  return row ? row.channel_id : null;
}

async function setLevelChannel(interaction) {
  const channel = interaction.options.getChannel('channel', true);

  db.prepare(`
    INSERT INTO level_config (guild_id, channel_id)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id
  `).run(interaction.guild.id, channel.id);

  return interaction.reply({
    content: `✅ Level-up announcements will be sent in ${channel}.`,
    ephemeral: true
  });
}

const NEO_CASH_PER_50_MESSAGES = 100;

async function handleLevelingMessage(message) {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const data = getLevelData(guildId, userId);
  const gainedXp = Math.floor(Math.random() * 11) + 15;
  const newXp = data.xp + gainedXp;
  const newMessageCount = data.message_count + 1;

  let newLevel = data.level;
  let leveledUp = false;

  while (newXp >= xpForLevel(newLevel)) {
    newLevel++;
    leveledUp = true;
  }

  db.prepare('UPDATE levels SET xp = ?, level = ?, message_count = ? WHERE user_id = ? AND guild_id = ?')
    .run(newXp, newLevel, newMessageCount, userId, guildId);

  if (newMessageCount % 50 === 0) {
    const { addBalance } = require('./economy');
    addBalance(guildId, userId, NEO_CASH_PER_50_MESSAGES);
    await message.channel.send(
      `💰 ${message.author}, you earned **${NEO_CASH_PER_50_MESSAGES}** Neo Cash for reaching **${newMessageCount}** messages!`
    ).catch(() => {});
  }

  if (leveledUp) {
    const channelId = getLevelChannel(guildId);
    const targetChannel = channelId
      ? await message.guild.channels.fetch(channelId).catch(() => null)
      : message.channel;

    if (targetChannel) {
      const embed = new EmbedBuilder()
        .setTitle('<a:levelup:1553245921582653761> Level Up!')
        .setDescription(
          `Congratulations ${message.author}, you have reached level **${newLevel}**!`
        )
        .addFields(
          { name: 'Level', value: `${newLevel}`, inline: true },
          { name: 'XP', value: `${newXp}`, inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setColor(0xffd700)
        .setTimestamp();

      await targetChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

async function showRank(interaction) {
  const guildId = interaction.guild.id;
  const target = interaction.options.getUser('user') || interaction.user;

  const data = getLevelData(guildId, target.id);

  const allUsers = db
    .prepare('SELECT user_id FROM levels WHERE guild_id = ? ORDER BY xp DESC')
    .all(guildId);
  const rank = allUsers.findIndex(u => u.user_id === target.id) + 1;

  const currentLevelXp = xpForLevel(data.level - 1 >= 0 ? data.level - 1 : 0);
  const nextLevelXp = xpForLevel(data.level);

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${target.username}'s Rank`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: 'Rank', value: `#${rank}`, inline: true },
      { name: 'Level', value: `${data.level}`, inline: true },
      { name: 'XP', value: `${data.xp} / ${nextLevelXp}`, inline: true },
      { name: 'Messages', value: `${data.message_count}`, inline: true }
    )
    .setColor(0x5865f2);

  return interaction.reply({ embeds: [embed] });
}

async function showLeaderboard(interaction) {
  const guildId = interaction.guild.id;

  const top = db
    .prepare('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT 10')
    .all(guildId);

  if (top.length === 0) {
    return interaction.reply({ content: 'No leveling data yet.', ephemeral: true });
  }

  const lines = await Promise.all(
    top.map(async (row, idx) => {
      const user = await interaction.client.users.fetch(row.user_id).catch(() => null);
      const name = user ? user.tag : 'Unknown User';
      return `**${idx + 1}.** ${name} — Level ${row.level} (${row.xp} XP)`;
    })
  );

  const embed = new EmbedBuilder()
    .setTitle('🏆 Leaderboard')
    .setDescription(lines.join('\n'))
    .setColor(0xffd700);

  return interaction.reply({ embeds: [embed] });
}

module.exports = {
  handleLevelingMessage,
  setLevelChannel,
  showRank,
  showLeaderboard
};
