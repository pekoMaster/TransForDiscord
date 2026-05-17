# Twitter V2 View Stats Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 URL repost stats lookup out of `view-updater.js`.

**Architecture:** Add `src/features/twitter/interactions/v2/view-stats.js` as the single helper for optional URL stats lookup during V2 view rebuilds. `view-updater.js` should call this helper and keep coordinating bundle resolution, render-state resolution, payload building, edit, and state persistence.

**Tech Stack:** Node.js CommonJS, pure smoke tests with dependency injection.

---

### Task 1: Add View Stats Helper

**Files:**
- Create: `src/features/twitter/interactions/v2/view-stats.js`
- Create: `scripts/twitter-v2-view-stats-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert these exact behaviors:
- returns `null` when `guildId` is missing.
- returns `null` when `channelId` is missing.
- calls lookup with `originalURL`, `guildId`, and `channelId`.
- falls back to `https://twitter.com/i/status/{tweetId}` when `originalURL` is missing.
- returns `null` if lookup throws.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-view-stats-smoke.js`
Expected: fails because `view-stats.js` does not exist.

- [x] **Step 3: Implement helper**

Create `resolveV2UrlStats({ interaction, tweetId, originalURL, lookup = lookupUrl })`.
Move the current try/catch behavior from `view-updater.js` into the helper.

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-view-stats-smoke.js`
Expected: `twitter v2 view stats smoke ok`.

### Task 2: Update View Updater

**Files:**
- Modify: `src/features/twitter/interactions/v2/view-updater.js`

- [x] **Step 1: Delegate stats lookup**

Import `resolveV2UrlStats` from `./view-stats`.
Remove direct `lookupUrl` import and inline stats try/catch.
Use:

```js
const urlStats = resolveV2UrlStats({
    interaction,
    tweetId,
    originalURL
});
```

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `interactions/v2/view-stats.js` and `scripts/twitter-v2-view-stats-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-view-stats-smoke.js`
- `node scripts\twitter-v2-tweet-bundle-resolution-smoke.js`
- `node scripts\twitter-v2-view-payload-smoke.js`
- `node --check` on touched runtime files
- require-load `view-stats`, `view-updater`, `reload-handler`, `toggle-handler`, `translate-handler`
- `rg` for `resolveV2UrlStats|lookupUrl|view-stats`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan moves only URL stats lookup and preserves the existing null-on-error behavior.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Type consistency: `resolveV2UrlStats` returns the same `urlStats` value currently passed into `buildV2EditPayload`.
