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
    ThumbnailBuilder, SeparatorBuilder
} = require('discord.js');

const TextTruncator = require('../../../shared/discord/text-truncator');
const { buildV2ActionRows } = require('./v2/action-rows');
const { deriveStateFromComponents } = require('../state/v2-component-state');
const {
    cacheTweetData,
    getCachedTweetData
} = require('../state/v2-tweet-cache');

// Cache functions are re-exported here for old callers; storage lives in ../state/v2-tweet-cache.

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
    const displayName = author.name || author.screen_name || 'Unknown';

    const container = new ContainerBuilder()
        .setAccentColor(0x1DA1F2);

    // 1. 作者資訊 + 推文內容
    const sourceText = isTranslated ? (translatedText || tweet.text) : tweet.text;
    const displayText = isExpanded ? sourceText : truncator.truncateText(sourceText).truncatedText;

    container.addTextDisplayComponents(
        new TextDisplayBuilder()
            .setContent(`[@${author.screen_name}](${authorUrl})\n**${displayName}**\n${displayText}`)
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

    // 6. Functional action rows
    const truncResult = truncator.truncateText(sourceText);
    for (const row of buildV2ActionRows(tweet, {
        isTranslated,
        isQuoteShown,
        isReplyShown,
        isExpanded,
        hasTruncated: truncResult.isTruncated
    })) {
        container.addActionRowComponents(row);
    }

    return container;
}


module.exports = {
    buildV2Container,
    cacheTweetData,
    getCachedTweetData,
    deriveStateFromComponents
};
