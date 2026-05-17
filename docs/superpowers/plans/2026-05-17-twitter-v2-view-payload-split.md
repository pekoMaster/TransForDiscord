# Twitter V2 View Payload Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Twitter V2 Discord edit payload construction out of `view-updater.js`.

**Architecture:** Add `src/features/twitter/interactions/v2/view-payload.js` to build the Components V2 edit payload from hydrated tweet data and resolved render state. Keep `view-updater.js` responsible for cache refresh, state resolution, URL stats lookup, `interaction.editReply`, and message-state persistence.

**Tech Stack:** Node.js CommonJS, Discord.js builders, pure smoke tests.

---

### Task 1: Add View Payload Helper

**Files:**
- Create: `src/features/twitter/interactions/v2/view-payload.js`
- Create: `scripts/twitter-v2-view-payload-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert that the helper returns a Components V2 edit payload with `content: null`, `embeds: []`, exactly one container component, and optional marker text inserted before the tweet content.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-view-payload-smoke.js`
Expected: fails because `view-payload.js` does not exist.

- [x] **Step 3: Implement helper**

Create `buildV2EditPayload({ tweet, originalURL, quoteData, replyData, state, urlStats })`.
The helper should call `buildV2Container`, prepend marker text with `TextDisplayBuilder` and `SeparatorBuilder` when `state.markerText` exists, and return the same `interaction.editReply` payload shape currently built inline by `view-updater.js`.

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-view-payload-smoke.js`
Expected: `twitter v2 view payload smoke ok`.

### Task 2: Update View Updater

**Files:**
- Modify: `src/features/twitter/interactions/v2/view-updater.js`

- [x] **Step 1: Delegate payload construction**

Import `buildV2EditPayload` from `./view-payload`.
Remove direct imports of `TextDisplayBuilder`, `SeparatorBuilder`, and `buildV2Container`.
Replace inline container/payload construction with:

```js
const payload = buildV2EditPayload({
    tweet,
    originalURL,
    quoteData,
    replyData,
    state: newState,
    urlStats
});

await interaction.editReply(payload);
```

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `interactions/v2/view-payload.js` and `scripts/twitter-v2-view-payload-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-view-payload-smoke.js`
- `node scripts\twitter-v2-render-state-smoke.js`
- `node scripts\twitter-v2-component-state-smoke.js`
- `node --check` on touched runtime files
- require-load `view-payload`, `view-updater`, `reload-handler`, `toggle-handler`, `translate-handler`
- `rg` for `buildV2EditPayload|view-payload|buildV2Container|TextDisplayBuilder|SeparatorBuilder`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan isolates Discord edit payload construction while preserving current reload/update behavior.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Type consistency: `buildV2EditPayload` takes the same hydrated data and render state currently used inline by `view-updater.js`.
