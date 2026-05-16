const assert = require('assert');
const fs = require('fs');
const tfd = require('../src/shared/logging/tfd-logger');

const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;
const originalWriteFileSync = fs.writeFileSync;
const originalRenameSync = fs.renameSync;
const originalMkdirSync = fs.mkdirSync;
const originalNow = Date.now;
const originalSys = tfd.sys;
const originalSysError = tfd.sysError;

let statsContent = null;
let tmpContent = null;
let now = Date.parse('2026-05-16T00:00:00.000Z');

function isStatsPath(filePath) {
    return String(filePath).replace(/\\/g, '/').endsWith('/data/url-stats.json');
}

function isTmpStatsPath(filePath) {
    return String(filePath).replace(/\\/g, '/').endsWith('/data/url-stats.json.tmp');
}

function setStats(value) {
    statsContent = value === null ? null : JSON.stringify(value, null, 2);
    tmpContent = null;
}

try {
    Date.now = () => now;
    tfd.sys = () => {};
    tfd.sysError = () => {};

    fs.existsSync = filePath => {
        if (isStatsPath(filePath)) return statsContent !== null;
        if (isTmpStatsPath(filePath)) return tmpContent !== null;
        return originalExistsSync.call(fs, filePath);
    };

    fs.readFileSync = (filePath, ...args) => {
        if (isStatsPath(filePath)) return statsContent;
        if (isTmpStatsPath(filePath)) return tmpContent;
        return originalReadFileSync.call(fs, filePath, ...args);
    };

    fs.writeFileSync = (filePath, content, ...args) => {
        if (isTmpStatsPath(filePath)) {
            tmpContent = content;
            return;
        }
        return originalWriteFileSync.call(fs, filePath, content, ...args);
    };

    fs.renameSync = (from, to) => {
        if (isTmpStatsPath(from) && isStatsPath(to)) {
            statsContent = tmpContent;
            tmpContent = null;
            return;
        }
        return originalRenameSync.call(fs, from, to);
    };

    fs.mkdirSync = (dirPath, ...args) => {
        if (String(dirPath).replace(/\\/g, '/').endsWith('/data')) {
            return;
        }
        return originalMkdirSync.call(fs, dirPath, ...args);
    };

    const SharedUrlStats = require('../src/shared/analytics/url-stats');
    const LegacyUrlStats = require('../tfd-system/utils/url-stats');

    assert.strictEqual(LegacyUrlStats, SharedUrlStats);
    assert.deepStrictEqual(SharedUrlStats.recordUrl(null, 'g1', 'c1'), { channel: 0, guild: 0, total: 0 });
    assert.deepStrictEqual(SharedUrlStats.lookupUrl('https://x.com/u/status/1', null, 'c1'), { channel: 0, guild: 0, total: 0 });

    setStats(null);
    assert.deepStrictEqual(
        SharedUrlStats.recordUrl('https://x.com/user/status/123?x=1', 'guild-a', 'channel-a'),
        { channel: 1, guild: 1, total: 1 }
    );
    assert.ok(statsContent.includes('twitter.com/status/123'));
    assert.deepStrictEqual(
        SharedUrlStats.recordUrl('https://vxtwitter.com/other/status/123', 'guild-a', 'channel-a'),
        { channel: 2, guild: 2, total: 2 }
    );
    assert.deepStrictEqual(
        SharedUrlStats.lookupUrl('https://fxtwitter.com/name/status/123', 'guild-a', 'channel-a'),
        { channel: 2, guild: 2, total: 2 }
    );
    assert.deepStrictEqual(
        SharedUrlStats.lookupUrl('https://fxtwitter.com/name/status/123', 'guild-a', 'channel-b'),
        { channel: 0, guild: 2, total: 2 }
    );
    assert.deepStrictEqual(
        SharedUrlStats.lookupUrl('https://fxtwitter.com/name/status/123', 'guild-b', 'channel-z'),
        { channel: 0, guild: 0, total: 2 }
    );

    setStats({
        windowStart: now - (8 * 24 * 60 * 60 * 1000),
        urls: {
            'example.com/old': { total: 5, guilds: { old: { count: 5, channels: { c: 5 } } }, lastSeen: now }
        }
    });
    assert.deepStrictEqual(
        SharedUrlStats.recordUrl('https://example.com/new', 'guild-a', 'channel-a'),
        { channel: 1, guild: 1, total: 1 }
    );
    assert.deepStrictEqual(
        SharedUrlStats.lookupUrl('https://example.com/old', 'old', 'c'),
        { channel: 0, guild: 0, total: 0 }
    );

    setStats({
        windowStart: now,
        urls: {
            'example.com/stale': { total: 9, guilds: { g: { count: 9, channels: { c: 9 } } }, lastSeen: now - (4 * 24 * 60 * 60 * 1000) }
        }
    });
    assert.deepStrictEqual(
        SharedUrlStats.recordUrl('https://example.com/fresh', 'guild-a', 'channel-a'),
        { channel: 1, guild: 1, total: 1 }
    );
    assert.deepStrictEqual(
        SharedUrlStats.lookupUrl('https://example.com/stale', 'g', 'c'),
        { channel: 0, guild: 0, total: 0 }
    );

    console.log('url-stats smoke ok');
} finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    fs.writeFileSync = originalWriteFileSync;
    fs.renameSync = originalRenameSync;
    fs.mkdirSync = originalMkdirSync;
    Date.now = originalNow;
    tfd.sys = originalSys;
    tfd.sysError = originalSysError;
}
