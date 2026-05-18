# PekoEmbed System Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the PekoEmbed/TFD system singleton into `src/core/system/` while keeping the old `tfd-system/index.js` path compatible.

**Architecture:** `src/core/system/pekoembed-system.js` owns the singleton implementation. `tfd-system/index.js` becomes a thin adapter so any old import path still resolves to the same instance.

**Compatibility note:** This phase does not move `message-handler-v2.js`; the new system file still lazy-loads the existing message handler through its current path.

---

### Task 1: Move System Singleton

**Files:**
- Move: `tfd-system/index.js` -> `src/core/system/pekoembed-system.js`
- Create adapter: `tfd-system/index.js`

- [x] Create `src/core/system/`.
- [x] Move the singleton implementation to `src/core/system/pekoembed-system.js`.
- [x] Update config loader import to `../config/config-loader`.
- [x] Update logger import to `../../shared/logging/tfd-logger`.
- [x] Keep message handler lazy-load pointed at current `tfd-system/core/message-handler-v2.js`.
- [x] Replace old `tfd-system/index.js` with a thin adapter.

### Task 2: Update Documentation and Inventory

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Add `src/core/system/pekoembed-system.js` to the file index.
- [x] Mark `tfd-system/index.js` as `done-adapter`.
- [x] Record the adapter behavior in the refactor map.

### Task 3: Verify and Review

- [x] Run `node --check` for new implementation and old adapter.
- [x] Require both new and old paths and verify they return the same singleton.
- [x] Search for stale `tfd-system/index.js` and `pekoembed-system` references.
- [x] Run `git diff --check`.
- [x] Review changed files, relative imports, compatibility adapter, docs, and staging scope before committing.
