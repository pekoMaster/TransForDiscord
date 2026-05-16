const { MessageFlags } = require('discord.js');
const { getCachedTweetData } = require('../../state/v2-tweet-cache');
const { getPreferredProvider, PROVIDERS } = require('../../../translation/keys/user-api-key-storage');
const { buildTextBundle } = require('../../../translation/text/text-bundle');
const { translateTweet } = require('../../../translation/service/translation-service');
const sharedTranslationCache = require('../../../translation/cache/shared-translation-cache');
const db = require('../../../../../db');
const tlog = require('../../../../../utils/tfd-logger');
const { extractTweetId } = require('./shared');
const { getCachedV2Translation, setCachedV2Translation } = require('./translation-cache');
const { rebuildAndUpdate } = require('./view-updater');

async function handleV2Translate(interaction) {
    const tweetId = extractTweetId(interaction.customId);
    const isTranslateAction = interaction.customId.startsWith('v2_translate_');

    await interaction.deferUpdate();

    if (!isTranslateAction) {
        await rebuildAndUpdate(interaction, tweetId, { isTranslated: false });
        tlog.log('V2-翻譯', interaction, `切回原文: ${tweetId}`);
        return;
    }

    const userId = interaction.user.id;
    const preferredProvider = getPreferredProvider(userId);
    const providerName = PROVIDERS[preferredProvider]?.name || preferredProvider;

    if (!preferredProvider) {
        await interaction.followUp({
            content: '請先使用 `/pe api model` 選擇翻譯引擎，再使用翻譯功能。',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const cached = getCachedV2Translation(tweetId, preferredProvider);
    if (cached) {
        await rebuildAndUpdate(interaction, tweetId, {
            isTranslated: true,
            ...cached
        });
        tlog.log('V2-翻譯', interaction, `使用快取翻譯: ${tweetId}`);
        return;
    }

    const tweetData = getCachedTweetData(tweetId);
    if (!tweetData?.tweet) {
        await interaction.followUp({
            content: '找不到推文資料，請重新抓取一次後再試。',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const { tweet, quoteData, replyData } = tweetData;
    const textBundle = buildTextBundle({
        main: tweet.text || '',
        quote: quoteData?.tweet?.text || '',
        reply: replyData?.tweet?.text || ''
    });

    tlog.log('V2-翻譯', interaction, `開始翻譯: ${tweetId} (${providerName}, ${textBundle.combined.length} 字)`);

    const result = await translateTweet({
        textBundle,
        userId,
        provider: preferredProvider,
        authorName: tweet.author?.name || null,
        context: '',
        allowEnvFallback: false
    });

    if (!result.success) {
        await interaction.followUp({
            content: result.error || '翻譯失敗，請稍後再試或檢查翻譯 API Key。',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const translationData = {
        translatedText: result.translated.main,
        translatedQuoteText: result.translated.quote,
        translatedReplyText: result.translated.reply
    };
    setCachedV2Translation(tweetId, preferredProvider, translationData);
    sharedTranslationCache.set(tweetId, preferredProvider, {
        original: {
            main: textBundle.main,
            quote: textBundle.quote,
            reply: textBundle.reply
        },
        translated: {
            main: result.translated.main,
            quote: result.translated.quote,
            reply: result.translated.reply
        },
        model: result.model || preferredProvider
    });

    await rebuildAndUpdate(interaction, tweetId, {
        isTranslated: true,
        ...translationData
    });

    tlog.log('V2-翻譯', interaction, `翻譯完成: ${tweetId} (${providerName})`);
    try { db.tfdStats.record('translation', interaction.guildId, interaction.user.id); } catch (_) {}
}

module.exports = {
    handleV2Translate
};
