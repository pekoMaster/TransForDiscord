const assert = require('node:assert/strict');

const viewUpdater = require('../src/features/twitter/interactions/v2/view-updater');

assert.equal(typeof viewUpdater.rebuildAndUpdate, 'function');
assert.equal(Object.prototype.hasOwnProperty.call(viewUpdater, 'buildFallbackState'), false);

console.log('twitter v2 view updater exports smoke ok');
process.exit(0);
