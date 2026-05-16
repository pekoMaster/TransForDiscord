const assert = require('assert');

const sharedLogger = require('../src/shared/logging/tfd-logger');
const legacyLogger = require('../utils/tfd-logger');

assert.strictEqual(legacyLogger.log, sharedLogger.log);
assert.strictEqual(legacyLogger.warn, sharedLogger.warn);
assert.strictEqual(legacyLogger.error, sharedLogger.error);
assert.strictEqual(legacyLogger.sys, sharedLogger.sys);
assert.strictEqual(legacyLogger.sysWarn, sharedLogger.sysWarn);
assert.strictEqual(legacyLogger.sysError, sharedLogger.sysError);
assert.strictEqual(legacyLogger.ts, sharedLogger.ts);

assert.match(sharedLogger.ts(), /^\[\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}\]$/);

const lines = [];
const originalLog = console.log;
console.log = message => lines.push(message);
try {
    sharedLogger.log('Smoke', { guild: { name: 'Guild' }, author: { username: 'User' } }, 'detail');
    sharedLogger.sys('SmokeSys', 'system detail');
} finally {
    console.log = originalLog;
}

assert.match(lines[0], /^\[\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}\] \[Guild\] \[Smoke\] \[User\] detail$/);
assert.match(lines[1], /^\[\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}\] \[SmokeSys\] system detail$/);

console.log('tfd-logger smoke ok');
