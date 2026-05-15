# Translation Subsystem Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the TFD translation flow so classic Twitter embeds and Twitter V2 components use the same provider selection, API key resolution, prompt building, cache behavior, and normalized error results.

**Architecture:** Add a small translation service layer under `utils/translation/` and migrate callers incrementally. Existing files keep compatibility exports during the migration so production behavior remains stable while duplicated logic is removed one seam at a time.

**Tech Stack:** Node.js CommonJS, Discord.js v14, `@google/genai`, axios, SQLite-backed user API keys, existing `tfd-logger`, existing `node --check` verification plus Node smoke scripts.

---

## Current Problems

- `handlers/twitter-translate-interactions.js` uses `utils/ai-translator.js`, honors `/pe api model`, and supports multiple providers.
- `handlers/twitter-v2-interactions.js` bypasses `utils/ai-translator.js` and directly uses `utils/user-api-key-service.js` plus `utils/gemini-translator.js`, so V2 is effectively Gemini-only.
- `utils/ai-translator.js`, `utils/gemini-translator.js`, and `utils/openrouter-translator.js` each own provider fallback, prompt content, and error classification.
- Translation state and cache are split between local Maps, `content-translation-interactions.js`, V2 local cache, and `shared-translation-cache.js`.
- `utils/user-api-key-storage.js` stores encrypted user keys; `utils/user-api-key-service.js` also resolves keys and env fallback keys. The boundary is unclear.
- There is no test framework, so verification must start with deterministic Node smoke scripts before adding larger behavior changes.

## Target File Structure

- Create: `utils/translation/errors.js`
  - Owns normalized error types and user-facing messages.
- Create: `utils/translation/prompt-builder.js`
  - Owns VTuber-focused translation prompt construction.
- Create: `utils/translation/text-bundle.js`
  - Owns joining and splitting main tweet, quote tweet, and reply tweet text with stable separators.
- Create: `utils/translation/key-resolver.js`
  - Owns provider selection and API key lookup from user settings plus env fallback where explicitly allowed.
- Create: `utils/translation/providers/gemini.js`
  - Owns Gemini API call and model fallback.
- Create: `utils/translation/providers/openrouter.js`
  - Owns OpenRouter API call and model fallback.
- Create: `utils/translation/providers/index.js`
  - Owns provider registry and provider metadata.
- Create: `utils/translation/translation-service.js`
  - Single public service used by handlers.
- Create: `scripts/translation-smoke.js`
  - Local deterministic smoke tests using mock providers and parser checks.
- Modify: `utils/ai-translator.js`
  - Become a compatibility adapter to `translation-service`.
- Modify: `utils/gemini-translator.js`
  - Keep non-Twitter helper methods for now; delegate `translateWithUserKey` to the Gemini provider or mark as compatibility path.
- Modify: `utils/user-api-key-service.js`
  - Become a compatibility adapter to `key-resolver`.
- Modify: `handlers/twitter-translate-interactions.js`
  - Replace direct `aiTranslate(...)` call with `translation-service.translateTweet(...)`.
- Modify: `handlers/twitter-v2-interactions.js`
  - Replace direct `geminiTranslator.translateWithUserKey(...)` with `translation-service.translateTweet(...)`.
- Modify: `doc/system/FILE_INDEX.md` and `CLAUDE.md`
  - Document the new translation subsystem entry point.

## Public Interfaces

### Translation Service

```js
// utils/translation/translation-service.js
async function translateTweet({
    textBundle,
    userId,
    provider,
    authorName = null,
    context = '',
    allowEnvFallback = false
}) {
    return {
        success: true,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        translated: {
            main: '...',
            quote: '',
            reply: ''
        },
        error: null,
        errorType: null
    };
}

module.exports = { translateTweet };
```

### Text Bundle

```js
// utils/translation/text-bundle.js
const QUOTE_SEPARATOR = '\n\n---QUOTE---\n\n';
const REPLY_SEPARATOR = '\n\n---REPLY---\n\n';

function buildTextBundle({ main, quote = '', reply = '' }) {
    let text = main || '';
    if (quote) text += QUOTE_SEPARATOR + quote;
    if (reply) text += REPLY_SEPARATOR + reply;
    return { main, quote, reply, combined: text };
}

function splitTranslatedBundle(translatedText) {
    let main = translatedText || '';
    let reply = '';
    let quote = '';

    if (main.includes('---REPLY---')) {
        const parts = main.split(/---REPLY---/);
        main = parts[0];
        reply = parts.slice(1).join('').trim();
    }

    if (main.includes('---QUOTE---')) {
        const parts = main.split(/---QUOTE---/);
        main = parts[0];
        quote = parts.slice(1).join('').trim();
    }

    return {
        main: main.replace(/---QUOTE---/g, '').replace(/---REPLY---/g, '').trim(),
        quote,
        reply
    };
}

module.exports = { QUOTE_SEPARATOR, REPLY_SEPARATOR, buildTextBundle, splitTranslatedBundle };
```

## Task 1: Add Baseline Translation Smoke Script

**Files:**
- Create: `scripts/translation-smoke.js`

- [ ] **Step 1: Create a deterministic smoke script**

Create `scripts/translation-smoke.js`:

```js
const assert = require('assert');

const { buildTextBundle, splitTranslatedBundle } = require('../utils/translation/text-bundle');

function testBundleRoundTrip() {
    const bundle = buildTextBundle({
        main: 'main text',
        quote: 'quote text',
        reply: 'reply text'
    });

    assert(bundle.combined.includes('---QUOTE---'));
    assert(bundle.combined.includes('---REPLY---'));

    const split = splitTranslatedBundle('主文\n\n---QUOTE---\n\n引用\n\n---REPLY---\n\n回覆');
    assert.strictEqual(split.main, '主文');
    assert.strictEqual(split.quote, '引用');
    assert.strictEqual(split.reply, '回覆');
}

testBundleRoundTrip();
console.log('translation smoke ok');
```

- [ ] **Step 2: Run smoke script before implementation**

Run: `node scripts/translation-smoke.js`

Expected before Task 2: FAIL with module not found for `../utils/translation/text-bundle`.

- [ ] **Step 3: Commit**

Run:

```bash
git add scripts/translation-smoke.js
git commit -m "test: add translation smoke coverage"
```

## Task 2: Add Text Bundle Utilities

**Files:**
- Create: `utils/translation/text-bundle.js`

- [ ] **Step 1: Create the utility**

Create `utils/translation/text-bundle.js` using the code from the “Text Bundle” public interface section.

- [ ] **Step 2: Verify**

Run:

```bash
node --check utils/translation/text-bundle.js
node scripts/translation-smoke.js
```

Expected: `translation smoke ok`.

- [ ] **Step 3: Commit**

Run:

```bash
git add utils/translation/text-bundle.js scripts/translation-smoke.js
git commit -m "feat: add translation text bundle utilities"
```

## Task 3: Normalize Translation Errors

**Files:**
- Create: `utils/translation/errors.js`
- Modify: `scripts/translation-smoke.js`

- [ ] **Step 1: Add error utility**

Create `utils/translation/errors.js`:

```js
const ERROR_MESSAGES = {
    NO_PROVIDER_SELECTED: '❌ 請先使用 `/pe api model` 選擇翻譯引擎，再使用翻譯功能。',
    NO_API_KEY: '❌ 你選擇的翻譯引擎尚未設定 API Key。請使用 `/pe api add` 設定 Key，或使用 `/pe api model` 更換引擎。',
    INVALID_API_KEY: '❌ API Key 無效，請重新設定。',
    QUOTA_EXHAUSTED: '⚠️ API 額度已用完或被限流，請稍後再試。',
    TIMEOUT: '⏰ 翻譯超時，請稍後再試。',
    TEXT_TOO_LONG: '❌ 文字過長，暫時無法翻譯。',
    ALL_PROVIDERS_FAILED: '❌ 所有翻譯引擎都失敗，請稍後再試。',
    UNKNOWN_ERROR: '❌ 翻譯失敗，請稍後再試。'
};

function normalizeProviderError(error) {
    const message = error?.message || String(error || '');
    const status = error?.response?.status;

    if (status === 401 || status === 403 || /invalid|api key/i.test(message)) {
        return { errorType: 'INVALID_API_KEY', message: ERROR_MESSAGES.INVALID_API_KEY, rawMessage: message };
    }
    if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(message)) {
        return { errorType: 'QUOTA_EXHAUSTED', message: ERROR_MESSAGES.QUOTA_EXHAUSTED, rawMessage: message };
    }
    if (/timeout|ETIMEDOUT/i.test(message)) {
        return { errorType: 'TIMEOUT', message: ERROR_MESSAGES.TIMEOUT, rawMessage: message };
    }
    return { errorType: 'UNKNOWN_ERROR', message: ERROR_MESSAGES.UNKNOWN_ERROR, rawMessage: message };
}

function failure(errorType, overrideMessage = null) {
    return {
        success: false,
        text: null,
        translated: null,
        errorType,
        error: overrideMessage || ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR
    };
}

module.exports = { ERROR_MESSAGES, normalizeProviderError, failure };
```

- [ ] **Step 2: Extend smoke script**

Append to `scripts/translation-smoke.js`:

```js
const { normalizeProviderError } = require('../utils/translation/errors');

const quota = normalizeProviderError(new Error('RESOURCE_EXHAUSTED'));
assert.strictEqual(quota.errorType, 'QUOTA_EXHAUSTED');
```

- [ ] **Step 3: Verify**

Run:

```bash
node --check utils/translation/errors.js
node scripts/translation-smoke.js
```

Expected: `translation smoke ok`.

- [ ] **Step 4: Commit**

Run:

```bash
git add utils/translation/errors.js scripts/translation-smoke.js
git commit -m "feat: normalize translation errors"
```

## Task 4: Extract Prompt Builder

**Files:**
- Create: `utils/translation/prompt-builder.js`
- Modify: `scripts/translation-smoke.js`

- [ ] **Step 1: Create prompt builder**

Create `utils/translation/prompt-builder.js`:

```js
const BASE_RULES = [
    '你是一位熟悉 VTuber 社群語境的翻譯助手。',
    '請將文字翻譯成自然的繁體中文。',
    '保留人名、團體名、專有名詞、網址、hashtag、emoji、顏文字。',
    '不要加入原文沒有的解釋。',
    '如果文字包含 ---QUOTE--- 或 ---REPLY---，請保留這些分隔符。'
];

function buildPrompt({ authorName = null, context = '' } = {}) {
    const lines = [...BASE_RULES];
    if (authorName) {
        lines.push(`發文者名稱是「${authorName}」，第一人稱語氣請優先視為該作者。`);
    }
    if (context) {
        lines.push(`額外上下文：\n${context}`);
    }
    return lines.join('\n');
}

module.exports = { buildPrompt };
```

- [ ] **Step 2: Extend smoke script**

Append to `scripts/translation-smoke.js`:

```js
const { buildPrompt } = require('../utils/translation/prompt-builder');

const prompt = buildPrompt({ authorName: 'Pekora', context: 'quote context' });
assert(prompt.includes('Pekora'));
assert(prompt.includes('---QUOTE---'));
assert(prompt.includes('quote context'));
```

- [ ] **Step 3: Verify**

Run:

```bash
node --check utils/translation/prompt-builder.js
node scripts/translation-smoke.js
```

Expected: `translation smoke ok`.

- [ ] **Step 4: Commit**

Run:

```bash
git add utils/translation/prompt-builder.js scripts/translation-smoke.js
git commit -m "feat: extract translation prompt builder"
```

## Task 5: Add Provider Registry and Key Resolver

**Files:**
- Create: `utils/translation/providers/index.js`
- Create: `utils/translation/key-resolver.js`
- Modify: `scripts/translation-smoke.js`

- [ ] **Step 1: Create provider registry**

Create `utils/translation/providers/index.js`:

```js
const PROVIDERS = {
    free: { name: '免費翻譯', requiresKey: false },
    gemini: { name: 'Gemini', requiresKey: true },
    openrouter: { name: 'OpenRouter', requiresKey: true },
    openai: { name: 'GPT', requiresKey: true },
    claude: { name: 'Claude', requiresKey: true }
};

function isSupportedProvider(provider) {
    return Object.prototype.hasOwnProperty.call(PROVIDERS, provider);
}

module.exports = { PROVIDERS, isSupportedProvider };
```

- [ ] **Step 2: Create key resolver**

Create `utils/translation/key-resolver.js`:

```js
const { getKey, getPreferredProvider } = require('../user-api-key-storage');
const { PROVIDERS, isSupportedProvider } = require('./providers');
const { failure } = require('./errors');

const ENV_KEY_BY_PROVIDER = {
    gemini: ['GOOGLE_GEMINI_API_KEY_1', 'GOOGLE_GEMINI_API_KEY_2', 'GOOGLE_GEMINI_API_KEY_3', 'GOOGLE_GEMINI_API_KEY_5', 'GOOGLE_GEMINI_API_KEY_6'],
    openrouter: ['OPENROUTER_API_KEY']
};

let envRoundRobin = new Map();

function getEnvFallbackKey(provider) {
    const names = ENV_KEY_BY_PROVIDER[provider] || [];
    const keys = names.map(name => process.env[name]).filter(Boolean);
    if (keys.length === 0) return null;
    const idx = envRoundRobin.get(provider) || 0;
    envRoundRobin.set(provider, (idx + 1) % keys.length);
    return keys[idx % keys.length];
}

function resolveTranslationKey({ userId, provider = null, allowEnvFallback = false }) {
    const selectedProvider = provider || getPreferredProvider(userId);
    if (!selectedProvider) return failure('NO_PROVIDER_SELECTED');
    if (!isSupportedProvider(selectedProvider)) return failure('NO_PROVIDER_SELECTED');

    if (!PROVIDERS[selectedProvider].requiresKey) {
        return { success: true, provider: selectedProvider, apiKey: null, source: 'none' };
    }

    const userKey = userId ? getKey(userId, selectedProvider) : null;
    if (userKey) return { success: true, provider: selectedProvider, apiKey: userKey, source: 'user' };

    if (allowEnvFallback) {
        const envKey = getEnvFallbackKey(selectedProvider);
        if (envKey) return { success: true, provider: selectedProvider, apiKey: envKey, source: 'env' };
    }

    return failure('NO_API_KEY');
}

module.exports = { resolveTranslationKey, getEnvFallbackKey };
```

- [ ] **Step 3: Extend smoke script with env fallback**

Append to `scripts/translation-smoke.js`:

```js
process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';
const { getEnvFallbackKey } = require('../utils/translation/key-resolver');
assert.strictEqual(getEnvFallbackKey('openrouter'), 'sk-or-v1-test');
```

- [ ] **Step 4: Verify**

Run:

```bash
node --check utils/translation/providers/index.js
node --check utils/translation/key-resolver.js
node scripts/translation-smoke.js
```

Expected: `translation smoke ok`.

- [ ] **Step 5: Commit**

Run:

```bash
git add utils/translation/providers/index.js utils/translation/key-resolver.js scripts/translation-smoke.js
git commit -m "feat: add translation provider key resolver"
```

## Task 6: Add Gemini Provider Adapter

**Files:**
- Create: `utils/translation/providers/gemini.js`

- [ ] **Step 1: Create Gemini provider**

Create `utils/translation/providers/gemini.js`:

```js
const { normalizeProviderError } = require('../errors');

const MODEL_FALLBACKS = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.1-pro-preview'
];

async function translate({ text, apiKey, prompt }) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    let lastError = null;

    for (const model of MODEL_FALLBACKS) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: `${prompt}\n\n原文：\n${text}\n\n譯文：`
            });
            const translatedText = response.text?.trim();
            if (!translatedText) throw new Error('Gemini returned empty translation');
            return { success: true, text: translatedText, model };
        } catch (error) {
            lastError = error;
            const normalized = normalizeProviderError(error);
            if (!['QUOTA_EXHAUSTED', 'TIMEOUT', 'UNKNOWN_ERROR'].includes(normalized.errorType)) break;
        }
    }

    const normalized = normalizeProviderError(lastError);
    return { success: false, errorType: normalized.errorType, error: normalized.message, rawError: normalized.rawMessage };
}

module.exports = { translate, MODEL_FALLBACKS };
```

- [ ] **Step 2: Verify syntax only**

Run: `node --check utils/translation/providers/gemini.js`

Expected: no output and exit code 0.

- [ ] **Step 3: Commit**

Run:

```bash
git add utils/translation/providers/gemini.js
git commit -m "feat: add gemini translation provider adapter"
```

## Task 7: Add OpenRouter Provider Adapter

**Files:**
- Create: `utils/translation/providers/openrouter.js`

- [ ] **Step 1: Create OpenRouter provider**

Create `utils/translation/providers/openrouter.js`:

```js
const axios = require('axios');
const { normalizeProviderError } = require('../errors');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS = [
    'z-ai/glm-4.5-air:free',
    'stepfun/step-3.5-flash:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'openrouter/free'
];

let currentModelIndex = 0;
const modelCooldowns = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

function isOnCooldown(model) {
    const until = modelCooldowns.get(model);
    if (!until) return false;
    if (Date.now() >= until) {
        modelCooldowns.delete(model);
        return false;
    }
    return true;
}

async function translate({ text, apiKey, prompt }) {
    let lastError = null;
    const total = MODELS.length;

    for (let i = 0; i < total; i++) {
        const idx = (currentModelIndex + i) % total;
        const model = MODELS[idx];
        if (isOnCooldown(model)) continue;

        try {
            const response = await axios.post(OPENROUTER_API_URL, {
                model,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: text }
                ],
                max_tokens: 2048,
                temperature: 0.3
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/TransForDiscord',
                    'X-Title': 'TransForDiscord'
                },
                timeout: 30000
            });

            const translatedText = response.data?.choices?.[0]?.message?.content?.trim();
            if (!translatedText) throw new Error('OpenRouter returned empty translation');
            currentModelIndex = (idx + 1) % total;
            return { success: true, text: translatedText, model };
        } catch (error) {
            lastError = error;
            if (error.response?.status === 429) modelCooldowns.set(model, Date.now() + COOLDOWN_MS);
        }
    }

    const normalized = normalizeProviderError(lastError);
    return { success: false, errorType: normalized.errorType, error: normalized.message, rawError: normalized.rawMessage };
}

module.exports = { translate, MODELS };
```

- [ ] **Step 2: Verify syntax only**

Run: `node --check utils/translation/providers/openrouter.js`

Expected: no output and exit code 0.

- [ ] **Step 3: Commit**

Run:

```bash
git add utils/translation/providers/openrouter.js
git commit -m "feat: add openrouter translation provider adapter"
```

## Task 8: Implement Translation Service

**Files:**
- Create: `utils/translation/translation-service.js`
- Modify: `scripts/translation-smoke.js`

- [ ] **Step 1: Create service**

Create `utils/translation/translation-service.js`:

```js
const { buildPrompt } = require('./prompt-builder');
const { splitTranslatedBundle } = require('./text-bundle');
const { resolveTranslationKey } = require('./key-resolver');
const { failure } = require('./errors');

const providers = {
    gemini: require('./providers/gemini'),
    openrouter: require('./providers/openrouter')
};

async function translateTweet({
    textBundle,
    userId,
    provider = null,
    authorName = null,
    context = '',
    allowEnvFallback = false
}) {
    if (!textBundle?.combined?.trim()) {
        return {
            success: true,
            provider: provider || 'none',
            model: 'none',
            translated: { main: '', quote: '', reply: '' },
            error: null,
            errorType: null
        };
    }

    const keyResult = resolveTranslationKey({ userId, provider, allowEnvFallback });
    if (!keyResult.success) return keyResult;

    if (keyResult.provider === 'free') {
        return failure('NO_API_KEY', '免費翻譯尚未啟用，請先選擇 Gemini 或 OpenRouter。');
    }

    const providerImpl = providers[keyResult.provider];
    if (!providerImpl) return failure('NO_PROVIDER_SELECTED');

    const prompt = buildPrompt({ authorName, context });
    const result = await providerImpl.translate({
        text: textBundle.combined,
        apiKey: keyResult.apiKey,
        prompt
    });

    if (!result.success) return result;

    return {
        success: true,
        provider: keyResult.provider,
        model: result.model,
        translated: splitTranslatedBundle(result.text),
        error: null,
        errorType: null
    };
}

module.exports = { translateTweet };
```

- [ ] **Step 2: Extend smoke script with mock seam**

Do not call real APIs in the smoke script. Verify only exports and empty-text behavior:

```js
const { translateTweet } = require('../utils/translation/translation-service');

translateTweet({
    textBundle: { combined: '' },
    userId: 'smoke-user',
    provider: 'gemini'
}).then(result => {
    assert.strictEqual(result.success, true);
});
```

- [ ] **Step 3: Verify**

Run:

```bash
node --check utils/translation/translation-service.js
node scripts/translation-smoke.js
```

Expected: `translation smoke ok`.

- [ ] **Step 4: Commit**

Run:

```bash
git add utils/translation/translation-service.js scripts/translation-smoke.js
git commit -m "feat: add unified translation service"
```

## Task 9: Convert `utils/ai-translator.js` to Compatibility Adapter

**Files:**
- Modify: `utils/ai-translator.js`

- [ ] **Step 1: Replace direct provider orchestration**

Keep exported names stable:

```js
const { EmbedBuilder } = require('discord.js');
const { PROVIDERS } = require('./user-api-key-storage');
const { buildTextBundle } = require('./translation/text-bundle');
const { translateTweet } = require('./translation/translation-service');

async function translate(text, userId, options = {}) {
    const textBundle = buildTextBundle({ main: text });
    const result = await translateTweet({
        textBundle,
        userId,
        provider: options.provider || null,
        authorName: options.authorName || null,
        context: options.context || '',
        allowEnvFallback: false
    });

    if (!result.success) {
        return { success: false, error: result.error, errorType: result.errorType };
    }

    return {
        success: true,
        text: result.translated.main,
        model: result.provider
    };
}

function getAvailableProviders(userId) {
    const { getAllKeys } = require('./user-api-key-storage');
    const keys = getAllKeys(userId);
    return Object.keys(keys);
}

function buildApiKeyTutorialEmbed() {
    return new EmbedBuilder()
        .setTitle('🔑 設定 AI 翻譯 API Key')
        .setDescription('請使用 `/pe api add` 設定 Gemini 或 OpenRouter API Key，再使用 `/pe api model` 選擇預設翻譯引擎。')
        .setColor(0x5865F2);
}

module.exports = { translate, buildApiKeyTutorialEmbed, getAvailableProviders, PROVIDERS };
```

- [ ] **Step 2: Verify classic Twitter translation handler still loads**

Run:

```bash
node --check utils/ai-translator.js
node --check handlers/twitter-translate-interactions.js
node -e "require('./handlers/twitter-translate-interactions'); console.log('classic translation handler ok'); process.exit(0)"
```

Expected: `classic translation handler ok`.

- [ ] **Step 3: Commit**

Run:

```bash
git add utils/ai-translator.js
git commit -m "refactor: route ai translator through translation service"
```

## Task 10: Migrate Classic Twitter Handler to Text Bundle Utility

**Files:**
- Modify: `handlers/twitter-translate-interactions.js`

- [ ] **Step 1: Import text bundle helpers**

Add near the top:

```js
const { buildTextBundle } = require('../utils/translation/text-bundle');
```

- [ ] **Step 2: Replace separator assembly**

Replace manual `QUOTE_SEPARATOR` and `REPLY_SEPARATOR` assembly with:

```js
const textBundle = buildTextBundle({
    main: fullOriginalText,
    quote: quoteOriginalText,
    reply: replyOriginalText
});

const translateResult = await aiTranslate(textBundle.combined, userId, translateOptions);
```

- [ ] **Step 3: Keep current state and cache behavior**

Do not change embed editing logic in this task. The only behavior change is that separator construction comes from a shared utility.

- [ ] **Step 4: Verify**

Run:

```bash
node --check handlers/twitter-translate-interactions.js
node -e "require('./handlers/twitter-translate-interactions'); console.log('classic translation handler ok'); process.exit(0)"
```

Expected: `classic translation handler ok`.

- [ ] **Step 5: Commit**

Run:

```bash
git add handlers/twitter-translate-interactions.js
git commit -m "refactor: use shared text bundle in classic twitter translation"
```

## Task 11: Migrate Twitter V2 Translation to Unified Service

**Files:**
- Modify: `handlers/twitter-v2-interactions.js`

- [ ] **Step 1: Replace Gemini-only imports**

Remove these imports from inside `handleV2Translate`:

```js
const { getInstance: getApiKeyService } = require('../utils/user-api-key-service.js');
const { getInstance: getGeminiTranslator } = require('../utils/gemini-translator.js');
```

Add:

```js
const { getPreferredProvider, PROVIDERS } = require('../utils/user-api-key-storage');
const { buildTextBundle } = require('../utils/translation/text-bundle');
const { translateTweet } = require('../utils/translation/translation-service');
```

- [ ] **Step 2: Use selected provider**

Inside `handleV2Translate`, before cache lookup:

```js
const preferredProvider = getPreferredProvider(userId);
if (!preferredProvider) {
    await interaction.followUp({
        content: '❌ 請先使用 `/pe api model` 選擇翻譯引擎，再使用翻譯功能。',
        flags: MessageFlags.Ephemeral
    });
    return;
}
const providerName = PROVIDERS[preferredProvider]?.name || preferredProvider;
```

- [ ] **Step 3: Replace translation execution**

Replace the Gemini-only call with:

```js
const textBundle = buildTextBundle({
    main: tweet.text || '',
    quote: quoteData?.tweet?.text || '',
    reply: replyData?.tweet?.text || ''
});

const result = await translateTweet({
    textBundle,
    userId,
    provider: preferredProvider,
    authorName: tweet.author?.name || null,
    context: '',
    allowEnvFallback: false
});
```

- [ ] **Step 4: Map result back to V2 state**

Replace split logic with:

```js
if (!result.success) {
    await interaction.followUp({
        content: result.error || '❌ 翻譯失敗，請稍後再試。',
        flags: MessageFlags.Ephemeral
    });
    return;
}

const translationData = {
    translatedText: result.translated.main,
    translatedQuoteText: result.translated.quote,
    translatedReplyText: result.translated.reply
};
```

- [ ] **Step 5: Use provider-specific cache key**

Change V2 cache from `Map<tweetId, ...>` to `Map<tweetId_provider, ...>`:

```js
function getV2TranslationCacheKey(tweetId, provider) {
    return `${tweetId}_${provider}`;
}
```

Use that key for `get`, `set`, and timeout cleanup.

- [ ] **Step 6: Verify**

Run:

```bash
node --check handlers/twitter-v2-interactions.js
node -e "require('./handlers/twitter-v2-interactions'); console.log('v2 translation handler ok'); process.exit(0)"
```

Expected: `v2 translation handler ok`.

- [ ] **Step 7: Commit**

Run:

```bash
git add handlers/twitter-v2-interactions.js
git commit -m "refactor: route v2 translation through unified service"
```

## Task 12: Keep `user-api-key-service.js` as Compatibility Adapter

**Files:**
- Modify: `utils/user-api-key-service.js`

- [ ] **Step 1: Keep class API but delegate env fallback**

Change internals so `getApiKey(userId, service)` uses `getKey(userId, service)` first and `getEnvFallbackKey(service)` second.

Use:

```js
const { getKey } = require('./user-api-key-storage');
const { getEnvFallbackKey } = require('./translation/key-resolver');

class UserApiKeyService {
    static getInstance() {
        if (!instance) instance = new UserApiKeyService();
        return instance;
    }

    async getApiKey(userId, service = 'gemini') {
        if (userId) {
            const userKey = getKey(userId, service);
            if (userKey) return userKey;
        }
        return getEnvFallbackKey(service);
    }

    async getUserApiKey(userId, service) {
        return this.getApiKey(userId, service);
    }
}
```

- [ ] **Step 2: Verify**

Run:

```bash
node --check utils/user-api-key-service.js
node -e "require('./utils/user-api-key-service'); console.log('api key service ok'); process.exit(0)"
```

Expected: `api key service ok`.

- [ ] **Step 3: Commit**

Run:

```bash
git add utils/user-api-key-service.js
git commit -m "refactor: delegate api key fallback to translation resolver"
```

## Task 13: Consolidate Translation Cache Policy

**Files:**
- Modify: `utils/shared-translation-cache.js`
- Modify: `handlers/twitter-translate-interactions.js`
- Modify: `handlers/twitter-v2-interactions.js`

- [ ] **Step 1: Extend shared cache key**

Store cache entries by `sourceId_provider` rather than only tweet ID:

```js
function makeKey(sourceId, provider = 'unknown') {
    return `${sourceId}_${provider}`;
}
```

- [ ] **Step 2: Add bundle-aware cache data**

Store:

```js
{
    sourceId,
    provider,
    original: { main, quote, reply },
    translated: { main, quote, reply },
    model,
    timestamp
}
```

- [ ] **Step 3: Use shared cache in classic handler**

Before calling translation service, call:

```js
const sharedCache = require('../utils/shared-translation-cache');
const cached = sharedCache.get(tweetId, preferredProvider);
```

If present, use `cached.translated`.

- [ ] **Step 4: Use shared cache in V2 handler**

Replace V2-only `v2TranslationCache` storage with `sharedCache.set(tweetId, preferredProvider, data)` while keeping a small in-memory compatibility read for messages translated before deployment.

- [ ] **Step 5: Verify**

Run:

```bash
node --check utils/shared-translation-cache.js
node --check handlers/twitter-translate-interactions.js
node --check handlers/twitter-v2-interactions.js
node scripts/translation-smoke.js
```

Expected: `translation smoke ok`.

- [ ] **Step 6: Commit**

Run:

```bash
git add utils/shared-translation-cache.js handlers/twitter-translate-interactions.js handlers/twitter-v2-interactions.js
git commit -m "refactor: consolidate translation cache policy"
```

## Task 14: Documentation Update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `doc/system/FILE_INDEX.md`

- [ ] **Step 1: Update development guide**

In `CLAUDE.md`, replace translation guidance with:

```md
| 改翻譯功能 | `utils/translation/translation-service.js` | 統一翻譯入口；classic Twitter 與 V2 都應走這裡 |
```

- [ ] **Step 2: Update file index**

In `doc/system/FILE_INDEX.md`, mark legacy adapters:

```md
| `utils/translation/translation-service.js` | 翻譯子系統統一入口 |
| `utils/ai-translator.js` | 舊版相容 adapter，轉呼叫 translation-service |
| `utils/gemini-translator.js` | Gemini 舊版 helper，相容期保留 |
```

- [ ] **Step 3: Verify docs do not reference wrong entry point**

Run:

```bash
rg -n "ai-translator.js \\+ gemini-translator|V2.*gemini-translator|Gemini 專線" CLAUDE.md doc/system/FILE_INDEX.md
```

Expected: no output.

- [ ] **Step 4: Commit**

Run:

```bash
git add CLAUDE.md doc/system/FILE_INDEX.md
git commit -m "docs: document unified translation subsystem"
```

## Task 15: Final Local Verification

**Files:**
- No code changes unless verification finds an issue.

- [ ] **Step 1: Syntax-check touched runtime files**

Run:

```bash
node --check utils/translation/text-bundle.js
node --check utils/translation/errors.js
node --check utils/translation/prompt-builder.js
node --check utils/translation/key-resolver.js
node --check utils/translation/providers/index.js
node --check utils/translation/providers/gemini.js
node --check utils/translation/providers/openrouter.js
node --check utils/translation/translation-service.js
node --check utils/ai-translator.js
node --check utils/user-api-key-service.js
node --check handlers/twitter-translate-interactions.js
node --check handlers/twitter-v2-interactions.js
```

Expected: all commands exit 0.

- [ ] **Step 2: Run smoke script**

Run: `node scripts/translation-smoke.js`

Expected: `translation smoke ok`.

- [ ] **Step 3: Require handlers**

Run:

```bash
node -e "require('./handlers/twitter-translate-interactions'); require('./handlers/twitter-v2-interactions'); console.log('translation handlers ok'); process.exit(0)"
```

Expected: `translation handlers ok`.

- [ ] **Step 4: Search for direct provider usage in handlers**

Run:

```bash
rg -n "gemini-translator|openrouter-translator|user-api-key-service" handlers utils/translation
```

Expected: direct handler references only remain where explicitly kept as compatibility paths.

- [ ] **Step 5: Commit**

Run:

```bash
git add .
git commit -m "refactor: unify translation subsystem"
```

## Task 16: Deploy and Production Verification

**Files:**
- Deploy changed runtime files only.

- [ ] **Step 1: Copy runtime files to VPS**

Run:

```bash
scp -r utils/translation root@64.118.148.130:/root/TransForDiscord/utils/
scp utils/ai-translator.js root@64.118.148.130:/root/TransForDiscord/utils/ai-translator.js
scp utils/user-api-key-service.js root@64.118.148.130:/root/TransForDiscord/utils/user-api-key-service.js
scp utils/shared-translation-cache.js root@64.118.148.130:/root/TransForDiscord/utils/shared-translation-cache.js
scp handlers/twitter-translate-interactions.js root@64.118.148.130:/root/TransForDiscord/handlers/twitter-translate-interactions.js
scp handlers/twitter-v2-interactions.js root@64.118.148.130:/root/TransForDiscord/handlers/twitter-v2-interactions.js
```

- [ ] **Step 2: Remote syntax check**

Run:

```bash
ssh root@64.118.148.130 "cd /root/TransForDiscord && node --check utils/translation/translation-service.js && node --check handlers/twitter-translate-interactions.js && node --check handlers/twitter-v2-interactions.js"
```

Expected: exit code 0.

- [ ] **Step 3: Restart PM2**

Run:

```bash
ssh root@64.118.148.130 "pm2 restart transfordiscord && pm2 logs transfordiscord --lines 30 --nostream"
```

Expected: PM2 status is `online`; latest logs show bot startup without translation module errors.

- [ ] **Step 4: Manual Discord verification**

Use a test Discord channel:

1. Post a normal Twitter/X URL that produces classic embed buttons.
2. Click `翻譯`.
3. Confirm preferred provider is honored.
4. Click `原文`.
5. Post a V2 video tweet.
6. Click `翻譯`.
7. Confirm V2 uses the same provider selection as classic Twitter.
8. Click `展開` and `重整`.
9. Confirm translated state is preserved.

- [ ] **Step 5: Watch logs**

Run:

```bash
ssh root@64.118.148.130 "pm2 logs transfordiscord --lines 80 --nostream"
```

Expected: no `is not defined`, no provider module load errors, no translation handler crashes.

## Rollback Plan

- Revert handler migrations first:
  - `handlers/twitter-translate-interactions.js`
  - `handlers/twitter-v2-interactions.js`
- Keep new `utils/translation/*` files if they are unused; they do not affect runtime unless required.
- Restart PM2 after rollback.
- Use `git restore` for local rollback only if changes are not committed. Use `git revert <commit>` for committed changes.

## Self-Review

- Spec coverage: The plan covers provider selection, API key resolution, prompt extraction, text bundle splitting, classic Twitter migration, V2 migration, shared cache, docs, local verification, and deploy verification.
- Placeholder scan: The plan intentionally avoids unspecified placeholders. Each code-producing task names exact files and code blocks.
- Type consistency: `translateTweet()` returns `translated.main`, `translated.quote`, and `translated.reply`; handler migration tasks use those exact names.
- Scope check: This plan does not redesign `/pe api` commands, billing, NotebookLM, or translation monetization. Those remain separate projects.
