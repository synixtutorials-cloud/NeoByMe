require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const config = require('./config');
const tickets = require('./tickets');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites
  ]
});

const stamp = () =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date());

const embed = (title, description) =>
  new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x5865f2)
    .setTimestamp();

client.once(Events.ClientReady, async () => {
  console.log(`NeoByMe online as ${client.user.tag}`);
  client.user.setActivity('/help • NeoByMe', { type: 0 });
});

client.on(Events.InteractionCreate, async i => {
  try {
    // =========================
    // TICKET SELECT MENU
    // =========================
    if (i.isStringSelectMenu() && i.customId === 'ticket:create') {
      const type = i.values[0];

      if (!tickets.TYPES[type]) {
        return i.reply({
          content: '❌ Invalid ticket type.',
          ephemeral: true
        });
      }

      return tickets.createTicket(i, type);
    }

    // =========================
    // TICKET BUTTONS
    // =========================
    if (i.isButton() && i.customId.startsWith('ticket:')) {
      const action = i.customId.split(':')[1];

      if (action === 'claim')
        return tickets.claimTicket(i);

      if (action === 'close')
        return tickets.closeTicket(i);

      if (action === 'reopen')
        return tickets.reopenTicket(i);

      if (action === 'delete')
        return tickets.deleteTicket(i);

      return;
    }

    // =========================
    // SLASH COMMANDS
    // =========================
    if (!i.isChatInputCommand()) return;

    const n = i.commandName;

    // /ping
    if (n === 'ping') {
      return i.reply({
        embeds: [
          embed(
            '🏓 NeoByMe Pong!',
            `Latency: **${client.ws.ping}ms**`
          )
        ]
      });
    }

    // /help
    if (n === 'help') {
      return i.reply({
        embeds: [
          embed(
            '🤖 NeoByMe Help',
            [
              '**General**',
              '`/ping` — Check bot latency',
              '`/help` — Show this help',
              '`/announce` — Create an announcement',
              '',
              '**Tickets**',
              '`/ticket panel` — Send the ticket panel',
              '`/ticket transcript` — Save a ticket transcript',
              '',
              '**Giveaways**',
              '`/gcreate` — Create a giveaway'
            ].join('\n')
          )
        ]
      });
    }

    // =========================
    // /announce
    // =========================
    if (n === 'announce') {
      const message = i.options.getString('message', true);
      const channel = i.options.getChannel('channel') || i.channel;
      const title = i.options.getString('title') || '📢 Announcement';
      const color = i.options.getString('color') || '#5865F2';
      const ping = i.options.getBoolean('ping') || false;

      if (!channel || !channel.isTextBased()) {
        return i.reply({
          content: '❌ That channel cannot receive messages.',
          ephemeral: true
        });
      }

      const announcement = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message)
        .setColor(color)
        .setFooter({
          text: `NeoByMe • ${i.user.tag}`
        })
        .setTimestamp();

      await channel.send({
        content: ping ? '@everyone' : undefined,
        embeds: [announcement]
      });

      return i.reply({
        content: `✅ Announcement sent to ${channel}.`,
        ephemeral: true
      });
    }

    // =========================
    // /ticket
    // =========================
    if (n === 'ticket') {
      const sub = i.options.getSubcommand();

      if (sub === 'panel') {
        if (
          !i.memberPermissions?.has(
            PermissionsBitField.Flags.ManageChannels
          )
        ) {
          return i.reply({
            content: '❌ You need **Manage Channels** to use this.',
            ephemeral: true
          });
        }

        return i.reply({
          embeds: [tickets.panelEmbed()],
          components: [tickets.panelRow()]
        });
      }

      if (sub === 'transcript') {
        return tickets.transcript(i);
      }
    }

    // =========================
    // /gcreate
    // =========================
    if (n === 'gcreate') {
      const time = i.options.getString('time', true);
      const winners = i.options.getInteger('winners', true);
      const prize = i.options.getString('prize', true);
      const message =
        i.options.getString('message') ||
        'React with 🎉 to enter!';

      const ping = i.options.getBoolean('ping') || false;

      const giveawayEmbed = new EmbedBuilder()
        .setTitle('🎉 GIVEAWAY')
        .setDescription(
          `${message}\n\n🎁 **Prize:** ${prize}\n🏆 **Winners:** ${winners}\n⏱️ **Duration:** ${time}\n\nReact with 🎉 to enter!`
        )
        .setColor(0xffd700)
        .setFooter({
          text: `Hosted by ${i.user.tag}`
        })
        .setTimestamp();

      const msg = await i.channel.send({
        content: ping ? '@everyone' : undefined,
        embeds: [giveawayEmbed]
      });

      await msg.react('🎉');

      return i.reply({
        content: '✅ Giveaway created.',
        ephemeral: true
      });
    }
  } catch (err) {
    console.error('Interaction error:', err);

    if (!i.replied && !i.deferred) {
      await i.reply({
        content: '❌ Something went wrong while processing that command.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// =========================
// MESSAGE EVENTS
// =========================

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // Basic anti-link example
  const cfg = config || {};

  if (
    cfg.antilink &&
    /https?:\/\/|discord\.gg\//i.test(message.content)
  ) {
    if (
      message.member &&
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageMessages
      )
    ) {
      await message.delete().catch(() => {});
    }
  }
});

// =========================
// MEMBER EVENTS
// =========================

client.on(Events.GuildMemberAdd, async member => {
  console.log(`${member.user.tag} joined ${member.guild.name}`);
});

client.on(Events.GuildMemberRemove, async member => {
  console.log(`${member.user.tag} left ${member.guild.name}`);
});

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

client.login(process.env.DISCORD_TOKEN);
