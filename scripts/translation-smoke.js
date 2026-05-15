const assert = require('assert');

const { buildTextBundle, splitTranslatedBundle } = require('../utils/translation/text-bundle');
const { normalizeProviderError } = require('../utils/translation/errors');
const { buildPrompt } = require('../utils/translation/prompt-builder');
const { getEnvFallbackKey } = require('../utils/translation/key-resolver');
const { translateTweet } = require('../utils/translation/translation-service');

function testBundleRoundTrip() {
    const bundle = buildTextBundle({
        main: 'main text',
        quote: 'quote text',
        reply: 'reply text'
    });

    assert(bundle.combined.includes('---QUOTE---'));
    assert(bundle.combined.includes('---REPLY---'));

    const split = splitTranslatedBundle('main translated\n\n---QUOTE---\n\nquote translated\n\n---REPLY---\n\nreply translated');
    assert.strictEqual(split.main, 'main translated');
    assert.strictEqual(split.quote, 'quote translated');
    assert.strictEqual(split.reply, 'reply translated');
}

testBundleRoundTrip();

function testErrorNormalization() {
    const quota = normalizeProviderError(new Error('RESOURCE_EXHAUSTED'));
    assert.strictEqual(quota.errorType, 'QUOTA_EXHAUSTED');

    const timeout = normalizeProviderError(new Error('ETIMEDOUT'));
    assert.strictEqual(timeout.errorType, 'TIMEOUT');
}

function testPromptBuilder() {
    const prompt = buildPrompt({ authorName: 'Pekora', context: 'quote context' });
    assert(prompt.includes('Pekora'));
    assert(prompt.includes('---QUOTE---'));
    assert(prompt.includes('quote context'));
}

function testEnvFallbackKey() {
    const original = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';
    assert.strictEqual(getEnvFallbackKey('openrouter'), 'sk-or-v1-test');

    if (original === undefined) {
        delete process.env.OPENROUTER_API_KEY;
    } else {
        process.env.OPENROUTER_API_KEY = original;
    }
}

async function testTranslationServiceEmptyText() {
    const result = await translateTweet({
        textBundle: { combined: '' },
        userId: 'smoke-user',
        provider: 'gemini'
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.translated.main, '');
}

testErrorNormalization();
testPromptBuilder();
testEnvFallbackKey();

testTranslationServiceEmptyText()
    .then(() => {
        console.log('translation smoke ok');
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
