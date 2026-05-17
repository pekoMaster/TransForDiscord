const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');

const { buildV2EditPayload } = require('../src/features/twitter/interactions/v2/view-payload');

const tweet = {
    id: '100',
    text: 'hello world',
    author: {
        screen_name: 'tester',
        name: 'Tester',
        avatar_url: 'https://example.com/avatar.png'
    },
    media: { all: [] }
};

const payload = buildV2EditPayload({
    tweet,
    originalURL: 'https://twitter.com/tester/status/100',
    quoteData: null,
    replyData: null,
    state: {
        markerText: '-# <@123> via Peko Embed',
        isTranslated: false,
        translatedText: null,
        translatedQuoteText: null,
        translatedReplyText: null,
        isQuoteShown: false,
        isReplyShown: false,
        isExpanded: false
    },
    urlStats: null
});

assert.equal(payload.content, null);
assert.deepEqual(payload.embeds, []);
assert.equal(payload.flags, MessageFlags.IsComponentsV2);
assert.equal(payload.components.length, 1);

const json = payload.components[0].toJSON();
assert.equal(json.type, 17);
assert.equal(json.components[0].content, '-# <@123> via Peko Embed');
assert.equal(json.components[1].type, 14);
assert.match(json.components[2].content, /hello world/);

const noMarkerPayload = buildV2EditPayload({
    tweet,
    originalURL: 'https://twitter.com/tester/status/100',
    state: {
        markerText: null,
        isTranslated: true,
        translatedText: 'translated body',
        translatedQuoteText: null,
        translatedReplyText: null,
        isQuoteShown: false,
        isReplyShown: false,
        isExpanded: false
    }
});

const noMarkerJson = noMarkerPayload.components[0].toJSON();
assert.match(noMarkerJson.components[0].content, /translated body/);

console.log('twitter v2 view payload smoke ok');
process.exit(0);
