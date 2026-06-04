const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const axios = require('axios');
const PixivR18CacheManager = require('../cache/r18-cache-manager');
const tlog = require('../../../shared/logging/tfd-logger');

function buildPaginationButtons(artworkId, currentPage, totalImages) {
    const isFirstPage = currentPage === 0;
    const isLastPage = currentPage === totalImages - 1;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pixivr18_first_${artworkId}_0`)
            .setLabel('First')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isFirstPage),
        new ButtonBuilder()
            .setCustomId(`pixivr18_prev_${artworkId}_${Math.max(0, currentPage - 1)}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isFirstPage),
        new ButtonBuilder()
            .setCustomId(`pixivr18_next_${artworkId}_${Math.min(totalImages - 1, currentPage + 1)}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isLastPage),
        new ButtonBuilder()
            .setCustomId(`pixivr18_last_${artworkId}_${totalImages - 1}`)
            .setLabel('Last')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isLastPage)
    );
}

function isBotManagedMessage(interaction, msg) {
    return msg.webhookId || msg.author?.id === interaction.client.user?.id;
}

async function createSpoilerAttachment(imageUrl, index = 0) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.pixiv.net/'
            }
        });

        let extension = 'jpg';
        const contentType = response.headers['content-type'];
        if (contentType) {
            if (contentType.includes('png')) extension = 'png';
            else if (contentType.includes('gif')) extension = 'gif';
            else if (contentType.includes('webp')) extension = 'webp';
        }

        const fileName = `SPOILER_pixiv_r18_${index}.${extension}`;
        return {
            attachment: new AttachmentBuilder(Buffer.from(response.data), { name: fileName }),
            attachmentName: fileName
        };
    } catch (error) {
        tlog.sysError('Pixiv-R18-Pagination', `download failed: ${error.message}`);
        return null;
    }
}

async function updateSpoilerTextMessage(interaction, pageData) {
    const spoilerImageUrl = `||${pageData.discordUrl}||`;

    if (pageData.imageMessageId) {
        try {
            const imageMsg = await interaction.channel.messages.fetch(pageData.imageMessageId);
            if (imageMsg) {
                await imageMsg.edit({ content: spoilerImageUrl });
                return;
            }
        } catch (error) {
            tlog.sysWarn('Pixiv-R18-Pagination', `cached image message fetch failed: ${error.message}`);
        }
    }

    const messages = await interaction.channel.messages.fetch({ limit: 10, after: interaction.message.id });
    for (const [, msg] of messages) {
        if (isBotManagedMessage(interaction, msg) &&
            msg.content.startsWith('||') &&
            msg.content.endsWith('||') &&
            msg.content.includes('cdn.discordapp.com')) {
            await msg.edit({ content: spoilerImageUrl });
            return;
        }
    }

    await interaction.channel.send({ content: spoilerImageUrl });
}

async function replaceSpoilerAttachmentMessage(interaction, attachment) {
    const messages = await interaction.channel.messages.fetch({ limit: 10, after: interaction.message.id });
    for (const [, msg] of messages) {
        if (isBotManagedMessage(interaction, msg) &&
            msg.attachments.size > 0 &&
            msg.attachments.some(att => att.name?.startsWith('SPOILER_pixiv_r18'))) {
            await msg.delete();
            break;
        }
    }

    await interaction.channel.send({ files: [attachment] });
}

async function handlePixivR18Pagination(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith('pixivr18_')) return;

    const parts = interaction.customId.split('_');
    if (parts.length !== 4) return;

    const [, action, artworkId, targetPage] = parts;
    const pageNumber = Number.parseInt(targetPage, 10);
    if (!artworkId || Number.isNaN(pageNumber)) return;

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    tlog.sys('Pixiv-R18-Pagination', `${interaction.user.tag} clicked ${action} -> ${pageNumber + 1}`);

    const r18Cache = new PixivR18CacheManager();
    const pageData = await r18Cache.getPageImage(artworkId, pageNumber);
    if (!pageData) {
        return interaction.followUp({
            content: 'R18 image cache has expired. Please post the Pixiv URL again.',
            flags: MessageFlags.Ephemeral
        });
    }

    const originalEmbed = interaction.message.embeds[0];
    if (!originalEmbed) {
        return interaction.followUp({
            content: 'Original Pixiv embed was not found. Please post the Pixiv URL again.',
            flags: MessageFlags.Ephemeral
        });
    }

    const updatedEmbed = EmbedBuilder.from(originalEmbed);
    const footerText = originalEmbed.footer?.text || 'Pixiv R18';
    const baseFooter = footerText.replace(/\| Page \d+\/\d+.*$/, '').trim();
    const suffix = pageData.hasDiscordUrls ? '' : ' (SPOILER)';

    updatedEmbed.setImage(null);
    updatedEmbed.setFooter({
        text: `${baseFooter} | Page ${pageNumber + 1}/${pageData.totalImages}${suffix}`,
        iconURL: originalEmbed.footer?.iconURL
    });

    const paginationRow = buildPaginationButtons(artworkId, pageNumber, pageData.totalImages);
    await interaction.editReply({
        embeds: [updatedEmbed],
        components: [paginationRow]
    });

    if (pageData.hasDiscordUrls && pageData.discordUrl) {
        await updateSpoilerTextMessage(interaction, pageData);
        return;
    }

    const spoilerResult = await createSpoilerAttachment(pageData.originalUrl || pageData.imageUrl, pageNumber);
    if (!spoilerResult) {
        return interaction.followUp({
            content: 'Failed to download the R18 image. Please try reload or post the Pixiv URL again.',
            flags: MessageFlags.Ephemeral
        });
    }

    await replaceSpoilerAttachmentMessage(interaction, spoilerResult.attachment);
}

module.exports = { handlePixivR18Pagination };
