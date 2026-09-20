const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [

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
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('The announcement message')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where the announcement will be sent')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('title')
        .setDescription('Optional announcement title')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('color')
        .setDescription('Optional hex color, e.g. #5865F2')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('ping')
        .setDescription('Ping @everyone')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket system')
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Create a ticket panel')
    ),

  new SlashCommandBuilder()
    .setName('gcreate')
    .setDescription('Create a giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addStringOption(option =>
      option
        .setName('time')
        .setDescription('Duration, e.g. 10m, 1h, 2d')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('winners')
        .setDescription('Number of winners')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('prize')
        .setDescription('Giveaway prize')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Optional giveaway message')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('ping')
        .setDescription('Ping winners when the giveaway ends')
        .setRequired(false)
    )

];

module.exports = commands;
