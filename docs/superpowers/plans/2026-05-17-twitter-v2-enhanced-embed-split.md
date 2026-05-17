# Twitter V2 Enhanced Embed Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 classic enhanced embed construction out of `twitter-v2-extractor.js`.

**Architecture:** Add `src/features/twitter/extractors/v2/enhanced-embed.js` to own classic embed author/title/body/quote/footer/image construction. Keep `TFDTwitterExtractor.buildEnhancedEmbed()` and `setEmbedImages()` as compatibility wrappers that inject the existing text truncator and image extractor.

**Tech Stack:** Node.js CommonJS, Discord.js `EmbedBuilder`, pure smoke tests with injected dependencies.

---

### Task 1: Add Enhanced Embed Helper

**Files:**
- Create: `src/features/twitter/extractors/v2/enhanced-embed.js`
- Create: `scripts/twitter-v2-enhanced-embed-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert:
- `buildEnhancedEmbed` sets author, title, URL, timestamp, footer, and truncation result.
- level 2 blacklist wraps description in spoiler markers and preserves the existing invalid `SPOILER_` embed image behavior under the caller's try/catch.
- quote fields are included only when `showQuote` is true.
- quote content keeps blockquote formatting and full-width blank lines.
- `setEnhancedEmbedImages` uses reply tweet image priority, quote fallback, and regular tweet image behavior.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-enhanced-embed-smoke.js`
Expected: fails because `enhanced-embed.js` does not exist.

- [x] **Step 3: Implement helper**

Create:
- `buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, showQuote, dependencies)`
- `setEnhancedEmbedImages(embed, tweet, replyInfo, tweetType, quoteInfo, dependencies)`

Required dependency keys:
- `textTruncator`
- `extractImagesFromTweet`

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-enhanced-embed-smoke.js`
Expected: `twitter v2 enhanced embed smoke ok`.

### Task 2: Delegate Extractor Wrappers

**Files:**
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [x] **Step 1: Import helper**

Add:

```js
const enhancedEmbed = require('./v2/enhanced-embed');
```

- [x] **Step 2: Replace method bodies**

Replace `buildEnhancedEmbed(...)` and `setEmbedImages(...)` with wrappers that call the helper and pass existing dependencies.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `extractors/v2/enhanced-embed.js` and `scripts/twitter-v2-enhanced-embed-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-enhanced-embed-smoke.js`
- `node scripts\twitter-v2-video-mode-response-smoke.js`
- `node scripts\twitter-v2-mixed-media-response-smoke.js`
- `node --check src\features\twitter\extractors\v2\enhanced-embed.js`
- `node --check src\features\twitter\extractors\twitter-v2-extractor.js`
- require-load `./src/features/twitter/extractors/twitter-v2-extractor`, `./tfd-system/extractors/twitter-v2`, and `./handlers/twitter-v2-interactions`
- `rg` for `enhanced-embed|buildEnhancedEmbed|setEmbedImages|setEnhancedEmbedImages|extractImagesFromTweet`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan only moves classic enhanced embed construction and image selection; it does not change extraction orchestration, button logic, or V2 container rendering.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Compatibility: `buildEnhancedEmbed()` and `setEmbedImages()` remain available on `TFDTwitterExtractor`.
