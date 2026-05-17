const assert = require('node:assert/strict');

const { resolveV2UrlStats } = require('../src/features/twitter/interactions/v2/view-stats');

function interaction(overrides = {}) {
    return {
        guildId: 'guild-1',
        channelId: 'channel-1',
        ...overrides
    };
}

assert.equal(resolveV2UrlStats({
    interaction: interaction({ guildId: null }),
    tweetId: '100',
    originalURL: 'https://twitter.com/tester/status/100',
    lookup: () => ({ total: 3 })
}), null);

assert.equal(resolveV2UrlStats({
    interaction: interaction({ channelId: null }),
    tweetId: '100',
    originalURL: 'https://twitter.com/tester/status/100',
    lookup: () => ({ total: 3 })
}), null);

let calls = [];
const foundStats = { guild: 1, channel: 2, total: 3 };
const stats = resolveV2UrlStats({
    interaction: interaction(),
    tweetId: '100',
    originalURL: 'https://twitter.com/tester/status/100',
    lookup: (...args) => {
        calls.push(args);
        return foundStats;
    }
});

assert.equal(stats, foundStats);
assert.deepEqual(calls, [[
    'https://twitter.com/tester/status/100',
    'guild-1',
    'channel-1'
]]);

calls = [];
resolveV2UrlStats({
    interaction: interaction(),
    tweetId: '200',
    originalURL: null,
    lookup: (...args) => {
        calls.push(args);
        return null;
    }
});

assert.deepEqual(calls, [[
    'https://twitter.com/i/status/200',
    'guild-1',
    'channel-1'
]]);

assert.equal(resolveV2UrlStats({
    interaction: interaction(),
    tweetId: '300',
    originalURL: 'https://twitter.com/tester/status/300',
    lookup: () => {
        throw new Error('lookup failed');
    }
}), null);

console.log('twitter v2 view stats smoke ok');
process.exit(0);
