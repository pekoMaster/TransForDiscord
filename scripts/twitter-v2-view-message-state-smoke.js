const assert = require('node:assert/strict');

const {
    getStoredViewState,
    setStoredViewState
} = require('../src/features/twitter/interactions/v2/view-message-state');

const interaction = {
    message: { id: 'message-1' }
};

let getCalls = [];
const stored = { tweetId: '100', isExpanded: true };
assert.equal(getStoredViewState(interaction, messageId => {
    getCalls.push(messageId);
    return stored;
}), stored);
assert.deepEqual(getCalls, ['message-1']);

let setCalls = [];
const normalized = { tweetId: '100', isExpanded: false };
assert.equal(setStoredViewState(interaction, { tweetId: '100' }, (messageId, state) => {
    setCalls.push([messageId, state]);
    return normalized;
}), normalized);
assert.deepEqual(setCalls, [['message-1', { tweetId: '100' }]]);

assert.equal(getStoredViewState({ message: {} }, () => stored), null);
assert.equal(setStoredViewState({ message: {} }, { tweetId: '100' }, () => normalized), null);
assert.equal(getStoredViewState(null, () => stored), null);
assert.equal(setStoredViewState(null, { tweetId: '100' }, () => normalized), null);

console.log('twitter v2 view message state smoke ok');
process.exit(0);
