/**
 * TFD 系統 - 完全重現版本的訊息處理器
 * 100% 模擬原版 TFD 的行為和格式
 */

const LinkProcessor = require('./link-processor');
const config = require('../config/tfd-config.json');
const { EmbedBuilder, AttachmentBuilder, MessageFlags, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const { cacheContent } = require('../../handlers/content-translation-interactions.js');
const axios = require('axios');
const tlog = require('../../utils/tfd-logger');

// Webhook 管理器 - 用於以使用者身份發送訊息
const { sendWithWebhook, editWebhookMessage, canUseWebhook, hasWebhookPermission } = require('../../utils/webhook-manager');
const { normalizeAuthorForBlacklist } = require('../../utils/normalize-author.js');
const { getInstance: getGBM } = require('../../utils/guild-blacklist-manager.js');

// URL 統計（footer N/M/O 顯示用）
const { recordUrl } = require('../utils/url-stats');

const db = require('../../db');

class TFDMessageHandler {
    constructor() {
        this.linkProcessor = new LinkProcessor();
        this.config = config;
        this.processedMessages = new Set();
        this.iconURL = 'https://ermiana.canaria.cc/pic/canaria.png'; // 原版 TFD 圖標
    }


    /**
     * 🌐 使用 Webhook 發送訊息（以使用者身份顯示）
     * 如果 Webhook 不可用，自動回退到 Bot 發送
     * @param {Object} message - 原始 Discord 訊息
     * @param {Object} options - 發送選項
     * @param {Array} [options.embeds] - Embed 陣列
     * @param {Array} [options.components] - 按鈕等組件
     * @param {Array} [options.files] - 附件檔案
     * @param {string} [options.content] - 文字內容
     * @param {boolean} [options.isReply=true] - 是否為回覆模式
     * @param {boolean} [options.deleteOriginal=true] - 是否刪除原始訊息
     * @param {boolean} [options.addUserMention=true] - 是否加入使用者標記
     * @param {string} [options.originalUrl] - 原始 URL（用於日誌）
     * @returns {Promise<Message>} 發送的訊息
     */
    async sendViaWebhook(message, options = {}) {
        const channel = message.channel;
        const author = message.author;
        const deleteOriginal = options.deleteOriginal !== false; // 預設刪除
        const addUserMention = options.addUserMention !== false; // 預設加入標記

        // 检查是否使用 V2 Components
        const isV2Components = options.flags && (options.flags & 32768); // 32768 = IsComponentsV2

        // 🖼️ 處理使用者附件：只在第一個訊息發送時附加使用者的原始附件
        let filesToSend = options.files ? [...options.files] : [];
        if (!message._userAttachmentsProcessed && message._userAttachments && message._userAttachments.length > 0) {
            // 合併使用者附件與其他附件（只執行一次）
            filesToSend = [...filesToSend, ...message._userAttachments];
            this.log(`📎 附加使用者附件: ${message._userAttachments.length} 個`);
            // 標記已處理，避免重複附加
            message._userAttachmentsProcessed = true;
        }

        // 準備內容：加入使用者標記 + 原網址 + 使用者非網址文字
        // 注意：V2 Components 不支援 content 字段
        let finalContent = '';
        if (!isV2Components) {
            finalContent = options.content || '';
            if (addUserMention && options.isReply !== false) {
                // 格式：-# <@userId> <原網址>
                //       使用者的非網址文字（只在第一個訊息顯示）
                const originalUrl = options.originalUrl || message._currentOriginalUrl || '';

                // 只在第一個訊息顯示使用者的非網址文字
                const userText = message._isFirstUrlConversion ? (options.userText || message._userText || '') : '';

                // 第一行：使用者標記 + 原網址（如果有）
                let headerLine = `-# <@${author.id}>`;
                if (originalUrl) {
                    headerLine += ` <${originalUrl}>`;
                }

                // 組合最終內容
                const parts = [headerLine];
                if (userText) {
                    parts.push(userText);
                }
                if (finalContent) {
                    parts.push(finalContent);
                }
                finalContent = parts.join('\n');

                // 標記已發送第一個訊息
                message._isFirstUrlConversion = false;
            }
        }

        // 🕶️ 附加防爆雷按鈕（非 V2 Components 訊息）
        if (!isV2Components && options.addSpoilerButton !== false) {
            const { appendReportButton } = require('../../utils/spoiler-button-helper.js');
            options.components = appendReportButton(options.components);
        }

        let sentMsg = null;

        try {
            // 檢查是否可以使用 Webhook
            if (canUseWebhook(channel) && hasWebhookPermission(channel)) {
                // 使用 Webhook 發送（顯示為使用者的名稱和頭像）
                // 優先順序: 伺服器暱稱 → 全域顯示名稱 → 帳號名稱
                const webhookOptions = {
                    username: message.member?.displayName || author.globalName || author.username,
                    avatarURL: author.displayAvatarURL({ dynamic: true }),
                    files: filesToSend.length > 0 ? filesToSend : undefined, // 🖼️ 使用處理後的附件列表
                    flags: options.flags  // 2026-04-11: 支援 V2 Components flags
                };

                // V2 Components 不使用 content 和 embeds
                if (!isV2Components) {
                    webhookOptions.embeds = options.embeds;
                    webhookOptions.components = options.components;  // 一般推文也需要按钮
                    webhookOptions.content = finalContent || undefined;
                } else {
                    // V2 只需要 components
                    webhookOptions.components = options.components;
                }

                // 2026-02-23: 如果原始訊息是回覆某人的，用小字標記回覆關係
                // Discord webhook 不支援 message_reference，改用 -# 小字顯示
                // 為避免通知被回覆者，先用純文字發送，再編輯成 mention
                let replyEditInfo = null; // 儲存編輯資訊
                if (message.reference && message.reference.messageId) {
                    try {
                        // 嘗試獲取被回覆的訊息
                        const repliedMessage = await channel.messages.fetch(message.reference.messageId).catch(() => null);
                        if (repliedMessage) {
                            // 構建訊息連結
                            const messageLink = `https://discord.com/channels/${message.reference.guildId}/${message.reference.channelId}/${message.reference.messageId}`;

                            // 判斷被回覆的訊息是否為 Webhook（URL 轉換產生的訊息）
                            // 如果是 Webhook，真正的原文作者是訊息中第一個被提及的用戶
                            let repliedUser = repliedMessage.author;
                            if (repliedMessage.webhookId) {
                                const firstMention = repliedMessage.mentions.users.first();
                                if (firstMention) {
                                    repliedUser = firstMention;
                                }
                            }

                            // 被回覆者的顯示名稱（用於先發送，不會通知）
                            const repliedMember = repliedMessage.webhookId && repliedMessage.mentions.users.first()
                                ? await message.guild.members.fetch(repliedUser.id).catch(() => null)
                                : repliedMessage.member;
                            const repliedUsername = repliedMember?.displayName || repliedUser.globalName || repliedUser.username;
                            // 先用純文字版本（不會通知被回覆者）
                            const replyNoticeTemp = `-# <@${author.id}> 回覆了 **${repliedUsername}** 的[訊息](${messageLink})`;
                            // 編輯後的版本（帶 mention，但編輯不會通知）
                            const replyNoticeFinal = `-# <@${author.id}> 回覆了 <@${repliedUser.id}> 的[訊息](${messageLink})`;

                            if (isV2Components) {
                                // V2 模式：不能用 content 欄位，改為修改 Container 第一個 TextDisplay
                                // TextDisplay 內的 mention 不觸發通知，可直接用 final（帶 mention）版本
                                const v2Container = webhookOptions.components?.[0];
                                if (v2Container?.components?.[0]) {
                                    const firstDisplay = v2Container.components[0];
                                    if (typeof firstDisplay.setContent === 'function') {
                                        const existingContent = firstDisplay.data?.content || '';
                                        // 保留原始 URL（格式為 <url>）
                                        const urlMatch = existingContent.match(/<(https?:\/\/[^>]+)>/);
                                        const urlPart = urlMatch ? `\n-# <${urlMatch[1]}>` : '';
                                        firstDisplay.setContent(
                                            `-# <@${author.id}> 回覆了 <@${repliedUser.id}> 的[訊息](${messageLink})${urlPart}`
                                        );
                                    }
                                }
                                // V2 不需要 replyEditInfo（無 content 需要後續編輯）
                            } else {
                                // 非 V2：替換原本的作者標記行（避免重複顯示作者）
                                // 格式：第一行回覆標記，第二行原網址，第三行使用者文字
                                let originalUrlLine = '';
                                if (webhookOptions.content && webhookOptions.content.startsWith('-# <@')) {
                                    const lines = webhookOptions.content.split('\n');
                                    const firstLine = lines[0];
                                    // 提取原網址部分（如果有），放到第二行
                                    const urlMatch = firstLine.match(/<(https?:\/\/[^>]+)>/);
                                    originalUrlLine = urlMatch ? `<${urlMatch[1]}>` : '';
                                    // 移除第一行（原作者標記行），用回覆標記替換
                                    lines.shift();
                                    // 組合：回覆標記 + 原網址（換行） + 其餘內容
                                    const newLines = [replyNoticeTemp];
                                    if (originalUrlLine) newLines.push(originalUrlLine);
                                    newLines.push(...lines);
                                    webhookOptions.content = newLines.join('\n');
                                } else {
                                    // 沒有作者標記行，直接加在最前面
                                    webhookOptions.content = replyNoticeTemp + (webhookOptions.content ? '\n' + webhookOptions.content : '');
                                }

                                // 儲存編輯資訊，發送後需要編輯
                                replyEditInfo = {
                                    searchText: replyNoticeTemp,
                                    replaceText: replyNoticeFinal
                                };
                            }

                            this.log(`🔗 標記回覆關係: ${author.username} 回覆了 ${repliedUsername} 的訊息`);
                        }
                    } catch (fetchError) {
                        // 無法獲取被回覆的訊息，靜默忽略
                        this.log(`⚠️ 無法獲取被回覆的訊息: ${fetchError.message}`);
                    }
                }

                sentMsg = await sendWithWebhook(channel, webhookOptions);

                // 發送成功後，用 webhook 編輯訊息把純文字改成 mention（編輯不會發送通知）
                if (replyEditInfo && sentMsg && sentMsg.id) {
                    try {
                        const editedContent = webhookOptions.content.replace(replyEditInfo.searchText, replyEditInfo.replaceText);
                        await editWebhookMessage(channel, sentMsg.id, {
                            content: editedContent,
                            embeds: webhookOptions.embeds,
                            components: webhookOptions.components
                        });
                        this.log(`✏️ 已編輯訊息，加入被回覆者 mention`);
                    } catch (editError) {
                        // 編輯失敗不影響主流程
                        this.log(`⚠️ 編輯回覆標記失敗: ${editError.message}`);
                    }
                }

                // 🗑️ 刪除原始訊息
                if (deleteOriginal && options.isReply !== false) {
                    try {
                        // 給 Discord 客戶端一點時間穩定顯示新的 webhook embed，減少圖片閃現後消失
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await message.delete();
                        // 🔧 標記訊息已刪除，避免後續 embedSuppresser 出錯
                        message._deleted = true;
                    } catch (deleteError) {
                        // 靜默處理刪除失敗（可能已被刪除或無權限）
                    }
                }

                return sentMsg;
            }
        } catch (webhookError) {
            this.log(`⚠️ Webhook 發送失敗，回退到 Bot 發送: ${webhookError.message}`);
        }

        // 回退到原本的發送方式（Bot 發送時保留 reply 格式，不刪除原訊息）
        try {
            // ⚠️ 回退發送時不包含使用者附件，避免超時問題
            // 使用者附件的 URL 可能導致下載超時
            const safeFiles = options.files || undefined;

            if (options.isReply !== false) {
                const sendOptions = {
                    files: safeFiles,
                    allowedMentions: { parse: [], repliedUser: false },
                    flags: options.flags  // 2026-04-11: 支援 V2 Components flags
                };
                // V2 Components 不使用 content 和 embeds
                if (!isV2Components) {
                    sendOptions.embeds = options.embeds;
                    sendOptions.components = options.components;  // 一般推文也需要按钮
                    sendOptions.content = options.content; // 回退時不加標記，因為 reply 已有關聯
                } else {
                    sendOptions.components = options.components;
                }
                sentMsg = await message.reply(sendOptions);
            } else {
                const sendOptions = {
                    files: safeFiles,
                    allowedMentions: { parse: [] },
                    flags: options.flags  // 2026-04-11: 支援 V2 Components flags
                };
                // V2 Components 不使用 content 和 embeds
                if (!isV2Components) {
                    sendOptions.embeds = options.embeds;
                    sendOptions.components = options.components;  // 一般推文也需要按钮
                    sendOptions.content = options.content;
                } else {
                    sendOptions.components = options.components;
                }
                sentMsg = await message.channel.send(sendOptions);
            }
        } catch (fallbackError) {
            this.log(`⚠️ 回退發送也失敗: ${fallbackError.message}`);
            // 最後嘗試：只發送文字和 embed，不包含任何附件
            try {
                if (options.isReply !== false) {
                    const sendOptions = {
                        allowedMentions: { parse: [], repliedUser: false },
                        flags: options.flags  // 2026-04-11: 支援 V2 Components flags
                    };
                    if (!isV2Components) {
                        sendOptions.embeds = options.embeds;
                        sendOptions.components = options.components;  // 一般推文也需要按钮
                        sendOptions.content = options.content;
                    } else {
                        sendOptions.components = options.components;
                    }
                    sentMsg = await message.reply(sendOptions);
                } else {
                    const sendOptions = {
                        allowedMentions: { parse: [] },
                        flags: options.flags  // 2026-04-11: 支援 V2 Components flags
                    };
                    if (!isV2Components) {
                        sendOptions.embeds = options.embeds;
                        sendOptions.components = options.components;  // 一般推文也需要按钮
                        sendOptions.content = options.content;
                    } else {
                        sendOptions.components = options.components;
                    }
                    sentMsg = await message.channel.send(sendOptions);
                }
            } catch (lastError) {
                this.log(`❌ 所有發送方式都失敗: ${lastError.message}`);
                return null; // 放棄發送，避免無限循環
            }
        }

        return sentMsg;
    }


    /**
     * 🌐 使用 Webhook 發送額外訊息（非回覆，不刪除原訊息，不加標記）
     * @param {Object} message - 原始 Discord 訊息
     * @param {Object} options - 發送選項
     * @returns {Promise<Message>} 發送的訊息
     */
    async sendExtraViaWebhook(message, options = {}) {
        return this.sendViaWebhook(message, {
            ...options,
            isReply: false,
            deleteOriginal: false,
            addUserMention: false
        });
    }

    /**
     * 取得時間前綴
     * @returns {string}
     */
    getTimePrefix() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `[${hours}:${minutes}]`;
    }

    /**
     * 統一日誌輸出
     * @param {string} message
     * @param {string} level - 'info' 或 'error'
     */
    log(message, level = 'info') {
        if (level === 'error') {
            tlog.sysError('TFD', message);
        } else {
            tlog.sys('TFD', message);
        }
    }

    /**
     * 模擬 TFD 的 typingSender
     * @param {Object} message
     */
    async typingSender(message) {
        try {
            await message.channel.sendTyping();
        } catch (error) {
            // TFD 的錯誤處理方式 - 靜默忽略
        }
    }

    /**
     * 模擬 TFD 的 embedSuppresser
     * @param {Object} message
     */
    async embedSuppresser(message) {
        try {
            // 🔧 如果原訊息已被刪除（Webhook 模式），則跳過抑制
            if (message._deleted) {
                return;
            }

            if (message && message.suppressEmbeds && typeof message.suppressEmbeds === 'function') {
                await message.suppressEmbeds(true);
                // this.log(`成功抑制訊息預覽: ${message.id}`);
            } else {
                // console.warn(`[TFD-MessageHandler] 無法抑制預覽 - 訊息不支援或已被刪除`);
            }
        } catch (error) {
            this.log(`embedSuppresser 錯誤: ${error.message}`, 'error');
            // TFD 的錯誤處理方式 - 繼續執行但記錄錯誤
        }
    }

    /**
     * 發送 Google Apps Script 處理的 Twitter 回應
     * @param {Object} message
     * @param {Object} result
     */
    async sendTwitterWithGAS(message, result) {

        try {
            const gasResult = result.gasResult;

            // 直接發送 GAS URL，讓 Discord 爬取並嵌入影片
            const content = `🌐 **${gasResult.tweetType}** - PekoEmbed 影片播放\n${gasResult.gasURL}`;

            // 🌐 使用 Webhook 發送
            await this.sendViaWebhook(message, { content });

            this.log(`✅ GAS 回應已發送: ${gasResult.tweetType}`);

        } catch (error) {
            this.log(`❌ 發送 GAS 回應時發生錯誤: ${error.message}`, 'error');

            // 🌐 使用 Webhook 發送錯誤回應
            await this.sendViaWebhook(message, {
                content: '❌ 處理混合媒體推文時發生錯誤，請稍後再試。'
            });
        }
    }

    /**
     * 發送多圖片 Pixiv 回應 (多嵌入式訊息方式，模仿推特)
     * @param {Object} message
     * @param {Object} result
     */
    async sendPixivWithMultipleEmbeds(message, result) {
        try {
            const isR18 = result.contentType === 'r18_artwork' || result.data?.isR18;
            tlog.log('Pixiv', message, `多圖 ${result.multipleImages.length} 張, R18=${isR18}`);

            const originalURL = result.pagination.originalURL || 'https://www.pixiv.net';

            // 2026-02-09: R18 靜態圖不再需要防爆雷，處理方式與一般圖片相同
            // 只有 Ugoira 動圖才需要特殊處理（但動圖在 pixiv.js 已被攔截處理）

            // 統一處理：使用附件方式發送圖片（避免多 embed 洗頻）
            const PixivImageAttachmentOptimizer = require('../extractors/pixiv-image-attachment-optimizer.js');
            const optimizer = new PixivImageAttachmentOptimizer();

            // 嘗試使用附件方式
            const artworkId = result.pagination?.artworkId || 'unknown';
            const attachmentResult = await optimizer.processImageAttachments(result.multipleImages, artworkId);

            if (attachmentResult && attachmentResult.success) {
                // 使用附件方式：文字 embed + 圖片附件
                const mainEmbed = result.embed;
                mainEmbed.setURL(originalURL);
                mainEmbed.setImage(null); // 移除 embed 中的圖片

                try {
                    // 🌐 使用 Webhook 發送
                    const sentMsg = await this.sendViaWebhook(message, {
                        embeds: [mainEmbed],
                        files: attachmentResult.attachments,
                        components: []
                    });

                    this.log(`Pixiv 附件方式發送成功 (${attachmentResult.totalImages} 張圖片, messageId=${sentMsg?.id || 'unknown'})`);

                    // 清理臨時檔案
                    attachmentResult.cleanup();
                    return;

                } catch (attachError) {
                    this.log(`附件發送失敗，回退到 embed 方式: ${attachError.message}`);
                    attachmentResult.cleanup();
                    // 繼續執行下面的 embed 回退邏輯
                }
            }

            // 回退方案：使用多 embed 方式
            this.log(`使用多 embed 方式發送 ${result.multipleImages.length} 張圖片`);
            const embeds = [];

            // 第一個嵌入式訊息包含完整內容（不含圖片）
            const mainEmbed = result.embed;
            mainEmbed.setURL(originalURL);
            mainEmbed.setImage(null);
            embeds.push(mainEmbed);

            // 為所有圖片創建單獨的嵌入式訊息
            for (let i = 0; i < result.multipleImages.length; i++) {
                const imageUrl = result.multipleImages[i];
                const imageEmbed = new EmbedBuilder()
                    .setURL(originalURL)
                    .setImage(imageUrl);
                embeds.push(imageEmbed);
            }

            // 🌐 使用 Webhook 發送
            const sentMsg = await this.sendViaWebhook(message, {
                embeds: embeds,
                components: []
            });

            this.log(`Pixiv 多嵌入式訊息發送成功 (${embeds.length} 個, messageId=${sentMsg?.id || 'unknown'})`);

        } catch (error) {
            this.log(`發送 Pixiv 多嵌入式訊息失敗: ${error.message}`);
            // 回退到一般回應
            await this.messageSender(
                message,
                this.getSiteIcon(result.siteName),
                result.embed,
                'Peko Embed'
            );
        }
    }

    /**
     * 發送多圖片 Facebook 回應 (多嵌入式訊息方式)
     * @param {Object} message
     * @param {Object} result
     */
    async sendFacebookWithMultipleEmbeds(message, result) {
        try {
            // 🔥 最多顯示 4 張圖片
            const totalImages = result.multipleImages.length;
            const imagesToShow = result.multipleImages.slice(0, 4);

            tlog.log('Facebook', message, `多圖 ${imagesToShow.length}/${totalImages} 張`);

            // 準備多個嵌入式訊息
            const embeds = [];
            const originalURL = result.data.facebedURL || result.data.originalURL;

            // 🔥 第一個嵌入式訊息包含完整內容但不含圖片
            const mainEmbed = result.embed;
            mainEmbed.setURL(originalURL);
            // 移除嵌入圖片（如果有的話）
            mainEmbed.setImage(null);

            // 🔥 添加圖片統計資訊
            mainEmbed.addFields({
                name: '🖼️ 圖片資訊',
                value: `顯示 ${imagesToShow.length} 張圖片${totalImages > 4 ? ` (共 ${totalImages} 張，請至原網址觀看)` : ''}`,
                inline: false
            });

            embeds.push(mainEmbed);

            // 🔥 為每張圖片創建單獨的嵌入式訊息（只顯示前 4 張）
            for (let i = 0; i < imagesToShow.length; i++) {
                const imageUrl = imagesToShow[i];
                const imageEmbed = new EmbedBuilder()
                    .setURL(originalURL)
                    .setImage(imageUrl);
                embeds.push(imageEmbed);
            }

            // 🌐 使用 Webhook 發送多個嵌入式訊息
            await this.sendViaWebhook(message, {
                embeds: embeds
            });

            this.log(`Facebook 多嵌入式訊息發送成功 (${embeds.length} 個嵌入式訊息)`);

        } catch (error) {
            this.log(`發送 Facebook 多嵌入式訊息失敗: ${error.message}`);
            // 回退到一般回應
            await this.messageSender(
                message,
                this.getSiteIcon(result.siteName),
                result.embed,
                'Peko Embed'
            );
        }
    }

    /**
     * 發送帶翻頁按鈕的 Pixiv 作品
     * @param {Object} message
     * @param {Object} result
     */
    async sendPixivWithPagination(message, result) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        // Pixiv 分頁邏輯：一頁一張圖，圖片顯示在 embed 內
        // 圖片已由 pixiv.js 設定在 embed.image 中

        const currentPage = result.pagination.currentPage;
        const totalImages = result.pagination.totalImages || 0;
        // 🔧 修正：Pixiv 使用每頁 1 張圖，總頁數 = 總圖片數
        const totalPages = result.pagination.totalPages || totalImages;
        const artworkId = result.pagination.artworkId;
        const originalURL = result.pagination.originalURL || 'https://www.pixiv.net';
        const nextProxyIndex = result.reloadMeta?.nextProxyIndex ?? 1;

        // 建立翻頁按鈕（合併 🔄 重新整理為同一列第 5 顆）
        let components = [];
        if (totalPages > 1) {
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pixiv_first_${artworkId}_0`)
                        .setLabel('⏪')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId(`pixiv_prev_${artworkId}_${Math.max(0, currentPage - 1)}`)
                        .setLabel('◀️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId(`pixiv_next_${artworkId}_${Math.min(totalPages - 1, currentPage + 1)}`)
                        .setLabel('▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId(`pixiv_last_${artworkId}_${totalPages - 1}`)
                        .setLabel('⏩')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId(`pixiv_reload_${artworkId}_${nextProxyIndex}`)
                        .setLabel('重整')
                        .setStyle(ButtonStyle.Secondary)
                );
            components = [buttons];
        }

        // embed 已包含圖片，直接發送
        const mainEmbed = result.embed;
        mainEmbed.setURL(originalURL);

        this.log(`Pixiv 分頁: ${result.pagination.totalImages} 張圖片, 當前第 ${currentPage + 1}/${totalPages} 張`);

        // 🌐 使用 Webhook 發送：單一 embed（內含圖片）+ 翻頁按鈕
        await this.sendViaWebhook(message, {
            embeds: [mainEmbed],
            components: components
        });
    }

    /**
     * 發送單張 Pixiv 作品（帶 🔄 重新整理按鈕）
     * 與 messageSender 的差別：改用 sendViaWebhook 以便帶上 components
     * @param {Object} message
     * @param {Object} result
     */
    async sendPixivSingle(message, result) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        const artworkId = result.reloadMeta?.artworkId
            || result.pagination?.artworkId
            || result.data?.id;
        const nextProxyIndex = result.reloadMeta?.nextProxyIndex ?? 1;
        const originalURL = result.pagination?.originalURL || result.originalURL;

        let components = [];
        if (artworkId) {
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pixiv_reload_${artworkId}_${nextProxyIndex}`)
                        .setLabel('重整')
                        .setStyle(ButtonStyle.Secondary)
                );
            components = [buttons];
        }

        await this.sendViaWebhook(message, {
            embeds: [result.embed],
            components: components,
            originalUrl: originalURL
        });

        // 如有額外預覽訊息（IWARA V2 用，Pixiv 通常無）
        if (result.additionalContent && result.additionalContent.type === 'preview_message') {
            const delay = result.additionalContent.delay || 1000;
            setTimeout(async () => {
                try {
                    await this.sendExtraViaWebhook(message, {
                        content: result.additionalContent.content,
                        originalUrl: originalURL
                    });
                } catch (previewError) {
                    this.log(`❌ Pixiv 單張額外訊息發送失敗: ${previewError.message}`);
                }
            }, delay);
        }
    }

    /**
     * 發送 Twitter V2 Container 訊息（影片推文用）
     * 2026-04-11: 使用 Components V2 取代 vxtwitter redirect
     * @param {Object} message - Discord 訊息物件
     * @param {Object} result - 包含 v2Container 的結果
     */
    async sendTwitterV2(message, result) {
        try {
            tlog.log('Twitter-V2', message, message._currentOriginalUrl || result.originalURL || '(URL 未知)');

            // 快取原始文字供翻譯按鈕使用
            if (result.originalText && result.tweetId) {
                cacheContent(result.tweetId, result.originalText);
            }

            // 🆕 在 V2 Container 最上方添加用戶標記行（類似傳統 Webhook 的 -# <@userId> <URL> 格式）
            // 這樣 delbotmsg 功能才能識別這是我們的 Webhook 訊息
            const authorId = message.author.id;
            const originalURL = result.originalURL || '';
            const markerText = `-# <@${authorId}>${originalURL ? ` <${originalURL}>` : ''}`;

            // 獲取原有的 v2Container
            const container = result.v2Container;

            // 📊 Footer 統計注入：N(channel)/M(guild)/O(total)
            try {
                if (originalURL && message.guildId && message.channelId) {
                    const urlCounts = recordUrl(originalURL, message.guildId, message.channelId);
                    // 找到 footer TextDisplay（內容以 -# 開頭且含 Peko Embed）並更新統計
                    for (const comp of container.components) {
                        if (comp?.data?.content?.startsWith('-# ') && comp.data.content.includes('Peko Embed')) {
                            // 先移除舊的 N/M/O（快取 container 重用時避免重複累加）
                            const stripped = comp.data.content.replace(/(\s*•\s*\d+\/\d+\/\d+)+$/, '');
                            comp.data.content = `${stripped} • ${urlCounts.channel}/${urlCounts.guild}/${urlCounts.total}`;
                            break;
                        }
                    }
                }
            } catch (_statsErr) { /* 統計失敗不影響主流程 */ }

            // 在 Container 的 components 陣列最前面添加 TextDisplay 和 Separator
            // 注意：需要保持正確的結構，使用 builder 的數據格式
            const { TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
            const markerTextDisplay = new TextDisplayBuilder().setContent(markerText);
            const separator = new SeparatorBuilder().setDivider(true);

            // 將新的組件添加到 container 的 components 陣列最前面
            container.components = [
                markerTextDisplay,  // 直接使用 builder，discord.js 會自動處理
                separator,
                ...container.components
            ];

            // 使用 Webhook 發送 V2 Container（现在包含用户标记行）
            await this.sendViaWebhook(message, {
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });

        } catch (error) {
            this.log(`[Twitter-V2] 發送失敗，降級為 embed: ${error.message}`, 'error');
            try {
                if (result.tweet) {
                    const TFDTwitterExtractor = require('../extractors/twitter-v2');
                    const extractor = new TFDTwitterExtractor();
                    const embedResult = extractor.buildEnhancedEmbed(
                        result.tweet, result.originalURL, null, result.contentType, null, false
                    );
                    if (embedResult?.embed) {
                        let components = extractor.buildPaginationButtons(result.tweet, result.contentType);
                        components = extractor.addTranslateButtonToComponents(components, result.tweet);
                        await this.sendViaWebhook(message, {
                            embeds: [embedResult.embed],
                            components: components
                        });
                        return;
                    }
                }
                // 最終降級：純文字
                await this.sendViaWebhook(message, {
                    content: `🎬 影片推文: ${result.originalURL || ''}`
                });
            } catch (fallbackError) {
                this.log(`[Twitter-V2] 降級發送也失敗: ${fallbackError.message}`, 'error');
            }
        }
    }

    /**
     * 發送帶 Twitter 分頁按鈕的回應
     * @param {Object} message
     * @param {Object} result
     */
    async sendTwitterWithPagination(message, result) {
        try {
            tlog.log('Twitter', message, result.originalURL || result.url || '(URL 未知)');

            // 🌐 使用 Webhook 發送回應：嵌入式訊息 + 分頁按鈕
            await this.sendViaWebhook(message, {
                embeds: [result.embed],
                components: result.components
            });

            // 🌐 快取原始文字供翻譯按鈕使用
            if (result.originalText && result.tweetId) {
                cacheContent(result.tweetId, result.originalText);
            }

            // 🎬 2026-04-11: 影片推文的 Vercel embed URL（取代 vxtwitter redirect）
            // 用 markdown 連結包裝，避免 Discord 產生第二個 embed 洗版
            if (result.videoUrls && result.videoUrls.length > 0) {
                const videoLinks = result.videoUrls.map((url, i) =>
                    result.videoUrls.length === 1 ? `[🎬 影片](${url})` : `[🎬 影片${i + 1}](${url})`
                ).join(' ');
                await this.sendExtraViaWebhook(message, {
                    content: videoLinks
                });
            }

        } catch (error) {
            this.log(`[Twitter] 發送失敗: ${error.message}`, 'error');
            // 回退到一般回應
            await this.messageSender(
                message,
                this.getSiteIcon(result.siteName),
                result.embed,
                'Peko Embed'
            );
        }
    }

    /**
     * 發送 Twitter 混合媒體回應 (影片+圖片 或 多影片)
     * @param {Object} message
     * @param {Object} result
     */
    async sendTwitterMixedMedia(message, result) {
        try {
            // this.log(`發送 Twitter 混合媒體回應: ${result.contentType}`);

            // 保留 Twitter 提取器設定的 Footer（不覆蓋）

            // 準備附件
            const files = [];
            if (result.videoAttachment) {
                files.push(result.videoAttachment);
                this.log(`📎 包含影片附件`);
            }

            // 根據不同的混合媒體類型處理
            if (result.contentType === 'video-with-images') {
                // 🌐 使用 Webhook 發送 1影片+圖片: 圖片放嵌入式訊息，影片單獨傳送，並且有分頁按鈕
                await this.sendViaWebhook(message, {
                    embeds: [result.embed],
                    components: result.components || [],
                    files: files // 添加影片附件
                });

                // 🌐 快取原始文字供翻譯按鈕使用
                if (result.originalText && result.tweetId) {
                    cacheContent(result.tweetId, result.originalText);
                }

                // 🌐 使用 Webhook 發送剩餘的影片連結（如果有的話）
                if (result.videoUrls && result.videoUrls.length > 0) {
                    const videoContent = result.videoUrls.join('\n');
                    await this.sendExtraViaWebhook(message, {
                        content: videoContent
                    });
                }

            } else if (result.contentType === 'multi-video' || result.contentType === 'multi-video-with-images') {
                // 多影片或多影片+圖片: 影片們在外面，嵌入式訊息有影片預覽圖

                // 🖼️ 準備多個 embeds（如果有圖片）
                const embeds = [];
                const originalURL = result.originalURL || 'https://twitter.com';

                // 主 embed（包含文字和統計）
                const mainEmbed = result.embed;
                mainEmbed.setURL(originalURL); // 設定統一的 URL
                mainEmbed.setImage(null); // 移除主 embed 的圖片（圖片會在獨立 embed 中）
                embeds.push(mainEmbed);

                // 🖼️ 為每張圖片創建獨立的 embed（使用相同的 URL）
                if (result.multipleImages && result.multipleImages.length > 0) {
                    for (const imageUrl of result.multipleImages) {
                        const { EmbedBuilder } = require('discord.js');
                        const imageEmbed = new EmbedBuilder()
                            .setURL(originalURL) // 🔑 關鍵：使用相同的 URL，Discord 會將它們組合顯示
                            .setImage(imageUrl);
                        embeds.push(imageEmbed);
                    }
                }

                // 🌐 使用 Webhook 發送多個 embeds
                await this.sendViaWebhook(message, {
                    embeds: embeds, // 發送多個 embeds（主 embed + 圖片 embeds）
                    files: files // 添加影片附件（如果有的話）
                });

                // 🌐 快取原始文字供翻譯按鈕使用
                if (result.originalText && result.tweetId) {
                    cacheContent(result.tweetId, result.originalText);
                }

                // 🌐 使用 Webhook 發送剩餘的影片連結
                if (result.videoUrls && result.videoUrls.length > 0) {
                    const videoContent = result.videoUrls.join('\n');
                    await this.sendExtraViaWebhook(message, {
                        content: videoContent
                    });
                }
            }

            // this.log(`Twitter 混合媒體回應發送成功`);

            // 清理影片附件臨時檔案
            if (result.videoAttachmentCleanup) {
                setTimeout(() => {
                    result.videoAttachmentCleanup();
                }, 5000); // 5秒後清理
            }

        } catch (error) {
            this.log(`[Twitter] 混合媒體發送失敗: ${error.message}`, 'error');

            // 清理影片附件臨時檔案
            if (result.videoAttachmentCleanup) {
                result.videoAttachmentCleanup();
            }

            // 回退到一般回應
            await this.messageSender(
                message,
                this.getSiteIcon(result.siteName),
                result.embed,
                'Peko Embed'
            );
        }
    }

    /**
     * 發送 Twitter HTML 影片播放回應
     * @param {Object} message
     * @param {Object} result
     */
    async sendTwitterHTMLResponse(message, result) {
        try {

            // 創建一個臨時的網址來提供 HTML 內容
            // 注意：這裡我們需要一個能夠提供 HTML 內容的服務
            // 暫時先發送一個簡化的回應，說明功能正在測試

            const embed = new EmbedBuilder()
                .setTitle('🎬 混合媒體影片播放 (HTML 模式)')
                .setDescription(`這個推文包含 **${result.videosCount}** 個影片和 **${result.imagesCount}** 張圖片\n\n⚠️ HTML 影片播放模式正在開發中...`)
                .setColor(0x1DA1F2)
                .setFooter({ text: 'PekoEmbed - HTML Video Mode', iconURL: this.getSiteIcon(result.siteName) })
                .setTimestamp();

            if (result.originalURL) {
                embed.setURL(result.originalURL);
            }

            // 🌐 使用 Webhook 發送
            await this.sendViaWebhook(message, {
                embeds: [embed]
            });


            // 為了開發階段，也同時顯示 HTML 內容的部分資訊
            if (result.htmlContent && result.htmlContent.length > 0) {
                this.log(`生成的 HTML 內容長度: ${result.htmlContent.length} 字符`);

                // 提取一些關鍵的 meta 標籤用於除錯
                const videoTags = (result.htmlContent.match(/og:video/g) || []).length;
                const imageTags = (result.htmlContent.match(/og:image/g) || []).length;

                this.log(`HTML meta 標籤: ${videoTags} 影片標籤, ${imageTags} 圖片標籤`);
            }

        } catch (error) {
            this.log(`[Twitter] HTML 回應失敗: ${error.message}`, 'error');

            // 回退到簡單的錯誤訊息
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ HTML 影片播放失敗')
                .setDescription('很抱歉，HTML 影片播放功能出現錯誤。')
                .setColor(0xFF0000)
                .setFooter({ text: 'PekoEmbed', iconURL: this.getSiteIcon(result.siteName) });

            if (result.originalURL) {
                errorEmbed.setURL(result.originalURL);
            }

            // 🌐 使用 Webhook 發送錯誤訊息
            await this.sendViaWebhook(message, {
                embeds: [errorEmbed]
            });
        }
    }

    /**
     * 發送多圖片 Twitter 回應 (多嵌入式訊息方式)
     * @param {Object} message
     * @param {Object} result
     */
    async sendTwitterWithMultipleEmbeds(message, result) {
        try {
            // this.log(`發送 Twitter 多嵌入式訊息: ${result.multipleImages.length} 張圖片`);

            // 準備多個嵌入式訊息
            const embeds = [];
            const originalURL = result.originalURL || 'https://twitter.com';

            // 第一個嵌入式訊息包含完整內容但不含圖片
            const mainEmbed = result.embed;
            // 保留 Twitter 提取器設定的 Footer（不覆蓋）
            mainEmbed.setURL(originalURL);
            // 移除嵌入圖片（如果有的話）
            mainEmbed.setImage(null);
            embeds.push(mainEmbed);

            // 為每張圖片創建單獨的嵌入式訊息
            for (let i = 0; i < result.multipleImages.length; i++) {
                const imageUrl = result.multipleImages[i];
                const imageEmbed = new EmbedBuilder()
                    .setURL(originalURL)
                    .setImage(imageUrl);
                embeds.push(imageEmbed);
            }

            // 🔧 深拷貝 components（避免修改快取中的原始物件導致重複 customId）
            let components = [];
            if (result.components) {
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                for (const row of result.components) {
                    const newRow = ActionRowBuilder.from(row);
                    components.push(newRow);
                }
            }

            // 🎨 如果有 mosaic 合併圖，加入「合併圖片」按鈕
            if (result.mosaicUrl && result.tweetId) {
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

                // 先檢查是否已經有合併圖片按鈕（避免快取重複添加）
                const hasMergeButton = components.some(row =>
                    row.components?.some(btn =>
                        btn.data?.custom_id === `twitter_merge_${result.tweetId}`
                    )
                );

                if (!hasMergeButton && components.length < 5) {
                    // 嘗試將合併圖片按鈕加入現有的第一個 ActionRow
                    if (components.length > 0 && components[0].components && components[0].components.length < 5) {
                        // 在現有 ActionRow 的最後加入合併圖片按鈕
                        const mergeButton = new ButtonBuilder()
                            .setCustomId(`twitter_merge_${result.tweetId}`)
                            .setLabel('合併')
                            .setStyle(ButtonStyle.Secondary);
                        components[0].addComponents(mergeButton);
                    } else {
                        // 創建新的 ActionRow
                        const row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`twitter_merge_${result.tweetId}`)
                                    .setLabel('合併')
                                    .setStyle(ButtonStyle.Secondary)
                            );
                        components.push(row);
                    }
                    tlog.log('Twitter', message, `🎨 已加入合併圖片按鈕 tweetId=${result.tweetId} url=${result.originalURL || message._currentOriginalUrl || ''}`);
                }
            }

            // 如果沒有任何 components，設為 null
            if (components.length === 0) {
                components = null;
            }

            // 🌐 使用 Webhook 發送
            await this.sendViaWebhook(message, {
                embeds: embeds,
                components: components
            });

            // 🌐 快取原始文字供翻譯按鈕使用
            if (result.originalText && result.tweetId) {
                cacheContent(result.tweetId, result.originalText);
            }

        } catch (error) {
            this.log(`[Twitter] 多嵌入式訊息發送失敗: ${error.message}`, 'error');

            // 回退到一般回應
            await this.messageSender(
                message,
                this.getSiteIcon(result.siteName),
                result.embed,
                'Peko Embed'
            );
        }
    }

    /**
     * 發送多圖片 Threads 回應（Discord gallery 多 embed 方式）
     */
    async sendThreadsWithMultipleEmbeds(message, result) {
        try {
            const embeds = [];
            const originalURL = result.originalURL || 'https://www.threads.com';
            tlog.log('Threads', message, originalURL);

            // 📊 Footer 統計注入
            try {
                if (originalURL && message.guildId && message.channelId) {
                    const urlCounts = recordUrl(originalURL, message.guildId, message.channelId);
                    const footer = result.embed.data?.footer;
                    const baseText = (footer?.text || '🧵 Threads').replace(/(\s*•\s*\d+\/\d+\/\d+)+$/, '');
                    result.embed.setFooter({
                        text: `${baseText} • ${urlCounts.channel}/${urlCounts.guild}/${urlCounts.total}`,
                        iconURL: footer?.icon_url
                    });
                }
            } catch (_e) {}

            // 主 embed（已含 images[0]），確保 url 正確
            result.embed.setURL(originalURL);
            embeds.push(result.embed);

            // 額外圖片（從第 2 張開始，同 URL 觸發 Discord gallery）
            for (let i = 1; i < result.multipleImages.length; i++) {
                embeds.push(new EmbedBuilder().setURL(originalURL).setImage(result.multipleImages[i]));
            }

            await this.sendViaWebhook(message, { embeds });
        } catch (error) {
            this.log(`[Threads] 多圖 embed 發送失敗: ${error.message}`, 'error');
            await this.messageSender(message, this.getSiteIcon(result.siteName), result.embed, '🧵 Threads');
        }
    }

    /**
     * 發送包含影片連結的回應
     * @param {Object} message
     * @param {Object} result
     */
    async sendWithVideoLinks(message, result) {
        try {

            // 保留 Twitter 提取器設定的 Footer（不覆蓋）

            // 建立影片連結文字 (模擬 TFD 格式)
            const videoLinksText = result.videoLinks.map(video =>
                `[影片連結](${video.url})`
            ).join('\n');

            // 組合訊息內容：影片連結
            const messageContent = videoLinksText;

            // 🌐 使用 Webhook 發送
            await this.sendViaWebhook(message, {
                content: messageContent,
                embeds: [result.embed]
            });

            this.log(`發送包含影片連結的回應: ${result.videoLinks.length} 個影片`);

        } catch (error) {
            this.log(`發送影片連結回應失敗: ${error.message}`);
            // 回退到一般回應
            await this.messageSender(
                message,
                this.getSiteIcon(result.siteName),
                result.embed,
                'Peko Embed'
            );
        }
    }

    /**
     * 模擬 TFD 的 messageSender (增強版支援額外內容)
     * 🌐 已改為使用 Webhook 發送（以使用者身份顯示）
     * @param {Object} message
     * @param {string} iconURL
     * @param {Object} embed
     * @param {string} textinfo
     * @param {Object} additionalContent 額外內容 (IWARA V2 雙訊息支援)
     */
    async messageSender(message, iconURL, embed, textinfo, additionalContent = null, originalUrl = null) {
        try {
            // 不再覆蓋 Footer，保留提取器設定的格式
            // const textinfo2 = textinfo || 'ermiana';
            // const iconURL2 = iconURL || this.iconURL;
            // embed.setFooter({ text: textinfo2, iconURL: iconURL2 });

            // 🌐 使用 Webhook 發送主要的 embed 訊息
            const mainReply = await this.sendViaWebhook(message, {
                embeds: [embed],
                originalUrl: originalUrl
            });

            // 如果有額外內容 (IWARA V2 預覽訊息)
            if (additionalContent && additionalContent.type === 'preview_message') {
                this.log(`發送額外預覽內容: ${additionalContent.content}`);

                // 延遲發送預覽訊息
                const delay = additionalContent.delay || 1000;
                setTimeout(async () => {
                    try {
                        // 🌐 使用 Webhook 發送額外訊息
                        await this.sendExtraViaWebhook(message, {
                            content: additionalContent.content,
                            originalUrl: originalUrl
                        });
                        this.log(`✅ 預覽訊息發送成功`);
                    } catch (previewError) {
                        this.log(`❌ 預覽訊息發送失敗: ${previewError.message}`);
                    }
                }, delay);
            }

            return mainReply;
        } catch (error) {
            this.log(`messageSender 錯誤: ${error.message}`);
            // TFD 的錯誤處理方式 - 靜默忽略主要錯誤，但記錄日誌
        }
    }

    /**
     * 處理 Discord 訊息 - 完全模擬 TFD 行為
     * @param {Object} message Discord 訊息物件
     * @returns {Promise<Object[]>}
     */
    async handleMessage(message) {
        try {
            // 基本檢查
            if (!this.shouldProcessMessage(message)) {
                return [];
            }

            // 濫用偵測（spam URL / burst）— 只在每個訊息第一個 URL 上做
            const abuseDetector = require('../../utils/abuse-detector.js');
            const firstUrl = (message.content || '').match(/https?:\/\/[^\s<>"]+/)?.[0];
            if (firstUrl && message.guild) {
                const abuseResult = abuseDetector.recordUrl({
                    userId: message.author.id,
                    guildId: message.guild.id,
                    channelId: message.channel.id,
                    url: firstUrl
                });
                if (abuseResult.blocked) {
                    return [];
                }
                // 評估長期累積的濫用（達門檻會自動加排除清單）
                abuseDetector.evaluateLongTerm(message.author.id, message.guild.id);
            }

            // 防止重複處理
            if (this.processedMessages.has(message.id)) {
                return [];
            }
            this.processedMessages.add(message.id);

            // 清理舊的處理記錄
            this.cleanupProcessedMessages();

            const getTimeStamp = () => {
                const now = new Date();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                return `${hours}:${minutes}`;
            };
            // console.log(`[${getTimeStamp()}] [TFD-MessageHandler] 處理訊息: ${message.id} 來自 ${message.author.tag}`);

            // 🖼️ 保存使用者的附件（圖片、檔案等），在 URL 轉換後一併發送
            // 注意：使用簡單的 URL 格式，避免 AttachmentBuilder 下載超時
            if (message.attachments && message.attachments.size > 0) {
                const attachmentArray = Array.from(message.attachments.values());
                // 直接使用 URL 格式，Discord 會自動處理
                // proxyURL 比 url 更持久，在原訊息刪除後仍可用
                message._userAttachments = attachmentArray.map(att => att.proxyURL || att.url);
                this.log(`📎 保存使用者附件: ${message._userAttachments.length} 個 (${attachmentArray.map(a => a.name).join(', ')})`);
            }

            // 🚫 早期檢查：Markdown 包裹的 URL（完全不處理）
            const allUrlsWrapped = this.checkAllUrlsWrapped(message.content);
            if (allUrlsWrapped) {
                // this.log(`所有 URL 都被 Markdown 包裹，跳過處理`);
                return [];
            }

            // 🔍 檢查防爆雷標記的 Twitter URL
            const spoilerTwitterResult = this.checkSpoilerTwitterUrls(message);
            if (spoilerTwitterResult) {
                // 🌐 使用 Webhook 發送 fixup URL 並保持防爆雷標記
                // 原始訊息會被自動刪除，不需要 embedSuppresser
                await this.sendViaWebhook(message, {
                    content: spoilerTwitterResult
                });

                return [{ success: true, spoilerFixup: true }];
            }

            // 🔍 檢查防爆雷標記的 Pixiv URL
            const spoilerPixivResult = this.checkSpoilerPixivUrls(message);
            if (spoilerPixivResult) {
                // 🌐 使用 Webhook 發送 phixiv URL 並保持防爆雷標記
                // 原始訊息會被自動刪除，不需要 embedSuppresser
                await this.sendViaWebhook(message, {
                    content: spoilerPixivResult
                });

                return [{ success: true, spoilerFixup: true }];
            }

            // 🛡️ 檢查 PTT 和巴哈姆特的防爆雷標記
            const spoilerPTTData = this.checkSpoilerPTTUrls(message);
            const hasSpoilerBahamut = this.checkSpoilerBahamutUrls(message);

            // PTT 防爆雷：不直接返回，而是設定標記讓後續處理時應用防爆雷
            if (spoilerPTTData && spoilerPTTData.hasSpoiler) {
                // 設定標記，讓 PTT 提取器知道需要防爆雷
                message._pttSpoilerMode = true;
                // 將原始訊息內容替換為提取的 URL（移除防爆雷標記）
                message._originalContent = message.content;
                message.content = spoilerPTTData.extractedUrl;
                // 繼續正常處理流程
            }

            if (hasSpoilerBahamut) {
                this.log(`檢測到防爆雷巴哈姆特 URL，忽略轉換`);
                return [{ success: true, spoilerIgnored: true, siteName: 'bahamut' }];
            }

            // 先顯示 typing indicator (模擬 TFD)
            // 2026-02-23: 只在非 Webhook 模式下顯示，因為 Webhook 發送後 Bot 的 typing 不會自動停止
            if (!canUseWebhook(message.channel) || !hasWebhookPermission(message.channel)) {
                await this.typingSender(message);
            }

            // 處理連結
            const results = await this.linkProcessor.processMessage(message);

            // 如果沒有找到支援的連結，靜默返回
            if (!results || results.length === 0) {
                return [];
            }

            // 🔧 提取使用者的非網址文字和不會被轉換的 URL（如 Discord 連結）
            const originalContent = message._originalContent || message.content;
            const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
            const allUrls = originalContent.match(urlPattern) || [];

            // 過濾出不會被轉換的 URL（如 Discord 連結）
            const discordLinkPattern = /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+\/\d+/i;
            const nonConvertedUrls = allUrls.filter(url => discordLinkPattern.test(url));

            // 移除所有 URL 後，再加回不會被轉換的 URL
            let userText = originalContent.replace(urlPattern, '').trim();
            if (nonConvertedUrls.length > 0) {
                userText = userText ? `${userText}\n${nonConvertedUrls.join('\n')}` : nonConvertedUrls.join('\n');
            }
            message._userText = userText;

            // 🔧 追蹤是否為第一個訊息（只有第一個訊息顯示使用者的非網址文字）
            message._isFirstUrlConversion = true;

            // 收集 URL 轉換結果，統一發送避免洗版
            const urlConversions = [];

            // 發送回應並抑制原始預覽 (完全模擬 TFD 流程)
            const responses = [];
            for (const result of results) {
                // this.log(`處理結果: siteName=${result.siteName}, success=${result.success}, contentType=${result.contentType}`);

                // 🔧 設置當前處理的原始 URL（供 sendViaWebhook 使用）
                // 優先使用 result 中的 URL，若無則從原始訊息中提取
                let currentUrl = result.originalURL || result.url || result.pagination?.originalURL || result.originalUrl || '';
                if (!currentUrl) {
                    // 從原始訊息內容中提取 URL
                    const originalContent = message._originalContent || message.content;
                    const urlMatch = originalContent.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
                    currentUrl = urlMatch ? urlMatch[0] : '';
                }
                message._currentOriginalUrl = currentUrl;

                // 🔒 Per-server blacklist enforcement (level 1/2/3)
                if (message.guild && db.guilds.isBlacklistEnabled(message.guild.id)) {
                    const gbm = getGBM();
                    const { author, uid, platform } = normalizeAuthorForBlacklist(result, message);
                    const entry = author || uid ? gbm.check(message.guild.id, platform, author, uid) : null;

                    if (entry) {
                        if (entry.level === 3) {
                            // Level 3: Block entirely
                            this.log(`${platform} 作者 ${author || 'unknown'} 被禁止 (等級 3)`);
                            try {
                                await message.reply({
                                    content: `-# <@${message.author.id}> 兔兔不轉發這個作者的內容（本伺服器管理員設定）`,
                                    allowedMentions: { users: [message.author.id] }
                                });
                                await this.embedSuppresser(message);
                            } catch (error) {
                                this.log(`處理黑名單禁止訊息失敗: ${error.message}`, 'error');
                            }
                            continue;
                        }

                        if (entry.level === 2) {
                            // Level 2: Auto-spoiler
                            const label = entry.label || '防爆雷';

                            // V2 Container: modify TextDisplay content + MediaGallery
                            if (result.isV2 && result.v2Container) {
                                try {
                                    const container = result.v2Container;
                                    const comps = container.components || [];
                                    for (const comp of comps) {
                                        // TextDisplay: wrap content in spoiler
                                        if (comp.data && comp.data.content && comp.data.type === 1) {
                                            const txt = comp.data.content;
                                            // Skip header lines (start with -#)
                                            const lines = txt.split('\n');
                                            const headerLines = [];
                                            const bodyLines = [];
                                            for (const line of lines) {
                                                if (line.startsWith('-#')) headerLines.push(line);
                                                else bodyLines.push(line);
                                            }
                                            if (bodyLines.length > 0) {
                                                comp.data.content = [...headerLines, '||' + bodyLines.join('\n') + '||'].join('\n');
                                            }
                                        }
                                        // MediaGallery: setSpoiler on items
                                        if (comp.components) {
                                            for (const item of comp.components) {
                                                if (item.data) item.data.spoiler = true;
                                            }
                                        }
                                    }
                                    // Add spoiler footer
                                    container.addTextDisplayComponents(
                                        new TextDisplayBuilder().setContent(`🕶️ 本伺服器已對此作者自動防爆雷【${label}】`)
                                    );
                                } catch (e) {
                                    this.log(`V2 防爆雷失敗: ${e.message}`, 'error');
                                }
                            }

                            // Traditional embed: wrap text content
                            if (result.embed) {
                                if (result.embed.data && result.embed.data.description) {
                                    result.embed.data.description = '||' + result.embed.data.description + '||';
                                }
                                if (result.embed.data && result.embed.data.title) {
                                    result.embed.data.title = '||🕶️ ' + result.embed.data.title + '||';
                                }
                                if (result.embed.data && result.embed.data.fields) {
                                    for (const field of result.embed.data.fields) {
                                        field.value = '||' + field.value + '||';
                                    }
                                }
                                const existingFooter = (result.embed.data && result.embed.data.footer && result.embed.data.footer.text) || '';
                                const footerText = existingFooter
                                    ? `🕶️ 本伺服器已對此作者自動防爆雷【${label}】| ${existingFooter}`
                                    : `🕶️ 本伺服器已對此作者自動防爆雷【${label}】`;
                                try { result.embed.setFooter({ text: footerText }); } catch (_) {}
                            }

                            this.log(`${platform} 作者 ${author || 'unknown'} 自動防爆雷(等級 2)`);
                        }

                        if (entry.level === 1) {
                            // Level 1: Warning footer
                            if (result.embed && typeof result.embed.setFooter === 'function') {
                                const label = entry.label || '未指定';
                                const existingFooter = result.embed.data?.footer?.text || '';
                                const warningText = existingFooter
                                    ? `⚠️ 此作者有 [提示] 標記：${label} | ${existingFooter}`
                                    : `⚠️ 此作者在本伺服器有 [提示] 等級標記：${label}`;
                                result.embed.setFooter({ text: warningText });
                            }
                        }
                    }
                }

                if (result.success) {
                    try {
                        // 特殊處理 Instagram Stories、Reels（使用 Embed 格式）
                        if ((result.contentType === 'story_formatted' || result.contentType === 'reel_formatted' || result.contentType === 'reel_dual_links' || result.contentType === 'reel_with_metadata') && result.deleteOriginal && result.embed) {
                            let contentTypeName = 'Instagram Stories';
                            if (result.contentType === 'reel_formatted') {
                                contentTypeName = 'Instagram Reels';
                            } else if (result.contentType === 'reel_dual_links') {
                                contentTypeName = 'Instagram Reels (雙連結)';
                            } else if (result.contentType === 'reel_with_metadata') {
                                contentTypeName = 'Instagram Reels (含資料)';
                            }
                            this.log(`處理 ${contentTypeName} 特殊格式化`);
                            tlog.sys('TFD-Debug', `Embed 標題: ${result.embed.data.title}`);

                            // 🌐 使用 Webhook 發送 embed 訊息
                            try {
                                await this.sendExtraViaWebhook(message, {
                                    embeds: [result.embed]
                                });
                                this.log(`✅ 成功發送 ${contentTypeName} Embed 訊息`);
                            } catch (sendError) {
                                this.log(`❌ 發送 Embed 訊息失敗: ${sendError.message}`, 'error');
                            }

                            // 🌐 使用 Webhook 發送影片連結（如果有的話）
                            if (result.content) {
                                try {
                                    await this.sendExtraViaWebhook(message, {
                                        content: result.content
                                    });
                                    this.log(`✅ 成功發送 ${contentTypeName} 影片連結`);
                                } catch (sendError) {
                                    this.log(`❌ 發送影片連結失敗: ${sendError.message}`, 'error');
                                }
                            }

                            // 刪除原訊息
                            try {
                                await message.delete();
                                this.log(`成功刪除原 ${contentTypeName} 訊息`);
                            } catch (deleteError) {
                                this.log(`刪除原訊息失敗: ${deleteError.message}`);
                            }

                            continue; // 跳過後續處理，避免重複執行其他邏輯

                        // 檢查是否為 URL 轉換或重定向類型 (如 Bilibili)
                        } else if ((result.contentType === 'url_conversion' && result.convertedURL) || (result.redirect && result.redirectURL)) {
                            // 收集 URL 轉換結果，稍後統一發送
                            const urlToSend = result.convertedURL || result.redirectURL;
                            urlConversions.push(urlToSend);
                            // this.log(`${result.siteName} URL ${result.redirect ? '重定向' : '轉換'} 已收集: ${urlToSend}`);

                        } else if (result.processed && result.contentType === 'ugoira_mp4') {
                            // Ugoira MP4 已由 MP4 處理系統完成處理，無需额外動作
                            this.log(`Ugoira MP4 處理系統已完成處理: ${result.mp4ProcessingResult?.success ? '成功' : '失敗'}`);

                            // 如果 MP4 處理失敗，則不異制嵌入式訊息，讓原始 Pixiv 預覽顯示
                            if (!result.mp4ProcessingResult?.success) {
                                tlog.sys('TFD', 'MP4 處理失敗，保留原始 Pixiv 預覽');
                                // 不抑制嵌入式訊息，讓原始預覽顯示
                            } else {
                                // MP4 處理成功，立即抑制原始預覽
                                await this.embedSuppresser(message);
                            }

                        } else if (result.isV2 && result.v2Container) {
                            // 🆕 V2 Container 訊息（影片推文用）
                            await this.sendTwitterV2(message, result);
                            await this.embedSuppresser(message);

                        } else if (result.embed) {
                            // 一般的嵌入式訊息處理
                            // 統一處理 Pixiv 內容（包括 R18 和一般向）
                            // Pixiv 多張圖片：一頁一張，使用按鈕翻頁，圖片顯示在 embed 內

                            // 📊 Footer 統計注入：N(channel)/M(guild)/O(total)
                            try {
                                if (currentUrl && message.guildId && message.channelId) {
                                    const urlCounts = recordUrl(currentUrl, message.guildId, message.channelId);
                                    const footer = result.embed.data?.footer;
                                    // 先移除舊的 N/M/O（快取 embed 重用時避免重複累加）
                                    const baseText = (footer?.text || 'Peko Embed').replace(/(\s*•\s*\d+\/\d+\/\d+)+$/, '');
                                    result.embed.setFooter({
                                        text: `${baseText} • ${urlCounts.channel}/${urlCounts.guild}/${urlCounts.total}`,

                                        iconURL: footer?.icon_url,
                                    });
                                }
                            } catch (_statsErr) { /* 統計失敗不影響主流程 */ }

                            if (result.siteName === 'pixiv' && result.pagination && result.pagination.hasMultiplePages) {
                                // 發送帶翻頁按鈕的回應（2張以上使用分頁）
                                await this.sendPixivWithPagination(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'pixiv' && !result.pagination?.hasMultiplePages) {
                                // 🔧 Pixiv 單張圖片處理（改走 sendPixivSingle 以支援 🔄 重新整理按鈕）
                                const isR18Single = result.contentType === 'r18_artwork' || result.data?.isR18;
                                this.log(`🖼️ Pixiv 單張圖片處理: fromCache=${result.fromCache}, hasEmbed=${!!result.embed}, R18=${isR18Single}`);

                                // 2026-02-09: R18 靜態圖不再需要防爆雷，處理方式與一般圖片相同
                                // 只有 Ugoira 動圖才需要特殊處理（但動圖在 pixiv.js 已被攔截處理）

                                await this.sendPixivSingle(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'threads' && result.multipleImages) {
                                // 發送多圖片的 Threads 回應（多嵌入式訊息 gallery）
                                await this.sendThreadsWithMultipleEmbeds(message, result);
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'facebook' && result.multipleImages) {
                                // 發送多圖片的 Facebook 回應 (≤4張圖，使用多嵌入式訊息)
                                await this.sendFacebookWithMultipleEmbeds(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if ((result.siteName === 'ptt' || result.siteName === 'pttweb') && message._pttSpoilerMode) {
                                // 🔒 PTT 防爆雷模式：內文和圖片防爆雷，標題不變
                                await this.sendPTTWithSpoiler(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if ((result.siteName === 'ptt' || result.siteName === 'pttweb') && result.components && result.components.length > 0) {
                                // 發送 PTT 多圖片的回應（帶翻頁按鈕）
                                await this.sendPTTWithPagination(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if ((result.siteName === 'ptt' || result.siteName === 'pttweb') && result.embeds && result.embeds.length > 1) {
                                // 發送 PTT 多圖片的回應（多 Embeds，無翻頁按鈕）
                                await this.sendPTTWithMultipleEmbeds(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'twitter' && result.gasResult) {
                                // 發送 Google Apps Script 處理的回應
                                await this.sendTwitterWithGAS(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'twitter' && result.mixedMedia) {
                                // 發送混合媒體推文的回應
                                await this.sendTwitterMixedMedia(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'twitter' && result.multipleImages) {
                                // 發送多圖片的 Twitter 回應 (多嵌入式訊息)
                                await this.sendTwitterWithMultipleEmbeds(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'twitter' && result.components) {
                                // 發送帶 Twitter 分頁按鈕的回應
                                await this.sendTwitterWithPagination(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else if (result.siteName === 'twitter' && result.videoUrls && result.videoUrls.length > 0) {
                                // 2026-04-11: 影片推文（Vercel embed，無按鈕時也要走 webhook）
                                await this.sendTwitterWithPagination(message, result);
                                // 立即抑制原始預覽
                                await this.embedSuppresser(message);
                            } else {
                                // 檢查是否有視頻需要額外顯示（Twitter 視頻）
                                if (result.videoUrls && result.videoUrls.length > 0) {
                                    // 對於視頻推文：先發送嵌入式訊息（含統計但無圖片），再發送視頻鏈接
                                    await this.messageSender(
                                        message,
                                        this.getSiteIcon(result.siteName),
                                        result.embed,
                                        'Peko Embed',
                                        null,
                                        result.originalURL
                                    );

                                    // 🔧 立即抑制原始預覽（Twitter 視頻推文）
                                    if (result.siteName === 'twitter') {
                                        await this.embedSuppresser(message);
                                    }

                                    // 🌐 使用 Webhook 發送視頻鏈接
                                    for (const videoUrl of result.videoUrls) {
                                        await this.sendExtraViaWebhook(message, {
                                            content: videoUrl
                                        });
                                    }
                                } else if (result.hasVideo && result.videoLinks) {
                                    // 檢查是否有其他影片需要額外顯示
                                    await this.sendWithVideoLinks(message, result);
                                    // 🔧 立即抑制原始預覽（Twitter 視頻連結）
                                    if (result.siteName === 'twitter') {
                                        await this.embedSuppresser(message);
                                    }
                                } else if (result.components && result.components.length > 0) {
                                    // 帶有互動按鈕（如妮姬展開/收合）
                                    await this.sendViaWebhook(message, {
                                        embeds: [result.embed],
                                        components: result.components,
                                        originalUrl: result.originalURL
                                    });
                                } else {
                                    // 發送一般回應 (使用 reply 格式，完全模擬 TFD)
                                    // 支援 IWARA V2 的 additionalContent (雙訊息系統)
                                    await this.messageSender(
                                        message,
                                        this.getSiteIcon(result.siteName),
                                        result.embed,
                                        'Peko Embed',
                                        result.additionalContent || null,
                                        result.originalURL
                                    );
                                    // 🔧 立即抑制原始預覽（Twitter 一般推文）
                                    if (result.siteName === 'twitter') {
                                        await this.embedSuppresser(message);
                                    }
                                }
                            }

                            // 立即抑制原始預覽（其他平台）
                            if (result.siteName !== 'twitter') {
                                await this.embedSuppresser(message);
                            }
                        }

                        responses.push({
                            messageId: message.id,
                            siteName: result.siteName,
                            contentType: result.contentType,
                            timestamp: new Date().toISOString()
                        });

                    } catch (error) {
                        this.log(`發送回應失敗: ${error.message}`);
                    }
                } else {
                    // 🔧 處理提取失敗的情況
                    try {
                        this.log(`處理失敗結果: siteName=${result.siteName}, error=${result.error}`);

                        // 🛒 PCHome 特殊處理：提取失敗時只記錄到後台，不發送 Discord 訊息
                        // 讓 Discord 顯示預設的 URL 預覽即可
                        if (result.siteName === 'pchome') {
                            this.log(`🛒 PCHome 提取失敗（僅後台記錄）: ${result.error || '未知錯誤'}`);
                            // 不發送任何訊息，讓 Discord 使用預設預覽
                            continue; // 跳過這個結果，處理下一個
                        }

                        // 📰 PTT 特殊處理：提取失敗時只記錄到後台，不發送 Discord 訊息
                        if (result.siteName === 'ptt' || result.siteName === 'pttweb') {
                            this.log(`[PTT] 提取失敗: ${result.error || '未知錯誤'}`);
                            continue;
                        }

                        // 🐦 Twitter 特殊處理：API 404（推文已刪除/私人帳號）時靜默跳過
                        if (result.siteName === 'twitter') {
                            this.log(`[Twitter] 提取失敗（靜默跳過）: ${result.error || '未知錯誤'}`);
                            continue;
                        }

                        // 其他網站：顯示錯誤訊息
                        // 🌐 使用 Webhook 發送錯誤 embed
                        if (result.embed) {
                            await this.sendViaWebhook(message, {
                                embeds: [result.embed],
                                originalUrl: result.originalURL
                            });
                            this.log(`錯誤訊息已發送: ${result.siteName}`);
                        } else {
                            // 🌐 使用 Webhook 發送文字錯誤訊息
                            await this.sendViaWebhook(message, {
                                content: `⚠️ ${result.siteName} 提取失敗：${result.error || '未知錯誤'}`,
                                originalUrl: result.originalURL
                            });
                            this.log(`純文字錯誤訊息已發送: ${result.siteName}`);
                        }
                    } catch (error) {
                        this.log(`發送錯誤訊息失敗: ${error.message}`);
                    }
                }
            }

            // 統一發送收集到的 URL 轉換結果
            if (urlConversions.length > 0) {
                try {
                    // 將所有轉換的 URL 合併成一則訊息，每個 URL 一行
                    const combinedContent = urlConversions.join('\n');

                    // 🌐 使用 Webhook 發送
                    await this.sendViaWebhook(message, {
                        content: combinedContent
                    });

                    tlog.log('TFD', message, `✅ 統一發送 ${urlConversions.length} 個轉換 URL: ${urlConversions.join(' | ')}`);

                    // 立即抑制原始預覽
                    try {
                        await this.embedSuppresser(message);
                    } catch (suppressError) {
                        this.log(`抑制原始預覽失敗: ${suppressError.message}`, 'error');
                    }

                } catch (error) {
                    this.log(`發送 URL 轉換失敗: ${error.message}`, 'error');
                }
            }

            // 成功時不顯示處理完成訊息
            return responses;

        } catch (error) {
            this.log(`處理訊息失敗: ${error.message}`);
            return [];
        }
    }

    /**
     * 獲取網站圖標 (模擬 TFD 的圖標系統)
     * @param {string} siteName
     * @returns {string}
     */
    getSiteIcon(siteName) {
        const icons = {
            'twitter': 'https://ermiana.canaria.cc/pic/twitter.png',
            'instagram': 'https://ermiana.canaria.cc/pic/instagram.png',
            'pixiv': 'https://ermiana.canaria.cc/pic/pixiv.png',
            'bilibili': 'https://ermiana.canaria.cc/pic/bilibili.png',
            'ptt': 'https://ermiana.canaria.cc/pic/ptt.png'
        };
        return icons[siteName] || this.iconURL;
    }

    /**
     * 檢查是否應該處理此訊息
     * @param {Object} message
     * @returns {boolean}
     */
    shouldProcessMessage(message) {
        // 檢查系統是否啟用
        if (!this.config.enabled) {
            return false;
        }

        // 🔧 忽略 Webhook 訊息（避免無限循環）
        if (message.webhookId) {
            return false;
        }

        // 忽略機器人訊息
        if (message.author.bot) {
            return false;
        }

        // 忽略 DM 訊息
        if (!message.guild) {
            return false;
        }

        // 檢查 per-guild 設定（從 SQLite 讀取，已隔離各伺服器）
        const guildId = message.guild.id;

        // 此伺服器是否啟用 TFD
        const guildSettings = db.guilds.get(guildId);
        if (guildSettings && guildSettings.enabled === 0) {
            return false;
        }

        // 檢查使用者是否被排除（per-guild）
        if (db.excludedUsers.has(guildId, message.author.id)) {
            return false;
        }

        // 檢查頻道是否被排除（子頻道、討論串、論壇貼文會繼承父/祖父頻道的排除狀態）
        const ch = message.channel;
        if (
            db.blockedChannels.has(guildId, ch.id) ||
            (ch.parentId && db.blockedChannels.has(guildId, ch.parentId)) ||
            (ch.parent?.parentId && db.blockedChannels.has(guildId, ch.parent.parentId))
        ) {
            return false;
        }

        // 檢查訊息是否包含支援的 URL
        if (!this.containsSupportedURL(message.content)) {
            return false;
        }

        // Rate limit 檢查（per-user / per-guild / per-user-per-guild）
        const rateLimiter = require('../../utils/rate-limiter.js');
        const rateResult = rateLimiter.check(message.author.id, guildId);
        if (!rateResult.allowed) {
            // 記錄濫用（被限速的次數累積到一定值會觸發 abuse detector）
            db.abuse.record({
                userId: message.author.id,
                guildId,
                channelId: ch.id,
                abuseType: 'rate_exceeded',
                severity: 1,
                details: { reason: rateResult.reason, limit: rateResult.limit, current: rateResult.current }
            });
            // 不發訊息提醒（避免被 abuse 的人也收到回應），靜默略過
            return false;
        }

        return true;
    }

    /**
     * 檢查內容是否包含 URL
     * @param {string} content
     * @returns {boolean}
     */
    containsURL(content) {
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        return urlRegex.test(content);
    }

    /**
     * 檢查內容是否包含支援的 URL
     * 排除被 <> 包裹的 URL
     * @param {string} content
     * @returns {boolean}
     */
    containsSupportedURL(content) {
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        const urls = content.match(urlRegex) || [];

        // 檢查是否有任何 URL 被支援（排除被 <> 包裹的）
        for (const url of urls) {
            // 檢查此 URL 是否被 <> 包裹
            if (this.isUrlWrappedInAngleBrackets(content, url)) {
                continue; // 跳過被包裹的 URL
            }

            if (this.linkProcessor.urlMatcher.matchURL(url)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 檢查 URL 是否被尖括號 <> 包裹
     * @param {string} content - 完整訊息內容
     * @param {string} url - 要檢查的 URL
     * @returns {boolean} - 是否被包裹
     */
    isUrlWrappedInAngleBrackets(content, url) {
        // 找到 URL 在內容中的位置
        const urlIndex = content.indexOf(url);
        if (urlIndex === -1) return false;

        // 檢查 URL 前面是否有 <
        const charBefore = urlIndex > 0 ? content[urlIndex - 1] : '';
        // 檢查 URL 後面是否有 >
        const charAfter = urlIndex + url.length < content.length ? content[urlIndex + url.length] : '';

        return charBefore === '<' && charAfter === '>';
    }


    /**
     * 清理處理過的訊息記錄
     */
    cleanupProcessedMessages() {
        // 限制記錄數量，避免記憶體洩漏
        if (this.processedMessages.size > 1000) {
            // 清除一半的舊記錄
            const messagesToDelete = Array.from(this.processedMessages).slice(0, 500);
            messagesToDelete.forEach(id => this.processedMessages.delete(id));
        }
    }

    /**
     * 清空處理記錄
     */
    clearProcessedMessages() {
        this.processedMessages.clear();
        this.linkProcessor.clearCache();
        tlog.sys('TFD', '處理記錄已清空');
    }

    /**
     * 取得處理統計
     * @returns {Object}
     */
    getStats() {
        return {
            processedMessages: this.processedMessages.size,
            linkProcessor: this.linkProcessor.getStats(),
            config: {
                enabled: this.config.enabled,
                features: this.config.features
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 重新載入配置
     */
    reloadConfig() {
        try {
            delete require.cache[require.resolve('../config/tfd-config.json')];
            this.config = require('../config/tfd-config.json');
            this.linkProcessor.reloadConfig();
            tlog.sys('TFD', '配置已重新載入');
            return true;
        } catch (error) {
            this.log(`重新載入配置失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 檢查訊息中是否包含防爆雷標記的 Twitter URL
     * @param {Object} message Discord 訊息物件
     * @returns {string|null} 轉換後的防爆雷 fixup URL，如果沒有則返回 null
     */
    checkSpoilerTwitterUrls(message) {
        if (!message || !message.content) {
            return null;
        }

        const content = message.content;

        // 檢查是否包含被 || 包圍的 Twitter/X URL
        const spoilerTwitterRegex = /\|\|[^|]*?(https?:\/\/(?:twitter\.com|x\.com)\/[^\s|]+)[^|]*?\|\|/gi;
        const matches = [...content.matchAll(spoilerTwitterRegex)];

        if (matches.length === 0) {
            return null;
        }

        // 轉換所有匹配的 URL
        let convertedContent = content;

        for (const match of matches) {
            const fullSpoilerText = match[0]; // 完整的 ||...|| 文本
            const twitterUrl = match[1]; // 提取的 Twitter URL

            // 將 Twitter/X URL 轉換為 fixup URL
            const fixupUrl = twitterUrl
                .replace(/https?:\/\/twitter\.com/g, 'https://fixupx.com')
                .replace(/https?:\/\/x\.com/g, 'https://fixupx.com');

            // 保持防爆雷標記，但替換內部的 URL
            const convertedSpoilerText = fullSpoilerText.replace(twitterUrl, fixupUrl);

            // 替換原始內容中的匹配項
            convertedContent = convertedContent.replace(fullSpoilerText, convertedSpoilerText);

            this.log(`防爆雷 URL 轉換: ${twitterUrl} → ${fixupUrl}`);
        }

        // 如果內容有變化，返回轉換後的內容
        if (convertedContent !== content) {
            return convertedContent;
        }

        return null;
    }

    /**
     * 檢查訊息中是否包含防爆雷標記的 Pixiv URL
     * @param {Object} message Discord 訊息物件
     * @returns {string|null} 轉換後的防爆雷 phixiv URL，如果沒有則返回 null
     */
    checkSpoilerPixivUrls(message) {
        if (!message || !message.content) {
            return null;
        }

        const content = message.content;

        // 檢查是否包含被 || 包圍的 Pixiv URL
        const spoilerPixivRegex = /\|\|[^|]*?(https?:\/\/(?:www\.)?pixiv\.net\/[^\s|]+)[^|]*?\|\|/gi;
        const matches = [...content.matchAll(spoilerPixivRegex)];

        if (matches.length === 0) {
            return null;
        }

        this.log(`檢測到 ${matches.length} 個防爆雷 Pixiv URL`);

        // 轉換所有匹配的 URL
        let convertedContent = content;

        for (const match of matches) {
            const fullSpoilerText = match[0]; // 完整的 ||...|| 文本
            const pixivUrl = match[1]; // 提取的 Pixiv URL

            // 將 Pixiv URL 轉換為 phixiv URL
            const phixivUrl = pixivUrl
                .replace(/https?:\/\/(?:www\.)?pixiv\.net/g, 'https://phixiv.net');

            // 保持防爆雷標記，但替換內部的 URL
            const convertedSpoilerText = fullSpoilerText.replace(pixivUrl, phixivUrl);

            // 替換原始內容中的匹配項
            convertedContent = convertedContent.replace(fullSpoilerText, convertedSpoilerText);

            this.log(`防爆雷 URL 轉換: ${pixivUrl} → ${phixivUrl}`);
        }

        // 如果內容有變化，返回轉換後的內容
        if (convertedContent !== content) {
            return convertedContent;
        }

        return null;
    }

    /**
     * 檢查訊息中的所有 URL 是否都被 Markdown 包裹
     * 如果沒有 URL 或所有 URL 都被包裹（<URL>、`URL`、```URL```），返回 true
     * @param {string} content 訊息內容
     * @returns {boolean} 所有 URL 是否都被 Markdown 包裹
     */
    checkAllUrlsWrapped(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }

        // 使用正則表達式提取所有 URL（包括被包裹的）
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        const allUrls = content.match(urlRegex);

        // 如果沒有 URL，不需要處理
        if (!allUrls || allUrls.length === 0) {
            return false;
        }

        // 檢查每個 URL 是否都被包裹
        for (const url of allUrls) {
            const urlIndex = content.indexOf(url);
            if (urlIndex === -1) continue;

            const beforeUrl = content.substring(0, urlIndex);
            const afterUrl = content.substring(urlIndex + url.length);

            let isWrapped = false;

            // 檢查 1: <URL>
            if (beforeUrl.endsWith('<') && afterUrl.startsWith('>')) {
                isWrapped = true;
            }
            // 檢查 2: ```URL``` 三個反引號（同一行）
            else if (beforeUrl.endsWith('```') && afterUrl.startsWith('```')) {
                isWrapped = true;
            }
            // 檢查 3: 多行 code block
            else if (/```[^\n]*\n\s*$/.test(beforeUrl) && /^\s*\n\s*```/.test(afterUrl)) {
                isWrapped = true;
            }
            // 檢查 4: `URL` 單個反引號（不是三個反引號的一部分）
            else {
                const endsWithSingleBacktick = beforeUrl.endsWith('`') && !beforeUrl.endsWith('``');
                const startsWithSingleBacktick = afterUrl.startsWith('`') && !afterUrl.startsWith('``');
                if (endsWithSingleBacktick && startsWithSingleBacktick) {
                    isWrapped = true;
                }
            }

            // 如果有任何一個 URL 沒有被包裹，返回 false
            if (!isWrapped) {
                return false;
            }
        }

        // 所有 URL 都被包裹
        return true;
    }

    /**
     * 檢查訊息中是否包含防爆雷標記的 PTT URL
     * @param {Object} message Discord 訊息物件
     * @returns {Object|null} { hasSpoiler: boolean, extractedUrl: string } 或 null
     */
    checkSpoilerPTTUrls(message) {
        if (!message || !message.content) {
            return null;
        }

        const content = message.content;

        // 檢查是否包含被 || 包圍的 PTT URL (支援 ptt.cc 和 pttweb.cc)
        const spoilerPTTRegex = /\|\|[^|]*?(https?:\/\/(?:www\.)?(?:ptt\.cc|pttweb\.cc)\/[^\s|]+)[^|]*?\|\|/gi;
        const matches = [...content.matchAll(spoilerPTTRegex)];

        if (matches.length > 0) {
            // 返回第一個匹配的 URL
            return {
                hasSpoiler: true,
                extractedUrl: matches[0][1] // 提取的 URL（移除防爆雷標記）
            };
        }

        return null;
    }

    /**
     * 檢查訊息中是否包含防爆雷標記的巴哈姆特 URL
     * @param {Object} message Discord 訊息物件
     * @returns {boolean} 是否包含防爆雷的巴哈姆特 URL
     */
    checkSpoilerBahamutUrls(message) {
        if (!message || !message.content) {
            return false;
        }

        const content = message.content;

        // 檢查是否包含被 || 包圍的巴哈姆特 URL
        const spoilerBahamutRegex = /\|\|[^|]*?(https?:\/\/forum\.gamer\.com\.tw\/[^\s|]+)[^|]*?\|\|/gi;
        const matches = [...content.matchAll(spoilerBahamutRegex)];

        if (matches.length > 0) {
            this.log(`檢測到 ${matches.length} 個防爆雷巴哈姆特 URL`);
            return true;
        }

        return false;
    }

    /**
     * 發送 PTT 多圖片回應（帶翻頁按鈕）
     * @param {Object} message - Discord 訊息物件
     * @param {Object} result - PTT 提取結果
     */
    async sendPTTWithPagination(message, result) {
        try {
            tlog.log('PTT', message, message._currentOriginalUrl || result.embeds?.[0]?.data?.url || '(URL 未知)');

            const embeds = result.embeds || [result.embed];
            const components = result.components || [];

            // 🌐 使用 Webhook 發送
            await this.sendViaWebhook(message, {
                embeds: embeds,
                components: components
            });
        } catch (error) {
            this.log(`[PTT] 發送失敗: ${error.message}`, 'error');
        }
    }

    /**
     * 發送 PTT 多圖片回應（多 Embeds，無翻頁按鈕）
     * @param {Object} message - Discord 訊息物件
     * @param {Object} result - PTT 提取結果
     */
    async sendPTTWithMultipleEmbeds(message, result) {
        try {
            tlog.log('PTT', message, message._currentOriginalUrl || result.embeds?.[0]?.data?.url || '(URL 未知)');

            const embeds = result.embeds || [result.embed];

            // 🌐 使用 Webhook 發送
            await this.sendViaWebhook(message, {
                embeds: embeds
            });
        } catch (error) {
            this.log(`[PTT] 發送失敗: ${error.message}`, 'error');
        }
    }

    /**
     * 發送 PTT 防爆雷回應
     * 內文和圖片防爆雷，標題不變
     * @param {Object} message - Discord 訊息物件
     * @param {Object} result - PTT 提取結果
     */
    async sendPTTWithSpoiler(message, result) {
        try {
            tlog.log('PTT-防爆雷', message, message._currentOriginalUrl || result.embeds?.[0]?.data?.url || '(URL 未知)');

            // 取得主要 embed
            const mainEmbed = result.embeds ? result.embeds[0] : result.embed;
            if (!mainEmbed) {
                this.log(`[PTT] 找不到 embed`, 'error');
                return;
            }

            // 🔒 修改 embed 的 description，加上防爆雷標記
            const originalDescription = mainEmbed.data?.description || '';
            if (originalDescription) {
                // 將內文（不包含標題）加上防爆雷
                // description 格式通常是 "作者 xxx\n\n內文..."
                const descParts = originalDescription.split('\n\n');
                if (descParts.length >= 2) {
                    // 保留作者行，內文加防爆雷
                    const authorLine = descParts[0];
                    const contentPart = descParts.slice(1).join('\n\n');
                    mainEmbed.setDescription(`${authorLine}\n\n||${contentPart}||`);
                } else {
                    // 整個 description 加防爆雷
                    mainEmbed.setDescription(`||${originalDescription}||`);
                }
            }

            // 🖼️ 收集所有圖片 URL
            const allImages = [];

            // 從 embeds 中提取圖片
            if (result.embeds && result.embeds.length > 0) {
                for (const embed of result.embeds) {
                    const imageUrl = embed.data?.image?.url;
                    if (imageUrl && !imageUrl.startsWith('SPOILER_')) {
                        allImages.push(imageUrl);
                    }
                }
            } else if (mainEmbed.data?.image?.url) {
                const imageUrl = mainEmbed.data.image.url;
                if (!imageUrl.startsWith('SPOILER_')) {
                    allImages.push(imageUrl);
                }
            }

            // 🔒 移除 embed 中的圖片（改用防爆雷 URL 發送）
            mainEmbed.setImage(null);
            mainEmbed.setThumbnail(null);

            // 修改 footer 加上防爆雷標記
            const originalFooter = mainEmbed.data?.footer?.text || 'PTT 批踢踢實業坊';
            mainEmbed.setFooter({
                text: `🔒 防爆雷模式 • ${originalFooter}`,
                iconURL: 'https://www.ptt.cc/favicon.ico'
            });

            // 🖼️ 準備防爆雷圖片 URL
            let content = null;
            if (allImages.length > 0) {
                content = allImages.map(url => `||${url}||`).join('\n');
            }

            // 🌐 使用 Webhook 發送訊息
            await this.sendViaWebhook(message, {
                content: content,
                embeds: [mainEmbed]
            });
        } catch (error) {
            this.log(`[PTT] 發送失敗: ${error.message}`, 'error');

            // 回退到一般發送
            try {
                const embeds = result.embeds || [result.embed];
                // 🌐 使用 Webhook 發送
                await this.sendViaWebhook(message, {
                    embeds: embeds
                });
            } catch (fallbackError) {
                this.log(`[PTT] 回退發送失敗: ${fallbackError.message}`, 'error');
            }
        }
    }

    /**
     * 下載圖片並創建 SPOILER 附件
     * 這樣圖片會嵌在 embed 中，但有模糊效果，需要點擊才能看到
     * @param {string} imageUrl - 圖片 URL
     * @param {number} index - 圖片索引（用於檔名）
     * @returns {Promise<{attachment: AttachmentBuilder, attachmentName: string}|null>}
     */
    async createSpoilerAttachment(imageUrl, index = 0) {
        try {
            this.log(`下載 R18 圖片: ${imageUrl.substring(0, 80)}...`);

            // 下載圖片
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.pixiv.net/'
                }
            });

            // 從 URL 或 Content-Type 判斷檔案類型
            let extension = 'jpg';
            const contentType = response.headers['content-type'];
            if (contentType) {
                if (contentType.includes('png')) extension = 'png';
                else if (contentType.includes('gif')) extension = 'gif';
                else if (contentType.includes('webp')) extension = 'webp';
            }

            // 創建 SPOILER 附件（檔名以 SPOILER_ 開頭）
            const fileName = `SPOILER_pixiv_r18_${index}.${extension}`;
            const attachment = new AttachmentBuilder(Buffer.from(response.data), { name: fileName });

            this.log(`✅ 成功創建 SPOILER 附件: ${fileName}`);

            return {
                attachment: attachment,
                attachmentName: fileName
            };

        } catch (error) {
            this.log(`❌ 下載圖片失敗: ${error.message}`);
            return null;
        }
    }

    /**
     * 發送 Pixiv R18 內容（使用 SPOILER 附件模式 + 分頁）
     * R18 特規：一次只顯示一張圖片，使用分頁按鈕切換
     * Discord embed 圖片不支援 SPOILER，所以必須分開發送
     * @param {Object} message - Discord 訊息物件
     * @param {Object} result - Pixiv 提取結果
     */
    async sendPixivR18WithEmbeddedSpoiler(message, result) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        try {
            const images = result.multipleImages || [];
            const singleImage = result.data?.images?.medium || result.data?.images?.large || result.data?.images?.original;

            // 確定要處理的圖片
            const imagesToProcess = images.length > 0 ? images : (singleImage ? [singleImage] : []);

            if (imagesToProcess.length === 0) {
                this.log(`R18 內容無圖片，使用一般模式`);
                return false; // 返回 false 表示需要回退到其他處理方式
            }

            const totalImages = imagesToProcess.length;
            this.log(`🔒 Pixiv R18 Discord URL 分頁模式: 共 ${totalImages} 張圖片`);

            const originalURL = result.pagination?.originalURL || 'https://www.pixiv.net';

            // 提取 artwork ID
            const artworkIdMatch = originalURL.match(/artworks\/(\d+)/);
            const artworkId = artworkIdMatch ? artworkIdMatch[1] : 'unknown';

            // 🆕 新架構：上傳圖片到隱密頻道，獲取 Discord URL
            const PixivR18CacheManager = require('../../utils/pixiv-r18-cache-manager');

            this.log(`📤 準備上傳 R18 圖片，檢查 client: ${!!message.client}`);
            const r18Cache = new PixivR18CacheManager(message.client); // 注入 Discord client

            const metadata = {
                title: result.data?.title || '無標題',
                description: result.data?.description || '',
                author: result.data?.author || '未知作者',
                authorId: result.data?.authorId,
                authorAvatar: result.data?.authorAvatar || null,
                originalURL: originalURL,
                dimensions: result.data?.dimensions || null,
                viewCount: result.data?.viewCount || 0,
                bookmarkCount: result.data?.bookmarkCount || 0,
                likeCount: result.data?.likeCount || 0,
                createDate: result.data?.createDate || null,
                tags: result.data?.tags || []
            };

            // 上傳所有圖片到隱密頻道
            this.log(`📤 開始上傳 ${totalImages} 張 R18 圖片到隱密頻道...`);
            this.log(`📤 圖片 URL 列表: ${imagesToProcess.slice(0, 2).join(', ')}${imagesToProcess.length > 2 ? '...' : ''}`);
            const discordUrls = await r18Cache.uploadImagesToDiscord(artworkId, imagesToProcess, metadata);
            this.log(`📤 上傳結果: ${discordUrls ? discordUrls.length + ' 張' : 'null'}`);

            if (!discordUrls || discordUrls.length === 0) {
                this.log(`❌ 上傳圖片到隱密頻道失敗，回退到 SPOILER 模式`);
                // 回退到舊的 SPOILER 附件模式
                return await this.sendPixivR18WithSpoilerFallback(message, result, imagesToProcess, artworkId, totalImages, originalURL);
            }

            this.log(`✅ 成功上傳 ${discordUrls.length} 張圖片到隱密頻道`);

            // 準備 embed（不含圖片，圖片用 ||URL|| 隱藏在內容中）
            const mainEmbed = result.embed;
            mainEmbed.setURL(originalURL);
            mainEmbed.setImage(null); // 不在 embed 中顯示圖片
            mainEmbed.setThumbnail(null);

            // 更新 Footer 顯示頁碼資訊
            const existingFooter = mainEmbed.data.footer?.text || 'Pixiv R18';
            mainEmbed.setFooter({
                text: `${existingFooter} | 第 1/${totalImages} 張`,
                iconURL: mainEmbed.data.footer?.icon_url
            });

            // 建立分頁按鈕（只有多於 1 張時才顯示）
            let components = [];
            if (totalImages > 1) {
                const paginationRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_first_${artworkId}_0`)
                            .setLabel('⏪ 第一張')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true), // 第一頁時停用
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_prev_${artworkId}_0`)
                            .setLabel('◀️ 上一張')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true), // 第一頁時停用
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_next_${artworkId}_1`)
                            .setLabel('下一張 ▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(totalImages <= 1),
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_last_${artworkId}_${totalImages - 1}`)
                            .setLabel('最後一張 ⏩')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(totalImages <= 1)
                    );
                components = [paginationRow];
            }

            // 🌐 使用 Webhook 發送第一條訊息：embed + 分頁按鈕
            const embedMsg = await this.sendViaWebhook(message, {
                embeds: [mainEmbed],
                components: components
            });

            // 🌐 使用 Webhook 發送第二條訊息：||URL|| 隱藏圖片（獨立訊息才有預覽）
            const spoilerImageUrl = `||${discordUrls[0]}||`;
            const imageMsg = await this.sendExtraViaWebhook(message, {
                content: spoilerImageUrl
            });

            // 儲存快取（包含 Discord URL 和訊息 ID）
            await r18Cache.saveR18ImageCache(artworkId, imagesToProcess, discordUrls, metadata, {
                channelId: message.channel.id,
                embedMessageId: embedMsg.id,
                imageMessageId: imageMsg.id
            });

            this.log(`✅ Pixiv R18 兩條訊息模式發送成功 (顯示第 1/${totalImages} 張, imageMsg: ${imageMsg.id})`);
            return true;

        } catch (error) {
            this.log(`❌ Pixiv R18 處理失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * R18 SPOILER 回退模式（當 Discord URL 上傳失敗時使用）
     */
    async sendPixivR18WithSpoilerFallback(message, result, imagesToProcess, artworkId, totalImages, originalURL) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        try {
            // 只儲存原始 URL（無 Discord URL）
            const PixivR18CacheManager = require('../../utils/pixiv-r18-cache-manager');
            const r18Cache = new PixivR18CacheManager();
            await r18Cache.saveR18ImageCache(artworkId, imagesToProcess, null, {
                title: result.data?.title || '無標題',
                description: result.data?.description || '',
                author: result.data?.author || '未知作者',
                authorId: result.data?.authorId,
                authorAvatar: result.data?.authorAvatar || null,
                originalURL: originalURL,
                dimensions: result.data?.dimensions || null,
                viewCount: result.data?.viewCount || 0,
                bookmarkCount: result.data?.bookmarkCount || 0,
                likeCount: result.data?.likeCount || 0,
                createDate: result.data?.createDate || null,
                tags: result.data?.tags || []
            });

            // 下載第一張圖片
            const spoilerResult = await this.createSpoilerAttachment(imagesToProcess[0], 0);

            if (!spoilerResult) {
                this.log(`R18 第一張圖片下載失敗，回退到 URL 模式`);
                return false;
            }

            // 準備 embed（不含圖片）
            const mainEmbed = result.embed;
            mainEmbed.setURL(originalURL);
            mainEmbed.setImage(null);
            mainEmbed.setThumbnail(null);

            // 更新 Footer
            const existingFooter = mainEmbed.data.footer?.text || 'Pixiv R18';
            mainEmbed.setFooter({
                text: `${existingFooter} | 第 1/${totalImages} 張 (SPOILER模式)`,
                iconURL: mainEmbed.data.footer?.icon_url
            });

            // 建立分頁按鈕
            let components = [];
            if (totalImages > 1) {
                const paginationRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_first_${artworkId}_0`)
                            .setLabel('⏪ 第一張')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_prev_${artworkId}_0`)
                            .setLabel('◀️ 上一張')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_next_${artworkId}_1`)
                            .setLabel('下一張 ▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(totalImages <= 1),
                        new ButtonBuilder()
                            .setCustomId(`pixivr18_last_${artworkId}_${totalImages - 1}`)
                            .setLabel('最後一張 ⏩')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(totalImages <= 1)
                    );
                components = [paginationRow];
            }

            // 🌐 使用 Webhook 發送第一條訊息：embed + 按鈕
            await this.sendViaWebhook(message, {
                embeds: [mainEmbed],
                components: components
            });

            // 🌐 使用 Webhook 發送第二條訊息：SPOILER 圖片
            await this.sendExtraViaWebhook(message, {
                files: [spoilerResult.attachment]
            });

            this.log(`✅ Pixiv R18 SPOILER 回退模式發送成功 (顯示第 1/${totalImages} 張)`);
            return true;

        } catch (error) {
            this.log(`❌ Pixiv R18 SPOILER 回退模式失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 檢查系統健康狀態
     * @returns {Object}
     */
    healthCheck() {
        const linkProcessorHealth = this.linkProcessor.healthCheck();

        return {
            status: linkProcessorHealth.status,
            messageHandler: {
                processedMessages: this.processedMessages.size,
                configLoaded: this.config !== null
            },
            linkProcessor: linkProcessorHealth,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = TFDMessageHandler;
