require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const ErmianaMessageHandler = require('./ermiana-system/core/message-handler-v2.js');
const interactionCreate = require('./events/interactionCreate.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // 特權 Intent，需在 Developer Portal 開啟
        GatewayIntentBits.GuildWebhooks,
    ]
});

// 初始化 Ermiana 訊息處理器
const ermianaHandler = new ErmianaMessageHandler(client);

// Ready
client.once(Events.ClientReady, () => {
    console.log(`✅ Bot 已上線：${client.user.tag}`);
    console.log(`📡 監控 ${client.guilds.cache.size} 個伺服器`);
    console.log('✅ Ermiana URL 轉換系統已就緒');
});

// 訊息 → Ermiana
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    try {
        await ermianaHandler.handleMessage(message);
    } catch (err) {
        console.error('Ermiana 訊息處理錯誤:', err.message);
    }
});

// 訊息編輯
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (newMessage.author?.bot) return;
    try {
        await ermianaHandler.handleMessageUpdate(oldMessage, newMessage);
    } catch (err) {
        // 忽略一般編輯錯誤
    }
});

// 互動（按鈕、斜線指令）
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        await interactionCreate.execute(interaction, client);
    } catch (err) {
        console.error('互動處理錯誤:', err.message);
    }
});

client.login(process.env.BOT_TOKEN);
