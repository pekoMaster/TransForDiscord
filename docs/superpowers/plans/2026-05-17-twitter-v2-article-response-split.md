# Twitter V2 Article Response Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 article tweet response construction out of `twitter-v2-extractor.js`.

**Architecture:** Add `src/features/twitter/extractors/v2/article-response.js` to own article Embed construction and article action rows. Keep `TFDTwitterExtractor.handleArticleTweet(tweet, originalURL)` as the runtime compatibility wrapper, injecting the extractor's text truncator and existing button builders.

**Tech Stack:** Node.js CommonJS, Discord.js builders, pure smoke tests with injected dependencies.

---

### Task 1: Add Article Response Helper

**Files:**
- Create: `src/features/twitter/extractors/v2/article-response.js`
- Create: `scripts/twitter-v2-article-response-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert:
- `buildArticleTweetResponse` returns a successful Twitter article response.
- content blocks are joined into the original article text.
- the embed keeps title, URL, image, and timestamp.
- long article text adds translate, expand, and reload controls.
- preview text fallback works when content blocks are missing.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-article-response-smoke.js`
Expected: fails because `article-response.js` does not exist.

- [x] **Step 3: Implement helper**

Move the body of `handleArticleTweet(tweet, originalURL)` into `buildArticleTweetResponse(tweet, originalURL, dependencies)`.
Required dependency keys:
- `textTruncator`
- `buildTranslateButtonComponent`
- `buildAllToggleButtonComponent`
- `buildReloadButtonComponent`

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-article-response-smoke.js`
Expected: `twitter v2 article response smoke ok`.

### Task 2: Delegate Extractor Wrapper

**Files:**
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [x] **Step 1: Import helper**

Add:

```js
const articleResponse = require('./v2/article-response');
```

- [x] **Step 2: Replace article method body**

Replace `handleArticleTweet(tweet, originalURL)` with a wrapper that calls `articleResponse.buildArticleTweetResponse(...)` and passes the existing extractor dependencies.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `extractors/v2/article-response.js` and `scripts/twitter-v2-article-response-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-article-response-smoke.js`
- `node scripts\twitter-v2-v1-transition-smoke.js`
- `node --check src\features\twitter\extractors\v2\article-response.js`
- `node --check src\features\twitter\extractors\twitter-v2-extractor.js`
- require-load `./src/features/twitter/extractors/twitter-v2-extractor`, `./tfd-system/extractors/twitter-v2`, and `./handlers/twitter-v2-interactions`
- `rg` for `buildArticleTweetResponse|article-response|handleArticleTweet|new ActionRowBuilder`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan only moves article tweet response construction; it does not change article detection, fetch behavior, or non-article tweet rendering.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Compatibility: `handleArticleTweet(tweet, originalURL)` remains available on `TFDTwitterExtractor`.
