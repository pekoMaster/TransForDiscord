/**
 * Twitter 分頁互動處理器
 * 處理 Twitter 多圖片分頁按鈕的點擊事件
 *
 * 此模組為 utility 模組，不再作為 Event handler 載入。
 * 由 events/interactionCreate.js 統一路由後呼叫。
 */

const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const TFDTwitterExtractor = require('../extractors/twitter-v2-extractor');
const HTTPClient = require('../../../shared/http/http-client');
const { appendSpoilerButton } = require('../../../shared/discord/spoiler-button-helper.js');
const { lookupUrl, formatUrlStatsForFooter } = require('../../../shared/analytics/url-stats');
const tlog = require('../../../../utils/tfd-logger');

/**
 * 處理翻頁按鈕（twitter_first_ / twitter_prev_ / twitter_next_ / twitter_last_ / twitter_page_）
 */
async function handlePagination(interaction) {
    try {
        // 解析按鈕 ID：格式為 twitter_{action}_{tweetId}_{targetPage}
        const parts = interaction.customId.split('_');
        if (parts.length !== 4) return;

        const tweetId = parts[2];
        const targetPage = parts[3];
        const pageNumber = parseInt(targetPage);

        // ⚡ 立即 defer（避免 API 呼叫超過 3 秒限制）
        await interaction.deferUpdate();

        // 重新獲取推文資料
        const httpClient = new HTTPClient();
        const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
            timeout: 5000
        });

        if (!fxapiResp || !fxapiResp.tweet) {
            return interaction.followUp({
                content: '無法載入推文資料。',
                flags: MessageFlags.Ephemeral
            });
        }

        const tweet = fxapiResp.tweet;

        // 提取圖片
        const images = extractImagesFromTweet(tweet);
        if (images.length === 0 || pageNumber >= images.length) {
            return interaction.followUp({
                content: '找不到指定的圖片。',
                flags: MessageFlags.Ephemeral
            });
        }

        // 重新建立嵌入式訊息 - 使用指定頁面的圖片
        let urlStats = null;
        try {
            const tweetUrl = `https://twitter.com/i/status/${tweetId}`;
            if (interaction.guildId && interaction.channelId) {
                urlStats = lookupUrl(tweetUrl, interaction.guildId, interaction.channelId);
            }
        } catch (_) {}
        const embed = buildUpdatedEmbed(tweet, images, pageNumber, urlStats);

        // 重新創建分頁按鈕，並附加防爆雷按鈕
        const components = appendSpoilerButton(buildPaginationButtons(tweet, images, pageNumber));

        // 更新訊息（已 deferUpdate，使用 editReply）
        await interaction.editReply({
            embeds: [embed],
            components: components
        });

    } catch (error) {
        tlog.sysError('Twitter分頁', `處理失敗: ${error}`);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '處理分頁時發生錯誤，請稍後再試。',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * 從推文中提取圖片
 */
function extractImagesFromTweet(tweet) {
    const images = [];
    try {
        if (tweet.media && tweet.media.all && tweet.media.all.length > 0) {
            tweet.media.all.forEach(media => {
                if (media && media.type !== 'video' && media.url) {
                    images.push(media);
                }
            });
        }
    } catch (error) {
        tlog.sysError('TFD', `提取圖片失敗: ${error}`);
    }
    return images;
}

/**
 * 建立更新後的嵌入式訊息
 */
function buildUpdatedEmbed(tweet, images, currentPage, urlStats = null) {
    const embed = new EmbedBuilder();
    embed.setColor(0x1DA1F2);

    // 設定標題和作者資訊
    try {
        const displayName = tweet.author.name || tweet.author.screen_name;
        const titleName = `${displayName}(@${tweet.author.screen_name})`;
        embed.setTitle(titleName);
        embed.setURL(`https://twitter.com/i/status/${tweet.id}`);

        if (tweet.author.avatar_url) {
            embed.setThumbnail(tweet.author.avatar_url);
        }
    } catch (error) {
        tlog.sysError('TFD', `設定標題失敗: ${error}`);
    }

    // 設定描述
    try {
        if (tweet.text) {
            embed.setDescription(tweet.text);
        }
    } catch (error) {
        tlog.sysError('TFD', `設定描述失敗: ${error}`);
    }

    // 設定當前頁面的圖片
    if (images[currentPage]) {
        embed.setImage(images[currentPage].url);
    }

    // 添加統計資訊（fxtwitter API 使用 likes/retweets/replies）
    try {
        const stats = [];
        if (tweet.likes) stats.push(`❤️ ${tweet.likes.toLocaleString()}`);
        if (tweet.retweets) stats.push(`🔄 ${tweet.retweets.toLocaleString()}`);
        if (tweet.replies) stats.push(`💬 ${tweet.replies.toLocaleString()}`);

        if (stats.length > 0) {
            embed.addFields({
                name: '📊 統計',
                value: stats.join(' • '),
                inline: false
            });
        }
    } catch (error) {
        tlog.sysError('TFD', `添加統計失敗: ${error}`);
    }

    // 設定 footer - 保持與主提取器一致的格式
    const footerBase = 'Peko Embed';
    const footerSuffix = urlStats ? ` • ${formatUrlStatsForFooter(urlStats)}` : '';
    embed.setFooter({
        text: footerBase + footerSuffix, // 統一格式
        iconURL: 'https://pekoembed.canaria.cc/pic/twitter.png'
    });

    return embed;
}

/**
 * 建立分頁按鈕
 */
function buildPaginationButtons(tweet, images, currentPage) {
    if (images.length <= 1) {
        return [];
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`twitter_first_${tweet.id}_0`)
                .setLabel('⏪')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId(`twitter_prev_${tweet.id}_${Math.max(0, currentPage - 1)}`)
                .setLabel('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId(`twitter_page_${tweet.id}_${currentPage}`)
                .setLabel(`${currentPage + 1} / ${images.length}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`twitter_next_${tweet.id}_${Math.min(images.length - 1, currentPage + 1)}`)
                .setLabel('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === images.length - 1),
            new ButtonBuilder()
                .setCustomId(`twitter_last_${tweet.id}_${images.length - 1}`)
                .setLabel('⏩')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === images.length - 1)
        );

    return [row];
}

/**
 * 處理合併圖片按鈕（twitter_merge_{tweetId}）
 */
async function handleMergeImages(interaction, tweetId) {
    try {
        // ⚡ 立即 defer（避免 API 呼叫超過 3 秒限制）
        await interaction.deferUpdate();

        // 重新獲取推文資料
        const httpClient = new HTTPClient();
        const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
            timeout: 5000
        });

        if (!fxapiResp || !fxapiResp.tweet) {
            return interaction.followUp({
                content: '無法載入推文資料。',
                flags: MessageFlags.Ephemeral
            });
        }

        const tweet = fxapiResp.tweet;

        // 檢查是否有 mosaic
        if (!tweet.media?.mosaic?.type || tweet.media.mosaic.type !== 'mosaic_photo') {
            return interaction.followUp({
                content: '此推文沒有合併圖可用。',
                flags: MessageFlags.Ephemeral
            });
        }

        // 建立單一 embed 使用 mosaic 圖（使用正確的格式）
        const embed = new EmbedBuilder()
            .setColor(0x1DA1F2);

        // 設定 Author：用戶ID、頭像、個人頁面
        embed.setAuthor({
            name: `@${tweet.author.screen_name}`,
            iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url,
            url: `https://twitter.com/${tweet.author.screen_name}`
        });

        // 設定標題：只顯示用戶暱稱
        const displayName = tweet.author.name || tweet.author.screen_name;
        embed.setTitle(displayName);
        embed.setURL(`https://twitter.com/i/status/${tweetId}`);

        // 設定描述：推文內容
        if (tweet.text) {
            embed.setDescription(tweet.text);
        }

        // 設定 mosaic 圖片
        embed.setImage(tweet.media.mosaic.formats.jpeg);

        // 設定 Footer：統計資訊 + Peko Embed（fxtwitter API 使用 likes/retweets/replies）
        const stats = [];
        if (tweet.likes) stats.push(`❤️ ${tweet.likes.toLocaleString()}`);
        if (tweet.retweets) stats.push(`🔄 ${tweet.retweets.toLocaleString()}`);
        if (tweet.replies) stats.push(`💬 ${tweet.replies.toLocaleString()}`);

        let footerText = stats.length > 0
            ? `${stats.join(' • ')} | Peko Embed`
            : 'Peko Embed';

        // 📊 channel/guild 統計（唯讀）
        try {
            const tweetUrl = `https://twitter.com/i/status/${tweetId}`;
            if (interaction.guildId && interaction.channelId) {
                const urlStats = lookupUrl(tweetUrl, interaction.guildId, interaction.channelId);
                footerText += ` • ${formatUrlStatsForFooter(urlStats)}`;
            }
        } catch (_) {}

        embed.setFooter({
            text: footerText,
            iconURL: 'https://abs.twimg.com/favicons/twitter.2.ico'
        });

        // 🔧 保留原有的按鈕（翻譯按鈕等），但移除合併/拆開圖片按鈕
        const preservedButtons = [];
        if (interaction.message.components) {
            for (const row of interaction.message.components) {
                for (const component of row.components) {
                    const customId = component.customId || '';
                    // 排除合併/拆開圖片按鈕，保留其他按鈕
                    if (!customId.startsWith('twitter_merge_') && !customId.startsWith('twitter_split_')) {
                        // 如果按鈕有 emoji，就不需要 label；否則確保 label 不為空
                        const labelText = component.label || '按鈕';

                        const btn = new ButtonBuilder()
                            .setCustomId(customId)
                            .setLabel(labelText)
                            .setStyle(component.style);
                        preservedButtons.push(btn);
                    }
                }
            }
        }

        // 建立「拆開圖片」按鈕
        const splitButton = new ButtonBuilder()
            .setCustomId(`twitter_split_${tweetId}`)
            .setLabel('拆開')
            .setStyle(ButtonStyle.Secondary);

        // 組合所有按鈕到同一個 ActionRow（如果不超過 5 個）
        const allButtons = [...preservedButtons, splitButton].slice(0, 5);
        const row = new ActionRowBuilder().addComponents(...allButtons);

        // 更新訊息為單一 embed + mosaic 圖（已 deferUpdate，使用 editReply），附加防爆雷按鈕
        await interaction.editReply({
            embeds: [embed],
            components: appendSpoilerButton([row])
        });

    } catch (error) {
        tlog.sysError('Twitter', `合併圖片失敗: ${error}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '合併圖片時發生錯誤，請稍後再試。',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

/**
 * 處理拆開圖片按鈕（twitter_split_{tweetId}）
 */
async function handleSplitImages(interaction, tweetId) {
    try {
        // ⚡ 立即 defer（避免 API 呼叫超過 3 秒限制）
        await interaction.deferUpdate();

        // 重新獲取推文資料
        const httpClient = new HTTPClient();
        const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
            timeout: 5000
        });

        if (!fxapiResp || !fxapiResp.tweet) {
            return interaction.followUp({
                content: '無法載入推文資料。',
                flags: MessageFlags.Ephemeral
            });
        }

        const tweet = fxapiResp.tweet;

        // 提取所有圖片
        const images = extractImagesFromTweet(tweet);
        if (images.length === 0) {
            return interaction.followUp({
                content: '找不到圖片資料。',
                flags: MessageFlags.Ephemeral
            });
        }

        // 建立多個 embed（恢復原始多圖模式，使用正確的格式）
        const embeds = [];
        const originalURL = `https://twitter.com/i/status/${tweetId}`;

        // 第一個 embed（主要內容，無圖片）
        const mainEmbed = new EmbedBuilder()
            .setColor(0x1DA1F2);

        // 設定 Author：用戶ID、頭像、個人頁面
        mainEmbed.setAuthor({
            name: `@${tweet.author.screen_name}`,
            iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url,
            url: `https://twitter.com/${tweet.author.screen_name}`
        });

        // 設定標題：只顯示用戶暱稱
        const displayName = tweet.author.name || tweet.author.screen_name;
        mainEmbed.setTitle(displayName);
        mainEmbed.setURL(originalURL);

        // 設定描述：推文內容
        if (tweet.text) {
            mainEmbed.setDescription(tweet.text);
        }

        // 設定 Footer：統計資訊 + Peko Embed（fxtwitter API 使用 likes/retweets/replies）
        const stats = [];
        if (tweet.likes) stats.push(`❤️ ${tweet.likes.toLocaleString()}`);
        if (tweet.retweets) stats.push(`🔄 ${tweet.retweets.toLocaleString()}`);
        if (tweet.replies) stats.push(`💬 ${tweet.replies.toLocaleString()}`);

        let footerText = stats.length > 0
            ? `${stats.join(' • ')} | Peko Embed`
            : 'Peko Embed';

        // 📊 channel/guild 統計（唯讀）
        try {
            if (interaction.guildId && interaction.channelId) {
                const urlStats = lookupUrl(originalURL, interaction.guildId, interaction.channelId);
                footerText += ` • ${formatUrlStatsForFooter(urlStats)}`;
            }
        } catch (_) {}

        mainEmbed.setFooter({
            text: footerText,
            iconURL: 'https://abs.twimg.com/favicons/twitter.2.ico'
        });

        embeds.push(mainEmbed);

        // 為每張圖片創建單獨的 embed
        for (let i = 0; i < images.length; i++) {
            const imageEmbed = new EmbedBuilder()
                .setURL(originalURL)
                .setImage(images[i].url);
            embeds.push(imageEmbed);
        }

        // 🔧 保留原有的按鈕（翻譯按鈕等），但移除合併/拆開圖片按鈕
        const preservedButtons = [];
        if (interaction.message.components) {
            for (const row of interaction.message.components) {
                for (const component of row.components) {
                    const customId = component.customId || '';
                    // 排除合併/拆開圖片按鈕，保留其他按鈕
                    if (!customId.startsWith('twitter_merge_') && !customId.startsWith('twitter_split_')) {
                        // 如果按鈕有 emoji，就不需要 label；否則確保 label 不為空
                        const labelText = component.label || '按鈕';

                        const btn = new ButtonBuilder()
                            .setCustomId(customId)
                            .setLabel(labelText)
                            .setStyle(component.style);
                        preservedButtons.push(btn);
                    }
                }
            }
        }

        // 如果有 mosaic，建立「合併圖片」按鈕
        let components = null;
        if (tweet.media?.mosaic?.type === 'mosaic_photo') {
            const mergeButton = new ButtonBuilder()
                .setCustomId(`twitter_merge_${tweetId}`)
                .setLabel('合並')
                .setStyle(ButtonStyle.Secondary);

            // 組合所有按鈕到同一個 ActionRow（如果不超過 5 個）
            const allButtons = [...preservedButtons, mergeButton].slice(0, 5);
            const row = new ActionRowBuilder().addComponents(...allButtons);
            components = [row];
        } else if (preservedButtons.length > 0) {
            // 沒有 mosaic 但有保留的按鈕
            const row = new ActionRowBuilder().addComponents(...preservedButtons.slice(0, 5));
            components = [row];
        }

        // 更新訊息為多個 embed（已 deferUpdate，使用 editReply），附加防爆雷按鈕
        await interaction.editReply({
            embeds: embeds,
            components: appendSpoilerButton(components)
        });

    } catch (error) {
        tlog.sysError('Twitter', `拆開圖片失敗: ${error}`);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '拆開圖片時發生錯誤，請稍後再試。',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

module.exports = {
    handlePagination,    // 翻頁按鈕（first/prev/next/last/page）
    handleMergeImages,   // 合併圖片按鈕
    handleSplitImages,   // 拆開圖片按鈕
    // helper methods（供外部或測試使用）
    extractImagesFromTweet,
    buildUpdatedEmbed,
    buildPaginationButtons,
};
