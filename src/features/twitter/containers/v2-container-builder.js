/**
 * Twitter V2 Container 建構器
 * 使用 Discord Components V2 建構推文顯示容器
 * 適用於所有影片類型推文（取代 vxtwitter redirect）
 *
 * 2026-04-12: 從 TFD 移植回 4.0，已調整 require 路徑
 */

const {
    ContainerBuilder, SectionBuilder, TextDisplayBuilder,
    MediaGalleryBuilder, MediaGalleryItemBuilder,
    ThumbnailBuilder, SeparatorBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

const TextTruncator = require('../../../shared/discord/text-truncator');
const { REPORT_BTN_PREFIX } = require('../../../shared/discord/spoiler-button-helper');

// V2 推文資料快取（供按鈕互動時重建 Container 使用）
// 格式: Map<tweetId, { tweet, originalURL, quoteData, replyData, timestamp }>
const v2TweetCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 分鐘

// 定期清理過期快取
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of v2TweetCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            v2TweetCache.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * 快取推文資料
 * @param {string} tweetId
 * @param {Object} data - { tweet, originalURL, quoteData?, replyData? }
 */
function cacheTweetData(tweetId, data) {
    v2TweetCache.set(tweetId, {
        ...data,
        timestamp: Date.now()
    });
}

/**
 * 取得快取的推文資料
 * @param {string} tweetId
 * @returns {Object|null}
 */
function getCachedTweetData(tweetId) {
    const cached = v2TweetCache.get(tweetId);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        v2TweetCache.delete(tweetId);
        return null;
    }
    return cached;
}

/**
 * 建構 V2 Container
 * @param {Object} tweet - fxtwitter API 推文物件
 * @param {string} originalURL - 原始推文 URL
 * @param {Object} options
 * @returns {ContainerBuilder}
 */
function buildV2Container(tweet, originalURL, options = {}) {
    const {
        isTranslated = false,
        translatedText = null,
        translatedQuoteText = null,
        translatedReplyText = null,
        isQuoteShown = false,
        isReplyShown = false,
        isExpanded = false,
        quoteData = null,
        replyData = null,
        urlStats = null,   // { channel, guild, total } — 選填，由呼叫方傳入
    } = options;

    const truncator = new TextTruncator();
    const author = tweet.author;
    const authorUrl = `https://twitter.com/${author.screen_name}`;

    const container = new ContainerBuilder()
        .setAccentColor(0x1DA1F2);

    // 1. 作者資訊 + 推文內容
    const sourceText = isTranslated ? (translatedText || tweet.text) : tweet.text;
    const displayText = isExpanded ? sourceText : truncator.truncateText(sourceText).truncatedText;

    container.addTextDisplayComponents(
        new TextDisplayBuilder()
            .setContent(`[@${author.screen_name}](${authorUrl})\n**${author.name}**\n${displayText}`)
    );

    // 2. 引用推文（如果展開）
    if (isQuoteShown && quoteData?.tweet) {
        const qt = quoteData.tweet;
        const qtUsername = qt.author?.screen_name || '';
        const qtDisplayName = qt.author?.name || qtUsername;
        const qtUrl = `https://twitter.com/${qtUsername}`;
        const qtText = isTranslated && translatedQuoteText
            ? translatedQuoteText
            : (qt.text || '（無內容）');
        const qtLines = qtText.split('\n').map(line => `> ${line}`).join('\n');

        const quoteContent = `> [RT](https://twitter.com/${qtUsername}/status/${quoteData.tweetId}): ${qtDisplayName} ([@${qtUsername}](${qtUrl}))\n> \u3000\n${qtLines}`;

        const quoteSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(quoteContent)
            );
        if (qt.author?.avatar_url) {
            quoteSection.setThumbnailAccessory(
                new ThumbnailBuilder().setURL(qt.author.avatar_url)
            );
        }
        container.addSectionComponents(quoteSection);
    }

    // 3. 回覆推文（如果展開）
    if (isReplyShown && replyData?.tweet) {
        const rt = replyData.tweet;
        const rtUsername = rt.author?.screen_name || '';
        const rtDisplayName = rt.author?.name || rtUsername;
        const rtUrl = `https://twitter.com/${rtUsername}`;

        const rtText = isTranslated && translatedReplyText
            ? translatedReplyText
            : (rt.text || '（無內容）');
        const rtLines = rtText.split('\n').map(line => `> ${line}`).join('\n');

        const replyContent = `> [↩️ 回覆](https://twitter.com/${rtUsername}/status/${replyData.tweetId}): ${rtDisplayName} ([@${rtUsername}](${rtUrl}))\n> \u3000\n${rtLines}`;

        const replySection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(replyContent)
            );
        if (rt.author?.avatar_url) {
            replySection.setThumbnailAccessory(
                new ThumbnailBuilder().setURL(rt.author.avatar_url)
            );
        }
        container.addSectionComponents(replySection);
    }

    // 4. MediaGallery（影片 + 圖片）
    const media = tweet.media?.all || [];
    if (media.length > 0) {
        const galleryItems = media.map((item, i) => {
            const isVideo = item.type === 'video' || item.type === 'gif';
            return new MediaGalleryItemBuilder()
                .setURL(item.url)
                .setDescription(`${isVideo ? '🎬' : '🖼️'} ${isVideo ? '影片' : '圖片'} ${i + 1}`);
        });
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(...galleryItems)
        );
    }

    // 5. 統計資訊 + 原文連結
    const statsItems = [];
    if (tweet.likes != null) statsItems.push(`❤️ ${tweet.likes}`);
    if (tweet.retweets != null) statsItems.push(`🔄 ${tweet.retweets}`);
    if (tweet.replies != null) statsItems.push(`💬 ${tweet.replies}`);

    let footerText = `-# ${statsItems.join('  ')}`;
    if (isTranslated) footerText += ' | 🌐 AI 翻譯';
    footerText += ' | Peko Embed';
    if (urlStats) footerText += ` • ${urlStats.channel}/${urlStats.guild}/${urlStats.total}`;

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(footerText)
    );

    // 6. 功能按鈕列
    const buttons = [];

    // 翻譯 / 原文 按鈕
    const textContent = tweet.text || '';
    if (textContent.trim().length >= 10) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(isTranslated ? `v2_original_${tweet.id}` : `v2_translate_${tweet.id}`)
                .setLabel(isTranslated ? '原文' : '翻譯')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // 統一展開/收回按鈕（引用、回覆、全文 共用一個）
    const hasQuote = !!tweet.quote?.author;
    const hasReply = !!tweet.replying_to;
    const truncResult = truncator.truncateText(sourceText);
    const hasTruncated = truncResult.isTruncated;
    const hasExpandable = hasQuote || hasReply || hasTruncated;

    if (hasExpandable) {
        const isAllExpanded =
            (!hasQuote || isQuoteShown) &&
            (!hasReply || isReplyShown) &&
            (!hasTruncated || isExpanded);
        buttons.push(
            new ButtonBuilder()
                .setCustomId(isAllExpanded ? `v2_collapse_all_${tweet.id}` : `v2_expand_all_${tweet.id}`)
                .setLabel(isAllExpanded ? '收回' : '展開')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    // 工具按鈕（重整、防爆雷）合併到同一排
    const utilButtons = [
        new ButtonBuilder()
            .setCustomId(`v2_reload_${tweet.id}`)
            .setLabel('重整')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(REPORT_BTN_PREFIX + Date.now())
            .setLabel('回報')
            .setStyle(ButtonStyle.Secondary)
    ];

    const allButtons = [...buttons, ...utilButtons];

    // Discord ActionRow 最多 5 個按鈕，超過時拆成兩排
    if (allButtons.length <= 5) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(...allButtons)
        );
    } else {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(...allButtons.slice(0, 5))
        );
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(...allButtons.slice(5))
        );
    }

    return container;
}

/**
 * 從 V2 訊息的按鈕狀態推導目前顯示狀態
 */
function deriveStateFromComponents(components, tweetId) {
    const state = {
        isTranslated: false,
        isQuoteShown: false,
        isReplyShown: false,
        isExpanded: false,
    };

    function findButtons(comps) {
        if (!comps) return;
        for (const comp of comps) {
            const id = comp.customId || comp.custom_id;
            if (id) {
                if (id === `v2_original_${tweetId}`) state.isTranslated = true;
                if (id === `v2_collapse_all_${tweetId}`) {
                    state.isQuoteShown = true;
                    state.isReplyShown = true;
                    state.isExpanded = true;
                }
                // 相容舊格式（快取內仍有舊按鈕 ID 的情況）
                if (id === `v2_hide_quote_${tweetId}`) state.isQuoteShown = true;
                if (id === `v2_hide_reply_${tweetId}`) state.isReplyShown = true;
                if (id === `v2_collapse_${tweetId}`) state.isExpanded = true;
            }
            if (comp.components) findButtons(comp.components);
        }
    }

    findButtons(components);
    return state;
}

module.exports = {
    buildV2Container,
    cacheTweetData,
    getCachedTweetData,
    deriveStateFromComponents
};
