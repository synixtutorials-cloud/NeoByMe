const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS last_activity (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_message_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
`);

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function handleActivityMessage(message) {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const row = db
    .prepare('SELECT last_message_at FROM last_activity WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId);

  const now = Date.now();

  if (row && now - row.last_message_at >= SIX_HOURS_MS) {
    await message.channel.send(`🎁 ${message.author} has appeared after 6 hours!`).catch(() => {});
  }

  db.prepare(`
    INSERT INTO last_activity (guild_id, user_id, last_message_at)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET last_message_at = excluded.last_message_at
  `).run(guildId, userId, now);
}

module.exports = {
  handleActivityMessage
};
