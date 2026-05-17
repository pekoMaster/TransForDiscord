const assert = require('node:assert/strict');

const { resolveTweetBundle } = require('../src/features/twitter/interactions/v2/tweet-data');

async function run() {
    const cachedBundle = {
        tweet: { id: '100' },
        originalURL: 'https://twitter.com/tester/status/100',
        quoteData: null,
        replyData: null
    };

    let hydrateCalls = [];
    const cacheHit = await resolveTweetBundle('100', {
        refreshData: false,
        getCached: () => cachedBundle,
        hydrate: async (...args) => {
            hydrateCalls.push(args);
            return { tweet: { id: 'hydrated' } };
        }
    });

    assert.equal(cacheHit, cachedBundle);
    assert.deepEqual(hydrateCalls, []);

    const refreshedBundle = { tweet: { id: 'refreshed' } };
    const refreshHit = await resolveTweetBundle('100', {
        refreshData: true,
        getCached: () => cachedBundle,
        hydrate: async (...args) => {
            hydrateCalls.push(args);
            return refreshedBundle;
        }
    });

    assert.equal(refreshHit, refreshedBundle);
    assert.deepEqual(hydrateCalls, [['100', 'https://twitter.com/tester/status/100']]);

    hydrateCalls = [];
    const missBundle = { tweet: { id: 'miss-hydrated' } };
    const cacheMiss = await resolveTweetBundle('200', {
        getCached: () => null,
        hydrate: async (...args) => {
            hydrateCalls.push(args);
            return missBundle;
        }
    });

    assert.equal(cacheMiss, missBundle);
    assert.deepEqual(hydrateCalls, [['200', undefined]]);

    const failed = await resolveTweetBundle('300', {
        getCached: () => null,
        hydrate: async () => {
            throw new Error('network failed');
        }
    });

    assert.equal(failed, null);

    console.log('twitter v2 tweet bundle resolution smoke ok');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
