require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const express = require('express');
const TFDMessageHandler = require('./tfd-system/core/message-handler-v2.js');
const interactionCreate = require('./events/interactionCreate.js');
const tfd = require('./utils/tfd-logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // 特權 Intent，需在 Developer Portal 開啟
        GatewayIntentBits.GuildWebhooks,
    ]
});

// 初始化 TFD 訊息處理器
const tfdHandler = new TFDMessageHandler(client);

// Ready
client.once(Events.ClientReady, () => {
    tfd.sys('TFD-Bot', `✅ Bot 已上線：${client.user.tag}`);
    tfd.sys('TFD-Bot', `📡 監控 ${client.guilds.cache.size} 個伺服器`);
    tfd.sys('TFD-Bot', '✅ Peko Embed URL 轉換系統已就緒');

    // 初始化共享翻譯快取（從磁碟載入 + 清理過期）
    const sharedCache = require('./utils/shared-translation-cache');
    sharedCache.init();

    // 每 24 小時清理一次過期快取（7 天 TTL）
    setInterval(() => sharedCache.cleanup(), 24 * 60 * 60 * 1000);

    // 初始化 SQLite + 啟動定期 GC（rate limit / abuse / url stats）
    const db = require('./db');
    db.init();
    require('./utils/rate-limiter.js').startGC();
    require('./utils/abuse-detector.js').startGC();

    // URL stats 清理：每天清一次，預設保留 30 天
    const URL_STATS_RETAIN_DAYS = parseInt(process.env.TFD_URL_STATS_RETAIN_DAYS, 10) || 30;
    setInterval(() => {
        try {
            const removed = db.urlStats.cleanupOlderThan(URL_STATS_RETAIN_DAYS * 86400);
            if (removed > 0) tfd.sys('url-stats', `清理了 ${removed} 筆 ${URL_STATS_RETAIN_DAYS} 天前的紀錄`);
        } catch (e) {
            tfd.sysError('url-stats', `清理失敗: ${e.message}`);
        }
    }, 24 * 60 * 60 * 1000);
});

// 訊息 → TFD
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    try {
        await tfdHandler.handleMessage(message);
    } catch (err) {
        tfd.sysError('TFD-Bot', `TFD 訊息處理錯誤: ${err.message}`);
    }
});

// 訊息編輯
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (newMessage.author?.bot) return;
    try {
        await tfdHandler.handleMessageUpdate(oldMessage, newMessage);
    } catch (err) {
        // 忽略一般編輯錯誤
    }
});

// 互動（按鈕、斜線指令）
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        await interactionCreate.execute(interaction, client);
    } catch (err) {
        tfd.sysError('TFD-Bot', `互動處理錯誤: ${err.message}`);
    }
});

// ── Express API（供 Vercel bot-stats 查詢 TFD 統計）──
const app = express();
const TFD_API_PORT = parseInt(process.env.TFD_API_PORT, 10) || 3456;

app.get('/api/tfd-stats', (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!process.env.TFD_API_KEY || apiKey !== process.env.TFD_API_KEY) {
            return res.status(403).json({ error: '未授權' });
        }
        const db = require('./db');
const tfd = require('./utils/tfd-logger');
        const stats = db.tfdStats.getAllStats();
        res.json(stats);
    } catch (e) {
        tfd.sysError('TFD API', `錯誤: ${e.message}`);
        res.status(500).json({ error: '內部錯誤' });
    }
});

app.listen(TFD_API_PORT, '0.0.0.0', () => {
    tfd.sys('TFD API', `Express 已啟動於 port ${TFD_API_PORT}`);
});

client.login(process.env.BOT_TOKEN);
