const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS giveaways (
  message_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winners_count INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  message_template TEXT NOT NULL,
  ping INTEGER DEFAULT 0,
  ended INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS giveaway_entries (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
`);

function parseDuration(str) {
  const match = String(str).match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * mult[unit];
}

function getEntryCount(messageId) {
  return db
    .prepare('SELECT COUNT(*) as c FROM giveaway_entries WHERE message_id = ?')
    .get(messageId).c;
}

function buildDescription(template, data) {
  return template
    .replaceAll('{enteredpeople}', data.entered)
    .replaceAll('{prize}', data.prize)
    .replaceAll('{time}', data.timeLeft)
    .replaceAll('{host}', data.host)
    .replaceAll('{winners}', data.winners);
}

function giveawayRow(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:enter:${messageId}`)
      .setLabel('Enter giveaway')
      .setEmoji({ id: '1553230160688582748', name: 'rocketup', animated: true })
      .setStyle(ButtonStyle.Primary)
  );
}

async function refreshGiveawayEmbed(client, giveaway) {
  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) return null;

  const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  if (!msg) return null;

  const entered = getEntryCount(giveaway.message_id);
  const timeLeft = giveaway.ended
    ? 'Ended'
    : `<t:${Math.floor(giveaway.end_time / 1000)}:R>`;

  const host = await client.users.fetch(giveaway.host_id).catch(() => null);

  const description = buildDescription(giveaway.message_template, {
    entered,
    prize: giveaway.prize,
    timeLeft,
    host: host ? `<@${host.id}>` : 'Unknown',
    winners: giveaway.winners_count
  });

  const embed = new EmbedBuilder()
    .setTitle(giveaway.ended ? '<a:celeb:1553233013381271633> GIVEAWAY ENDED' : '<a:celeb:1553233013381271633> GIVEAWAY')
    .setDescription(description)
    .setColor(giveaway.ended ? 0x808080 : 0xffd700)
    .setFooter({ text: `Hosted by ${host ? host.tag : 'Unknown'}` })
    .setTimestamp();

  await msg.edit({
    embeds: [embed],
    components: giveaway.ended ? [] : [giveawayRow(giveaway.message_id)]
  }).catch(() => {});

  return msg;
}

async function createGiveaway(interaction) {
  const timeStr = interaction.options.getString('time', true);
  const winners = interaction.options.getInteger('winners', true);
  const prize = interaction.options.getString('prize', true);
  const messageTemplate =
    interaction.options.getString('message') ||
    '<a:next:1553230272479240222> **Prize:** {prize}\n<a:next:1553230272479240222> **Winners:** {winners}\n<a:next:1553230272479240222> **Entries:** {enteredpeople}\n<a:next:1553230272479240222> **Ends:** {time}\n\n<a:flaming:1553230331488903248> Click the button below to enter!';
  const ping = interaction.options.getBoolean('ping') || false;

  const durationMs = parseDuration(timeStr);
  if (!durationMs) {
    return interaction.reply({
      content: '❌ Invalid time format. Use something like 10m, 1h, or 2d.',
      ephemeral: true
    });
  }

  const endTime = Date.now() + durationMs;

  const placeholderEmbed = new EmbedBuilder()
    .setTitle('<a:celeb:1553233013381271633> GIVEAWAY')
    .setDescription('Setting up...')
    .setColor(0xffd700);

  const msg = await interaction.channel.send({
    content: ping ? '@everyone' : undefined,
    embeds: [placeholderEmbed]
  });

  db.prepare(`
    INSERT INTO giveaways
    (message_id, channel_id, guild_id, host_id, prize, winners_count, end_time, message_template, ping, ended, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    msg.id,
    interaction.channel.id,
    interaction.guild.id,
    interaction.user.id,
    prize,
    winners,
    endTime,
    messageTemplate,
    ping ? 1 : 0,
    Date.now()
  );

  const giveaway = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(msg.id);
  await refreshGiveawayEmbed(interaction.client, giveaway);

  scheduleGiveawayEnd(interaction.client, msg.id, durationMs);

  return interaction.reply({
    content: '✅ Giveaway created.',
    ephemeral: true
  });
}

async function enterGiveaway(interaction) {
  const messageId = interaction.customId.split(':')[2];
  const giveaway = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);

  if (!giveaway || giveaway.ended) {
    return interaction.reply({
      content: '❌ This giveaway has ended.',
      ephemeral: true
    });
  }

  const existing = db
    .prepare('SELECT * FROM giveaway_entries WHERE message_id = ? AND user_id = ?')
    .get(messageId, interaction.user.id);

  if (existing) {
    return interaction.reply({
      content: '⚠️ You already entered this giveaway.',
      ephemeral: true
    });
  }

  db.prepare('INSERT INTO giveaway_entries (message_id, user_id) VALUES (?, ?)')
    .run(messageId, interaction.user.id);

  await refreshGiveawayEmbed(interaction.client, giveaway);

  return interaction.reply({
    content: '✅ You entered the giveaway!',
    ephemeral: true
  });
}

function pickWinners(messageId, count) {
  const entries = db
    .prepare('SELECT user_id FROM giveaway_entries WHERE message_id = ?')
    .all(messageId)
    .map(r => r.user_id);

  if (entries.length === 0) return [];

  const shuffled = entries.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function announceWinners(client, giveaway, winnerIds) {
  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) return;

  if (winnerIds.length === 0) {
    await channel.send({
      content: `😔 No valid entries — no winner could be selected for **${giveaway.prize}**.`
    });
    return;
  }

  const mentions = winnerIds.map(id => `<@${id}>`).join(', ');

  await channel.send({
    content:
      `🎉 Congratulations ${mentions}! You won **${giveaway.prize}**!\n` +
      `https://discord.com/channels/${giveaway.guild_id}/${giveaway.channel_id}/${giveaway.message_id}`
  });
}

async function endGiveawayById(client, messageId, isReroll = false) {
  const giveaway = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
  if (!giveaway) return null;

  const winnerIds = pickWinners(messageId, giveaway.winners_count);

  if (!isReroll) {
    db.prepare('UPDATE giveaways SET ended = 1 WHERE message_id = ?').run(messageId);
  }

  const updated = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
  await refreshGiveawayEmbed(client, updated);
  await announceWinners(client, updated, winnerIds);

  return winnerIds;
}

function getLatestActiveGiveaway(guildId) {
  return db
    .prepare('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 ORDER BY created_at DESC LIMIT 1')
    .get(guildId);
}

function getLatestGiveaway(guildId) {
  return db
    .prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(guildId);
}

const timers = new Map();

function scheduleGiveawayEnd(client, messageId, delayMs) {
  if (timers.has(messageId)) clearTimeout(timers.get(messageId));

  const safeDelay = Math.min(delayMs, 2147000000);

  const timer = setTimeout(async () => {
    const g = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
    if (g && !g.ended) {
      await endGiveawayById(client, messageId);
    }
    timers.delete(messageId);
  }, safeDelay);

  timers.set(messageId, timer);
}

function resumeActiveGiveaways(client) {
  const active = db.prepare('SELECT * FROM giveaways WHERE ended = 0').all();
  for (const g of active) {
    const remaining = g.end_time - Date.now();
    if (remaining <= 0) {
      endGiveawayById(client, g.message_id);
    } else {
      scheduleGiveawayEnd(client, g.message_id, remaining);
    }
  }
}

async function gend(interaction) {
  const giveaway = getLatestActiveGiveaway(interaction.guild.id);
  if (!giveaway) {
    return interaction.reply({ content: '❌ No active giveaway found.', ephemeral: true });
  }
  if (timers.has(giveaway.message_id)) {
    clearTimeout(timers.get(giveaway.message_id));
    timers.delete(giveaway.message_id);
  }
  await endGiveawayById(interaction.client, giveaway.message_id);
  return interaction.reply({ content: '✅ Giveaway ended.', ephemeral: true });
}

async function gstart(interaction) {
  return gend(interaction);
}

async function greroll(interaction) {
  const giveaway = getLatestGiveaway(interaction.guild.id);
  if (!giveaway) {
    return interaction.reply({ content: '❌ No giveaway found.', ephemeral: true });
  }
  await endGiveawayById(interaction.client, giveaway.message_id, true);
  return interaction.reply({ content: '✅ Winner rerolled.', ephemeral: true });
}

async function gwinner(interaction) {
  const giveaway = getLatestGiveaway(interaction.guild.id);
  if (!giveaway) {
    return interaction.reply({ content: '❌ No giveaway found.', ephemeral: true });
  }
  const user = interaction.options.getUser('username', true);

  await announceWinners(interaction.client, giveaway, [user.id]);

  return interaction.reply({ content: `✅ ${user.tag} selected as winner.`, ephemeral: true });
}

module.exports = {
  createGiveaway,
  enterGiveaway,
  gend,
  gstart,
  greroll,
  gwinner,
  resumeActiveGiveaways
};
