const assert = require('assert');

const db = require('../db');
const {
    listSupportedDomains,
    normalizeDomainInput,
    resolveSupportedDomain
} = require('../src/features/link-support/domain-registry');
const linkSupport = require('../src/features/link-support/link-support-service');

const TEST_GUILD_ID = '__link_support_smoke_guild__';
const TEST_USER_ID = '__link_support_smoke_user__';

function runDomainRegistryChecks() {
    assert.strictEqual(normalizeDomainInput('https://x.com/user/status/123'), 'x.com');
    assert.strictEqual(normalizeDomainInput(' WWW.Instagram.COM/path '), 'www.instagram.com');

    const twitter = resolveSupportedDomain('https://x.com/user/status/123');
    assert.deepStrictEqual(
        { siteName: twitter.siteName, domain: twitter.domain },
        { siteName: 'twitter', domain: 'x.com' }
    );

    assert.strictEqual(resolveSupportedDomain('https://example.invalid/post'), null);
    assert.ok(listSupportedDomains().some(entry => entry.siteName === 'twitter' && entry.domain === 'x.com'));
}

function runDbChecks() {
    db.guilds._ensure(TEST_GUILD_ID);
    linkSupport.setDomainEnabled(TEST_GUILD_ID, 'x.com', true, TEST_USER_ID);

    assert.strictEqual(linkSupport.isDomainEnabled(TEST_GUILD_ID, 'https://x.com/a/status/1'), true);

    linkSupport.setDomainEnabled(TEST_GUILD_ID, 'https://x.com/a/status/1', false, TEST_USER_ID);
    assert.strictEqual(linkSupport.isDomainEnabled(TEST_GUILD_ID, 'https://x.com/a/status/1'), false);

    const disabled = linkSupport.listDisabledDomains(TEST_GUILD_ID);
    assert.ok(disabled.some(row => row.domain === 'x.com' && row.site_name === 'twitter'));

    linkSupport.setDomainEnabled(TEST_GUILD_ID, 'x.com', true, TEST_USER_ID);
    assert.strictEqual(linkSupport.isDomainEnabled(TEST_GUILD_ID, 'x.com'), true);
    assert.ok(!linkSupport.listDisabledDomains(TEST_GUILD_ID).some(row => row.domain === 'x.com'));
}

try {
    runDomainRegistryChecks();
    runDbChecks();
    console.log('link-support smoke ok');
} finally {
    try {
        db.guilds.delete(TEST_GUILD_ID);
    } catch (_) {
        // Ignore cleanup errors so the original assertion remains visible.
    }
    db.close();
}
