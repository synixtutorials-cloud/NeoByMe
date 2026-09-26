const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS counting (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  current_number INTEGER NOT NULL,
  last_user_id TEXT,
  reset_message TEXT
);
`);

function getCounting(guildId) {
  return db.prepare('SELECT * FROM counting WHERE guild_id = ?').get(guildId);
}

async function setupCounting(interaction) {
  const channel = interaction.options.getChannel('channel', true);
  const start = interaction.options.getInteger('start') ?? 1;
  const resetMessage = interaction.options.getString('message') || null;

  db.prepare(`
    INSERT INTO counting (guild_id, channel_id, current_number, last_user_id, reset_message)
    VALUES (?, ?, ?, NULL, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      current_number = excluded.current_number,
      last_user_id = NULL,
      reset_message = excluded.reset_message
  `).run(interaction.guild.id, channel.id, start, resetMessage);

  return interaction.reply({
    content: `✅ Counting set up in ${channel} starting at **${start}**.`,
    ephemeral: true
  });
}

async function handleCountingMessage(message) {
  if (message.author.bot) return;

  const setup = getCounting(message.guild.id);
  if (!setup || setup.channel_id !== message.channel.id) return;

  const raw = message.content.trim();
  const isNumber = /^-?\d+$/.test(raw);

  if (!isNumber) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(
      `${message.author}, you are not allowed to speak here, try typing some math!`
    );
    setTimeout(() => warn.delete().catch(() => {}), 4000);
    return;
  }

  const num = parseInt(raw, 10);

  if (message.author.id === setup.last_user_id) {
    await message.delete().catch(() => {});
    db.prepare('UPDATE counting SET current_number = 1, last_user_id = NULL WHERE guild_id = ?')
      .run(message.guild.id);
    const failMsg = setup.reset_message
      ? setup.reset_message.replaceAll('{user}', message.author.toString()).replaceAll('{number}', num)
      : `<a:countross:1553244188009824286> ${message.author} counted twice in a row! Count reset to **1**.`;
    await message.channel.send(failMsg);
    return;
  }

  if (num !== setup.current_number) {
    await message.delete().catch(() => {});
    db.prepare('UPDATE counting SET current_number = 1, last_user_id = NULL WHERE guild_id = ?')
      .run(message.guild.id);
    const failMsg = setup.reset_message
      ? setup.reset_message.replaceAll('{user}', message.author.toString()).replaceAll('{number}', num)
      : `<a:countross:1553244188009824286> ${message.author} said the wrong number! Expected **${setup.current_number}**. Count reset to **1**.`;
    await message.channel.send(failMsg);
    return;
  }

  db.prepare('UPDATE counting SET current_number = ?, last_user_id = ? WHERE guild_id = ?')
    .run(num + 1, message.author.id, message.guild.id);

  await message.react('<a:countick:1553244156581904494>').catch(() => {});
}

module.exports = {
  setupCounting,
  handleCountingMessage
};
