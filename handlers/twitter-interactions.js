const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');
const db = require('../db');

/**
 * 檢查互動使用者是否為本伺服器的 TFD owner
 * 公開版設計：無 owner 設定的伺服器 = 此功能停用
 */
function isGuildOwner(interaction) {
    if (!interaction.guildId) return false;
    const settings = db.guilds.get(interaction.guildId);
    const ownerId = settings?.owner_user_id;
    return ownerId && interaction.user.id === ownerId;
}

class TwitterInteractionHandler {
    constructor() {
        this.twitterClient = null;
        this.geminiTranslator = getGeminiTranslator(); // GEMINI 翻譯器
        this.initTwitterClient();
    }

    initTwitterClient() {
        try {
            const { 
                X_CONSUMER_API_KEY,
                X_CONSUMER_API_KEY_SECRET,
                X_ACCESS_TOKEN,
                X_ACCESS_TOKEN_SECRET
            } = process.env;

            if (!X_CONSUMER_API_KEY || !X_CONSUMER_API_KEY_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
                console.error('[Twitter] 缺少必要的環境變數');
                return;
            }

            this.twitterClient = new TwitterApi({
                appKey: X_CONSUMER_API_KEY,
                appSecret: X_CONSUMER_API_KEY_SECRET,
                accessToken: X_ACCESS_TOKEN,
                accessSecret: X_ACCESS_TOKEN_SECRET,
            });

            console.log('[Twitter] API 客戶端初始化成功');
        } catch (error) {
            console.error('[Twitter] 初始化失敗:', error);
        }
    }

    async handlePrepareButton(interaction) {
        try {
            // 檢查管理員權限
            if (!isGuildOwner(interaction)) {
                await interaction.reply({
                    content: '❌ 此功能僅限本伺服器 Peko Embed owner 使用（請伺服器管理員以 `/pe owner` 指定）。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const messageId = interaction.customId.split(':')[1];
            
            // 從原始訊息獲取熱門訊息資料
            const originalEmbed = interaction.message.embeds[0];
            if (!originalEmbed) {
                await interaction.reply({
                    content: '❌ 找不到訊息資料',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // 解析嵌入式訊息中的資料
            const messageData = this.parseEmbedData(originalEmbed, messageId);

            // ⚡ 快速建立預設推文內容（使用原文，避免超時）
            // 翻譯將在模態提交後執行
            let defaultTweetContent = '今日のぺこ村\n\n';

            // 處理引用回覆
            if (messageData.reference) {
                defaultTweetContent += `とある野うさぎA：${messageData.reference.content || '(無內容)'}\n`;
                defaultTweetContent += `とある野うさぎB：${messageData.content || '(無內容)'}\n\n`;
            } else {
                // 一般訊息
                const content = messageData.content || '(圖片或貼圖內容)';
                const truncatedContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
                defaultTweetContent += `とある野うさぎ：${truncatedContent}\n\n`;
            }

            // 添加標籤
            defaultTweetContent += '#ぺこらいぶ\n#ぺこ村';

            // 🚫 不再在推文內容中包含圖片 URL（改為直接上傳）
            // 圖片將在發推時自動上傳並附加

            // 創建模態視窗
            const modal = new ModalBuilder()
                .setCustomId(`twitter_modal:${messageId}`)
                .setTitle('編輯推特發文內容');

            const tweetInput = new TextInputBuilder()
                .setCustomId('tweet_content')
                .setLabel('推文內容')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('編輯你的推文內容...')
                .setValue(defaultTweetContent)
                .setMaxLength(280)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(tweetInput);
            modal.addComponents(firstActionRow);

            // 💾 儲存訊息資料（包含圖片），供模態提交時使用
            this.preparedMessages = this.preparedMessages || new Map();
            this.preparedMessages.set(messageId, {
                messageData: messageData,
                timestamp: Date.now()
            });

            await interaction.showModal(modal);
            console.log(`[Twitter] 顯示編輯模態視窗: ${messageId}`);

        } catch (error) {
            console.error('[Twitter] 處理準備按鈕錯誤:', error);
            // 嘗試回應，但用 try-catch 避免重複回應錯誤
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ 處理請求時發生錯誤',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                // 忽略回應錯誤，避免錯誤傳播
            }
        }
    }

    async handleModalSubmit(interaction) {
        try {
            // 檢查管理員權限
            if (!isGuildOwner(interaction)) {
                await interaction.reply({
                    content: '❌ 此功能僅限本伺服器 Peko Embed owner 使用（請伺服器管理員以 `/pe owner` 指定）。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const messageId = interaction.customId.split(':')[1];
            let tweetContent = interaction.fields.getTextInputValue('tweet_content');

            // ⏰ 先延遲回應，避免翻譯超時
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // 🔥 自動翻譯成 5CH 風格日文
            console.log('[Twitter] 🌐 開始翻譯推文內容成 5CH 風格日文...');

            try {
                // 🔥 支援多行內容的翻譯
                // 匹配模式：とある野うさぎ[A/B]：[內容]（內容可跨多行，到下一個野うさぎ或#標籤為止）
                const regex = /とある野うさぎ([AB]?)：([\s\S]*?)(?=\nとある野うさぎ|\n#|$)/g;
                const matches = [...tweetContent.matchAll(regex)];

                if (matches && matches.length > 0) {
                    console.log(`[Twitter] 找到 ${matches.length} 段需要翻譯的內容`);

                    for (const match of matches) {
                        const fullMatch = match[0];
                        const suffix = match[1] || ''; // A, B 或空
                        const originalText = match[2].trim();
                        const prefix = `とある野うさぎ${suffix}：`;

                        if (originalText && originalText !== '(無內容)' && originalText !== '(圖片或貼圖內容)') {
                            console.log('[Twitter] 原文:', originalText.substring(0, 80) + (originalText.length > 80 ? '...' : ''));

                            // 翻譯（保留換行符，將多行合併後翻譯）
                            const textToTranslate = originalText.replace(/\n/g, ' ').trim();
                            const translated = await this.geminiTranslator.to5CHJapanese(textToTranslate);

                            // 限制長度
                            let finalText = translated.text;
                            if (finalText.length > 150) {
                                finalText = finalText.substring(0, 150) + '...';
                            }

                            // 替換原文（保持原本的換行結構）
                            tweetContent = tweetContent.replace(fullMatch, prefix + finalText);
                            console.log('[Twitter] 譯文:', finalText.substring(0, 80) + (finalText.length > 80 ? '...' : ''));
                        }
                    }

                    console.log('[Twitter] ✅ 翻譯完成');
                } else {
                    console.log('[Twitter] ⚠️ 未找到「とある野うさぎ：」格式的內容，跳過翻譯');
                }
            } catch (error) {
                console.error('[Twitter] ❌ 翻譯失敗，使用原文:', error.message);
                // 翻譯失敗時保持原文不變
            }

            // 創建確認嵌入式訊息
            const embed = new EmbedBuilder()
                .setTitle('📝 確認推特發文')
                .setDescription('請確認以下內容是否正確：')
                .addFields({
                    name: '推文內容',
                    value: `\`\`\`\n${tweetContent}\n\`\`\``,
                    inline: false
                })
                .addFields({
                    name: '📊 統計資訊',
                    value: `字數：${tweetContent.length}/280`,
                    inline: true
                })
                .setColor(0x1DA1F2)
                .setTimestamp();

            // 創建確認和取消按鈕
            const confirmButton = new ButtonBuilder()
                .setCustomId(`twitter_confirm:${messageId}`)
                .setLabel('確認發推')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅');

            const cancelButton = new ButtonBuilder()
                .setCustomId(`twitter_cancel:${messageId}`)
                .setLabel('取消')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌');

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            // 從記憶體中提取圖片 URLs
            const preparedMessage = this.preparedMessages?.get(messageId);
            const imageUrls = [];

            if (preparedMessage && preparedMessage.messageData) {
                const messageData = preparedMessage.messageData;

                // 收集圖片 URLs
                if (messageData.attachments && messageData.attachments.length > 0) {
                    messageData.attachments.forEach(att => {
                        if (att.content_type && att.content_type.startsWith('image/')) {
                            imageUrls.push(att.url);
                        }
                    });
                }

                console.log(`[Twitter] 📸 偵測到 ${imageUrls.length} 張圖片`);

                // 清理記憶體
                this.preparedMessages.delete(messageId);
            } else {
                console.warn(`[Twitter] ⚠️  找不到訊息資料: ${messageId}`);
            }

            // 儲存推文內容和圖片 URLs 供確認時使用
            this.pendingTweets = this.pendingTweets || new Map();
            this.pendingTweets.set(messageId, {
                content: tweetContent,
                imageUrls: imageUrls, // 🔥 儲存圖片 URLs
                userId: interaction.user.id,
                timestamp: Date.now()
            });

            console.log(`[Twitter] 模態提交處理完成: ${messageId}`);

        } catch (error) {
            console.error('[Twitter] 處理模態提交錯誤:', error);
            // 嘗試回應，但用 try-catch 避免重複回應錯誤
            try {
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({
                        content: '❌ 處理請求時發生錯誤'
                    });
                } else if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ 處理請求時發生錯誤',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                // 忽略回應錯誤，避免錯誤傳播
            }
        }
    }

    async handleConfirmButton(interaction) {
        try {
            // 檢查管理員權限
            if (!isGuildOwner(interaction)) {
                await interaction.reply({
                    content: '❌ 此功能僅限本伺服器 Peko Embed owner 使用（請伺服器管理員以 `/pe owner` 指定）。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const [action, messageId] = interaction.customId.split(':');
            
            if (action === 'twitter_cancel') {
                // 處理取消
                this.pendingTweets?.delete(messageId);
                
                const embed = new EmbedBuilder()
                    .setTitle('❌ 已取消發推')
                    .setDescription('推特發文已取消。')
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.update({
                    embeds: [embed],
                    components: []
                });

                console.log(`[Twitter] 發推已取消: ${messageId}`);
                return;
            }

            if (action === 'twitter_confirm') {
                // 處理確認發推
                const pendingTweet = this.pendingTweets?.get(messageId);
                if (!pendingTweet) {
                    await interaction.update({
                        content: '❌ 找不到待發推的內容，請重新操作。',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                // 檢查用戶權限
                if (pendingTweet.userId !== interaction.user.id) {
                    await interaction.reply({
                        content: '❌ 你沒有權限執行此操作。',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // 發送推文（包含圖片）
                await interaction.deferUpdate();

                const result = await this.postTweet(pendingTweet.content, pendingTweet.imageUrls || []);
                
                let embed;
                if (result.success) {
                    embed = new EmbedBuilder()
                        .setTitle('✅ 推文發送成功！')
                        .setDescription(`推文已成功發送到推特！`)
                        .addFields({
                            name: '🔗 推文連結',
                            value: `[查看推文](${result.url})`,
                            inline: false
                        })
                        .setColor(0x00FF00)
                        .setTimestamp();
                } else {
                    embed = new EmbedBuilder()
                        .setTitle('❌ 推文發送失敗')
                        .setDescription(`發送推文時發生錯誤：${result.error}`)
                        .setColor(0xFF0000)
                        .setTimestamp();
                }

                await interaction.editReply({
                    embeds: [embed],
                    components: []
                });

                // 清理暫存資料
                this.pendingTweets.delete(messageId);
                console.log(`[Twitter] 推文處理完成: ${messageId}, 成功: ${result.success}`);
            }

        } catch (error) {
            console.error('[Twitter] 處理確認按鈕錯誤:', error);
            
            const embed = new EmbedBuilder()
                .setTitle('❌ 處理錯誤')
                .setDescription('處理推文時發生錯誤，請稍後再試。')
                .setColor(0xFF0000)
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed],
                    components: []
                });
            } else {
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            }
        }
    }

    /**
     * 從 URL 下載圖片到暫存檔案
     * @param {string} url 圖片 URL
     * @returns {Promise<string>} 暫存檔案路徑
     */
    async downloadImage(url) {
        try {
            console.log(`[Twitter] 📥 下載圖片: ${url.substring(0, 80)}...`);

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            // 創建 temp/twitter 目錄（如果不存在）
            const tempDir = path.join(__dirname, '../temp/twitter');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // 生成隨機檔名
            const ext = url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)?.[1] || 'jpg';
            const filename = `twitter_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const filepath = path.join(tempDir, filename);

            // 寫入檔案
            fs.writeFileSync(filepath, response.data);

            console.log(`[Twitter] ✅ 圖片下載完成: ${filename}`);
            return filepath;
        } catch (error) {
            console.error(`[Twitter] ❌ 圖片下載失敗:`, error.message);
            throw error;
        }
    }

    /**
     * 上傳圖片到 Twitter 並取得 media_id
     * @param {string} filepath 本地圖片路徑
     * @returns {Promise<string>} media_id
     */
    async uploadImageToTwitter(filepath) {
        try {
            console.log(`[Twitter] 📤 上傳圖片到 Twitter: ${path.basename(filepath)}`);

            const mediaId = await this.twitterClient.v1.uploadMedia(filepath);

            console.log(`[Twitter] ✅ 圖片上傳成功，media_id: ${mediaId}`);
            return mediaId;
        } catch (error) {
            console.error(`[Twitter] ❌ 圖片上傳失敗:`, error.message);
            throw error;
        } finally {
            // 刪除暫存檔案
            try {
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                    console.log(`[Twitter] 🗑️  已刪除暫存檔案: ${path.basename(filepath)}`);
                }
            } catch (cleanupError) {
                console.warn(`[Twitter] ⚠️  清理暫存檔案失敗:`, cleanupError.message);
            }
        }
    }

    async postTweet(content, imageUrls = []) {
        try {
            if (!this.twitterClient) {
                return {
                    success: false,
                    error: 'Twitter 客戶端未初始化'
                };
            }

            // 🖼️ 處理圖片上傳（如果有圖片）
            let mediaIds = [];
            if (imageUrls && imageUrls.length > 0) {
                console.log(`[Twitter] 🖼️  準備上傳 ${imageUrls.length} 張圖片`);

                for (const imageUrl of imageUrls) {
                    try {
                        // 下載圖片
                        const filepath = await this.downloadImage(imageUrl);

                        // 上傳到 Twitter
                        const mediaId = await this.uploadImageToTwitter(filepath);
                        mediaIds.push(mediaId);
                    } catch (error) {
                        console.error(`[Twitter] ⚠️  圖片處理失敗，跳過: ${imageUrl}`, error.message);
                        // 繼續處理其他圖片，不中斷流程
                    }
                }

                console.log(`[Twitter] ✅ 成功上傳 ${mediaIds.length} 張圖片`);
            }

            // 發推（附加圖片 media_ids）
            const tweetOptions = {
                text: content
            };

            if (mediaIds.length > 0) {
                tweetOptions.media = {
                    media_ids: mediaIds
                };
            }

            const tweet = await this.twitterClient.v2.tweet(tweetOptions);
            
            return {
                success: true,
                url: `https://twitter.com/user/status/${tweet.data.id}`,
                id: tweet.data.id
            };

        } catch (error) {
            console.error('[Twitter] 發推錯誤:', error);
            
            let errorMessage = '未知錯誤';
            let diagnosticInfo = '';
            
            // 詳細錯誤分析
            if (error.code === 403 || (error.data && error.data.status === 403)) {
                console.error('[Twitter] 403 認證錯誤 - 詳細資訊:', {
                    code: error.code,
                    message: error.message,
                    data: error.data,
                    errors: error.errors
                });
                
                errorMessage = '403 認證錯誤';
                diagnosticInfo = '\n可能原因:\n• Twitter應用程式權限不足(需要Read and Write)\n• Access Token過期或無效\n• 帳戶被限制\n• API金鑰配置錯誤';
                
                if (error.data && error.data.detail) {
                    diagnosticInfo += `\nAPI詳情: ${error.data.detail}`;
                }
            } else if (error.errors && error.errors.length > 0) {
                errorMessage = error.errors[0].message;
                if (error.errors[0].code) {
                    diagnosticInfo = `\n錯誤代碼: ${error.errors[0].code}`;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            console.error(`[Twitter] 錯誤診斷: ${errorMessage}${diagnosticInfo}`);

            return {
                success: false,
                error: errorMessage + (diagnosticInfo ? ' (請查看控制台詳情)' : '')
            };
        }
    }

    parseEmbedData(embed, messageId) {
        const messageData = {
            message_id: messageId,
            content: '',
            attachments: [],
            reference: null
        };

        // 解析訊息內容
        const contentField = embed.fields?.find(field => field.name === '💬 訊息內容');
        if (contentField) {
            messageData.content = contentField.value.replace(/^\*\(無文字內容\)\*$/, '');
        }

        // 解析附件
        const attachmentField = embed.fields?.find(field => field.name === '📎 附件');
        if (attachmentField) {
            // 解析附件連結
            const attachmentMatches = attachmentField.value.match(/\[([^\]]+)\]\(([^)]+)\)/g);
            if (attachmentMatches) {
                messageData.attachments = attachmentMatches.map(match => {
                    const [, name, url] = match.match(/\[([^\]]+)\]\(([^)]+)\)/);
                    return {
                        name,
                        url,
                        content_type: name.match(/\.(jpg|jpeg|png|gif)$/i) ? 'image/' + RegExp.$1 : 'unknown'
                    };
                });
            }
        }

        // 解析引用回覆
        const referenceField = embed.fields?.find(field => field.name === '↩️ 回覆的原文');
        if (referenceField) {
            const lines = referenceField.value.split('\n');
            const contentLine = lines.find(line => line.startsWith('**內容:**'));
            if (contentLine) {
                messageData.reference = {
                    content: contentLine.replace('**內容:** ', '').replace(/^\*\(無內容\)\*$/, '')
                };
            }
        }

        // 處理圖片（避免重複添加）
        if (embed.image) {
            // 檢查是否已存在相同 URL 的附件
            const imageUrl = embed.image.url;
            const alreadyExists = messageData.attachments.some(att => att.url === imageUrl);

            if (!alreadyExists) {
                messageData.attachments.push({
                    name: '圖片',
                    url: imageUrl,
                    content_type: 'image/unknown'
                });
            }
        }

        return messageData;
    }
}

// 建立單例實例
const twitterHandler = new TwitterInteractionHandler();

module.exports = {
    handlePrepareButton: (interaction) => twitterHandler.handlePrepareButton(interaction),
    handleModalSubmit: (interaction) => twitterHandler.handleModalSubmit(interaction),
    handleConfirmButton: (interaction) => twitterHandler.handleConfirmButton(interaction)
};