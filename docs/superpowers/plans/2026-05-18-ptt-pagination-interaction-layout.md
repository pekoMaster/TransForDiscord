# PTT Pagination Interaction Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move PTT pagination/reload/expand interaction handling into the PTT feature folder while preserving the old event path.

**Architecture:** `src/features/ptt/interactions/pagination.js` owns the PTT interaction handler. `events/ptt-pagination-interactions.js` remains a thin adapter, and the interaction router imports the canonical path.

---

### Task 1: Move Interaction Handler

**Files:**
- Move: `events/ptt-pagination-interactions.js` -> `src/features/ptt/interactions/pagination.js`
- Create adapter: `events/ptt-pagination-interactions.js`
- Modify: `events/interactionCreate.js`

- [x] Create `src/features/ptt/interactions/`.
- [x] Move the PTT pagination implementation to the feature folder.
- [x] Update relative imports for PTT extractor, cache manager, and logger.
- [x] Replace old event path with a thin adapter.
- [x] Update interaction router to import the canonical feature path.

### Task 2: Update Documentation and Inventory

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Update button routing docs to the new feature path.
- [x] Mark old event path as `done-adapter`.
- [x] Add canonical PTT interaction path to the file index.

### Task 3: Verify and Review

- [x] Run `node --check` for new implementation, adapter, and interaction router.
- [x] Require new and old paths and confirm they return the same handler.
- [x] Search PTT pagination references and classify adapters/docs.
- [x] Run `git diff --check`.
- [x] Review import paths, router dependency, adapter, docs, and staging scope before committing.
