async function findEmoji(guild, name) {
  const cleanName = name.replace(/:/g, '').trim();
  return guild.emojis.cache.find(e => e.name.toLowerCase() === cleanName.toLowerCase());
}

async function reactCommand(interaction) {
  const emojiName = interaction.options.getString('emoji', true);
  const messageLink = interaction.options.getString('message');

  let targetMessage;

  if (messageLink) {
    const idMatch = messageLink.match(/(\d{15,25})$/);
    if (!idMatch) {
      return interaction.reply({ content: '❌ Invalid message link or ID.', ephemeral: true });
    }
    targetMessage = await interaction.channel.messages.fetch(idMatch[1]).catch(() => null);
  } else {
    const messages = await interaction.channel.messages.fetch({ limit: 2 });
    targetMessage = messages.filter(m => m.id !== interaction.id).first();
  }

  if (!targetMessage) {
    return interaction.reply({ content: '❌ Could not find a message to react to.', ephemeral: true });
  }

  const emoji = await findEmoji(interaction.guild, emojiName);

  try {
    if (emoji) {
      await targetMessage.react(emoji);
    } else {
      await targetMessage.react(emojiName);
    }
    return interaction.reply({ content: `✅ Reacted with ${emoji ? emoji.toString() : emojiName}.`, ephemeral: true });
  } catch (err) {
    return interaction.reply({ content: `❌ Could not react. Make sure the emoji name or unicode emoji is valid.`, ephemeral: true });
  }
}

async function emojiCommand(interaction) {
  const name = interaction.options.getString('name', true);

  const emoji = await findEmoji(interaction.guild, name);

  if (!emoji) {
    return interaction.reply({ content: `❌ No custom emoji named **${name}** found in this server.`, ephemeral: true });
  }

  const code = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;

  return interaction.reply({ content: `\`${code}\``, ephemeral: true });
}

module.exports = {
  reactCommand,
  emojiCommand
};
