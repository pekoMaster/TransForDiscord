const assert = require('node:assert/strict');

const { buildV2ActionRows } = require('../src/features/twitter/containers/v2/action-rows');
const { REPORT_BTN_PREFIX } = require('../src/shared/discord/spoiler-button-helper');

function ids(rows) {
    return rows.flatMap(row => row.components.map(component => component.data.custom_id));
}

function assertValidRows(rows) {
    assert.ok(rows.length > 0, 'expected at least one action row');
    for (const row of rows) {
        assert.ok(row.components.length >= 1, 'action row must not be empty');
        assert.ok(row.components.length <= 5, 'action row must not exceed 5 components');
    }
}

const tweet = {
    id: '123',
    text: 'This tweet is long enough to show translation controls.',
    quote: { author: { screen_name: 'quoted' } },
    replying_to: 'someone'
};

const collapsedRows = buildV2ActionRows(tweet, {
    isTranslated: false,
    isQuoteShown: false,
    isReplyShown: false,
    isExpanded: false,
    hasTruncated: true,
    reportId: 111
});
assertValidRows(collapsedRows);
assert.deepEqual(ids(collapsedRows), [
    'v2_translate_123',
    'v2_expand_all_123',
    'v2_reload_123',
    `${REPORT_BTN_PREFIX}111`
]);

const expandedRows = buildV2ActionRows(tweet, {
    isTranslated: true,
    isQuoteShown: true,
    isReplyShown: true,
    isExpanded: true,
    hasTruncated: true,
    reportId: 222
});
assertValidRows(expandedRows);
assert.deepEqual(ids(expandedRows), [
    'v2_original_123',
    'v2_collapse_all_123',
    'v2_reload_123',
    `${REPORT_BTN_PREFIX}222`
]);

const shortTweetRows = buildV2ActionRows(
    { id: '456', text: 'short' },
    { reportId: 333 }
);
assertValidRows(shortTweetRows);
assert.deepEqual(ids(shortTweetRows), [
    'v2_reload_456',
    `${REPORT_BTN_PREFIX}333`
]);

console.log('twitter v2 action rows smoke ok');
