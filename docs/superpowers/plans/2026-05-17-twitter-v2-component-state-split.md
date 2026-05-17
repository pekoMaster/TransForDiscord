# Twitter V2 Component State Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 button-state derivation out of the V2 container builder into a state helper.

**Architecture:** Add `src/features/twitter/state/v2-component-state.js` for deriving translated/expanded state from Discord component trees. Keep `v2-container-builder.js` re-exporting `deriveStateFromComponents` for compatibility, and point current runtime code to the state helper directly.

**Tech Stack:** Node.js CommonJS, pure smoke tests.

---

### Task 1: Add Component State Helper

**Files:**
- Create: `src/features/twitter/state/v2-component-state.js`
- Create: `scripts/twitter-v2-component-state-smoke.js`

- [x] **Step 1: Write smoke coverage first**

Assert default state, translated state, collapse-all expanded state, and legacy hide/collapse IDs.

- [x] **Step 2: Run smoke to verify RED**

Run: `node scripts\twitter-v2-component-state-smoke.js`
Expected: fails because `v2-component-state.js` does not exist.

- [x] **Step 3: Implement helper**

Move the pure `deriveStateFromComponents(components, tweetId)` behavior into the new state module.

- [x] **Step 4: Run smoke to verify GREEN**

Run: `node scripts\twitter-v2-component-state-smoke.js`
Expected: `twitter v2 component state smoke ok`.

### Task 2: Update Imports and Compatibility

**Files:**
- Modify: `src/features/twitter/containers/v2-container-builder.js`
- Modify: `src/features/twitter/interactions/v2/view-updater.js`

- [x] **Step 1: Re-export compatibility from builder**

Import `deriveStateFromComponents` from `../state/v2-component-state` in the builder and keep exporting it.

- [x] **Step 2: Point runtime code at state helper**

Update `view-updater.js` to import `deriveStateFromComponents` from `../../state/v2-component-state`, leaving `buildV2Container` imported from the builder.

### Task 3: Docs, Verification, Commit

**Files:**
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] **Step 1: Update docs**

Document `state/v2-component-state.js` and `scripts/twitter-v2-component-state-smoke.js`.

- [x] **Step 2: Verify and review**

Run:
- `node scripts\twitter-v2-component-state-smoke.js`
- `node --check` on touched runtime files
- require-load helper, builder, view-updater
- `rg` for `deriveStateFromComponents`
- `git diff --check`

- [x] **Step 3: Local commit**

Commit only this phase. Do not stage unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.
