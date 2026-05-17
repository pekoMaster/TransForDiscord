const assert = require('node:assert/strict');
const {
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

const {
    buildV1TransitionPayload,
    transitionV2ToV1
} = require('../src/features/twitter/interactions/v2/v1-transition');

function button(customId) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(customId)
        .setStyle(ButtonStyle.Secondary);
}

function createExtractor(overrides = {}) {
    return {
        analyzeTweetType: () => 'single',
        isQuoteTweet: () => false,
        isReplyTweet: () => false,
        getQuoteTweetInfo: () => null,
        getReplyTweetInfo: async () => null,
        buildEnhancedEmbed: () => ({
            embed: new EmbedBuilder().setDescription('classic body'),
            truncationResult: { isTruncated: false }
        }),
        buildPaginationButtons: () => [],
        buildTranslateButtonComponent: tweetId => button(`twitter_translate_${tweetId}`),
        buildAllToggleButtonComponent: tweetId => button(`twitter_expand_all_${tweetId}`),
        buildReloadButtonComponent: tweetId => button(`twitter_reload_${tweetId}`),
        ...overrides
    };
}

const interaction = {
    message: {
        content: '-# <@123> via Peko Embed\nbody'
    },
    editReply: async () => null
};

async function run() {
    assert.equal(await buildV1TransitionPayload(interaction, '100', null, {
        extractor: createExtractor()
    }), null);

    assert.equal(await buildV1TransitionPayload(interaction, '100', {
        tweet: { id: '100', text: 'hello world long enough' }
    }, {
        extractor: createExtractor({
            buildEnhancedEmbed: () => ({ embed: null })
        })
    }), null);

    const payload = await buildV1TransitionPayload(interaction, '100', {
        originalURL: 'https://twitter.com/tester/status/100',
        tweet: { id: '100', text: 'hello world long enough' }
    }, {
        extractor: createExtractor()
    });

    assert.equal(payload.content, '-# <@123> via Peko Embed');
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.components.length, 1);
    assert.equal(payload.components[0].components.length, 2);
    assert.equal(payload.components[0].components[0].data.custom_id, 'twitter_translate_100');
    assert.equal(payload.components[0].components[1].data.custom_id, 'twitter_reload_100');

    let editedPayload = null;
    const transitioned = await transitionV2ToV1({
        ...interaction,
        editReply: async payloadArg => {
            editedPayload = payloadArg;
        }
    }, '100', {
        tweet: { id: '100', text: 'hello world long enough' }
    }, {
        extractor: createExtractor(),
        logger: {
            sysWarn: () => null,
            sysError: () => null
        }
    });

    assert.equal(transitioned, true);
    assert.equal(editedPayload.embeds.length, 1);

    console.log('twitter v2 v1 transition smoke ok');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
