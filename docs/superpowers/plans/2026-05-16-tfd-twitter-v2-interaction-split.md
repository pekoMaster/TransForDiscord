# TFD Twitter V2 Interaction Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/features/twitter/interactions/v2-router.js` into focused V2 interaction modules without changing Discord behavior.

**Architecture:** Keep `handlers/twitter-v2-interactions.js` and `src/features/twitter/interactions/v2-router.js` as stable public entrypoints. Move internal helper/cache/data/render/action responsibilities into `src/features/twitter/interactions/v2/`. Each task extracts one responsibility and immediately verifies syntax, old adapter loading, dependency drift, and behavior-preserving require checks.

**Tech Stack:** Node.js CommonJS, Discord.js v14, current PowerShell workflow, `node --check`, require-load smoke checks, existing `scripts/translation-smoke.js`.

---

## Non-Negotiable Safety Rules

- Do not push.
- Do not deploy.
- Do not intentionally change runtime behavior.
- Keep `handlers/twitter-v2-interactions.js` exporting `handleV2Interaction` and `handleV2SpoilerModalSubmit`.
- After every task, review new files plus old dependencies, names, folder locations, adapters, indexes, and docs.
- Do not reintroduce Twitter posting or legacy `gemini-translator`.

## Target Structure

```txt
src/features/twitter/interactions/
  v2-router.js
  v2/
    shared.js
    translation-cache.js
    tweet-data.js
    view-updater.js
    translate-handler.js
    toggle-handler.js
    reload-handler.js
    spoiler-handler.js
```

## Task 1: Add V2 Interaction Subfolder and Extract Shared Helpers

**Files:**
- Create: `src/features/twitter/interactions/v2/shared.js`
- Modify: `src/features/twitter/interactions/v2-router.js`

- [ ] **Step 1: Create destination folder**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\twitter\interactions\v2 | Out-Null
```

Expected: command exits 0.

- [ ] **Step 2: Create `shared.js`**

Create this file:

```js
const { MessageFlags } = require('discord.js');

async function safeInteractionNotice(interaction, content) {
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        }
    } catch (_) {}
}

function extractTweetId(customId) {
    const parts = customId.split('_');
    return parts[parts.length - 1];
}

function extractMarkerTextFromMessage(message) {
    const origComponents = message?.components;
    if (!origComponents?.[0]?.components?.[0]) return null;

    const first = origComponents[0].components[0];
    if (first.data?.type === 10 || first.type === 10) {
        return first.data?.content || first.content || null;
    }

    return null;
}

module.exports = {
    safeInteractionNotice,
    extractTweetId,
    extractMarkerTextFromMessage
};
```

- [ ] **Step 3: Use shared helpers from router**

In `src/features/twitter/interactions/v2-router.js`, remove the local `safeInteractionNotice`, `extractTweetId`, and `extractMarkerTextFromMessage` functions and add:

```js
const {
    safeInteractionNotice,
    extractTweetId,
    extractMarkerTextFromMessage
} = require('./v2/shared');
```

- [ ] **Step 4: Verify and review**

Run:

```powershell
node --check src\features\twitter\interactions\v2\shared.js
node --check src\features\twitter\interactions\v2-router.js
node --check handlers\twitter-v2-interactions.js
node -e "require('./handlers/twitter-v2-interactions'); console.log('v2 shared extraction ok'); process.exit(0)"
rg -n "function safeInteractionNotice|function extractTweetId|function extractMarkerTextFromMessage|require\('./v2/shared'\)" src\features\twitter\interactions\v2-router.js src\features\twitter\interactions\v2\shared.js
```

Expected:

```txt
v2 shared extraction ok
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add src\features\twitter\interactions\v2 src\features\twitter\interactions\v2-router.js
git commit -m "refactor: extract twitter v2 shared interaction helpers"
```

## Task 2: Extract V2 Translation Cache

**Files:**
- Create: `src/features/twitter/interactions/v2/translation-cache.js`
- Modify: `src/features/twitter/interactions/v2-router.js`

- [ ] **Step 1: Create `translation-cache.js`**

Create this file:

```js
const sharedTranslationCache = require('../../../translation/cache/shared-translation-cache');

const V2_TRANSLATION_TTL_MS = 30 * 60 * 1000;
const v2TranslationCache = new Map();

function getV2TranslationCacheKey(tweetId, provider = 'unknown') {
    return `${tweetId}_${provider || 'unknown'}`;
}

function getCachedV2Translation(tweetId, provider = null) {
    if (provider) {
        const providerCached = v2TranslationCache.get(getV2TranslationCacheKey(tweetId, provider));
        if (providerCached) return providerCached;

        const sharedCached = sharedTranslationCache.get(tweetId, provider);
        if (sharedCached?.translated) {
            return {
                translatedText: sharedCached.translated.main || '',
                translatedQuoteText: sharedCached.translated.quote || '',
                translatedReplyText: sharedCached.translated.reply || ''
            };
        }
    }
    return v2TranslationCache.get(tweetId);
}

function setCachedV2Translation(tweetId, provider, translationData) {
    const providerKey = getV2TranslationCacheKey(tweetId, provider);
    v2TranslationCache.set(providerKey, translationData);
    v2TranslationCache.set(tweetId, translationData);

    setTimeout(() => {
        v2TranslationCache.delete(providerKey);
        v2TranslationCache.delete(tweetId);
    }, V2_TRANSLATION_TTL_MS);
}

module.exports = {
    getCachedV2Translation,
    setCachedV2Translation
};
```

- [ ] **Step 2: Use translation cache from router**

In `src/features/twitter/interactions/v2-router.js`, remove `sharedTranslationCache`, `V2_TRANSLATION_TTL_MS`, `v2TranslationCache`, `getV2TranslationCacheKey`, `getCachedV2Translation`, and `setCachedV2Translation` from the router. Add:

```js
const {
    getCachedV2Translation,
    setCachedV2Translation
} = require('./v2/translation-cache');
const sharedTranslationCache = require('../../translation/cache/shared-translation-cache');
```

The router still imports `sharedTranslationCache` for persistence inside `handleV2Translate`; only the short-lived in-memory V2 cache moves.

- [ ] **Step 3: Verify and review**

Run:

```powershell
node --check src\features\twitter\interactions\v2\translation-cache.js
node --check src\features\twitter\interactions\v2-router.js
node -e "require('./handlers/twitter-v2-interactions'); console.log('v2 translation cache extraction ok'); process.exit(0)"
rg -n "V2_TRANSLATION_TTL_MS|v2TranslationCache|getV2TranslationCacheKey|getCachedV2Translation|setCachedV2Translation|require\('./v2/translation-cache'\)" src\features\twitter\interactions\v2-router.js src\features\twitter\interactions\v2\translation-cache.js
```

Expected:

```txt
v2 translation cache extraction ok
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src\features\twitter\interactions\v2 src\features\twitter\interactions\v2-router.js
git commit -m "refactor: extract twitter v2 translation cache"
```

## Task 3: Extract Tweet Hydration

**Files:**
- Create: `src/features/twitter/interactions/v2/tweet-data.js`
- Modify: `src/features/twitter/interactions/v2-router.js`

- [ ] **Step 1: Create `tweet-data.js`**

Create this file:

```js
const HTTPClient = require('../../../../../tfd-system/utils/http-client');
const TFDTwitterExtractor = require('../../extractors/twitter-v2-extractor');
const { cacheTweetData } = require('../../containers/v2-container-builder');

async function hydrateTweetBundle(tweetId, originalURL = null) {
    const httpClient = new HTTPClient();
    const resp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, { timeout: 5000 });
    if (!resp?.tweet) return null;

    const tweet = resp.tweet;
    const fallbackOriginalURL = originalURL || `https://twitter.com/i/status/${tweetId}`;
    const extractor = new TFDTwitterExtractor();

    let quoteData = null;
    let replyData = null;

    if (extractor.isReplyTweet(tweet)) {
        const replyInfo = await extractor.getReplyTweetInfo(tweet);
        if (replyInfo) {
            replyData = {
                tweet: replyInfo.tweet || null,
                tweetId: replyInfo.tweetId || null
            };
        }
    }

    if (extractor.isQuoteTweet(tweet)) {
        const quoteInfo = extractor.getQuoteTweetInfo(tweet);
        if (quoteInfo) {
            quoteData = {
                tweet: quoteInfo.tweet || null,
                tweetId: quoteInfo.tweetId || null
            };
        }
    }

    const hydrated = { tweet, originalURL: fallbackOriginalURL, quoteData, replyData };
    cacheTweetData(tweetId, hydrated);
    return hydrated;
}

module.exports = {
    hydrateTweetBundle
};
```

- [ ] **Step 2: Use hydration from router**

In `src/features/twitter/interactions/v2-router.js`, remove the local `hydrateTweetBundle` function and add:

```js
const { hydrateTweetBundle } = require('./v2/tweet-data');
```

Remove the now-unused `TFDTwitterExtractor` import from `v2-router.js`.

- [ ] **Step 3: Verify and review**

Run:

```powershell
node --check src\features\twitter\interactions\v2\tweet-data.js
node --check src\features\twitter\interactions\v2-router.js
node -e "require('./handlers/twitter-v2-interactions'); console.log('v2 tweet hydration extraction ok'); process.exit(0)"
rg -n "TFDTwitterExtractor|function hydrateTweetBundle|require\('./v2/tweet-data'\)" src\features\twitter\interactions\v2-router.js src\features\twitter\interactions\v2\tweet-data.js
```

Expected:

```txt
v2 tweet hydration extraction ok
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src\features\twitter\interactions\v2 src\features\twitter\interactions\v2-router.js
git commit -m "refactor: extract twitter v2 tweet hydration"
```

## Task 4: Extract View Rebuild Service

**Files:**
- Create: `src/features/twitter/interactions/v2/view-updater.js`
- Modify: `src/features/twitter/interactions/v2-router.js`

- [ ] **Step 1: Create `view-updater.js`**

Move `buildFallbackState` and `rebuildAndUpdate` into `view-updater.js`, preserving their bodies and imports. The new file must import:

```js
const { MessageFlags, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const {
    buildV2Container,
    getCachedTweetData,
    deriveStateFromComponents
} = require('../../containers/v2-container-builder');
const { lookupUrl } = require('../../../../../tfd-system/utils/url-stats');
const { getMessageState, setMessageState } = require('../../state/v2-state-store');
const { extractMarkerTextFromMessage } = require('./shared');
const { getCachedV2Translation } = require('./translation-cache');
const { hydrateTweetBundle } = require('./tweet-data');
```

Export:

```js
module.exports = {
    buildFallbackState,
    rebuildAndUpdate
};
```

- [ ] **Step 2: Use view updater from router**

In `src/features/twitter/interactions/v2-router.js`, remove local `buildFallbackState` and `rebuildAndUpdate`, then add:

```js
const { buildFallbackState, rebuildAndUpdate } = require('./v2/view-updater');
```

Remove any imports that became unused only because of the moved functions: `buildV2Container`, `lookupUrl`, `setMessageState`, and `deriveStateFromComponents`.

- [ ] **Step 3: Verify and review**

Run:

```powershell
node --check src\features\twitter\interactions\v2\view-updater.js
node --check src\features\twitter\interactions\v2-router.js
node -e "require('./handlers/twitter-v2-interactions'); console.log('v2 view updater extraction ok'); process.exit(0)"
rg -n "function buildFallbackState|function rebuildAndUpdate|require\('./v2/view-updater'\)|buildV2Container|deriveStateFromComponents|setMessageState" src\features\twitter\interactions\v2-router.js src\features\twitter\interactions\v2\view-updater.js
```

Expected:

```txt
v2 view updater extraction ok
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src\features\twitter\interactions\v2 src\features\twitter\interactions\v2-router.js
git commit -m "refactor: extract twitter v2 view updater"
```

## Task 5: Extract Action Handlers

**Files:**
- Create: `src/features/twitter/interactions/v2/translate-handler.js`
- Create: `src/features/twitter/interactions/v2/toggle-handler.js`
- Create: `src/features/twitter/interactions/v2/reload-handler.js`
- Create: `src/features/twitter/interactions/v2/spoiler-handler.js`
- Modify: `src/features/twitter/interactions/v2-router.js`

- [ ] **Step 1: Move each action handler**

Move these functions into focused files:

```txt
handleV2Translate -> translate-handler.js
handleV2Toggle -> toggle-handler.js
handleV2Reload -> reload-handler.js
handleV2Spoiler, handleV2SpoilerModalSubmit, sendSpoilerLog, buildSpoilerContainer -> spoiler-handler.js
```

Each new file must import only the dependencies it uses.

- [ ] **Step 2: Keep router as dispatcher only**

After extraction, `v2-router.js` should contain the imports for:

```js
const { handleV2Translate } = require('./v2/translate-handler');
const { handleV2Toggle } = require('./v2/toggle-handler');
const { handleV2Reload } = require('./v2/reload-handler');
const { handleV2Spoiler, handleV2SpoilerModalSubmit } = require('./v2/spoiler-handler');
const { safeInteractionNotice } = require('./v2/shared');
const tlog = require('../../../../utils/tfd-logger');
```

The router should export the same public API:

```js
module.exports = { handleV2Interaction, handleV2SpoilerModalSubmit };
```

- [ ] **Step 3: Verify and review**

Run:

```powershell
node --check src\features\twitter\interactions\v2\translate-handler.js
node --check src\features\twitter\interactions\v2\toggle-handler.js
node --check src\features\twitter\interactions\v2\reload-handler.js
node --check src\features\twitter\interactions\v2\spoiler-handler.js
node --check src\features\twitter\interactions\v2-router.js
node --check handlers\twitter-v2-interactions.js
node -e "require('./handlers/twitter-v2-interactions'); console.log('v2 action handler extraction ok'); process.exit(0)"
rg -n "async function handleV2Translate|async function handleV2Toggle|async function handleV2Reload|async function handleV2Spoiler|async function handleV2SpoilerModalSubmit|function buildSpoilerContainer" src\features\twitter\interactions\v2-router.js src\features\twitter\interactions\v2
```

Expected:

```txt
v2 action handler extraction ok
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src\features\twitter\interactions\v2 src\features\twitter\interactions\v2-router.js
git commit -m "refactor: split twitter v2 action handlers"
```

## Task 6: Documentation and Final Verification

**Files:**
- Modify: `src/features/twitter/README.md`
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update docs**

Document that V2 interaction internals live under:

```txt
src/features/twitter/interactions/v2/
```

and that `v2-router.js` is now a stable dispatcher.

- [ ] **Step 2: Final syntax and load checks**

Run:

```powershell
node --check src\features\twitter\interactions\v2-router.js
node --check src\features\twitter\interactions\v2\shared.js
node --check src\features\twitter\interactions\v2\translation-cache.js
node --check src\features\twitter\interactions\v2\tweet-data.js
node --check src\features\twitter\interactions\v2\view-updater.js
node --check src\features\twitter\interactions\v2\translate-handler.js
node --check src\features\twitter\interactions\v2\toggle-handler.js
node --check src\features\twitter\interactions\v2\reload-handler.js
node --check src\features\twitter\interactions\v2\spoiler-handler.js
node --check handlers\twitter-v2-interactions.js
node --check events\interactionCreate.js
node --check tfd-system\core\message-handler-v2.js
node -e "require('./src/features/twitter'); require('./handlers/twitter-v2-interactions'); require('./events/interactionCreate'); console.log('twitter v2 split load ok'); process.exit(0)"
node scripts\translation-smoke.js
```

Expected:

```txt
twitter v2 split load ok
translation smoke ok
```

- [ ] **Step 3: Review dependency drift**

Run:

```powershell
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
rg -n "src/features/twitter/interactions/v2|v2-router" CLAUDE.md doc\system\FILE_INDEX.md src\features\twitter\README.md
git diff --check
git status --short
```

Expected:
- No runtime references to deleted Twitter posting or legacy Gemini helper.
- Docs mention V2 subfolder and stable router.
- `git diff --check` exits 0.
- `git status --short` is empty after final commit.

- [ ] **Step 4: Commit docs if needed**

Run:

```powershell
git add src\features\twitter\README.md doc\system\FILE_INDEX.md CLAUDE.md
git commit -m "docs: document twitter v2 interaction split"
```

If no docs changed, do not create an empty commit.

## Self-Review

- Spec coverage: This plan implements the inventory request to split `twitter-v2-interactions.js` into translation/toggle/reload/spoiler modules.
- Scope control: It does not split `twitter-v2-extractor.js`; extractor decomposition should be its own plan after V2 interactions are stable.
- Adapter policy: The old public adapter `handlers/twitter-v2-interactions.js` remains unchanged.
- Dependency review: Each task includes `rg` checks for moved functions and old dependency drift.
- Verification: Every step has syntax and require-load checks, plus final translation smoke and core load checks.
- Deployment: No push or deployment is included.
