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

];
