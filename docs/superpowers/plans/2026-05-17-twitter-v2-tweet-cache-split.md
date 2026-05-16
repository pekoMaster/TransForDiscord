# Twitter V2 Tweet Cache Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 tweet runtime cache out of the V2 container builder so rendering and state storage have separate ownership.

**Architecture:** Add `src/features/twitter/state/v2-tweet-cache.js` as the cache owner. Keep `src/features/twitter/containers/v2-container-builder.js` re-exporting `cacheTweetData` and `getCachedTweetData` for old callers, while updating current feature modules to import the state module directly.

**Tech Stack:** Node.js CommonJS modules, existing Twitter V2 Components renderer, smoke tests.

---

### Task 1: Add Cache State Module

**Files:**
- Create: `src/features/twitter/state/v2-tweet-cache.js`
- Create: `scripts/twitter-v2-tweet-cache-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Create a smoke test that imports `cacheTweetData`, `getCachedTweetData`, `clearTweetCacheForTest`, and `pruneExpiredTweetCache` from the new state module.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-tweet-cache-smoke.js`
Expected: fails because `src/features/twitter/state/v2-tweet-cache.js` does not exist.

- [x] **Step 3: Implement cache state module**

Move the Map, TTL, set/get, and prune behavior from `v2-container-builder.js` into `v2-tweet-cache.js`. Use `interval.unref()` when available so smoke tests and short scripts can exit cleanly.

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-tweet-cache-smoke.js`
Expected: `twitter v2 tweet cache smoke ok`.

### Task 2: Update Runtime Imports

**Files:**
- Modify: `src/features/twitter/containers/v2-container-builder.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
- Modify: `src/features/twitter/interactions/v2/tweet-data.js`
- Modify: `src/features/twitter/interactions/v2/view-updater.js`
- Modify: `src/features/twitter/interactions/v2/translate-handler.js`
- Modify: `src/features/twitter/interactions/v2/toggle-handler.js`

- [x] **Step 1: Remove cache storage from builder**

Delete the cache Map and cleanup interval from `v2-container-builder.js`. Import cache functions from `../state/v2-tweet-cache` and re-export them for compatibility.

- [x] **Step 2: Point feature internals at state cache**

Update V2 interaction modules and the extractor to import `cacheTweetData` / `getCachedTweetData` from `state/v2-tweet-cache` instead of the container builder.

- [x] **Step 3: Preserve old adapter behavior**

Keep `handlers/twitter-v2-container-builder.js` unchanged; it still re-exports the builder module, and the builder still exposes cache functions.

### Task 3: Docs, Ignore, Verification

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Modify: `.gitignore`

- [x] **Step 1: Update file index and refactor map**

Document `state/v2-tweet-cache.js` and the new smoke test. Mark the container cache split as done.

- [x] **Step 2: Ignore local command tool state**

Add `.commandcode/` to `.gitignore` under local tool state so tool-generated state does not keep appearing in git status.

- [x] **Step 3: Verify and review**

Run:
- `node scripts\twitter-v2-tweet-cache-smoke.js`
- `node --check` on touched runtime files
- require-load for builder, cache, extractor, V2 handlers
- `rg` for cache import fallout
- `git diff --check`

- [x] **Step 4: Local commit**

Commit only this phase. Do not stage unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.
