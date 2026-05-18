# Pixiv Interactions Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Pixiv reload and pagination interaction handlers into the Pixiv feature folder while preserving existing event/router imports.

**Architecture:** `src/features/pixiv/interactions/` owns Pixiv button interactions. `handlers/pixiv-reload-interactions.js` and `events/pixiv-pagination-interactions.js` remain compatibility adapters for `events/interactionCreate.js`.

---

### Task 1: Move Implementations

**Files:**
- Move: `handlers/pixiv-reload-interactions.js` -> `src/features/pixiv/interactions/reload.js`
- Move: `events/pixiv-pagination-interactions.js` -> `src/features/pixiv/interactions/pagination.js`

- [x] Move implementations with `git mv`.
- [x] Update Pixiv cache manager imports to feature-local `../cache/pixiv-cache-manager`.
- [x] Update logger imports to `../../../shared/logging/tfd-logger`.
- [x] Update root-relative helper imports for Pixiv extractor, webhook manager, and DB stats.
- [x] Keep `events/interactionCreate.js` imports unchanged for this batch.

### Task 2: Preserve Legacy Paths

**Files:**
- Create: `handlers/pixiv-reload-interactions.js`
- Create: `events/pixiv-pagination-interactions.js`

- [x] Replace old paths with adapters to `src/features/pixiv/interactions/*`.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old Pixiv interaction paths as `done-adapter`.
- [x] Add canonical Pixiv interaction paths to the refactor map and file index.

### Task 4: Verify and Review

- [x] Run `node --check` for canonical implementations and adapters.
- [x] Verify adapter text points to canonical modules.
- [x] Verify `deleteArtworkCache` still exists on the feature cache manager.
- [x] Run syntax check for `events/interactionCreate.js`.
- [x] Search for Pixiv interaction references.
- [x] Run `git diff --check`.
- [x] Review changed files, adapters, imports, call sites, docs, and staging scope before committing.
