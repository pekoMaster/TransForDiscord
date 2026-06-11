const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const providerPath = path.join(repoRoot, 'src/features/translation/providers/free-provider.js');
const geminiProviderPath = path.join(repoRoot, 'src/features/translation/providers/gemini-provider.js');
const envPath = path.join(repoRoot, '.env');

test('free provider is locked to stable Gemini 3.1 Flash-Lite', () => {
    const provider = require(providerPath);

    assert.equal(provider.DEFAULT_MODEL, 'gemini-3.1-flash-lite');
});

test('free provider rotates only Gemini key slots 2, 3, 4, and 6', () => {
    const source = fs.readFileSync(providerPath, 'utf8');

    assert.match(source, /const GEMINI_KEY_SLOTS = \[2, 3, 4, 6\];/);
    assert.doesNotMatch(source, /FREE_API_URL|FREE_MODEL|_tryFreemodel|_loadFreeKeys/);
});

test('free provider advances Gemini key cursor after successful calls', async () => {
    const axios = require('axios');
    const originalPost = axios.post;
    const envKeys = Array.from({ length: 6 }, (_, i) => `GOOGLE_GEMINI_API_KEY_${i + 1}`);
    const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    const providerCacheKey = require.resolve(providerPath);

    for (const key of envKeys) delete process.env[key];
    process.env.GOOGLE_GEMINI_API_KEY_1 = 'KEY1_SHOULD_NOT_BE_USED';
    process.env.GOOGLE_GEMINI_API_KEY_2 = 'KEY2';
    process.env.GOOGLE_GEMINI_API_KEY_3 = 'KEY3';
    process.env.GOOGLE_GEMINI_API_KEY_5 = 'KEY5_SHOULD_NOT_BE_USED';

    const usedKeys = [];
    axios.post = async (url) => {
        usedKeys.push(new URL(url).searchParams.get('key'));
        return {
            data: {
                candidates: [{ content: { parts: [{ text: 'ok' }] } }]
            }
        };
    };

    delete require.cache[providerCacheKey];
    try {
        const provider = require(providerPath);
        await provider.translate({ text: 'hello', prompt: 'translate' });
        await provider.translate({ text: 'world', prompt: 'translate' });

        assert.deepEqual(usedKeys, ['KEY2', 'KEY3']);
    } finally {
        axios.post = originalPost;
        for (const key of envKeys) {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        }
        delete require.cache[providerCacheKey];
    }
});

test('Gemini provider fallback starts with stable Gemini 3.1 Flash-Lite', () => {
    const provider = require(geminiProviderPath);

    assert.equal(provider.MODEL_FALLBACKS[0], 'gemini-3.1-flash-lite');
    assert.ok(!provider.MODEL_FALLBACKS.some(model => model.includes('preview')));
});

test('.env free translation config uses Gemini only', () => {
    const envText = fs.readFileSync(envPath, 'utf8');

    assert.match(envText, /^FREE_GEMINI_MODEL=gemini-3\.1-flash-lite$/m);
    assert.doesNotMatch(envText, /^GOOGLE_GEMINI_API_KEY_1=/m);
    assert.doesNotMatch(envText, /^GOOGLE_GEMINI_API_KEY_5=/m);
    assert.match(envText, /^GOOGLE_GEMINI_API_KEY_2=/m);
    assert.match(envText, /^GOOGLE_GEMINI_API_KEY_3=/m);
    assert.match(envText, /^GOOGLE_GEMINI_API_KEY_4=/m);
    assert.match(envText, /^GOOGLE_GEMINI_API_KEY_6=/m);
    assert.doesNotMatch(envText, /^FREE_API_BASE_URL=/m);
    assert.doesNotMatch(envText, /^FREE_MODEL=/m);
    assert.doesNotMatch(envText, /^FREE_API_KEY=/m);
});
