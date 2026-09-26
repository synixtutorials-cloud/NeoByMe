const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS economy (
  user_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 20
);
CREATE TABLE IF NOT EXISTS mine_games (
  message_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  bet INTEGER NOT NULL,
  board TEXT NOT NULL,
  revealed TEXT NOT NULL DEFAULT '[]',
  multiplier REAL NOT NULL DEFAULT 1.0,
  ended INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

function getBalance(guildId, userId) {
  let row = db.prepare('SELECT * FROM economy WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  if (!row) {
    db.prepare('INSERT INTO economy (user_id, guild_id, balance) VALUES (?, ?, 20)').run(userId, guildId);
    row = { user_id: userId, guild_id: guildId, balance: 20 };
  }
  return row.balance;
}

function setBalance(guildId, userId, amount) {
  getBalance(guildId, userId);
  db.prepare('UPDATE economy SET balance = ? WHERE user_id = ? AND guild_id = ?').run(amount, userId, guildId);
}

function addBalance(guildId, userId, amount) {
  const current = getBalance(guildId, userId);
  setBalance(guildId, userId, current + amount);
  return current + amount;
}

const REWARD_PER_SAFE = 0.5;

function generateBoard() {
  const positions = [0, 1, 2, 3, 4, 5];
  const shuffled = positions.sort(() => Math.random() - 0.5);
  const mines = shuffled.slice(0, 3);
  return positions.map(p => (mines.includes(p) ? 'mine' : 'reward'));
}

function buildMineEmbed(game, finished = false, won = null) {
  const revealed = JSON.parse(game.revealed);
  let desc;

  if (finished) {
    desc = won
      ? `💰 You cashed out! Winnings: **${Math.floor(game.bet * game.multiplier)}** Neo Cash`
      : `💥 You hit a mine! You lost **${game.bet}** Neo Cash.`;
  } else {
    desc = `Bet: **${game.bet}** Neo Cash\nCurrent multiplier: **${game.multiplier.toFixed(2)}x**\nPotential payout: **${Math.floor(game.bet * game.multiplier)}** Neo Cash\n\nClick a box to reveal it, or withdraw to cash out.`;
  }

  return new EmbedBuilder()
    .setTitle('⛏️ Neo Mine')
    .setDescription(desc)
    .setColor(finished ? (won ? 0x00ff00 : 0xff0000) : 0xffd700);
}

function buildMineRow(game, finished = false) {
  const revealed = JSON.parse(game.revealed);
  const board = JSON.parse(game.board);

  const rows = [];
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  for (let i = 0; i < 6; i++) {
    const isRevealed = revealed.includes(i);
    let emoji = '⬛';
    let style = ButtonStyle.Secondary;

    if (finished && isRevealed) {
      emoji = board[i] === 'mine' ? '💥' : '💎';
      style = board[i] === 'mine' ? ButtonStyle.Danger : ButtonStyle.Success;
    } else if (isRevealed) {
      emoji = '💎';
      style = ButtonStyle.Success;
    }

    const btn = new ButtonBuilder()
      .setCustomId(`mine:box:${game.message_id}:${i}`)
      .setLabel(' ')
      .setEmoji(emoji)
      .setStyle(style)
      .setDisabled(finished || isRevealed);

    if (i < 3) row1.addComponents(btn);
    else row2.addComponents(btn);
  }

  rows.push(row1, row2);

  if (!finished) {
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mine:withdraw:${game.message_id}`)
        .setLabel('Withdraw')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mine:cancel:${game.message_id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(controlRow);
  }

  return rows;
}

async function handleNeoChat(message) {
  if (message.author.bot) return false;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (!lower.startsWith('neo ')) return false;

  const guildId = message.guild.id;
  const userId = message.author.id;

  if (lower === 'neo cash') {
    const bal = getBalance(guildId, userId);
    await message.reply(`💰 You have **${bal}** Neo Cash.`);
    return true;
  }

  if (lower.startsWith('neo give ')) {
    const target = message.mentions.users.first();
    const parts = content.split(' ');
    const amount = parseInt(parts[parts.length - 1], 10);

    if (!target || isNaN(amount) || amount <= 0) {
      await message.reply('❌ Usage: `Neo give @user amount`');
      return true;
    }
    if (target.id === userId) {
      await message.reply('❌ You cannot give money to yourself.');
      return true;
    }

    const senderBal = getBalance(guildId, userId);
    if (amount > senderBal) {
      await message.reply(`❌ You only have **${senderBal}** Neo Cash.`);
      return true;
    }

    setBalance(guildId, userId, senderBal - amount);
    addBalance(guildId, target.id, amount);

    await message.reply(`✅ You gave **${amount}** Neo Cash to ${target}.`);
    return true;
  }

  if (lower.startsWith('neo add cash ')) {
    if (!message.member.permissions.has('ManageGuild')) {
      await message.reply('❌ You do not have permission to use this.');
      return true;
    }

    const target = message.mentions.users.first();
    const parts = content.split(' ');
    const amount = parseInt(parts[parts.length - 1], 10);

    if (!target || isNaN(amount) || amount <= 0) {
      await message.reply('❌ Usage: `Neo add cash @user amount`');
      return true;
    }

    const newBal = addBalance(guildId, target.id, amount);
    await message.reply(`✅ Added **${amount}** Neo Cash to ${target}. New balance: **${newBal}**.`);
    return true;
  }

  if (lower.startsWith('neo mine ')) {
    const parts = content.split(' ');
    const amount = parseInt(parts[parts.length - 1], 10);

    if (isNaN(amount) || amount <= 0) {
      await message.reply('❌ Usage: `Neo mine amount`');
      return true;
    }

    const bal = getBalance(guildId, userId);
    if (amount > bal) {
      await message.reply(`❌ You only have **${bal}** Neo Cash.`);
      return true;
    }

    setBalance(guildId, userId, bal - amount);

    const board = generateBoard();

    const placeholder = new EmbedBuilder().setTitle('⛏️ Neo Mine').setDescription('Setting up...');
    const msg = await message.channel.send({ embeds: [placeholder] });

    db.prepare(`
      INSERT INTO mine_games (message_id, user_id, guild_id, channel_id, bet, board, revealed, multiplier, ended, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '[]', 1.0, 0, ?)
    `).run(msg.id, userId, guildId, message.channel.id, amount, JSON.stringify(board), Date.now());

    const game = db.prepare('SELECT * FROM mine_games WHERE message_id = ?').get(msg.id);
    await msg.edit({ embeds: [buildMineEmbed(game)], components: buildMineRow(game) });

    return true;
  }

  if (lower === 'neo daily') return handleDaily(message);
  if (lower === 'neo work') return handleWork(message);
  if (lower.startsWith('neo slots ')) return handleSlots(message);
  if (lower.startsWith('neo flip ')) return handleFlip(message);
  if (lower.startsWith('neo rob ')) return handleRob(message);
  if (lower.startsWith('neo blackjack ')) return handleBlackjack(message);

  return false;
}

async function handleMineButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const messageId = parts[2];

  const game = db.prepare('SELECT * FROM mine_games WHERE message_id = ?').get(messageId);
  if (!game || game.ended) {
    return interaction.reply({ content: '❌ This game has ended.', ephemeral: true });
  }

  if (interaction.user.id !== game.user_id) {
    return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });
  }

  if (action === 'cancel') {
    addBalance(game.guild_id, game.user_id, game.bet);
    db.prepare('UPDATE mine_games SET ended = 1 WHERE message_id = ?').run(messageId);
    const updated = db.prepare('SELECT * FROM mine_games WHERE message_id = ?').get(messageId);
    await interaction.update({
      embeds: [new EmbedBuilder().setTitle('⛏️ Neo Mine').setDescription('Game cancelled, bet refunded.').setColor(0x808080)],
      components: []
    });
    return;
  }

  if (action === 'withdraw') {
    const winnings = Math.floor(game.bet * game.multiplier);
    addBalance(game.guild_id, game.user_id, winnings);
    db.prepare('UPDATE mine_games SET ended = 1 WHERE message_id = ?').run(messageId);
    const updated = db.prepare('SELECT * FROM mine_games WHERE message_id = ?').get(messageId);
    await interaction.update({
      embeds: [buildMineEmbed(updated, true, true)],
      components: buildMineRow(updated, true)
    });
    return;
  }

  if (action === 'box') {
    const boxIndex = parseInt(parts[3], 10);
    const board = JSON.parse(game.board);
    const revealed = JSON.parse(game.revealed);

    if (revealed.includes(boxIndex)) {
      return interaction.reply({ content: '❌ Already revealed.', ephemeral: true });
    }

    if (board[boxIndex] === 'mine') {
      revealed.push(boxIndex);
      db.prepare('UPDATE mine_games SET ended = 1, revealed = ? WHERE message_id = ?')
        .run(JSON.stringify(revealed), messageId);
      const updated = db.prepare('SELECT * FROM mine_games WHERE message_id = ?').get(messageId);
      await interaction.update({
        embeds: [buildMineEmbed(updated, true, false)],
        components: buildMineRow(updated, true)
      });
      return;
    }

    revealed.push(boxIndex);
    const newMultiplier = game.multiplier + REWARD_PER_SAFE;
    db.prepare('UPDATE mine_games SET revealed = ?, multiplier = ? WHERE message_id = ?')
      .run(JSON.stringify(revealed), newMultiplier, messageId);

    const updated = db.prepare('SELECT * FROM mine_games WHERE message_id = ?').get(messageId);

    if (revealed.length === 3) {
      const winnings = Math.floor(updated.bet * updated.multiplier);
      addBalance(updated.guild_id, updated.user_id, winnings);
      db.prepare('UPDATE mine_games SET ended = 1 WHERE message_id = ?').run(messageId);
      const finalGame = db.prepare('SELECT * FROM mine_games WHERE message_id = ?').get(messageId);
      await interaction.update({
        embeds: [buildMineEmbed(finalGame, true, true)],
        components: buildMineRow(finalGame, true)
      });
      return;
    }

    await interaction.update({
      embeds: [buildMineEmbed(updated)],
      components: buildMineRow(updated)
    });
  }
}


db.exec(`
CREATE TABLE IF NOT EXISTS cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  last_used INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, type)
);
CREATE TABLE IF NOT EXISTS blackjack_games (
  message_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  bet INTEGER NOT NULL,
  player_total INTEGER NOT NULL,
  dealer_total INTEGER NOT NULL,
  ended INTEGER DEFAULT 0
);
`);

function getCooldown(guildId, userId, type) {
  return db.prepare('SELECT last_used FROM cooldowns WHERE guild_id = ? AND user_id = ? AND type = ?')
    .get(guildId, userId, type);
}

function setCooldown(guildId, userId, type) {
  db.prepare(`
    INSERT INTO cooldowns (guild_id, user_id, type, last_used)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, type) DO UPDATE SET last_used = excluded.last_used
  `).run(guildId, userId, type, Date.now());
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

async function handleDaily(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  const COOLDOWN = 24 * 60 * 60 * 1000;

  const cd = getCooldown(guildId, userId, 'daily');
  if (cd && Date.now() - cd.last_used < COOLDOWN) {
    const remaining = COOLDOWN - (Date.now() - cd.last_used);
    await message.reply(`⏳ You already claimed your daily. Come back in **${formatDuration(remaining)}**.`);
    return true;
  }

  const reward = Math.floor(Math.random() * 101) + 50;
  addBalance(guildId, userId, reward);
  setCooldown(guildId, userId, 'daily');

  await message.reply(`🎁 You claimed your daily reward of **${reward}** Neo Cash!`);
  return true;
}

const WORK_FLAVORS = [
  'You worked as a builder and earned',
  'You delivered packages around town and earned',
  'You helped at the market and earned',
  'You fixed some wires and earned',
  'You did some freelance coding and earned'
];

async function handleWork(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  const COOLDOWN = 60 * 60 * 1000;

  const cd = getCooldown(guildId, userId, 'work');
  if (cd && Date.now() - cd.last_used < COOLDOWN) {
    const remaining = COOLDOWN - (Date.now() - cd.last_used);
    await message.reply(`⏳ You're tired from working. Rest for **${formatDuration(remaining)}**.`);
    return true;
  }

  const reward = Math.floor(Math.random() * 61) + 20;
  const flavor = WORK_FLAVORS[Math.floor(Math.random() * WORK_FLAVORS.length)];
  addBalance(guildId, userId, reward);
  setCooldown(guildId, userId, 'work');

  await message.reply(`💼 ${flavor} **${reward}** Neo Cash!`);
  return true;
}

async function handleSlots(message) {
  const parts = message.content.trim().split(' ');
  const bet = parseInt(parts[parts.length - 1], 10);
  const guildId = message.guild.id;
  const userId = message.author.id;

  if (isNaN(bet) || bet <= 0) {
    await message.reply('❌ Usage: `Neo slots amount`');
    return true;
  }

  const bal = getBalance(guildId, userId);
  if (bet > bal) {
    await message.reply(`❌ You only have **${bal}** Neo Cash.`);
    return true;
  }

  setBalance(guildId, userId, bal - bet);

  const symbols = ['🍒', '🍋', '🍇', '💎', '7️⃣'];
  const reels = [
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)]
  ];

  let winnings = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    winnings = bet * 5;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    winnings = bet * 2;
  }

  if (winnings > 0) {
    addBalance(guildId, userId, winnings);
  }

  const resultLine = `[ ${reels.join(' | ')} ]`;

  if (winnings > 0) {
    await message.reply(`🎰 ${resultLine}\nYou won **${winnings}** Neo Cash!`);
  } else {
    await message.reply(`🎰 ${resultLine}\nYou lost **${bet}** Neo Cash. Better luck next time!`);
  }
  return true;
}

async function handleFlip(message) {
  const parts = message.content.trim().split(' ');
  const bet = parseInt(parts[2], 10);
  const choice = (parts[3] || '').toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;

  if (isNaN(bet) || bet <= 0 || !['heads', 'tails'].includes(choice)) {
    await message.reply('❌ Usage: `Neo flip amount heads` or `Neo flip amount tails`');
    return true;
  }

  const bal = getBalance(guildId, userId);
  if (bet > bal) {
    await message.reply(`❌ You only have **${bal}** Neo Cash.`);
    return true;
  }

  setBalance(guildId, userId, bal - bet);

  const result = Math.random() < 0.5 ? 'heads' : 'tails';

  if (result === choice) {
    const winnings = bet * 2;
    addBalance(guildId, userId, winnings);
    await message.reply(`🪙 It landed on **${result}**! You won **${winnings}** Neo Cash!`);
  } else {
    await message.reply(`🪙 It landed on **${result}**! You lost **${bet}** Neo Cash.`);
  }
  return true;
}

async function handleRob(message) {
  const target = message.mentions.users.first();
  const guildId = message.guild.id;
  const userId = message.author.id;

  if (!target) {
    await message.reply('❌ Usage: `Neo rob @user`');
    return true;
  }

  if (target.id === userId) {
    await message.reply('❌ You cannot rob yourself.');
    return true;
  }

  const COOLDOWN = 60 * 60 * 1000;
  const cd = getCooldown(guildId, userId, 'rob');
  if (cd && Date.now() - cd.last_used < COOLDOWN) {
    const remaining = COOLDOWN - (Date.now() - cd.last_used);
    await message.reply(`⏳ You need to lay low. Try again in **${formatDuration(remaining)}**.`);
    return true;
  }

  setCooldown(guildId, userId, 'rob');

  const targetBal = getBalance(guildId, target.id);
  const robberBal = getBalance(guildId, userId);

  if (targetBal < 20) {
    await message.reply(`❌ ${target.username} doesn't have enough Neo Cash to rob.`);
    return true;
  }

  const success = Math.random() < 0.4;

  if (success) {
    const stolen = Math.floor(targetBal * (0.1 + Math.random() * 0.2));
    setBalance(guildId, target.id, targetBal - stolen);
    addBalance(guildId, userId, stolen);
    await message.reply(`🦹 You successfully robbed **${stolen}** Neo Cash from ${target}!`);
  } else {
    const fine = Math.min(robberBal, Math.floor(Math.random() * 31) + 10);
    setBalance(guildId, userId, robberBal - fine);
    addBalance(guildId, target.id, fine);
    await message.reply(`🚓 You got caught! You paid **${fine}** Neo Cash to ${target} as a fine.`);
  }
  return true;
}


function drawCard() {
  return Math.floor(Math.random() * 10) + 1;
}

function buildBlackjackEmbed(game, finished = false, resultText = null) {
  let desc = `Bet: **${game.bet}** Neo Cash\n\nYour total: **${game.player_total}**\nDealer total: **${finished ? game.dealer_total : '?'}**`;

  if (finished && resultText) {
    desc += `\n\n${resultText}`;
  } else {
    desc += `\n\nHit to draw another card, or Stand to let the dealer play.`;
  }

  return new EmbedBuilder()
    .setTitle('🃏 Neo Blackjack')
    .setDescription(desc)
    .setColor(finished ? (resultText && resultText.includes('win') ? 0x00ff00 : 0xff0000) : 0xffd700);
}

function buildBlackjackRow(messageId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj:hit:${messageId}`).setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`bj:stand:${messageId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

async function handleBlackjack(message) {
  const parts = message.content.trim().split(' ');
  const bet = parseInt(parts[parts.length - 1], 10);
  const guildId = message.guild.id;
  const userId = message.author.id;

  if (isNaN(bet) || bet <= 0) {
    await message.reply('❌ Usage: `Neo blackjack amount`');
    return true;
  }

  const bal = getBalance(guildId, userId);
  if (bet > bal) {
    await message.reply(`❌ You only have **${bal}** Neo Cash.`);
    return true;
  }

  setBalance(guildId, userId, bal - bet);

  const playerTotal = drawCard() + drawCard();
  const dealerTotal = drawCard() + drawCard();

  const placeholder = new EmbedBuilder().setTitle('🃏 Neo Blackjack').setDescription('Dealing...');
  const msg = await message.channel.send({ embeds: [placeholder] });

  db.prepare(`
    INSERT INTO blackjack_games (message_id, user_id, guild_id, channel_id, bet, player_total, dealer_total, ended)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(msg.id, userId, guildId, message.channel.id, bet, playerTotal, dealerTotal);

  const game = db.prepare('SELECT * FROM blackjack_games WHERE message_id = ?').get(msg.id);

  if (playerTotal === 21) {
    return finishBlackjack(msg, game, true);
  }

  await msg.edit({ embeds: [buildBlackjackEmbed(game)], components: [buildBlackjackRow(msg.id)] });
  return true;
}

async function finishBlackjack(msg, game, forcedStand) {
  let dealerTotal = game.dealer_total;

  if (forcedStand !== true || game.player_total !== 21) {
    while (dealerTotal < 17) {
      dealerTotal += drawCard();
    }
  }

  let resultText;
  let winnings = 0;

  if (game.player_total > 21) {
    resultText = `💥 You busted! You lost **${game.bet}** Neo Cash.`;
  } else if (dealerTotal > 21) {
    winnings = game.bet * 2;
    resultText = `🎉 Dealer busted! You win **${winnings}** Neo Cash!`;
  } else if (game.player_total > dealerTotal) {
    winnings = game.bet * 2;
    resultText = `🎉 You win **${winnings}** Neo Cash!`;
  } else if (game.player_total === dealerTotal) {
    winnings = game.bet;
    resultText = `🤝 Push! Your **${game.bet}** Neo Cash was returned.`;
  } else {
    resultText = `😔 Dealer wins. You lost **${game.bet}** Neo Cash.`;
  }

  if (winnings > 0) {
    addBalance(game.guild_id, game.user_id, winnings);
  }

  db.prepare('UPDATE blackjack_games SET ended = 1, dealer_total = ? WHERE message_id = ?')
    .run(dealerTotal, game.message_id);

  const updated = db.prepare('SELECT * FROM blackjack_games WHERE message_id = ?').get(game.message_id);

  await msg.edit({
    embeds: [buildBlackjackEmbed(updated, true, resultText)],
    components: [buildBlackjackRow(game.message_id, true)]
  });
}

async function handleBlackjackButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const messageId = parts[2];

  const game = db.prepare('SELECT * FROM blackjack_games WHERE message_id = ?').get(messageId);

  if (!game || game.ended) {
    return interaction.reply({ content: '❌ This game has ended.', ephemeral: true });
  }

  if (interaction.user.id !== game.user_id) {
    return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });
  }

  const msg = interaction.message;

  if (action === 'stand') {
    await interaction.deferUpdate();
    return finishBlackjack(msg, game, false);
  }

  if (action === 'hit') {
    const newTotal = game.player_total + drawCard();
    db.prepare('UPDATE blackjack_games SET player_total = ? WHERE message_id = ?').run(newTotal, messageId);
    const updated = db.prepare('SELECT * FROM blackjack_games WHERE message_id = ?').get(messageId);

    if (newTotal >= 21) {
      await interaction.deferUpdate();
      return finishBlackjack(msg, updated, false);
    }

    await interaction.update({
      embeds: [buildBlackjackEmbed(updated)],
      components: [buildBlackjackRow(messageId)]
    });
  }
}

module.exports = {
  handleNeoChat,
  handleMineButton,
  handleBlackjackButton
};
