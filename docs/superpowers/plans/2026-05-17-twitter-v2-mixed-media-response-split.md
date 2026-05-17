# Twitter V2 Mixed Media Response Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 mixed-media response construction out of `twitter-v2-extractor.js`.

**Architecture:** Add `src/features/twitter/extractors/v2/mixed-media-response.js` to own mixed-media classic response assembly and fallback response assembly. Keep `TFDTwitterExtractor.handleMixedMediaTweet()` and `handleMixedMediaTweetFallback()` as compatibility wrappers that inject existing extractor dependencies.

**Tech Stack:** Node.js CommonJS, Discord.js builders, pure smoke tests with injected dependencies.

---

### Task 1: Add Mixed Media Response Helper

**Files:**
- Create: `src/features/twitter/extractors/v2/mixed-media-response.js`
- Create: `scripts/twitter-v2-mixed-media-response-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert:
- `buildMixedMediaTweetResponse` fetches reply and quote data through injected dependencies.
- video attachment optimization removes the first formatted video URL when the first video is attached.
- pagination components are preserved and mixed-media toggle buttons are appended.
- result includes `multipleImages`, `mixedMedia`, `originalText`, `originalURL`, `tweetId`, and video attachment metadata.
- `buildMixedMediaTweetFallbackResponse` builds a fallback response with formatted video links and translated components.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-mixed-media-response-smoke.js`
Expected: fails because `mixed-media-response.js` does not exist.

- [x] **Step 3: Implement helper**

Create:
- `buildMixedMediaTweetResponse(tweet, originalURL, tweetType, dependencies)`
- `buildMixedMediaTweetFallbackResponse(tweet, originalURL, tweetType, dependencies)`

Required dependency keys:
- `isReplyTweet`
- `getReplyTweetInfo`
- `isQuoteTweet`
- `getQuoteTweetInfo`
- `processVideoOptimization`
- `buildEnhancedEmbed`
- `extractVideoUrls`
- `formatVideoUrls`
- `buildPaginationButtons`
- `buildTranslateButtonComponent`
- `buildAllToggleButtonComponent`
- `buildReloadButtonComponent`
- `extractMultipleImages`
- `addTranslateButtonToComponents`
- `createErrorResponse`
- `logger`

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-mixed-media-response-smoke.js`
Expected: `twitter v2 mixed media response smoke ok`.

### Task 2: Delegate Extractor Wrappers

**Files:**
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [x] **Step 1: Import helper**

Add:

```js
const mixedMediaResponse = require('./v2/mixed-media-response');
```

- [x] **Step 2: Replace method bodies**

Replace `handleMixedMediaTweet(tweet, originalURL, tweetType)` and `handleMixedMediaTweetFallback(tweet, originalURL, tweetType)` with wrappers that call the helper and pass existing extractor dependencies.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `extractors/v2/mixed-media-response.js` and `scripts/twitter-v2-mixed-media-response-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-mixed-media-response-smoke.js`
- `node scripts\twitter-v2-article-response-smoke.js`
- `node --check src\features\twitter\extractors\v2\mixed-media-response.js`
- `node --check src\features\twitter\extractors\twitter-v2-extractor.js`
- require-load `./src/features/twitter/extractors/twitter-v2-extractor`, `./tfd-system/extractors/twitter-v2`, and `./handlers/twitter-v2-interactions`
- `rg` for `mixed-media-response|buildMixedMediaTweetResponse|buildMixedMediaTweetFallbackResponse|handleMixedMediaTweet|handleMixedMediaTweetFallback|new ActionRowBuilder`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan only moves mixed-media response assembly; it does not change tweet fetch, media type policy, GAS mode, HTML mode, or V2 container rendering.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Compatibility: `handleMixedMediaTweet()` and `handleMixedMediaTweetFallback()` remain available on `TFDTwitterExtractor`.
