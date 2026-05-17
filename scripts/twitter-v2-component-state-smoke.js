const assert = require('node:assert/strict');

const { deriveStateFromComponents } = require('../src/features/twitter/state/v2-component-state');
const {
    buildV2Container,
    deriveStateFromComponents: deriveStateFromBuilder
} = require('../src/features/twitter/containers/v2-container-builder');

function row(ids) {
    return {
        components: ids.map(id => ({ customId: id }))
    };
}

assert.deepEqual(deriveStateFromComponents([], '100'), {
    isTranslated: false,
    isQuoteShown: false,
    isReplyShown: false,
    isExpanded: false
});

assert.deepEqual(deriveStateFromComponents([row(['v2_original_100'])], '100'), {
    isTranslated: true,
    isQuoteShown: false,
    isReplyShown: false,
    isExpanded: false
});

assert.deepEqual(deriveStateFromComponents([row(['v2_collapse_all_100'])], '100'), {
    isTranslated: false,
    isQuoteShown: true,
    isReplyShown: true,
    isExpanded: true
});

assert.deepEqual(deriveStateFromComponents([row([
    'v2_hide_quote_100',
    'v2_hide_reply_100',
    'v2_collapse_100'
])], '100'), {
    isTranslated: false,
    isQuoteShown: true,
    isReplyShown: true,
    isExpanded: true
});

assert.deepEqual(deriveStateFromComponents([{
    components: [{ custom_id: 'v2_original_100' }]
}], '100'), {
    isTranslated: true,
    isQuoteShown: false,
    isReplyShown: false,
    isExpanded: false
});

assert.equal(deriveStateFromBuilder, deriveStateFromComponents);

const container = buildV2Container({
    id: '100',
    text: 'hello world',
    author: {
        screen_name: 'tester',
        name: 'Tester',
        avatar_url: 'https://example.com/avatar.png'
    },
    media: { all: [] }
}, 'https://twitter.com/tester/status/100');

assert.equal(typeof container.toJSON, 'function');
assert.equal(container.toJSON().type, 17);

console.log('twitter v2 component state smoke ok');
