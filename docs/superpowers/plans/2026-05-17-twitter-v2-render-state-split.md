# Twitter V2 Render State Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Twitter V2 render-state reconstruction out of the view updater so reload can clearly refresh data while preserving the current message state.

**Architecture:** Add a focused `render-state.js` helper under `src/features/twitter/interactions/v2/` for deriving fallback state from Discord components and merging stored state with overrides. Keep `view-updater.js` responsible for hydration, container rendering, and editing the existing interaction reply. Existing callers continue using `rebuildAndUpdate`; toggle code imports fallback state from the new helper.

**Tech Stack:** Node.js CommonJS, Discord.js builders, pure smoke tests.

---

### Task 1: Add Render State Helper

**Files:**
- Create: `src/features/twitter/interactions/v2/render-state.js`
- Create: `scripts/twitter-v2-render-state-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert that fallback state is derived from current Discord components, marker text is preserved, cached translations are applied only when the current components indicate translated state, and merge logic keeps stored state while applying explicit overrides.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-render-state-smoke.js`
Expected: fails because `render-state.js` does not exist.

- [x] **Step 3: Implement helper**

Move `buildFallbackState(interaction, tweetId, cached)` from `view-updater.js` into `render-state.js`.
Add `resolveRenderState({ interaction, tweetId, cached, storedState, stateOverrides })` that returns:

```js
{
    ...storedStateOrFallback,
    ...stateOverrides,
    tweetId,
    originalURL: cached.originalURL,
    markerText: stateOverrides.markerText !== undefined
        ? stateOverrides.markerText
        : storedStateOrFallback.markerText
}
```

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-render-state-smoke.js`
Expected: `twitter v2 render state smoke ok`.

### Task 2: Update View Updater and Toggle Imports

**Files:**
- Modify: `src/features/twitter/interactions/v2/view-updater.js`
- Modify: `src/features/twitter/interactions/v2/toggle-handler.js`

- [x] **Step 1: Keep view updater focused on refresh/render/edit**

Import `buildFallbackState` and `resolveRenderState` from `./render-state`.
Remove direct imports that are only needed for fallback state derivation.
Replace the inline `storedState/newState` construction with `resolveRenderState`.

- [x] **Step 2: Move toggle fallback import**

Update `toggle-handler.js` to import `buildFallbackState` from `./render-state` and keep `rebuildAndUpdate` imported from `./view-updater`.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `interactions/v2/render-state.js` and `scripts/twitter-v2-render-state-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-render-state-smoke.js`
- `node scripts\twitter-v2-component-state-smoke.js`
- `node --check` on touched runtime files
- require-load `render-state`, `view-updater`, `toggle-handler`, `reload-handler`, `translate-handler`
- `rg` for `buildFallbackState|resolveRenderState|render-state`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not stage unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.

---

## Self-Review

- Spec coverage: This plan addresses the current reload/rebuild concern by making render state preservation explicit before later behavior changes.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: `buildFallbackState` and `resolveRenderState` both use the same state shape currently stored by `v2-state-store.js`.
