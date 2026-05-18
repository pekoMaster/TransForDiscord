# Interaction Router Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the central Discord interaction router into `src/app/events/` while preserving the old `events/interactionCreate.js` path.

**Architecture:** `src/app/events/interaction-create.js` owns command/modal/button routing. Root `events/interactionCreate.js` becomes a thin adapter. Existing feature handlers remain unchanged unless a canonical feature path already exists.

---

### Task 1: Move Interaction Router

**Files:**
- Move: `events/interactionCreate.js` -> `src/app/events/interaction-create.js`
- Create adapter: `events/interactionCreate.js`
- Modify: `src/app/bootstrap/bot.js`

- [x] Create `src/app/events/`.
- [x] Move the router implementation to `src/app/events/interaction-create.js`.
- [x] Update command loading path to root `commands/`.
- [x] Update handler imports for canonical Twitter/Pixiv/PTT feature paths where already available.
- [x] Keep report/spoiler/context command paths stable until their own split phases.
- [x] Update bot bootstrap to import the canonical router path.
- [x] Replace old `events/interactionCreate.js` with a thin adapter.

### Task 2: Update Documentation and Inventory

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Update router docs to `src/app/events/interaction-create.js`.
- [x] Mark old `events/interactionCreate.js` as `done-adapter`.
- [x] Record that command files still load from root `commands/`.

### Task 3: Verify and Review

- [x] Run `node --check` for new router, adapter, and bootstrap.
- [x] Require new and old router paths and confirm they return the same module.
- [x] Search interaction router references and classify adapters/docs.
- [x] Run `git diff --check`.
- [x] Review command loading, handler import paths, bootstrap import, docs, and staging scope before committing.
