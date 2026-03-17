/**
 * Twitter 分頁互動處理器
 * 處理 Twitter 多圖片分頁按鈕的點擊事件
 */

const { Events } = require('discord.js');
const ErmianaTwitterExtractor = require('../ermiana-system/extractors/twitter-v2.js');
const HTTPClient = require('../ermiana-system/utils/http-client');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 只處理按鈕互動
        if (!interaction.isButton()) return;

        // 檢查是否為 Twitter 分頁按鈕
        if (!interaction.customId.startsWith('twitter_')) return;

        try {
            // 解析按鈕 ID
            const parts = interaction.customId.split('_');
            if (parts.length < 3) return;

            const [, action, ...rest] = parts;

            // 🔽 處理顯示原文按鈕 (twitter_show_quote_{tweetId})
            if (action === 'show' && rest[0] === 'quote') {
                const tweetId = rest[1];
                return await this.handleShowQuote(interaction, tweetId);
            }

            // 🔼 處理縮回原文按鈕 (twitter_hide_quote_{tweetId})
            if (action === 'hide' && rest[0] === 'quote') {
                const tweetId = rest[1];
                return await this.handleHideQuote(interaction, tweetId);
            }

            // 🔽 處理顯示回覆原文按鈕 (twitter_show_reply_{tweetId})
            if (action === 'show' && rest[0] === 'reply') {
                const tweetId = rest[1];
                return await this.handleShowReply(interaction, tweetId);
            }

            // 🔼 處理收回回覆原文按鈕 (twitter_hide_reply_{tweetId})
            if (action === 'hide' && rest[0] === 'reply') {
                const tweetId = rest[1];
                return await this.handleHideReply(interaction, tweetId);
            }

            // 以下使用舊的解析方式 (twitter_action_{tweetId})
            const tweetId = rest[0];

            // 🎨 處理合併圖片按鈕
            if (action === 'merge') {
                return await this.handleMergeImages(interaction, tweetId);
            }

            // 📄 處理拆開圖片按鈕
            if (action === 'split') {
                return await this.handleSplitImages(interaction, tweetId);
            }

            // 原有的分頁處理
            if (parts.length !== 4) return;
            const targetPage = parts[3];
            const pageNumber = parseInt(targetPage);

            // 權限檢查已移除 - 所有人都可以使用翻頁按鈕

            // 重新獲取推文資料
            const httpClient = new HTTPClient();
            const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                timeout: 5000
            });

            if (!fxapiResp || !fxapiResp.tweet) {
                return interaction.reply({
                    content: '無法載入推文資料。',
                    ephemeral: true
                });
            }

            const tweet = fxapiResp.tweet;

            // 提取圖片
            const images = this.extractImagesFromTweet(tweet);
            if (images.length === 0 || pageNumber >= images.length) {
                return interaction.reply({
                    content: '找不到指定的圖片。',
                    ephemeral: true
                });
            }

            // 重新建立嵌入式訊息 - 使用指定頁面的圖片
            const embed = this.buildUpdatedEmbed(tweet, images, pageNumber);

            // 重新創建分頁按鈕
            const components = this.buildPaginationButtons(tweet, images, pageNumber);

            // 更新訊息
            await interaction.update({
                embeds: [embed],
                components: components
            });

        } catch (error) {
            console.error(`[Twitter分頁] 處理失敗:`, error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '處理分頁時發生錯誤，請稍後再試。',
                    ephemeral: true
                });
            }
        }
    },

    /**
     * 從推文中提取圖片
     */
    extractImagesFromTweet(tweet) {
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
            console.error('提取圖片失敗:', error);
        }
        return images;
    },

    /**
     * 建立更新後的嵌入式訊息
     */
    buildUpdatedEmbed(tweet, images, currentPage) {
        const { EmbedBuilder } = require('discord.js');
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
            console.error('設定標題失敗:', error);
        }

        // 設定描述
        try {
            if (tweet.text) {
                embed.setDescription(tweet.text);
            }
        } catch (error) {
            console.error('設定描述失敗:', error);
        }

        // 設定當前頁面的圖片
        if (images[currentPage]) {
            embed.setImage(images[currentPage].url);
        }

        // 添加統計資訊
        try {
            const stats = [];
            if (tweet.favorite_count) stats.push(`❤️ ${tweet.favorite_count.toLocaleString()}`);
            if (tweet.retweet_count) stats.push(`🔄 ${tweet.retweet_count.toLocaleString()}`);
            if (tweet.reply_count) stats.push(`💬 ${tweet.reply_count.toLocaleString()}`);

            if (stats.length > 0) {
                embed.addFields({
                    name: '📊 統計',
                    value: stats.join(' • '),
                    inline: false
                });
            }
        } catch (error) {
            console.error('添加統計失敗:', error);
        }

        // 設定 footer - 保持與主提取器一致的格式
        embed.setFooter({
            text: 'Original By Ermiana', // 統一格式
            iconURL: 'https://ermiana.canaria.cc/pic/twitter.png'
        });

        return embed;
    },

    /**
     * 建立分頁按鈕
     */
    buildPaginationButtons(tweet, images, currentPage) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
    },

    /**
     * 處理合併圖片按鈕
     */
    async handleMergeImages(interaction, tweetId) {
        try {
            // 重新獲取推文資料
            const httpClient = new HTTPClient();
            const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                timeout: 5000
            });

            if (!fxapiResp || !fxapiResp.tweet) {
                return interaction.reply({
                    content: '無法載入推文資料。',
                    ephemeral: true
                });
            }

            const tweet = fxapiResp.tweet;

            // 檢查是否有 mosaic
            if (!tweet.media?.mosaic?.type || tweet.media.mosaic.type !== 'mosaic_photo') {
                return interaction.reply({
                    content: '此推文沒有合併圖可用。',
                    ephemeral: true
                });
            }

            // 建立單一 embed 使用 mosaic 圖（使用正確的格式）
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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

            // 設定 Footer：統計資訊 + Original By Ermiana
            const stats = [];
            if (tweet.favorite_count) stats.push(`❤️ ${tweet.favorite_count.toLocaleString()}`);
            if (tweet.retweet_count) stats.push(`🔄 ${tweet.retweet_count.toLocaleString()}`);
            if (tweet.reply_count) stats.push(`💬 ${tweet.reply_count.toLocaleString()}`);

            const footerText = stats.length > 0
                ? `${stats.join(' • ')} | Original By Ermiana`
                : 'Original By Ermiana';

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
                            preservedButtons.push(
                                new ButtonBuilder()
                                    .setCustomId(customId)
                                    .setLabel(component.label || '')
                                    .setStyle(component.style)
                            );
                        }
                    }
                }
            }

            // 建立「拆開圖片」按鈕
            const splitButton = new ButtonBuilder()
                .setCustomId(`twitter_split_${tweetId}`)
                .setLabel('📄 拆開圖片')
                .setStyle(ButtonStyle.Primary);

            // 組合所有按鈕到同一個 ActionRow（如果不超過 5 個）
            const allButtons = [...preservedButtons, splitButton].slice(0, 5);
            const row = new ActionRowBuilder().addComponents(...allButtons);

            // 更新訊息為單一 embed + mosaic 圖
            await interaction.update({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error(`[Twitter] 合併圖片失敗:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '合併圖片時發生錯誤，請稍後再試。',
                    ephemeral: true
                });
            }
        }
    },

    /**
     * 處理拆開圖片按鈕
     */
    async handleSplitImages(interaction, tweetId) {
        try {
            // 重新獲取推文資料
            const httpClient = new HTTPClient();
            const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                timeout: 5000
            });

            if (!fxapiResp || !fxapiResp.tweet) {
                return interaction.reply({
                    content: '無法載入推文資料。',
                    ephemeral: true
                });
            }

            const tweet = fxapiResp.tweet;

            // 提取所有圖片
            const images = this.extractImagesFromTweet(tweet);
            if (images.length === 0) {
                return interaction.reply({
                    content: '找不到圖片資料。',
                    ephemeral: true
                });
            }

            // 建立多個 embed（恢復原始多圖模式，使用正確的格式）
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

            // 設定 Footer：統計資訊 + Original By Ermiana
            const stats = [];
            if (tweet.favorite_count) stats.push(`❤️ ${tweet.favorite_count.toLocaleString()}`);
            if (tweet.retweet_count) stats.push(`🔄 ${tweet.retweet_count.toLocaleString()}`);
            if (tweet.reply_count) stats.push(`💬 ${tweet.reply_count.toLocaleString()}`);

            const footerText = stats.length > 0
                ? `${stats.join(' • ')} | Original By Ermiana`
                : 'Original By Ermiana';

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
                            preservedButtons.push(
                                new ButtonBuilder()
                                    .setCustomId(customId)
                                    .setLabel(component.label || '')
                                    .setStyle(component.style)
                            );
                        }
                    }
                }
            }

            // 如果有 mosaic，建立「合併圖片」按鈕
            let components = null;
            if (tweet.media?.mosaic?.type === 'mosaic_photo') {
                const mergeButton = new ButtonBuilder()
                    .setCustomId(`twitter_merge_${tweetId}`)
                    .setLabel('🎨 合併圖片')
                    .setStyle(ButtonStyle.Success);

                // 組合所有按鈕到同一個 ActionRow（如果不超過 5 個）
                const allButtons = [...preservedButtons, mergeButton].slice(0, 5);
                const row = new ActionRowBuilder().addComponents(...allButtons);
                components = [row];
            } else if (preservedButtons.length > 0) {
                // 沒有 mosaic 但有保留的按鈕
                const row = new ActionRowBuilder().addComponents(...preservedButtons.slice(0, 5));
                components = [row];
            }

            // 更新訊息為多個 embed
            await interaction.update({
                embeds: embeds,
                components: components
            });

        } catch (error) {
            console.error(`[Twitter] 拆開圖片失敗:`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '拆開圖片時發生錯誤，請稍後再試。',
                    ephemeral: true
                });
            }
        }
    },

    /**
     * 處理顯示原文按鈕
     */
    async handleShowQuote(interaction, tweetId) {
        try {
            // 立即延遲回應，防止 3 秒超時
            await interaction.deferUpdate();

            // 重新獲取推文資料
            const httpClient = new HTTPClient();
            const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                timeout: 5000
            });

            if (!fxapiResp || !fxapiResp.tweet) {
                return interaction.followUp({
                    content: '無法載入推文資料。',
                    ephemeral: true
                });
            }

            const tweet = fxapiResp.tweet;

            // 檢查是否有引用推文
            if (!tweet.quote || !tweet.quote.author) {
                return interaction.followUp({
                    content: '此推文沒有引用內容。',
                    ephemeral: true
                });
            }

            // 取得現有的 embed 並添加引用 Field
            const currentEmbed = interaction.message.embeds[0];
            const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
            const updatedEmbed = EmbedBuilder.from(currentEmbed);

            // 建立引用推文 Field（使用與 twitter-v2.js 相同的邏輯）
            const quoteTweet = tweet.quote;
            const quoteUsername = quoteTweet.author.screen_name;
            const quoteDisplayName = quoteTweet.author.name || quoteTweet.author.screen_name;

            // 處理被引用推文內容
            const TextTruncator = require('../ermiana-system/utils/text-truncator');
            const truncator = new TextTruncator();
            const rawQuoteContent = quoteTweet.text || '引用內容';
            const quoteTruncationResult = truncator.processTweetContent(rawQuoteContent, '引用推文');
            const truncatedQuoteContent = quoteTruncationResult.text;

            const quotedContent = truncatedQuoteContent
                .split('\n')
                .map(line => line.trim() === '' ? '> 　' : `> ${line}`)
                .join('\n');

            const quotedTweetURL = `https://twitter.com/${quoteUsername}/status/${quoteTweet.id}`;
            const authorProfileURL = `https://twitter.com/${quoteUsername}`;
            const fieldValue = `> [RT](${quotedTweetURL}): ${quoteDisplayName} ([@${quoteUsername}](${authorProfileURL}))\n> 　\n${quotedContent}`;

            updatedEmbed.addFields({
                name: '\u200B',
                value: fieldValue,
                inline: false
            });

            // 🖼️ 處理引用推文的多圖片（最多 4 張）
            const embeds = [updatedEmbed];
            const originalURL = `https://twitter.com/i/status/${tweetId}`;

            if (quoteTweet.media && quoteTweet.media.all && quoteTweet.media.all.length > 0) {
                const quoteImages = quoteTweet.media.all.filter(m => m.type !== 'video' && m.url);

                if (quoteImages.length > 0) {
                    console.log(`[Twitter引用] 引用推文有 ${quoteImages.length} 張圖片，將全部顯示`);

                    // 為每張圖片創建單獨的 embed（最多 4 張）
                    const maxImages = Math.min(quoteImages.length, 4);
                    for (let i = 0; i < maxImages; i++) {
                        const imageEmbed = new EmbedBuilder()
                            .setURL(originalURL) // 使用相同的 URL 讓圖片連接在一起
                            .setImage(quoteImages[i].url);
                        embeds.push(imageEmbed);
                    }

                }
            }

            // 更新按鈕（在同一行中更新引用按鈕）
            const extractor = new ErmianaTwitterExtractor();
            let allComponents = interaction.message.components ? interaction.message.components.slice() : [];

            // 找到包含切換按鈕的那一行
            const toggleRowIndex = allComponents.findIndex(row =>
                row.components && row.components.some(btn =>
                    btn.customId && (
                        btn.customId.includes('show_quote') || btn.customId.includes('hide_quote') ||
                        btn.customId.includes('show_reply') || btn.customId.includes('hide_reply') ||
                        btn.customId.includes('twitter_expand_') || btn.customId.includes('twitter_collapse_')
                    )
                )
            );

            if (toggleRowIndex !== -1) {
                // 在同一行中更新引用按鈕
                const existingRow = allComponents[toggleRowIndex];
                const newButtons = existingRow.components.map(btn => {
                    if (btn.customId && (btn.customId.includes('show_quote') || btn.customId.includes('hide_quote'))) {
                        return extractor.buildQuoteToggleButtonComponent(tweetId, true); // true = 顯示狀態
                    }
                    return btn;
                });
                allComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
            } else {
                // 沒有找到切換按鈕行，添加新的
                const quoteButton = extractor.buildQuoteToggleButton(tweetId, true);
                allComponents.push(quoteButton);
            }

            await interaction.editReply({
                embeds: embeds, // 使用多個 embed 來顯示圖片
                components: allComponents
            });

        } catch (error) {
            console.error(`[Twitter] 顯示原文失敗:`, error);
            // 因為已經 deferUpdate，所以用 followUp 或 editReply
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '顯示原文時發生錯誤。',
                        components: interaction.message.components
                    });
                }
            } catch (replyError) {
                console.error(`[Twitter引用] 回應錯誤失敗:`, replyError);
            }
        }
    },

    /**
     * 處理縮回原文按鈕
     */
    async handleHideQuote(interaction, tweetId) {
        try {
            // 立即延遲回應，防止 3 秒超時
            await interaction.deferUpdate();

            // 取得現有的 embed 並移除引用 Field
            const currentEmbed = interaction.message.embeds[0];
            const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
            const updatedEmbed = EmbedBuilder.from(currentEmbed);

            // 移除引用 Field（找到包含 [RT] 的 field）
            if (updatedEmbed.data.fields && updatedEmbed.data.fields.length > 0) {
                const quoteFieldIndex = updatedEmbed.data.fields.findIndex(f =>
                    f.name === '\u200B' && f.value.includes('[RT]')
                );
                if (quoteFieldIndex !== -1) {
                    updatedEmbed.data.fields.splice(quoteFieldIndex, 1);
                }
            }

            // 更新按鈕（在同一行中更新引用按鈕）
            const extractor = new ErmianaTwitterExtractor();
            let allComponents = interaction.message.components ? interaction.message.components.slice() : [];

            // 找到包含切換按鈕的那一行
            const toggleRowIndex = allComponents.findIndex(row =>
                row.components && row.components.some(btn =>
                    btn.customId && (
                        btn.customId.includes('show_quote') || btn.customId.includes('hide_quote') ||
                        btn.customId.includes('show_reply') || btn.customId.includes('hide_reply') ||
                        btn.customId.includes('twitter_expand_') || btn.customId.includes('twitter_collapse_')
                    )
                )
            );

            if (toggleRowIndex !== -1) {
                // 在同一行中更新引用按鈕
                const existingRow = allComponents[toggleRowIndex];
                const newButtons = existingRow.components.map(btn => {
                    if (btn.customId && (btn.customId.includes('show_quote') || btn.customId.includes('hide_quote'))) {
                        return extractor.buildQuoteToggleButtonComponent(tweetId, false); // false = 隱藏狀態
                    }
                    return btn;
                });
                allComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
            } else {
                // 沒有找到切換按鈕行，添加新的
                const quoteButton = extractor.buildQuoteToggleButton(tweetId, false);
                allComponents.push(quoteButton);
            }

            // 🖼️ 只保留第一個 embed（移除引用圖片的 embed）
            await interaction.editReply({
                embeds: [updatedEmbed], // 只返回主 embed，移除引用圖片
                components: allComponents
            });

        } catch (error) {
            console.error(`[Twitter] 縮回原文失敗:`, error);
            // 因為已經 deferUpdate，所以用 followUp 或 editReply
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '縮回原文時發生錯誤。',
                        components: interaction.message.components
                    });
                }
            } catch (replyError) {
                console.error(`[Twitter引用] 回應錯誤失敗:`, replyError);
            }
        }
    },

    /**
     * 處理顯示回覆原文按鈕
     */
    async handleShowReply(interaction, tweetId) {
        try {
            // 立即延遲回應，防止 3 秒超時
            await interaction.deferUpdate();

            // 重新獲取推文資料
            const httpClient = new HTTPClient();
            const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                timeout: 5000
            });

            if (!fxapiResp || !fxapiResp.tweet) {
                return interaction.followUp({
                    content: '無法載入推文資料。',
                    ephemeral: true
                });
            }

            const tweet = fxapiResp.tweet;

            // 使用 extractor 的方法獲取回覆資訊
            const extractor = new ErmianaTwitterExtractor();
            const replyInfo = await extractor.getReplyTweetInfo(tweet);

            // 檢查是否有回覆推文
            if (!replyInfo || !replyInfo.tweet) {
                return interaction.followUp({
                    content: '此推文沒有回覆內容或無法獲取被回覆的推文。',
                    ephemeral: true
                });
            }

            // 取得現有的 embed 並添加回覆 Field
            const currentEmbed = interaction.message.embeds[0];
            const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
            const updatedEmbed = EmbedBuilder.from(currentEmbed);

            // 建立回覆推文 Field（使用與引用相同的邏輯）
            const replyTweet = replyInfo.tweet;
            const replyUsername = replyInfo.username || replyTweet.author.screen_name;
            const replyDisplayName = replyTweet.author.name || replyTweet.author.screen_name;

            // 處理被回覆推文內容
            const TextTruncator = require('../ermiana-system/utils/text-truncator');
            const truncator = new TextTruncator();
            const rawReplyContent = replyTweet.text || '回覆內容';
            const replyTruncationResult = truncator.processTweetContent(rawReplyContent, '回覆推文');
            const truncatedReplyContent = replyTruncationResult.text;

            const quotedContent = truncatedReplyContent
                .split('\n')
                .map(line => line.trim() === '' ? '> 　' : `> ${line}`)
                .join('\n');

            const repliedTweetURL = `https://twitter.com/${replyUsername}/status/${replyTweet.id}`;
            const authorProfileURL = `https://twitter.com/${replyUsername}`;
            const fieldValue = `> [回覆](${repliedTweetURL}): ${replyDisplayName} ([@${replyUsername}](${authorProfileURL}))\n> 　\n${quotedContent}`;

            updatedEmbed.addFields({
                name: '\u200B',
                value: fieldValue,
                inline: false
            });

            // 處理被回覆推文的圖片
            let originalImage = null;
            if (currentEmbed.image) {
                // 保存原始圖片 URL（用於恢復）
                originalImage = currentEmbed.image.url;
            }

            // 如果被回覆推文有圖片，顯示第一張
            if (replyTweet.media && replyTweet.media.all && replyTweet.media.all.length > 0) {
                const firstMedia = replyTweet.media.all.find(m => m.type !== 'video' && m.url);
                if (firstMedia) {
                    updatedEmbed.setImage(firstMedia.url);

                    // 如果有多張圖，在 Field 中註記
                    const imageCount = replyTweet.media.all.filter(m => m.type !== 'video').length;
                    if (imageCount > 1) {
                        console.log(`[Twitter回覆] 被回覆推文有 ${imageCount} 張圖片，顯示第一張`);
                    }
                }
            }

            // 更新按鈕（在同一行中更新回覆按鈕）
            let allComponents = interaction.message.components ? interaction.message.components.slice() : [];

            // 找到包含切換按鈕的那一行
            const toggleRowIndex = allComponents.findIndex(row =>
                row.components && row.components.some(btn =>
                    btn.customId && (
                        btn.customId.includes('show_quote') || btn.customId.includes('hide_quote') ||
                        btn.customId.includes('show_reply') || btn.customId.includes('hide_reply') ||
                        btn.customId.includes('twitter_expand_') || btn.customId.includes('twitter_collapse_')
                    )
                )
            );

            if (toggleRowIndex !== -1) {
                // 在同一行中更新回覆按鈕
                const existingRow = allComponents[toggleRowIndex];
                const newButtons = existingRow.components.map(btn => {
                    if (btn.customId && (btn.customId.includes('show_reply') || btn.customId.includes('hide_reply'))) {
                        return extractor.buildReplyToggleButtonComponent(tweetId, true); // true = 顯示狀態
                    }
                    return btn;
                });
                allComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
            } else {
                // 沒有找到切換按鈕行，添加新的
                const replyButton = extractor.buildReplyToggleButton(tweetId, true);
                allComponents.push(replyButton);
            }

            // 在 embed 的 footer 或某處保存原始圖片 URL（用於恢復）
            // 使用一個特殊的隱藏欄位來保存
            if (originalImage) {
                updatedEmbed.data._originalImage = originalImage;
            }

            await interaction.editReply({
                embeds: [updatedEmbed],
                components: allComponents
            });

        } catch (error) {
            console.error(`[Twitter] 顯示回覆原文失敗:`, error);
            // 因為已經 deferUpdate，所以用 followUp 或 editReply
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '顯示原文時發生錯誤。',
                        components: interaction.message.components
                    });
                }
            } catch (replyError) {
                console.error(`[Twitter回覆] 回應錯誤失敗:`, replyError);
            }
        }
    },

    /**
     * 處理收回回覆原文按鈕
     */
    async handleHideReply(interaction, tweetId) {
        try {
            // 立即延遲回應，防止 3 秒超時
            await interaction.deferUpdate();

            // 取得現有的 embed 並移除回覆 Field
            const currentEmbed = interaction.message.embeds[0];
            const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
            const updatedEmbed = EmbedBuilder.from(currentEmbed);

            // 移除回覆 Field（找到包含 [回覆] 的 field）
            if (updatedEmbed.data.fields && updatedEmbed.data.fields.length > 0) {
                const replyFieldIndex = updatedEmbed.data.fields.findIndex(f =>
                    f.name === '\u200B' && f.value.includes('[回覆]')
                );
                if (replyFieldIndex !== -1) {
                    updatedEmbed.data.fields.splice(replyFieldIndex, 1);
                }
            }

            // 恢復原始圖片（如果有保存）
            if (currentEmbed.data._originalImage) {
                updatedEmbed.setImage(currentEmbed.data._originalImage);
                delete updatedEmbed.data._originalImage;
            } else {
                // 沒有保存的原始圖片，需要重新獲取推文資料
                try {
                    const httpClient = new HTTPClient();
                    const fxapiResp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, {
                        timeout: 3000
                    });

                    if (fxapiResp && fxapiResp.tweet) {
                        const tweet = fxapiResp.tweet;
                        // 恢復原推文的圖片
                        if (tweet.media && tweet.media.photos && tweet.media.photos.length > 0) {
                            updatedEmbed.setImage(tweet.media.photos[0].url);
                        } else {
                            // 沒有圖片，移除圖片
                            updatedEmbed.setImage(null);
                        }
                    }
                } catch (fetchError) {
                    console.error('[Twitter回覆] 重新獲取推文失敗:', fetchError);
                    // 失敗時移除圖片
                    updatedEmbed.setImage(null);
                }
            }

            // 更新按鈕（在同一行中更新回覆按鈕）
            const extractor = new ErmianaTwitterExtractor();
            let allComponents = interaction.message.components ? interaction.message.components.slice() : [];

            // 找到包含切換按鈕的那一行
            const toggleRowIndex = allComponents.findIndex(row =>
                row.components && row.components.some(btn =>
                    btn.customId && (
                        btn.customId.includes('show_quote') || btn.customId.includes('hide_quote') ||
                        btn.customId.includes('show_reply') || btn.customId.includes('hide_reply') ||
                        btn.customId.includes('twitter_expand_') || btn.customId.includes('twitter_collapse_')
                    )
                )
            );

            if (toggleRowIndex !== -1) {
                // 在同一行中更新回覆按鈕
                const existingRow = allComponents[toggleRowIndex];
                const newButtons = existingRow.components.map(btn => {
                    if (btn.customId && (btn.customId.includes('show_reply') || btn.customId.includes('hide_reply'))) {
                        return extractor.buildReplyToggleButtonComponent(tweetId, false); // false = 隱藏狀態
                    }
                    return btn;
                });
                allComponents[toggleRowIndex] = new ActionRowBuilder().addComponents(...newButtons);
            } else {
                // 沒有找到切換按鈕行，添加新的
                const replyButton = extractor.buildReplyToggleButton(tweetId, false);
                allComponents.push(replyButton);
            }

            await interaction.editReply({
                embeds: [updatedEmbed],
                components: allComponents
            });

        } catch (error) {
            console.error(`[Twitter] 收回回覆原文失敗:`, error);
            // 因為已經 deferUpdate，所以用 followUp 或 editReply
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '收回原文時發生錯誤。',
                        components: interaction.message.components
                    });
                }
            } catch (replyError) {
                console.error(`[Twitter回覆] 回應錯誤失敗:`, replyError);
            }
        }
    }
};