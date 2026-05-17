# Twitter V2 Tweet Bundle Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 cache-vs-refresh tweet bundle resolution out of `view-updater.js`.

**Architecture:** Extend `src/features/twitter/interactions/v2/tweet-data.js` with `resolveTweetBundle(tweetId, options)` so `view-updater.js` no longer owns cache lookup, reload refresh decisions, or hydrate error fallback. Keep `hydrateTweetBundle` unchanged and export it for existing direct callers.

**Tech Stack:** Node.js CommonJS, pure smoke tests with dependency injection to avoid network calls.

---

### Task 1: Add Tweet Bundle Resolution Smoke

**Files:**
- Create: `scripts/twitter-v2-tweet-bundle-resolution-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert these exact behaviors:
- cache hit with `refreshData: false` returns cached bundle and does not hydrate.
- cache hit with `refreshData: true` hydrates using `cached.originalURL`.
- cache miss hydrates using `undefined` original URL, matching current `view-updater.js` behavior.
- hydrate throw returns `null`.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-tweet-bundle-resolution-smoke.js`
Expected: fails because `resolveTweetBundle` is not exported yet.

### Task 2: Implement Resolution Helper and Update Updater

**Files:**
- Modify: `src/features/twitter/interactions/v2/tweet-data.js`
- Modify: `src/features/twitter/interactions/v2/view-updater.js`

- [x] **Step 1: Implement `resolveTweetBundle`**

Add:

```js
async function resolveTweetBundle(tweetId, {
    refreshData = false,
    getCached = getCachedTweetData,
    hydrate = hydrateTweetBundle
} = {}) {
    let cached = getCached(tweetId);
    if (!cached || refreshData) {
        try {
            cached = await hydrate(tweetId, cached?.originalURL);
        } catch (_) {
            cached = null;
        }
    }
    return cached;
}
```

Export both `hydrateTweetBundle` and `resolveTweetBundle`.

- [x] **Step 2: Update `view-updater.js`**

Replace direct `getCachedTweetData` + `hydrateTweetBundle` logic with:

```js
const cached = await resolveTweetBundle(tweetId, { refreshData });
```

Remove now-unused imports.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `scripts/twitter-v2-tweet-bundle-resolution-smoke.js` and clarify that `tweet-data.js` owns hydrate and cache-vs-refresh resolution.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-tweet-bundle-resolution-smoke.js`
- `node scripts\twitter-v2-view-payload-smoke.js`
- `node scripts\twitter-v2-render-state-smoke.js`
- `node --check` on touched runtime files
- require-load `tweet-data`, `view-updater`, `reload-handler`, `toggle-handler`, `translate-handler`
- `rg` for `resolveTweetBundle|getCachedTweetData|hydrateTweetBundle`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan keeps reload behavior stable while making the refresh-data boundary explicit.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Type consistency: `resolveTweetBundle` returns the same cached/hydrated bundle shape already consumed by `view-updater.js`.
