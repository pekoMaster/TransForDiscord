const assert = require('assert');

const config = require('../tfd-system/config/tfd-config.json');
const SharedHTTPClient = require('../src/shared/http/http-client');
const LegacyHTTPClient = require('../tfd-system/utils/http-client');

assert.strictEqual(LegacyHTTPClient, SharedHTTPClient);

const client = new SharedHTTPClient();
assert.strictEqual(client.timeout, config.settings.timeout);
assert.strictEqual(client.userAgent, config.settings.userAgent);
assert.strictEqual(client.maxRetries, config.settings.maxRetries);
assert.strictEqual(client.maxContentLength, config.settings.maxContentLength);

client.log = () => {};

client.client = async requestConfig => ({
    data: 'ok',
    status: 200,
    headers: { 'x-smoke': 'yes' },
    config: { url: requestConfig.url }
});

(async () => {
    const success = await client.request({ url: 'https://example.com/success' });
    assert.deepStrictEqual(success, {
        success: true,
        data: 'ok',
        status: 200,
        headers: { 'x-smoke': 'yes' },
        url: 'https://example.com/success'
    });

    let botBlockCalls = 0;
    client.maxRetries = 3;
    client.client = async () => {
        botBlockCalls += 1;
        const error = new Error('blocked');
        error.response = { status: 403 };
        throw error;
    };

    const botBlock = await client.request({ url: 'https://example.com/blocked' });
    assert.strictEqual(botBlock.success, false);
    assert.strictEqual(botBlock.error, 'blocked');
    assert.strictEqual(botBlock.status, 403);
    assert.strictEqual(botBlock.url, 'https://example.com/blocked');
    assert.strictEqual(botBlockCalls, 1);

    let retryCalls = 0;
    client.maxRetries = 2;
    client.sleep = async () => {};
    client.client = async () => {
        retryCalls += 1;
        throw new Error('network down');
    };

    const retryFailure = await client.request({ url: 'https://example.com/retry' });
    assert.strictEqual(retryFailure.success, false);
    assert.strictEqual(retryFailure.error, 'network down');
    assert.strictEqual(retryFailure.status, 0);
    assert.strictEqual(retryCalls, 2);

    client.get = async () => ({ success: true, data: '<html></html>' });
    assert.strictEqual(await client.fetchHTML('https://example.com/html'), '<html></html>');

    client.get = async () => ({ success: false, status: 500, error: 'server error' });
    assert.deepStrictEqual(await client.fetchHTML('https://example.com/html-error'), {
        error: true,
        status: 500,
        message: 'server error'
    });

    client.get = async () => ({ success: true, data: '{"answer":42}' });
    assert.deepStrictEqual(await client.fetchJSON('https://example.com/json-string'), { answer: 42 });

    const jsonObject = { ok: true };
    client.get = async () => ({ success: true, data: jsonObject });
    assert.strictEqual(await client.fetchJSON('https://example.com/json-object'), jsonObject);

    client.get = async () => ({ success: true, data: '{bad json' });
    assert.strictEqual(await client.fetchJSON('https://example.com/json-invalid'), null);

    client.get = async () => ({ success: false, status: 404, error: 'not found' });
    assert.strictEqual(await client.fetchJSON('https://example.com/json-failure'), null);

    client.client = { head: async () => ({ status: 204 }) };
    assert.strictEqual(await client.checkURL('https://example.com/head-ok'), true);

    client.client = { head: async () => { throw new Error('head failed'); } };
    assert.strictEqual(await client.checkURL('https://example.com/head-fail'), false);

    assert.strictEqual(client.calculateBackoff(1), 1000);
    assert.strictEqual(client.calculateBackoff(3), 4000);
    assert.strictEqual(client.calculateBackoff(10), 5000);

    console.log('http-client smoke ok');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
