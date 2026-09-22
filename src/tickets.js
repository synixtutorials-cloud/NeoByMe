const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');

const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  claimed_by TEXT DEFAULT NULL,
  closed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

const TYPES = {
  support: {
    label: 'Support',
    emoji: '🛠️',
    description: 'Get help with NeoByMe or the server.',
    color: 0x5865F2
  },
  report: {
    label: 'Report',
    emoji: '🚨',
    description: 'Report a player or server issue.',
    color: 0xED4245
  },
  staff: {
    label: 'Staff Application',
    emoji: '📋',
    description: 'Apply to become a member of the staff team.',
    color: 0x57F287
  },
  partnership: {
    label: 'Partnership',
    emoji: '🤝',
    description: 'Business and server partnership requests.',
    color: 0xFEE75C
  }
};

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎫 NeoByMe Support Center')
    .setDescription(
      'Welcome to the official support center.\n\n' +
      'Select the category that best matches your request below.\n\n' +
      '🛠️ **Support** — General help\n' +
      '🚨 **Report** — Report an issue or user\n' +
      '📋 **Staff Application** — Apply for staff\n' +
      '🤝 **Partnership** — Partnership requests'
    )
    .setFooter({ text: 'NeoByMe • Please do not abuse the ticket system' })
    .setTimestamp();
}

function panelRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:create')
    .setPlaceholder('🎫 Select a ticket category...')
    .addOptions(
      Object.entries(TYPES).map(([value, data]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(data.label)
          .setDescription(data.description)
          .setValue(value)
          .setEmoji(data.emoji)
      )
    );

  return new ActionRowBuilder().addComponents(menu);
}

function ticketButtons(claimed = false, closed = false) {
  const row = new ActionRowBuilder();

  if (!closed) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:claim')
        .setLabel(claimed ? 'Claimed' : 'Claim')
        .setEmoji('🙋')
        .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(claimed),

      new ButtonBuilder()
        .setCustomId('ticket:close')
        .setLabel('Close')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:reopen')
        .setLabel('Reopen')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('ticket:delete')
        .setLabel('Delete')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:add')
      .setLabel('Add Member')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Secondary)
  );

  return row;
}

function getTicket(channelId) {
  return db.prepare(
    'SELECT * FROM tickets WHERE channel_id=?'
  ).get(channelId);
}

function getUserOpenTicket(guildId, userId) {
  return db.prepare(
    'SELECT * FROM tickets WHERE guild_id=? AND user_id=? AND closed=0'
  ).get(guildId, userId);
}

function createTicket(data) {
  db.prepare(`
    INSERT INTO tickets
    (channel_id,guild_id,user_id,type,created_at)
    VALUES (?,?,?,?,?)
  `).run(
    data.channelId,
    data.guildId,
    data.userId,
    data.type,
    Date.now()
  );
}

function updateTicket(channelId, values) {
  const fields = Object.keys(values);
  const sql = `
    UPDATE tickets
    SET ${fields.map(x => `${x}=?`).join(',')}
    WHERE channel_id=?
  `;

  db.prepare(sql).run(
    ...fields.map(x => values[x]),
    channelId
  );
}

async function createTicket(interaction, type) {
  const config = TYPES[type];

  if (!config) {
    return interaction.reply({
      content: '❌ Invalid ticket category.',
      ephemeral: true
    });
  }

  const existing = getUserOpenTicket(
    interaction.guild.id,
    interaction.user.id
  );

  if (existing) {
    const channel = await interaction.guild.channels.fetch(existing.channel_id).catch(() => null);

    if (channel) {
      return interaction.reply({
        content: `❌ You already have an open ticket: ${channel}`,
        ephemeral: true
      });
    }

    updateTicket(existing.channel_id, { closed: 1 });
  }

  await interaction.deferReply({ ephemeral: true });

  let category = interaction.guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildCategory &&
      c.name.toLowerCase() === 'tickets'
  );

  if (!category) {
    category = await interaction.guild.channels.create({
      name: 'Tickets',
      type: ChannelType.GuildCategory
    });
  }

  const safeName =
    `${config.label}-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 80);

  const channel = await interaction.guild.channels.create({
    name: safeName || `ticket-${interaction.user.id}`,
    type: ChannelType.GuildText,
    topic: `${config.label} ticket • ${interaction.user.id}`,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: interaction.guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles
        ]
      }
    ]
  });

  db.prepare("INSERT INTO tickets (channel_id, guild_id, user_id, type, closed, claimed_by, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?)").run(channel.id, interaction.guild.id, interaction.user.id, type, Date.now());

  const checkPerms = channel.permissionsFor(interaction.user.id);
  console.log("TICKET ACCESS CHECK:", {
    channelId: channel.id,
    userId: interaction.user.id,
    canView: checkPerms?.has(PermissionFlagsBits.ViewChannel),
    canSend: checkPerms?.has(PermissionFlagsBits.SendMessages),
    overwrites: channel.permissionOverwrites.cache.map(o => ({
      id: o.id,
      allow: o.allow.bitfield.toString(),
      deny: o.deny.bitfield.toString()
    }))
  });

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(`${config.emoji} ${config.label}`)
    .setDescription(
      `Welcome ${interaction.user}!\n\n` +
      `Thank you for contacting **NeoByMe Support**.\n\n` +
      `A staff member will assist you shortly.\n\n` +
      `**Ticket Information**\n` +
      `> Category: **${config.label}**\n` +
      `> Created by: ${interaction.user}\n\n` +
      `Please explain your request clearly and provide any relevant information.`
    )
    .setFooter({ text: 'NeoByMe Ticket System' })
    .setTimestamp();

  await channel.send({
    content: `${interaction.user}`,
    embeds: [embed],
    components: [ticketButtons()]
  });

  await interaction.followUp({ content: `✅ Your ticket has been created: <#${channel.id}>`, ephemeral: true }).catch(() => {});
}

async function claimTicket(interaction) {
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({
      content: '❌ This is not a NeoByMe ticket.',
      ephemeral: true
    });
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: '❌ You need Manage Channels to claim tickets.',
      ephemeral: true
    });
  }

  if (ticket.claimed_by) {
    return interaction.reply({
      content: '❌ This ticket is already claimed.',
      ephemeral: true
    });
  }

  updateTicket(interaction.channel.id, {
    claimed_by: interaction.user.id
  });

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`🙋 **${interaction.user}** has claimed this ticket.`)
        .setTimestamp()
    ]
  });

  return interaction.update({
    components: [ticketButtons(true, false)]
  });
}

async function closeTicket(interaction) {
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({
      content: '❌ This is not a NeoByMe ticket.',
      ephemeral: true
    });
  }

  if (
    interaction.user.id !== ticket.user_id &&
    !interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return interaction.reply({
      content: '❌ You cannot close this ticket.',
      ephemeral: true
    });
  }

  updateTicket(interaction.channel.id, { closed: 1 });

  await interaction.channel.permissionOverwrites.edit(
    ticket.user_id,
    {
      SendMessages: false
    }
  ).catch(() => {});

  await interaction.channel.setName(
    `closed-${interaction.channel.name.replace(/^closed-/, '').slice(0, 80)}`
  ).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🔒 Ticket Closed')
    .setDescription(
      `This ticket has been closed by ${interaction.user}.\n\n` +
      `Use **Reopen** if the conversation needs to continue.`
    )
    .setTimestamp();

  return interaction.update({
    embeds: [embed],
    components: [ticketButtons(false, true)]
  });
}

async function reopenTicket(interaction) {
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({
      content: '❌ This is not a NeoByMe ticket.',
      ephemeral: true
    });
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: '❌ You need Manage Channels to reopen tickets.',
      ephemeral: true
    });
  }

  updateTicket(interaction.channel.id, { closed: 0 });

  await interaction.channel.permissionOverwrites.edit(
    ticket.user_id,
    {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }
  ).catch(() => {});

  await interaction.channel.setName(
    interaction.channel.name.replace(/^closed-/, '').slice(0, 100)
  ).catch(() => {});

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🔓 Ticket Reopened')
        .setDescription(`This ticket was reopened by ${interaction.user}.`)
        .setTimestamp()
    ],
    components: [ticketButtons(!!ticket.claimed_by, false)]
  });
}

async function deleteTicket(interaction) {
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({
      content: '❌ This is not a NeoByMe ticket.',
      ephemeral: true
    });
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: '❌ You need Manage Channels to delete tickets.',
      ephemeral: true
    });
  }

  await interaction.reply({
    content: '🗑️ Deleting this ticket...'
  });

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 1500);
}

async function addMember(interaction) {
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({
      content: '❌ This is not a NeoByMe ticket.',
      ephemeral: true
    });
  }

  return interaction.reply({
    content: 'Use the ticket management command `/ticket add` to add a member.',
    ephemeral: true
  });
}

async function transcript(interaction) {
  const ticket = getTicket(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({
      content: '❌ This is not a NeoByMe ticket.',
      ephemeral: true
    });
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: '❌ You need Manage Channels to create transcripts.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const messages = await interaction.channel.messages.fetch({ limit: 100 });

  const sorted = [...messages.values()].reverse();

  const text = sorted.map(m => {
    const time = new Date(m.createdTimestamp).toISOString();
    return `[${time}] ${m.author.tag}: ${m.content || '[attachment/embed]'}`;
  }).join('\n');

  const file = new AttachmentBuilder(
    Buffer.from(text || 'No messages found.', 'utf8'),
    { name: `ticket-${interaction.channel.id}.txt` }
  );

  return interaction.editReply({
    content: '📜 Ticket transcript:',
    files: [file]
  });
}

module.exports = {
  TYPES,
  panelEmbed,
  panelRow,
  createTicket,
  claimTicket,
  closeTicket,
  reopenTicket,
  deleteTicket,
  addMember,
  transcript
};
