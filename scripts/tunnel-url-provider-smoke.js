const assert = require('assert');
const fs = require('fs');

const tfd = require('../src/shared/logging/tfd-logger');
const originalSysError = tfd.sysError;
const SharedTunnelUrlProvider = require('../src/shared/web/tunnel-url-provider');
const LegacyTunnelUrlProvider = require('../tfd-system/utils/tunnel-url-provider');

assert.strictEqual(LegacyTunnelUrlProvider, SharedTunnelUrlProvider);

const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;

let fakeExists = true;
let fakeConfig = {
    status: 'active',
    current_url: 'https://tunnel.example',
    last_updated: '2026-05-16T00:00:00.000Z'
};
let readCount = 0;

function isTunnelConfigPath(filePath) {
    return String(filePath).replace(/\\/g, '/').endsWith('/data/cloudflare_tunnel.json');
}

try {
    tfd.sysError = () => {};

    fs.existsSync = filePath => {
        if (isTunnelConfigPath(filePath)) {
            return fakeExists;
        }
        return originalExistsSync.call(fs, filePath);
    };

    fs.readFileSync = (filePath, ...args) => {
        if (isTunnelConfigPath(filePath)) {
            readCount += 1;
            return typeof fakeConfig === 'string' ? fakeConfig : JSON.stringify(fakeConfig);
        }
        return originalReadFileSync.call(fs, filePath, ...args);
    };

    SharedTunnelUrlProvider.clearCache();
    assert.strictEqual(SharedTunnelUrlProvider.isTunnelAvailable(), 'https://tunnel.example');
    assert.strictEqual(SharedTunnelUrlProvider.getTunnelBaseUrl(), 'https://tunnel.example');
    assert.strictEqual(
        SharedTunnelUrlProvider.getTwitterEmbedUrl('123'),
        'https://tunnel.example/embed/twitter/123'
    );
    assert.strictEqual(
        SharedTunnelUrlProvider.convertTwitterUrl('https://x.com/user/status/123'),
        'https://tunnel.example/embed/twitter/123'
    );
    assert.strictEqual(
        SharedTunnelUrlProvider.convertTwitterUrl('https://twitter.com/user/status/456'),
        'https://tunnel.example/embed/twitter/456'
    );
    assert.strictEqual(SharedTunnelUrlProvider.convertTwitterUrl('https://example.com/nope'), null);
    assert.deepStrictEqual(SharedTunnelUrlProvider.getTunnelStatus(), {
        available: true,
        url: 'https://tunnel.example',
        lastUpdated: '2026-05-16T00:00:00.000Z'
    });

    const readsAfterActive = readCount;
    fakeConfig = {
        status: 'active',
        current_url: 'https://changed.example',
        last_updated: '2026-05-16T00:01:00.000Z'
    };
    assert.strictEqual(SharedTunnelUrlProvider.getTunnelBaseUrl(), 'https://tunnel.example');
    assert.strictEqual(readCount, readsAfterActive);

    SharedTunnelUrlProvider.clearCache();
    assert.strictEqual(SharedTunnelUrlProvider.getTunnelBaseUrl(), 'https://changed.example');

    fakeConfig = {
        status: 'inactive',
        current_url: 'https://inactive.example',
        last_updated: '2026-05-16T00:02:00.000Z'
    };
    SharedTunnelUrlProvider.clearCache();
    assert.strictEqual(SharedTunnelUrlProvider.isTunnelAvailable(), false);
    assert.strictEqual(SharedTunnelUrlProvider.getTunnelBaseUrl(), null);
    assert.deepStrictEqual(SharedTunnelUrlProvider.getTunnelStatus(), {
        available: false,
        url: 'https://inactive.example',
        lastUpdated: '2026-05-16T00:02:00.000Z'
    });

    fakeExists = false;
    SharedTunnelUrlProvider.clearCache();
    assert.strictEqual(SharedTunnelUrlProvider.isTunnelAvailable(), null);
    assert.strictEqual(SharedTunnelUrlProvider.getTunnelBaseUrl(), null);
    assert.deepStrictEqual(SharedTunnelUrlProvider.getTunnelStatus(), {
        available: false,
        url: null,
        lastUpdated: null
    });

    fakeExists = true;
    fakeConfig = '{bad json';
    SharedTunnelUrlProvider.clearCache();
    assert.strictEqual(SharedTunnelUrlProvider.isTunnelAvailable(), null);
    assert.deepStrictEqual(SharedTunnelUrlProvider.getTunnelStatus(), {
        available: false,
        url: null,
        lastUpdated: null
    });

    console.log('tunnel-url-provider smoke ok');
} finally {
    tfd.sysError = originalSysError;
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    SharedTunnelUrlProvider.clearCache();
}
