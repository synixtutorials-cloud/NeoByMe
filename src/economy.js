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

module.exports = {
  handleNeoChat,
  handleMineButton
};
