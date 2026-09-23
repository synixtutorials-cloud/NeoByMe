const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { db } = require('./db');

/* =========================================================
   DATABASE
========================================================= */

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

/* =========================================================
   CONFIG
========================================================= */

const TYPES = {
  support: {
    label: 'Support',
    emoji: '🛠️',
    description: 'Get help with something'
  },

  report: {
    label: 'Report',
    emoji: '🚨',
    description: 'Report a player or problem'
  },

  staff: {
    label: 'Staff Application',
    emoji: '👮',
    description: 'Apply for staff'
  },

  partnership: {
    label: 'Partnership',
    emoji: '🤝',
    description: 'Partnership requests'
  }
};

/* =========================================================
   HELPERS
========================================================= */

function getTicket(channelId) {
  return db
    .prepare('SELECT * FROM tickets WHERE channel_id = ?')
    .get(channelId);
}

function getOpenTicket(guildId, userId) {
  return db
    .prepare(`
      SELECT *
      FROM tickets
      WHERE guild_id = ?
        AND user_id = ?
        AND closed = 0
      LIMIT 1
    `)
    .get(guildId, userId);
}

function updateTicket(channelId, data) {
  const fields = Object.keys(data);

  if (!fields.length) return;

  const set = fields.map(field => `${field} = ?`).join(', ');
  const values = fields.map(field => data[field]);

  db.prepare(`
    UPDATE tickets
    SET ${set}
    WHERE channel_id = ?
  `).run(...values, channelId);
}

function isStaff(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageChannels
  );
}

function channelUrl(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function safeChannelName(type, username) {
  const cleanUser = String(username)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 55);

  return `${type}-${cleanUser || 'user'}`.slice(0, 90);
}

/* =========================================================
   TICKET PANEL
========================================================= */

function panelEmbed() {
  return new EmbedBuilder()
    .setTitle('🎫 NeoByMe Support')
    .setDescription(
      [
        'Need help? Open a ticket below.',
        '',
        '🛠️ **Support** — General help',
        '🚨 **Report** — Report a player/problem',
        '👮 **Staff Application** — Apply for staff',
        '🤝 **Partnership** — Partnership requests',
        '',
        'Please choose the option that matches your request.'
      ].join('\n')
    )
    .setColor(0x5865f2)
    .setFooter({
      text: 'NeoByMe • Ticket System'
    });
}

function panelRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:create')
    .setPlaceholder('🎫 Choose a ticket type...')
    .addOptions(
      Object.entries(TYPES).map(([value, config]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(config.label)
          .setDescription(config.description)
          .setValue(value)
          .setEmoji(config.emoji)
      )
    );

  return new ActionRowBuilder().addComponents(menu);
}

/* =========================================================
   TICKET BUTTONS
========================================================= */

function ticketButtons(ticket) {
  const row = new ActionRowBuilder();

  if (ticket.closed) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:reopen')
        .setLabel('Reopen Ticket')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('ticket:transcript')
        .setLabel('Transcript')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('ticket:delete')
        .setLabel('Delete Ticket')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:claim')
        .setLabel(ticket.claimed_by ? 'Claimed' : 'Claim Ticket')
        .setEmoji('🙋')
        .setStyle(
          ticket.claimed_by
            ? ButtonStyle.Secondary
            : ButtonStyle.Primary
        )
        .setDisabled(Boolean(ticket.claimed_by)),

      new ButtonBuilder()
        .setCustomId('ticket:close')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('ticket:transcript')
        .setLabel('Transcript')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('ticket:add')
        .setLabel('Add Member')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return row;
}

/* =========================================================
   CREATE TICKET
========================================================= */

async function createTicket(interaction, type) {
  try {
    const config = TYPES[type];

    if (!config) {
      return interaction.reply({
        content: '❌ Invalid ticket type.',
        ephemeral: true
      });
    }

    const existing = getOpenTicket(
      interaction.guild.id,
      interaction.user.id
    );

    if (existing) {
      const existingChannel =
        await interaction.guild.channels
          .fetch(existing.channel_id)
          .catch(() => null);

      if (existingChannel) {
        return interaction.reply({
          content:
            `❌ You already have an open ticket.\n\n` +
            `**#${existingChannel.name}**\n` +
            `${channelUrl(interaction.guild.id, existingChannel.id)}`,
          ephemeral: true
        });
      }

      // Channel was deleted manually.
      updateTicket(existing.channel_id, {
        closed: 1
      });
    }

    await interaction.deferReply({
      ephemeral: true
    });

    /* -----------------------------------------------------
       FIND CATEGORY
    ----------------------------------------------------- */

    const FIXED_CATEGORY_ID = '1545833387372314715';

    let category = interaction.guild.channels.cache.get(FIXED_CATEGORY_ID);

    let __unused =
      interaction.guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildCategory &&
          ['tickets', 'support'].includes(
            channel.name.toLowerCase()
          )
      );

    if (!category) {
      category = await interaction.guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory
      });
    }

    /* -----------------------------------------------------
       CREATE CHANNEL
    ----------------------------------------------------- */

    const channel = await interaction.guild.channels.create({
      name: safeChannelName(
        type,
        interaction.user.username
      ),

      type: ChannelType.GuildText,

      parent: category.id,

      topic:
        `${config.label} ticket • Owner: ` +
        `${interaction.user.id}`,

      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [
            PermissionFlagsBits.ViewChannel
          ]
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
          id: interaction.client.user.id,
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

    /* -----------------------------------------------------
       PERMISSION DEBUG
    ----------------------------------------------------- */

    try {
      const me = interaction.guild.members.me;
      const creator = await interaction.guild.members.fetch(interaction.user.id);

      console.log('===== TICKET PERMISSION DEBUG =====');
      console.log({
        channelId: channel.id,
        channelName: channel.name,
        creatorId: creator.id,
        creatorName: creator.user.tag,
        canView: channel.permissionsFor(creator)?.has(PermissionFlagsBits.ViewChannel),
        canSend: channel.permissionsFor(creator)?.has(PermissionFlagsBits.SendMessages),
        botCanView: channel.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel),
        botCanSend: channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages),
        overwrites: channel.permissionOverwrites.cache.map(o => ({
          id: o.id,
          type: o.type,
          allow: o.allow.bitfield.toString(),
          deny: o.deny.bitfield.toString()
        }))
      });
      console.log('===================================');
    } catch (debugError) {
      console.error('PERMISSION DEBUG ERROR:', debugError);
    }

    /* -----------------------------------------------------
       DATABASE
    ----------------------------------------------------- */

    db.prepare(`
      INSERT INTO tickets
      (
        channel_id,
        guild_id,
        user_id,
        type,
        claimed_by,
        closed,
        created_at
      )
      VALUES (?, ?, ?, ?, NULL, 0, ?)
    `).run(
      channel.id,
      interaction.guild.id,
      interaction.user.id,
      type,
      Date.now()
    );

    const ticket = getTicket(channel.id);

    /* -----------------------------------------------------
       EMBED
    ----------------------------------------------------- */

    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.label} Ticket`)
      .setDescription(
        [
          `Welcome ${interaction.user}!`,
          '',
          `**Ticket Type:** ${config.label}`,
          `**Created By:** ${interaction.user}`,
          '',
          'Please describe your issue clearly.',
          'A staff member will assist you shortly.'
        ].join('\n')
      )
      .setColor(0x5865f2)
      .setTimestamp()
      .setFooter({
        text: 'NeoByMe Ticket System'
      });

    await channel.send({
      content: `${interaction.user}`,
      embeds: [embed],
      components: [ticketButtons(ticket)]
    });




    await new Promise(resolve => setTimeout(resolve, 2000));

    await interaction.editReply({
      content:
        `✅ Your ticket has been created:\n\n` +
        `**#${channel.name}**\n` +
        `${channelUrl(interaction.guild.id, channel.id)}`
    });

  } catch (error) {
    console.error('CREATE TICKET ERROR:', error);

    const message =
      '❌ I could not create your ticket. Please contact staff.';

    if (interaction.deferred) {
      await interaction.editReply({
        content: message
      }).catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({
        content: message,
        ephemeral: true
      }).catch(() => {});
    }
  }
}

/* =========================================================
   CLAIM
========================================================= */

async function claimTicket(interaction) {
  try {
    if (!isStaff(interaction)) {
      return interaction.reply({
        content:
          '❌ Only staff members can claim tickets.',
        ephemeral: true
      });
    }

    const ticket = getTicket(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({
        content: '❌ This is not a valid ticket channel.',
        ephemeral: true
      });
    }

    if (ticket.closed) {
      return interaction.reply({
        content: '❌ This ticket is closed.',
        ephemeral: true
      });
    }

    if (ticket.claimed_by) {
      return interaction.reply({
        content: '❌ This ticket has already been claimed.',
        ephemeral: true
      });
    }

    updateTicket(interaction.channel.id, {
      claimed_by: interaction.user.id
    });

    const updated = getTicket(interaction.channel.id);

    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `🙋 **${interaction.user}** claimed this ticket.`
          )
          .setColor(0x57f287)
          .setTimestamp()
      ]
    });

    await interaction.message.edit({
      components: [ticketButtons(updated)]
    });

    return interaction.reply({
      content: '✅ Ticket claimed.',
      ephemeral: true
    });

  } catch (error) {
    console.error('CLAIM TICKET ERROR:', error);
  }
}

/* =========================================================
   CLOSE
========================================================= */

async function closeTicket(interaction) {
  try {
    const ticket = getTicket(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({
        content: '❌ This is not a ticket channel.',
        ephemeral: true
      });
    }

    const allowed =
      ticket.user_id === interaction.user.id ||
      isStaff(interaction);

    if (!allowed) {
      return interaction.reply({
        content:
          '❌ Only the ticket owner or staff can close this ticket.',
        ephemeral: true
      });
    }

    if (ticket.closed) {
      return interaction.reply({
        content: '❌ This ticket is already closed.',
        ephemeral: true
      });
    }

    updateTicket(interaction.channel.id, {
      closed: 1
    });

    await interaction.channel.permissionOverwrites.edit(
      ticket.user_id,
      {
        SendMessages: false
      }
    );

    await interaction.channel.setName(
      `closed-${interaction.channel.name}`
        .replace(/^closed-/, '')
        .slice(0, 90)
    );

    const updated = getTicket(interaction.channel.id);

    await interaction.message.edit({
      components: [ticketButtons(updated)]
    });

    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔒 Ticket Closed')
          .setDescription(
            `This ticket was closed by ${interaction.user}.\n\n` +
            `Staff can reopen or delete it.`
          )
          .setColor(0xed4245)
          .setTimestamp()
      ]
    });

    return interaction.reply({
      content: '🔒 Ticket closed.',
      ephemeral: true
    });

  } catch (error) {
    console.error('CLOSE TICKET ERROR:', error);
  }
}

/* =========================================================
   REOPEN
========================================================= */

async function reopenTicket(interaction) {
  try {
    if (!isStaff(interaction)) {
      return interaction.reply({
        content:
          '❌ Only staff members can reopen tickets.',
        ephemeral: true
      });
    }

    const ticket = getTicket(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({
        content: '❌ This is not a ticket channel.',
        ephemeral: true
      });
    }

    if (!ticket.closed) {
      return interaction.reply({
        content: '❌ This ticket is already open.',
        ephemeral: true
      });
    }

    updateTicket(interaction.channel.id, {
      closed: 0
    });

    await interaction.channel.permissionOverwrites.edit(
      ticket.user_id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
      }
    );

    await interaction.channel.setName(
      interaction.channel.name
        .replace(/^closed-/, '')
        .slice(0, 90)
    );

    const updated = getTicket(interaction.channel.id);

    await interaction.message.edit({
      components: [ticketButtons(updated)]
    });

    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔓 Ticket Reopened')
          .setDescription(
            `This ticket was reopened by ${interaction.user}.`
          )
          .setColor(0x57f287)
          .setTimestamp()
      ]
    });

    return interaction.reply({
      content: '🔓 Ticket reopened.',
      ephemeral: true
    });

  } catch (error) {
    console.error('REOPEN TICKET ERROR:', error);
  }
}

/* =========================================================
   TRANSCRIPT
========================================================= */

async function transcript(interaction) {
  try {
    if (!isStaff(interaction)) {
      return interaction.reply({
        content:
          '❌ Only staff members can create transcripts.',
        ephemeral: true
      });
    }

    await interaction.deferReply({
      ephemeral: true
    });

    const messages =
      await interaction.channel.messages.fetch({
        limit: 100
      });

    const sorted = [...messages.values()]
      .sort(
        (a, b) =>
          a.createdTimestamp - b.createdTimestamp
      );

    const lines = [
      `NeoByMe Ticket Transcript`,
      `Channel: ${interaction.channel.name}`,
      `Channel ID: ${interaction.channel.id}`,
      `Created: ${new Date().toISOString()}`,
      '',
      '==================================================',
      ''
    ];

    for (const message of sorted) {
      const time =
        new Date(message.createdTimestamp)
          .toISOString();

      const content =
        message.content ||
        '[Attachment/Embed/No text]';

      lines.push(
        `[${time}] ${message.author.tag}: ${content}`
      );
    }

    const buffer = Buffer.from(
      lines.join('\n'),
      'utf8'
    );

    const file = new AttachmentBuilder(
      buffer,
      {
        name:
          `${interaction.channel.name}-transcript.txt`
      }
    );

    return interaction.editReply({
      content: '📜 Transcript generated.',
      files: [file]
    });

  } catch (error) {
    console.error('TRANSCRIPT ERROR:', error);

    if (interaction.deferred) {
      return interaction.editReply({
        content:
          '❌ Failed to generate transcript.'
      }).catch(() => {});
    }
  }
}

/* =========================================================
   DELETE
========================================================= */

async function deleteTicket(interaction) {
  try {
    if (!isStaff(interaction)) {
      return interaction.reply({
        content:
          '❌ Only staff members can delete tickets.',
        ephemeral: true
      });
    }

    const ticket = getTicket(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({
        content: '❌ This is not a ticket channel.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '🗑️ Deleting ticket...'
    });

    db.prepare(
      'DELETE FROM tickets WHERE channel_id = ?'
    ).run(interaction.channel.id);

    setTimeout(() => {
      interaction.channel.delete(
        'Ticket deleted'
      ).catch(error =>
        console.error(
          'DELETE CHANNEL ERROR:',
          error
        )
      );
    }, 1500);

  } catch (error) {
    console.error('DELETE TICKET ERROR:', error);
  }
}

/* =========================================================
   ADD MEMBER
========================================================= */

async function addMember(interaction) {
  try {
    const ticket = getTicket(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({
        content: '❌ This is not a ticket channel.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('ticket:add_modal')
      .setTitle('Add Member');

    const input = new TextInputBuilder()
      .setCustomId('member')
      .setLabel('User ID or @mention')
      .setPlaceholder('Example: 123456789012345678')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(30);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);

  } catch (error) {
    console.error('ADD MEMBER ERROR:', error);
  }
}

/* =========================================================
   ADD MEMBER MODAL
========================================================= */

async function addMemberModal(interaction) {
  try {
    const ticket = getTicket(interaction.channel.id);

    if (!ticket) {
      return interaction.reply({
        content: '❌ This is not a ticket channel.',
        ephemeral: true
      });
    }

    const value =
      interaction.fields
        .getTextInputValue('member')
        .trim()
        .replace(/[<@!>]/g, '');

    if (!/^\d{15,25}$/.test(value)) {
      return interaction.reply({
        content:
          '❌ Please enter a valid Discord user ID or mention.',
        ephemeral: true
      });
    }

    const member =
      await interaction.guild.members
        .fetch(value)

      await interaction.reply({
        content:
          `❌ Failed to find that member.`,
        ephemeral: true
      });

  } catch (error) {
    console.error('ADD MEMBER MODAL ERROR:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Failed to add that member.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}

/* =========================================================
   BUTTON ROUTER
========================================================= */

async function handleButton(interaction) {
  switch (interaction.customId) {
    case 'ticket:claim':
      return claimTicket(interaction);

    case 'ticket:close':
      return closeTicket(interaction);

    case 'ticket:reopen':
      return reopenTicket(interaction);

    case 'ticket:transcript':
      return transcript(interaction);

    case 'ticket:delete':
      return deleteTicket(interaction);

    case 'ticket:add':
      return addMember(interaction);

    default:
      return;
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  TYPES,
  panelEmbed,
  panelRow,
  createTicket,
  claimTicket,
  closeTicket,
  reopenTicket,
  transcript,
  deleteTicket,
  addMember,
  addMemberModal,
  handleButton
};
