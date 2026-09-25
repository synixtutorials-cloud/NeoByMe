const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = [

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check NeoByMe latency'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show NeoByMe commands'),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Create an announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
    .addStringOption(o =>
      o.setName('message')
        .setDescription('Announcement message')
        .setRequired(true)
    )
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Announcement channel')
    )
    .addStringOption(o =>
      o.setName('title')
        .setDescription('Announcement title')
    )
    .addStringOption(o =>
      o.setName('color')
        .setDescription('Hex color such as #5865F2')
    )
    .addBooleanOption(o =>
      o.setName('ping')
        .setDescription('Ping everyone')
    ),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the NeoByMe ticket system')
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Send the ticket selection panel')
    )
    .addSubcommand(sub =>
      sub
        .setName('transcript')
        .setDescription('Create a ticket transcript')
    ),

  new SlashCommandBuilder()
    .setName('gcreate')
    .setDescription('Create a giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addStringOption(o =>
      o.setName('time')
        .setDescription('Duration such as 10m, 1h or 2d')
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('winners')
        .setDescription('Number of winners')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('prize')
        .setDescription('Giveaway prize')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('message')
        .setDescription('Optional giveaway message')
    )
    .addBooleanOption(o =>
      o.setName('ping')
        .setDescription('Ping winners')
    )
,

  new SlashCommandBuilder()
    .setName('gend')
    .setDescription('End the latest active giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName('gstart')
    .setDescription('Choose the winner before time ends')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName('greroll')
    .setDescription('Reroll the winner of the latest giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName('gwinner')
    .setDescription('Manually select a winner')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addUserOption(o =>
      o.setName('username')
        .setDescription('User to select as winner')
        .setRequired(true)
    )

,

  new SlashCommandBuilder()
    .setName('count')
    .setDescription('Counting game setup')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Set up the counting channel')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Channel where counting happens')
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName('start')
            .setDescription('Starting number (default 1)')
        )
        .addStringOption(o =>
          o.setName('message')
            .setDescription('Custom reset message. Use {user} and {number}')
        )
    )
,

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Poll commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a poll')
        .addStringOption(o => o.setName('title').setDescription('Poll title').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Channel to post the poll').setRequired(true))
        .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
        .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
        .addStringOption(o => o.setName('option3').setDescription('Option 3'))
        .addStringOption(o => o.setName('option4').setDescription('Option 4'))
        .addStringOption(o => o.setName('option5').setDescription('Option 5'))
        .addStringOption(o => o.setName('time').setDescription('Optional duration such as 10m, 1h, 2d'))
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('End the latest poll')
    )
    .addSubcommand(sub =>
      sub.setName('result')
        .setDescription('Show the latest poll result')
    )
,

  new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Autorole management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a role to be auto-given to new members')
        .addRoleOption(o => o.setName('role').setDescription('Role to auto-assign').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add-all')
        .setDescription('Add a role to all current members and set it as autorole')
        .addRoleOption(o => o.setName('role').setDescription('Role to add to everyone').setRequired(true))
    )
,

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Welcome message management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Set up the welcome message')
        .addChannelOption(o => o.setName('channel').setDescription('Channel for welcome messages').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Message. Use {user} {username} {server} {membercount}'))
        .addBooleanOption(o => o.setName('ping').setDescription('Ping the user who joined'))
        .addStringOption(o => o.setName('image').setDescription('Banner image URL'))
    )
    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('Send a test welcome message')
    )
,

  new SlashCommandBuilder()
    .setName('level')
    .setDescription('Leveling system settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(sub =>
      sub.setName('setchannel')
        .setDescription('Set the channel for level-up announcements')
        .addChannelOption(o => o.setName('channel').setDescription('Channel for level-up messages').setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your or another user rank')
    .addUserOption(o => o.setName('user').setDescription('User to check')),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the server leaderboard')
,

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('View info about yourself or another member')
    .addUserOption(o => o.setName('user').setDescription('User to view info about')),

  new SlashCommandBuilder()
    .setName('i')
    .setDescription('View info about yourself or another member (shorthand)')
    .addUserOption(o => o.setName('user').setDescription('User to view info about'))
,

  new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Anti-nuke settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Exempt a user or role from anti-nuke detection')
        .addUserOption(o => o.setName('user').setDescription('User to exempt'))
        .addRoleOption(o => o.setName('role').setDescription('Role to exempt'))
    )
];
