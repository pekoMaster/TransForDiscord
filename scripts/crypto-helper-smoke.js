const assert = require('assert');
const path = require('path');

const TEST_KEY = '0'.repeat(64);
const originalEnvKey = process.env.TFD_ENCRYPTION_KEY;

process.env.TFD_ENCRYPTION_KEY = TEST_KEY;

const sharedCrypto = require('../src/shared/crypto/crypto-helper');
const legacyCrypto = require('../utils/crypto-helper');

try {
    assert.strictEqual(legacyCrypto.encrypt, sharedCrypto.encrypt);
    assert.strictEqual(legacyCrypto.decrypt, sharedCrypto.decrypt);
    assert.strictEqual(legacyCrypto.secureEqual, sharedCrypto.secureEqual);
    assert.strictEqual(legacyCrypto.maskKey, sharedCrypto.maskKey);

    const expectedKeyFile = path.resolve(__dirname, '..', 'data', '.encryption-key');
    assert.strictEqual(sharedCrypto._KEY_FILE, expectedKeyFile);

    const encrypted = sharedCrypto.encrypt('secret-api-key');
    assert.notStrictEqual(encrypted, 'secret-api-key');
    assert.strictEqual(sharedCrypto.decrypt(encrypted), 'secret-api-key');
    assert.strictEqual(legacyCrypto.decrypt(encrypted), 'secret-api-key');

    assert.strictEqual(sharedCrypto.secureEqual('same', 'same'), true);
    assert.strictEqual(sharedCrypto.secureEqual('same', 'diff'), false);
    assert.strictEqual(sharedCrypto.maskKey('sk-proj-abcdef123456'), 'sk-pr••••3456');
    assert.strictEqual(sharedCrypto.maskKey('short'), '••••');

    process.env.TFD_ENCRYPTION_KEY = 'bad';
    sharedCrypto._resetForTesting();
    assert.throws(() => sharedCrypto.encrypt('x'), /TFD_ENCRYPTION_KEY/);

    process.env.TFD_ENCRYPTION_KEY = TEST_KEY;
    sharedCrypto._resetForTesting();

    console.log('crypto-helper smoke ok');
} finally {
    if (originalEnvKey === undefined) {
        delete process.env.TFD_ENCRYPTION_KEY;
    } else {
        process.env.TFD_ENCRYPTION_KEY = originalEnvKey;
    }
    sharedCrypto._resetForTesting();
}
