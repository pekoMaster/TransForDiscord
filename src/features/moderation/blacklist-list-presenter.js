const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

const PAGE_SIZE = 10;
const BUTTON_PREFIX = 'pe_blacklist_page_';

const LEVEL_META = {
    1: { emoji: '💬', name: '僅提示' },
    2: { emoji: '🕶️', name: '防爆雷' },
    3: { emoji: '🚫', name: '封鎖' }
};

function buildBlacklistListPage(entries, { platform = null, page = 0 } = {}) {
    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * PAGE_SIZE;
    const visibleEntries = entries.slice(start, start + PAGE_SIZE);

    const title = platform ? `📋 黑名單 (${platform})` : '📋 黑名單';
    const description = visibleEntries.map((entry, index) => {
        const number = start + index + 1;
        const level = LEVEL_META[entry.level] || { emoji: '❔', name: `等級 ${entry.level}` };
        const author = formatAuthor(entry);
        const label = entry.label ? ` — ${entry.label}` : '';
        return `${level.emoji} **${number}.** [${entry.platform}] ${author} ⌈${level.name}⌉${label}`;
    }).join('\n') || '_沒有黑名單項目_';

    const embed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: `第 ${safePage + 1}/${totalPages} 頁 • 共 ${total} 條` });

    return {
        embed,
        components: buildPaginationComponents(safePage, totalPages),
        page: safePage,
        totalPages
    };
}

async function sendPaginatedBlacklistList(interaction, entries, { platform = null, timeoutMs = 120000 } = {}) {
    let currentPage = 0;
    let pageData = buildBlacklistListPage(entries, { platform, page: currentPage });

    const response = await interaction.reply({
        embeds: [pageData.embed],
        components: pageData.components,
        flags: MessageFlags.Ephemeral,
        fetchReply: true
    });

    if (pageData.totalPages <= 1 || typeof response.createMessageComponentCollector !== 'function') {
        return response;
    }

    const collector = response.createMessageComponentCollector({
        filter: componentInteraction => componentInteraction.customId?.startsWith(BUTTON_PREFIX),
        time: timeoutMs
    });

    collector.on('collect', async componentInteraction => {
        if (componentInteraction.user.id !== interaction.user.id) {
            await componentInteraction.reply({
                content: '這個分頁按鈕只能由原本執行指令的人操作。',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return;
        }

        if (componentInteraction.customId === `${BUTTON_PREFIX}prev`) currentPage -= 1;
        if (componentInteraction.customId === `${BUTTON_PREFIX}next`) currentPage += 1;

        pageData = buildBlacklistListPage(entries, { platform, page: currentPage });
        currentPage = pageData.page;

        await componentInteraction.update({
            embeds: [pageData.embed],
            components: pageData.components
        });
    });

    collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
    });

    return response;
}

function buildPaginationComponents(page, totalPages) {
    if (totalPages <= 1) return [];

    const previous = new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}prev`)
        .setLabel('◀ 上一頁')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0);

    const next = new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}next`)
        .setLabel('下一頁 ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1);

    return [new ActionRowBuilder().addComponents(previous, next)];
}

function formatAuthor(entry) {
    if (!entry.author) return '_unknown_';
    if (entry.platform === 'twitter' && !entry.author.startsWith('@')) {
        return `@${entry.author}`;
    }
    return entry.author;
}

module.exports = {
    PAGE_SIZE,
    BUTTON_PREFIX,
    buildBlacklistListPage,
    sendPaginatedBlacklistList
};
