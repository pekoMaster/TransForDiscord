# Twitter V2 Video Mode Response Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 GAS video mode, HTML video mode, and basic HTML response embed construction out of `twitter-v2-extractor.js`.

**Architecture:** Add `src/features/twitter/extractors/v2/video-mode-response.js` to own GAS URL response assembly, HTML mixed-media response assembly, and the basic embed used by HTML responses. Keep `TFDTwitterExtractor.handleGASVideoMode()`, `handleHTMLVideoMode()`, and `buildBasicEmbed()` as compatibility wrappers that inject existing extractor dependencies.

**Tech Stack:** Node.js CommonJS, Discord.js builders, pure smoke tests with injected dependencies.

---

### Task 1: Add Video Mode Response Helper

**Files:**
- Create: `src/features/twitter/extractors/v2/video-mode-response.js`
- Create: `scripts/twitter-v2-video-mode-response-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert:
- `buildGASVideoModeResponse` returns `null` and logs when GAS URL is missing.
- `buildGASVideoModeResponse` returns encoded GAS query payload when configured.
- `buildBasicEmbed` preserves author, title, URL, color, and timestamp.
- `buildHTMLVideoModeResponse` returns HTML response metadata, counts videos/images, and embeds.
- `buildHTMLVideoModeResponse` logs and falls back through injected fallback when HTML build fails.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-video-mode-response-smoke.js`
Expected: fails because `video-mode-response.js` does not exist.

- [x] **Step 3: Implement helper**

Create:
- `buildGASVideoModeResponse(tweet, originalURL, tweetType, dependencies)`
- `buildBasicEmbed(tweet, originalURL)`
- `buildHTMLVideoModeResponse(tweet, originalURL, tweetType, dependencies)`

Required dependency keys:
- `getGasURL`
- `extractTweetId`
- `extractVideos`
- `extractImages`
- `buildHTML`
- `handleMixedMediaTweetFallback`
- `logger`

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-video-mode-response-smoke.js`
Expected: `twitter v2 video mode response smoke ok`.

### Task 2: Delegate Extractor Wrappers

**Files:**
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [x] **Step 1: Import helper**

Add:

```js
const videoModeResponse = require('./v2/video-mode-response');
```

- [x] **Step 2: Replace method bodies**

Replace `handleGASVideoMode(tweet, originalURL, tweetType)`, `handleHTMLVideoMode(tweet, originalURL, tweetType)`, and `buildBasicEmbed(tweet, originalURL, tweetType)` with wrappers that call the helper and pass existing extractor dependencies.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `extractors/v2/video-mode-response.js` and `scripts/twitter-v2-video-mode-response-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-video-mode-response-smoke.js`
- `node scripts\twitter-v2-mixed-media-response-smoke.js`
- `node --check src\features\twitter\extractors\v2\video-mode-response.js`
- `node --check src\features\twitter\extractors\twitter-v2-extractor.js`
- require-load `./src/features/twitter/extractors/twitter-v2-extractor`, `./tfd-system/extractors/twitter-v2`, and `./handlers/twitter-v2-interactions`
- `rg` for `video-mode-response|buildGASVideoModeResponse|buildHTMLVideoModeResponse|buildBasicEmbed|handleGASVideoMode|handleHTMLVideoMode|MixedMediaHTMLBuilder`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan only moves GAS/HTML video mode response assembly; it does not change when GAS/HTML mode is selected.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Compatibility: `handleGASVideoMode()`, `handleHTMLVideoMode()`, and `buildBasicEmbed()` remain available on `TFDTwitterExtractor`.
