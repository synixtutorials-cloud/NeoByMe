const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS polls (
  message_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  title TEXT NOT NULL,
  options TEXT NOT NULL,
  end_time INTEGER,
  ended INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_votes (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
`);

function parseDuration(str) {
  if (!str) return null;
  const match = String(str).match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * mult[unit];
}

function getVoteCounts(messageId, optionCount) {
  const counts = new Array(optionCount).fill(0);
  const rows = db
    .prepare('SELECT option_index, COUNT(*) as c FROM poll_votes WHERE message_id = ? GROUP BY option_index')
    .all(messageId);
  for (const row of rows) {
    counts[row.option_index] = row.c;
  }
  return counts;
}

function buildPollEmbed(poll) {
  const options = JSON.parse(poll.options);
  const counts = getVoteCounts(poll.message_id, options.length);
  const totalVotes = counts.reduce((a, b) => a + b, 0);

  const lines = options.map((opt, idx) => {
    const count = counts[idx];
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const barLength = 15;
    const filled = totalVotes > 0 ? Math.round((count / totalVotes) * barLength) : 0;
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    return `**${idx + 1}. ${opt}**\n${bar} ${count} votes (${pct}%)`;
  });

  const timeLine = poll.ended
    ? '🔒 Poll ended'
    : poll.end_time
      ? `⏱️ Ends <t:${Math.floor(poll.end_time / 1000)}:R>`
      : '⏱️ No end time set';

  return new EmbedBuilder()
    .setTitle(`📊 ${poll.title}`)
    .setDescription(`${lines.join('\n\n')}\n\n${timeLine}\n👥 Total votes: ${totalVotes}`)
    .setColor(poll.ended ? 0x808080 : 0x5865f2)
    .setFooter({ text: `Poll by ${poll.host_id ? 'host' : 'unknown'}` })
    .setTimestamp();
}

function buildPollRow(messageId, options, disabled = false) {
  const row = new ActionRowBuilder();
  options.forEach((opt, idx) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll:vote:${messageId}:${idx}`)
        .setLabel(opt.slice(0, 70))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    );
  });
  return row;
}

async function refreshPollEmbed(client, poll) {
  const channel = await client.channels.fetch(poll.channel_id).catch(() => null);
  if (!channel) return null;

  const msg = await channel.messages.fetch(poll.message_id).catch(() => null);
  if (!msg) return null;

  const options = JSON.parse(poll.options);
  const embed = buildPollEmbed(poll);

  await msg.edit({
    embeds: [embed],
    components: [buildPollRow(poll.message_id, options, !!poll.ended)]
  }).catch(() => {});

  return msg;
}

async function createPoll(interaction) {
  const title = interaction.options.getString('title', true);
  const channel = interaction.options.getChannel('channel', true);
  const timeStr = interaction.options.getString('time');

  const options = [];
  for (let n = 1; n <= 5; n++) {
    const opt = interaction.options.getString(`option${n}`);
    if (opt) options.push(opt);
  }

  if (options.length < 2) {
    return interaction.reply({
      content: '❌ You need at least 2 options for a poll.',
      ephemeral: true
    });
  }

  let endTime = null;
  if (timeStr) {
    const durationMs = parseDuration(timeStr);
    if (!durationMs) {
      return interaction.reply({
        content: '❌ Invalid time format. Use something like 10m, 1h, or 2d.',
        ephemeral: true
      });
    }
    endTime = Date.now() + durationMs;
  }

  const placeholderEmbed = new EmbedBuilder()
    .setTitle(`📊 ${title}`)
    .setDescription('Setting up...')
    .setColor(0x5865f2);

  const msg = await channel.send({ embeds: [placeholderEmbed] });

  db.prepare(`
    INSERT INTO polls (message_id, channel_id, guild_id, host_id, title, options, end_time, ended, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    msg.id,
    channel.id,
    interaction.guild.id,
    interaction.user.id,
    title,
    JSON.stringify(options),
    endTime,
    Date.now()
  );

  const poll = db.prepare('SELECT * FROM polls WHERE message_id = ?').get(msg.id);
  await refreshPollEmbed(interaction.client, poll);

  if (endTime) {
    schedulePollEnd(interaction.client, msg.id, endTime - Date.now());
  }

  return interaction.reply({
    content: `✅ Poll created in ${channel}.`,
    ephemeral: true
  });
}

async function votePoll(interaction) {
  const parts = interaction.customId.split(':');
  const messageId = parts[2];
  const optionIndex = parseInt(parts[3], 10);

  const poll = db.prepare('SELECT * FROM polls WHERE message_id = ?').get(messageId);

  if (!poll || poll.ended) {
    return interaction.reply({
      content: '❌ This poll has ended.',
      ephemeral: true
    });
  }

  const existing = db
    .prepare('SELECT * FROM poll_votes WHERE message_id = ? AND user_id = ?')
    .get(messageId, interaction.user.id);

  if (existing) {
    return interaction.reply({
      content: '⚠️ You already voted in this poll.',
      ephemeral: true
    });
  }

  db.prepare('INSERT INTO poll_votes (message_id, user_id, option_index) VALUES (?, ?, ?)')
    .run(messageId, interaction.user.id, optionIndex);

  await refreshPollEmbed(interaction.client, poll);

  const options = JSON.parse(poll.options);
  return interaction.reply({
    content: `✅ You voted for **${options[optionIndex]}**.`,
    ephemeral: true
  });
}

function getLatestActivePoll(guildId) {
  return db
    .prepare('SELECT * FROM polls WHERE guild_id = ? AND ended = 0 ORDER BY created_at DESC LIMIT 1')
    .get(guildId);
}

function getLatestPoll(guildId) {
  return db
    .prepare('SELECT * FROM polls WHERE guild_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(guildId);
}

const timers = new Map();

function schedulePollEnd(client, messageId, delayMs) {
  if (timers.has(messageId)) clearTimeout(timers.get(messageId));

  const safeDelay = Math.min(Math.max(delayMs, 0), 2147000000);

  const timer = setTimeout(async () => {
    const p = db.prepare('SELECT * FROM polls WHERE message_id = ?').get(messageId);
    if (p && !p.ended) {
      await endPollById(client, messageId);
    }
    timers.delete(messageId);
  }, safeDelay);

  timers.set(messageId, timer);
}

async function endPollById(client, messageId) {
  const poll = db.prepare('SELECT * FROM polls WHERE message_id = ?').get(messageId);
  if (!poll) return null;

  db.prepare('UPDATE polls SET ended = 1 WHERE message_id = ?').run(messageId);

  const updated = db.prepare('SELECT * FROM polls WHERE message_id = ?').get(messageId);
  await refreshPollEmbed(client, updated);

  return updated;
}

async function pollEnd(interaction) {
  const poll = getLatestActivePoll(interaction.guild.id);
  if (!poll) {
    return interaction.reply({ content: '❌ No active poll found.', ephemeral: true });
  }
  if (timers.has(poll.message_id)) {
    clearTimeout(timers.get(poll.message_id));
    timers.delete(poll.message_id);
  }
  await endPollById(interaction.client, poll.message_id);
  return interaction.reply({ content: '✅ Poll ended.', ephemeral: true });
}

async function pollResult(interaction) {
  const poll = getLatestPoll(interaction.guild.id);
  if (!poll) {
    return interaction.reply({ content: '❌ No poll found.', ephemeral: true });
  }

  const embed = buildPollEmbed(poll);
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

function resumeActivePolls(client) {
  const active = db.prepare('SELECT * FROM polls WHERE ended = 0 AND end_time IS NOT NULL').all();
  for (const p of active) {
    const remaining = p.end_time - Date.now();
    if (remaining <= 0) {
      endPollById(client, p.message_id);
    } else {
      schedulePollEnd(client, p.message_id, remaining);
    }
  }
}

module.exports = {
  createPoll,
  votePoll,
  pollEnd,
  pollResult,
  resumeActivePolls
};
