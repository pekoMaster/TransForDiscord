/**
 * Webhook 管理器
 * 用於管理頻道 Webhook，支援使用自訂名稱和頭像發送訊息
 * 含閒置自動重命名功能
 *
 * 2026-02-23: Discord webhook 不支援 message_reference 回覆功能
 * 改用 -# 小字標記回覆關係（在 message-handler-v2.js 處理）
 */

const { WebhookClient } = require('discord.js');
const tlog = require('./tfd-logger');

// Webhook 名稱（用於識別 Bot 建立的 Webhook）
const WEBHOOK_NAME = 'MB_MessageBubble';
const IDLE_WEBHOOK_NAME = '野兔';
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 分鐘

// 頻道閒置計時器 Map（channelId -> timeoutId）
const channelIdleTimers = new Map();

// 頻道 Webhook 快取（channelId -> webhook）
const webhookCache = new Map();

/**
 * 取得或建立頻道的 Webhook
 * 支援討論串和論壇頻道（從父頻道取得 Webhook）
 * @param {TextChannel|ThreadChannel} channel - Discord 頻道或討論串
 * @returns {Promise<{webhook: Webhook, threadId: string|null}>} Webhook 物件和討論串 ID
 */
async function getOrCreateWebhook(channel) {
    try {
        // 判斷是否為討論串（包含論壇貼文）
        // 10: ANNOUNCEMENT_THREAD, 11: PUBLIC_THREAD, 12: PRIVATE_THREAD
        const isThread = [10, 11, 12].includes(channel.type);

        // 如果是討論串，需要從父頻道取得 Webhook
        let targetChannel = channel;
        let threadId = null;

        if (isThread) {
            threadId = channel.id;
            targetChannel = channel.parent;

            if (!targetChannel) {
                throw new Error('無法取得討論串的父頻道');
            }

            tlog.sys('Webhook', `討論串模式: ${channel.name} → 父頻道 ${targetChannel.name}`);
        }

        // 使用父頻道 ID 作為快取 key（討論串共用父頻道的 Webhook）
        const cacheKey = targetChannel.id;

        // 檢查快取
        if (webhookCache.has(cacheKey)) {
            return { webhook: webhookCache.get(cacheKey), threadId };
        }

        // 取得頻道所有 Webhooks
        const webhooks = await targetChannel.fetchWebhooks();

        // 找尋已存在的 MB Webhook（可能是原名或閒置名）
        let webhook = webhooks.find(wh =>
            wh.name === WEBHOOK_NAME || wh.name === IDLE_WEBHOOK_NAME
        );

        // 如果不存在則建立新的
        if (!webhook) {
            webhook = await targetChannel.createWebhook({
                name: WEBHOOK_NAME,
                reason: 'Ermiana URL 預覽系統使用'
            });
            tlog.sys('Webhook', `已在頻道 ${targetChannel.name} 建立新的 Webhook`);
        }

        // 存入快取
        webhookCache.set(cacheKey, webhook);

        return { webhook, threadId };
    } catch (error) {
        tlog.sysError('Webhook', `取得或建立 Webhook 失敗: ${error}`);
        throw new Error(`無法建立 Webhook：${error.message}`);
    }
}

/**
 * 重設頻道閒置計時器
 * @param {TextChannel} channel - Discord 頻道
 */
function resetIdleTimer(channel) {
    const channelId = channel.id;

    // 清除舊的計時器
    if (channelIdleTimers.has(channelId)) {
        clearTimeout(channelIdleTimers.get(channelId));
    }

    // 設置新的計時器（30分鐘後重命名）
    const timerId = setTimeout(async () => {
        try {
            const webhook = webhookCache.get(channelId);
            if (webhook && webhook.name !== IDLE_WEBHOOK_NAME) {
                await webhook.edit({ name: IDLE_WEBHOOK_NAME });
                tlog.sys('Webhook', `頻道 ${channel.name} 閒置 30 分鐘，已將 Webhook 重命名為「${IDLE_WEBHOOK_NAME}」`);
            }
        } catch (error) {
            tlog.sys('Webhook', `⚠️ 閒置重命名失敗: ${error.message}`);
        }
        channelIdleTimers.delete(channelId);
    }, IDLE_TIMEOUT);

    channelIdleTimers.set(channelId, timerId);
}

/**
 * 使用 Webhook 發送訊息（自訂名稱和頭像）
 * 支援討論串和論壇頻道
 *
 * @param {TextChannel|ThreadChannel} channel - Discord 頻道或討論串
 * @param {Object} options - 發送選項
 * @param {string} options.username - 顯示名稱
 * @param {string} options.avatarURL - 頭像 URL
 * @param {string} [options.content] - 文字內容
 * @param {Array} [options.files] - 附件檔案
 * @param {Array} [options.embeds] - Embed 陣列
 * @param {Array} [options.components] - 按鈕等組件陣列
 * @returns {Promise<Message>} 發送的訊息
 */
async function sendWithWebhook(channel, options) {
    const buildSendOptions = (threadId) => {
        const opts = {
            username: options.username || 'Message Bubble',
            avatarURL: options.avatarURL,
            content: options.content,
            files: options.files,
            embeds: options.embeds,
            components: options.components,
            flags: options.flags,
            allowedMentions: options.allowedMentions ?? { parse: [] },
        };
        if (threadId) opts.threadId = threadId;
        return opts;
    };

    try {
        const { webhook, threadId } = await getOrCreateWebhook(channel);
        const message = await webhook.send(buildSendOptions(threadId));

        // 重設閒置計時器（使用實際的頻道，不是討論串）
        const targetChannel = channel.parent || channel;
        resetIdleTimer(targetChannel);

        return message;
    } catch (error) {
        // Webhook 被外部刪除（10015 Unknown Webhook）：清除快取並重試一次
        if (error.code === 10015) {
            const cacheKey = ([10, 11, 12].includes(channel.type) ? channel.parent : channel).id;
            webhookCache.delete(cacheKey);
            tlog.sys('Webhook', `⚠️ Webhook 已失效（10015），清除快取重試...`);
            try {
                const { webhook: newWh, threadId: newThreadId } = await getOrCreateWebhook(channel);
                const message = await newWh.send(buildSendOptions(newThreadId));
                const targetChannel = channel.parent || channel;
                resetIdleTimer(targetChannel);
                return message;
            } catch (retryErr) {
                tlog.sysError('Webhook', `重試後仍失敗: ${retryErr}`);
                throw new Error(`Webhook 發送失敗：${retryErr.message}`);
            }
        }
        tlog.sysError('Webhook', `發送訊息失敗: ${error}`);
        throw new Error(`Webhook 發送失敗：${error.message}`);
    }
}

/**
 * 檢查頻道是否支援 Webhook
 * @param {TextChannel|ThreadChannel} channel - Discord 頻道或討論串
 * @returns {boolean} 是否支援
 */
function canUseWebhook(channel) {
    // 支援的頻道類型：
    // 0 = GUILD_TEXT (文字頻道)
    // 5 = GUILD_ANNOUNCEMENT (公告頻道)
    // 10 = ANNOUNCEMENT_THREAD (公告討論串)
    // 11 = PUBLIC_THREAD (公開討論串)
    // 12 = PRIVATE_THREAD (私人討論串)
    // 注意：論壇頻道 (15) 的貼文本質上是 PUBLIC_THREAD (11)

    const supportedTypes = [0, 5, 10, 11, 12];

    if (supportedTypes.includes(channel.type)) {
        // 如果是討論串，檢查父頻道是否存在
        if ([10, 11, 12].includes(channel.type)) {
            return !!channel.parent;
        }
        return true;
    }

    return false;
}

/**
 * 檢查 Bot 是否有管理 Webhook 的權限
 * @param {TextChannel|ThreadChannel} channel - Discord 頻道或討論串
 * @returns {boolean} 是否有權限
 */
function hasWebhookPermission(channel) {
    // 如果是討論串，檢查父頻道的權限
    const targetChannel = channel.parent || channel;

    const botPermissions = targetChannel.permissionsFor(targetChannel.guild.members.me);
    return botPermissions && botPermissions.has('ManageWebhooks');
}

/**
 * 編輯 Webhook 發送的訊息
 * 2026-02-23: 新增此函數，用於編輯 webhook 訊息（避免通知被回覆者）
 *
 * @param {TextChannel|ThreadChannel} channel - Discord 頻道或討論串
 * @param {string} messageId - 要編輯的訊息 ID
 * @param {Object} options - 編輯選項
 * @param {string} [options.content] - 新的文字內容
 * @param {Array} [options.embeds] - 新的 Embed 陣列
 * @param {Array} [options.components] - 新的按鈕等組件陣列
 * @returns {Promise<Message>} 編輯後的訊息
 */
async function editWebhookMessage(channel, messageId, options) {
    const buildEditOptions = (threadId) => {
        const opts = {
            content: options.content,
            embeds: options.embeds,
            components: options.components
        };
        if (threadId) opts.threadId = threadId;
        return opts;
    };

    try {
        const { webhook, threadId } = await getOrCreateWebhook(channel);
        return await webhook.editMessage(messageId, buildEditOptions(threadId));
    } catch (error) {
        // Webhook 被外部刪除（10015）：清除快取（無法重試，因為原訊息已消失）
        if (error.code === 10015) {
            const cacheKey = ([10, 11, 12].includes(channel.type) ? channel.parent : channel).id;
            webhookCache.delete(cacheKey);
            tlog.sys('Webhook', `⚠️ 編輯時 Webhook 失效（10015），已清除快取`);
        }
        tlog.sysError('Webhook', `編輯訊息失敗: ${error}`);
        throw new Error(`Webhook 編輯失敗：${error.message}`);
    }
}

/**
 * 清除所有閒置計時器（Bot 關閉時呼叫）
 */
function clearAllIdleTimers() {
    for (const [channelId, timerId] of channelIdleTimers) {
        clearTimeout(timerId);
    }
    channelIdleTimers.clear();
    webhookCache.clear();
    tlog.sys('Webhook', '已清除所有閒置計時器');
}

module.exports = {
    getOrCreateWebhook,
    sendWithWebhook,
    editWebhookMessage,
    canUseWebhook,
    hasWebhookPermission,
    clearAllIdleTimers,
    WEBHOOK_NAME,
    IDLE_WEBHOOK_NAME
};
