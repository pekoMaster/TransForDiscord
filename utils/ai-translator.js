/**
 * Compatibility adapter for legacy Twitter translation callers.
 *
 * New translation behavior lives in utils/translation/translation-service.js.
 * This file keeps the old exports stable while the handlers migrate one seam
 * at a time.
 */

const { EmbedBuilder } = require('discord.js');
const { getAllKeys, PROVIDERS } = require('./user-api-key-storage.js');
const { buildTextBundle, combineTranslatedBundle } = require('./translation/text-bundle');
const { translateTweet } = require('./translation/translation-service');

function getAvailableProviders(userId) {
    const keys = getAllKeys(userId);
    return Object.entries(keys)
        .filter(([, key]) => typeof key === 'string' && key.trim())
        .map(([provider]) => provider);
}

async function translate(text, userId, options = {}) {
    if (!text || text.trim().length === 0) {
        return { success: true, text: '', model: 'none' };
    }

    const textBundle = buildTextBundle({ main: text });
    const result = await translateTweet({
        textBundle,
        userId,
        provider: options.provider || null,
        authorName: options.authorName || null,
        context: options.context || '',
        allowEnvFallback: false
    });

    if (!result.success) {
        return {
            success: false,
            error: result.error,
            errorType: result.errorType
        };
    }

    return {
        success: true,
        text: combineTranslatedBundle(result.translated),
        model: result.model || result.provider
    };
}

async function translateFree() {
    return {
        success: false,
        error: '免費翻譯目前尚未啟用，請先使用 Gemini、OpenRouter、OpenAI 或 Claude。',
        errorType: 'FREE_NOT_READY'
    };
}

function buildApiKeyTutorialEmbed() {
    return new EmbedBuilder()
        .setTitle('設定 AI 翻譯 API Key')
        .setDescription('請先用 `/pe api add` 設定至少一組 API Key，再用 `/pe api model` 選擇翻譯引擎。')
        .addFields(
            {
                name: '支援引擎',
                value: Object.entries(PROVIDERS)
                    .filter(([provider]) => provider !== 'free')
                    .map(([provider, info]) => `- ${info.name || provider}`)
                    .join('\n'),
                inline: false
            },
            {
                name: '指令範例',
                value: [
                    '`/pe api add provider:Gemini apikey:你的_API_Key`',
                    '`/pe api model provider:Gemini`'
                ].join('\n'),
                inline: false
            }
        )
        .setColor(0x5865F2)
        .setFooter({ text: 'API Key 只會加密保存在本機資料庫。' });
}

module.exports = {
    translate,
    translateFree,
    buildApiKeyTutorialEmbed,
    getAvailableProviders,
    PROVIDERS
};
