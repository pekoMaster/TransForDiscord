# Twitter V2 View Message State Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize Twitter V2 interaction-message render state access.

**Architecture:** Add `src/features/twitter/interactions/v2/view-message-state.js` as the bridge between Discord interaction messages and `state/v2-state-store.js`. `view-updater.js` and `toggle-handler.js` should no longer know how to derive the state-store key from `interaction.message.id`.

**Tech Stack:** Node.js CommonJS, pure smoke tests with dependency injection.

---

### Task 1: Add View Message State Helper

**Files:**
- Create: `src/features/twitter/interactions/v2/view-message-state.js`
- Create: `scripts/twitter-v2-view-message-state-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert these exact behaviors:
- `getStoredViewState(interaction)` calls `getState` with `interaction.message.id`.
- `setStoredViewState(interaction, state)` calls `setState` with `interaction.message.id` and returns the stored value.
- both helpers return `null` when `interaction.message.id` is missing.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-view-message-state-smoke.js`
Expected: fails because `view-message-state.js` does not exist.

- [x] **Step 3: Implement helper**

Create `getStoredViewState(interaction, getState = getMessageState)` and `setStoredViewState(interaction, state, setState = setMessageState)`.
Both helpers should guard missing message IDs.

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-view-message-state-smoke.js`
Expected: `twitter v2 view message state smoke ok`.

### Task 2: Update Runtime Callers

**Files:**
- Modify: `src/features/twitter/interactions/v2/view-updater.js`
- Modify: `src/features/twitter/interactions/v2/toggle-handler.js`

- [x] **Step 1: Update view updater**

Replace direct `getMessageState` / `setMessageState` imports with `getStoredViewState` / `setStoredViewState`.
Keep `resolveRenderState`, payload building, edit, and return value unchanged.

- [x] **Step 2: Update toggle handler**

Replace direct `getMessageState(interaction.message.id)` with `getStoredViewState(interaction)`.
Keep existing fallback to `buildFallbackState(...)`.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `src/features/twitter/README.md`

- [x] **Step 1: Update docs**

Document `interactions/v2/view-message-state.js` and `scripts/twitter-v2-view-message-state-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-view-message-state-smoke.js`
- `node scripts\twitter-v2-view-updater-exports-smoke.js`
- `node scripts\twitter-v2-render-state-smoke.js`
- `node --check` on touched runtime files
- require-load `view-message-state`, `view-updater`, `toggle-handler`, `reload-handler`, `translate-handler`
- `rg` for `getMessageState|setMessageState|getStoredViewState|setStoredViewState|view-message-state`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not push or deploy.

---

## Self-Review

- Spec coverage: This plan centralizes interaction-message state key access without changing stored state shape or update behavior.
- Placeholder scan: No TODO/TBD/fill-in placeholders remain.
- Type consistency: helper names use `ViewState` consistently and map directly to existing `getMessageState` / `setMessageState`.
