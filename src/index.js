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
const giveaways = require('./giveaways');
const counting = require('./counting');
const polls = require('./polls');

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
  console.log('Bot is in these servers:');
  client.guilds.cache.forEach(g => console.log(`  - ${g.name} (ID: ${g.id})`));
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
    // TICKET MODAL
    // =========================
    if (i.isModalSubmit() && i.customId === 'ticket:add_modal') {
      return tickets.addMemberModal(i);
    }

    // =========================
    // TICKET BUTTONS
    // =========================
    if (i.isButton() && i.customId.startsWith('giveaway:enter:')) {
      return giveaways.enterGiveaway(i);
    }

    if (i.isButton() && i.customId.startsWith('poll:vote:')) {
      return polls.votePoll(i);
    }

    if (i.isButton() && i.customId.startsWith('ticket:')) {
      return tickets.handleButton(i);
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
    if (n === 'gcreate') return giveaways.createGiveaway(i);
    if (n === 'gend') return giveaways.gend(i);
    if (n === 'gstart') return giveaways.gstart(i);
    if (n === 'greroll') return giveaways.greroll(i);
    if (n === 'gwinner') return giveaways.gwinner(i);
    if (n === 'count' && i.options.getSubcommand() === 'setup') return counting.setupCounting(i);
    if (n === 'poll' && i.options.getSubcommand() === 'create') return polls.createPoll(i);
    if (n === 'poll' && i.options.getSubcommand() === 'end') return polls.pollEnd(i);
    if (n === 'poll' && i.options.getSubcommand() === 'result') return polls.pollResult(i);
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
  await counting.handleCountingMessage(message);


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
