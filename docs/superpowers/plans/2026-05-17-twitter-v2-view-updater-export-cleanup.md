# Twitter V2 View Updater Export Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `view-updater.js` export only the view update orchestration API.

**Architecture:** `buildFallbackState` now belongs to `render-state.js`; all runtime callers already import it from there. Remove the stale `buildFallbackState` import/re-export from `view-updater.js` and add a smoke test that locks the intended export surface.

**Tech Stack:** Node.js CommonJS, pure smoke tests.

---

### Task 1: Add Export Surface Smoke

**Files:**
- Create: `scripts/twitter-v2-view-updater-exports-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert that `view-updater.js` exports `rebuildAndUpdate` as a function and does not export `buildFallbackState`.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-view-updater-exports-smoke.js`
Expected: fails because `view-updater.js` still exports `buildFallbackState`.

### Task 2: Clean View Updater Exports

**Files:**
- Modify: `src/features/twitter/interactions/v2/view-updater.js`

- [x] **Step 1: Remove stale fallback import/export**

Remove `buildFallbackState` from the `./render-state` import and from `module.exports`.
Keep `resolveRenderState` and `rebuildAndUpdate` unchanged.

- [x] **Step 2: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-view-updater-exports-smoke.js`
Expected: `twitter v2 view updater exports smoke ok`.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`

- [x] **Step 1: Update docs**

Document `scripts/twitter-v2-view-updater-exports-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-view-updater-exports-smoke.js`
- `node scripts\twitter-v2-view-stats-smoke.js`
- `node scripts\twitter-v2-render-state-smoke.js`
- `node --check src/features/twitter/interactions/v2/view-updater.js`
- require-load `view-updater`, `toggle-handler`, `reload-handler`, `translate-handler`, `render-state`
- `rg` for `buildFallbackState|view-updater`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan removes only a stale re-export after confirming runtime callers use `render-state.js`.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Type consistency: `view-updater.js` keeps exporting `rebuildAndUpdate`, and `render-state.js` remains the owner of `buildFallbackState`.
