/**
 * 內容翻譯按鈕互動處理器
 * 處理來自各種內容提取器（Twitter、Facebook等）的翻譯按鈕互動
 */

const { EmbedBuilder } = require('discord.js');
const translator = require('../utils/translator.js');
const deeplTranslator = require('../utils/deepl-translator.js').getInstance();

// 暫存原始文字的 Map（用於翻譯）
// 格式：Map<sourceId, { text, timestamp }>
const contentCache = new Map();

// 自動清理過期快取（15 分鐘）
setInterval(() => {
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;

    for (const [key, value] of contentCache.entries()) {
        if (now - value.timestamp > fifteenMinutes) {
            contentCache.delete(key);
        }
    }
}, 5 * 60 * 1000); // 每 5 分鐘檢查一次

/**
 * 儲存內容到快取
 * @param {string} sourceId - 來源 ID
 * @param {string} text - 文字內容
 */
function cacheContent(sourceId, text) {
    if (!sourceId || !text) return;

    contentCache.set(sourceId, {
        text: text,
        timestamp: Date.now()
    });
}

/**
 * 從快取獲取內容
 * @param {string} sourceId - 來源 ID
 * @returns {string|null} 文字內容或 null
 */
function getCachedContent(sourceId) {
    const cached = contentCache.get(sourceId);
    if (!cached) return null;

    // 檢查是否過期（15 分鐘）
    const fifteenMinutes = 15 * 60 * 1000;
    if (Date.now() - cached.timestamp > fifteenMinutes) {
        contentCache.delete(sourceId);
        return null;
    }

    return cached.text;
}

/**
 * 處理翻譯按鈕互動
 * @param {ButtonInteraction} interaction - 按鈕互動物件
 */
async function handleContentTranslationInteraction(interaction) {
    try {
        const customId = interaction.customId;

        // 檢查是否為翻譯按鈕
        if (!customId.startsWith('translate_google_') && !customId.startsWith('translate_deepl_')) {
            return false; // 不是翻譯按鈕，返回 false
        }

        console.log(`[內容翻譯] 用戶 ${interaction.user.username} 點擊了 ${customId}`);

        // 延遲回應避免超時
        await interaction.deferReply({ ephemeral: true });

        // 解析 customId
        const isDeepL = customId.startsWith('translate_deepl_');
        const sourceId = customId.replace('translate_google_', '').replace('translate_deepl_', '');

        // 從快取獲取內容
        let originalText = getCachedContent(sourceId);

        // 如果快取中沒有，嘗試從訊息的 Embed 中提取
        if (!originalText) {
            const originalEmbed = interaction.message.embeds[0];
            if (originalEmbed && originalEmbed.description) {
                // 移除防爆雷標記
                originalText = originalEmbed.description.replace(/^\|\||\|\|$/g, '').trim();
                // 重新快取
                cacheContent(sourceId, originalText);
            }
        }

        if (!originalText) {
            await interaction.followUp({
                content: '❌ 無法找到原始文字，可能已過期或快取已清除',
                ephemeral: true
            });
            return true;
        }

        console.log(`[內容翻譯] 開始翻譯（長度: ${originalText.length}，引擎: ${isDeepL ? 'DeepL' : 'Google'}）`);

        let translationResult;
        let engineName;

        if (isDeepL) {
            // 使用 DeepL 翻譯
            if (!deeplTranslator.checkAvailability()) {
                await interaction.followUp({
                    content: '❌ DeepL 翻譯器未設定或無法使用',
                    ephemeral: true
                });
                return true;
            }

            const deeplResult = await deeplTranslator.toTraditionalChinese(originalText);

            if (!deeplResult.success) {
                console.error(`[內容翻譯] DeepL 翻譯失敗:`, deeplResult.error);
                await interaction.followUp({
                    content: `❌ DeepL 翻譯失敗：${deeplResult.error}`,
                    ephemeral: true
                });
                return true;
            }

            translationResult = {
                text: deeplResult.translatedText,
                from: deeplResult.detectedSourceLang
            };
            engineName = 'DeepL';
        } else {
            // 使用 Google 翻譯
            try {
                const googleResult = await translator.toTraditionalChinese(originalText);
                translationResult = googleResult;
                engineName = 'Google Translate';
            } catch (error) {
                console.error(`[內容翻譯] Google 翻譯失敗:`, error.message);
                await interaction.followUp({
                    content: `❌ 翻譯失敗：${error.message}`,
                    ephemeral: true
                });
                return true;
            }
        }

        console.log(`[內容翻譯] 翻譯成功 (來源語言: ${translationResult.from})`);

        // 建立翻譯結果 Embed
        const translationEmbed = new EmbedBuilder()
            .setTitle(`📝 翻譯結果（${engineName} - 繁體中文）`)
            .setDescription(translationResult.text)
            .addFields(
                { name: '原始語言', value: getLanguageName(translationResult.from), inline: true },
                { name: '目標語言', value: '繁體中文', inline: true },
                { name: '翻譯引擎', value: engineName, inline: true }
            )
            .setColor(isDeepL ? 0x00D56A : 0x5865F2) // DeepL 綠色 / Google 藍色
            .setFooter({ text: '翻譯結果為機器翻譯，僅供參考' })
            .setTimestamp();

        // 發送翻譯結果
        await interaction.followUp({
            embeds: [translationEmbed],
            ephemeral: true
        });

        console.log(`[內容翻譯] 翻譯結果已發送給 ${interaction.user.username}`);
        return true;

    } catch (error) {
        console.error(`[內容翻譯] 處理失敗:`, error);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: `❌ 發生錯誤：${error.message}`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: `❌ 發生錯誤：${error.message}`,
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error(`[內容翻譯] 無法回應錯誤訊息:`, replyError.message);
        }

        return true;
    }
}

/**
 * 獲取語言名稱
 * @param {string} langCode - ISO 639-1 語言代碼
 * @returns {string} 語言名稱
 */
function getLanguageName(langCode) {
    const languageNames = {
        'en': '英文',
        'EN': '英文',
        'ja': '日文',
        'JA': '日文',
        'ko': '韓文',
        'KO': '韓文',
        'zh-CN': '簡體中文',
        'ZH': '中文',
        'zh-TW': '繁體中文',
        'es': '西班牙文',
        'ES': '西班牙文',
        'fr': '法文',
        'FR': '法文',
        'de': '德文',
        'DE': '德文',
        'ru': '俄文',
        'RU': '俄文',
        'ar': '阿拉伯文',
        'AR': '阿拉伯文',
        'pt': '葡萄牙文',
        'PT': '葡萄牙文',
        'it': '意大利文',
        'IT': '意大利文',
        'th': '泰文',
        'TH': '泰文',
        'vi': '越南文',
        'VI': '越南文',
        'id': '印尼文',
        'ID': '印尼文'
    };

    return languageNames[langCode] || `${langCode.toUpperCase()}`;
}

module.exports = {
    handleContentTranslationInteraction,
    execute: handleContentTranslationInteraction,
    cacheContent,
    getCachedContent
};
