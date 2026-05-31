const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const IMAGES_PER_PAGE = 4;
const PAGE_FOOTER_PATTERN = /(\s*•\s*第\s*\d+\/\d+\s*頁)+$/;

function cloneBaseEmbed(baseEmbedData) {
    return EmbedBuilder.from(baseEmbedData || {});
}

function getTotalPages(imageUrls) {
    const count = Array.isArray(imageUrls) ? imageUrls.length : 0;
    return Math.max(1, Math.ceil(count / IMAGES_PER_PAGE));
}

function clampPage(page, totalPages) {
    const parsed = Number.parseInt(page, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(parsed, totalPages - 1));
}

function buildThreadsGalleryPage(state, requestedPage = 0) {
    const imageUrls = Array.isArray(state.imageUrls) ? state.imageUrls : [];
    const totalPages = getTotalPages(imageUrls);
    const page = clampPage(requestedPage, totalPages);
    const start = page * IMAGES_PER_PAGE;
    const pageImages = imageUrls.slice(start, start + IMAGES_PER_PAGE);
    const embeds = [];

    const mainEmbed = cloneBaseEmbed(state.baseEmbedData);
    if (state.originalURL) mainEmbed.setURL(state.originalURL);
    if (pageImages[0]) mainEmbed.setImage(pageImages[0]);

    const footer = mainEmbed.data?.footer || {};
    const baseFooterText = (footer.text || '🧵 Threads | Peko Embed').replace(PAGE_FOOTER_PATTERN, '');
    mainEmbed.setFooter({
        text: baseFooterText + ' • 第 ' + (page + 1) + '/' + totalPages + ' 頁',
        iconURL: footer.icon_url
    });
    embeds.push(mainEmbed);

    for (const imageUrl of pageImages.slice(1)) {
        embeds.push(new EmbedBuilder().setURL(state.originalURL).setImage(imageUrl));
    }

    return {
        embeds,
        components: buildThreadsGalleryButtons(state.galleryId, page, totalPages),
        page,
        totalPages
    };
}

function buildThreadsGalleryButtons(galleryId, page, totalPages) {
    if (!galleryId || totalPages <= 1) return [];

    const buttonDefs = [
        { page: 0, label: '⏪', disabled: page === 0 },
        { page: Math.max(0, page - 1), label: '◀️', disabled: page === 0 },
        { page: Math.min(totalPages - 1, page + 1), label: '▶️', disabled: page === totalPages - 1 },
        { page: totalPages - 1, label: '⏩', disabled: page === totalPages - 1 }
    ];
    const usedCustomIds = new Set();
    const buttons = [];

    for (const def of buttonDefs) {
        const customId = 'threads_gallery_' + galleryId + '_' + def.page;
        if (usedCustomIds.has(customId)) continue;
        usedCustomIds.add(customId);
        buttons.push(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel(def.label)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(def.disabled)
        );
    }

    return buttons.length > 0 ? [new ActionRowBuilder().addComponents(...buttons)] : [];
}

module.exports = {
    IMAGES_PER_PAGE,
    buildThreadsGalleryPage,
    buildThreadsGalleryButtons,
    getTotalPages
};
