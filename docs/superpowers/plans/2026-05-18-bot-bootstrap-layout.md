# Bot Bootstrap Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the root bot bootstrap implementation into `src/app/bootstrap/` while keeping `index.js` as the package entry adapter.

**Architecture:** `src/app/bootstrap/bot.js` owns Discord client setup, event registration, Express stats API, and bot login side effects. Root `index.js` remains a thin CommonJS adapter so `npm start` and PM2 entrypoints keep working.

**Compatibility note:** Do not require-load the bootstrap during verification because it calls `client.login()`. Use syntax checks and import path review instead.

---

### Task 1: Move Bootstrap

**Files:**
- Move: `index.js` -> `src/app/bootstrap/bot.js`
- Create adapter: `index.js`

- [x] Create `src/app/bootstrap/`.
- [x] Move root bootstrap implementation into `src/app/bootstrap/bot.js`.
- [x] Update relative imports for message handler, events, logger, db, and utils.
- [x] Replace root `index.js` with a thin adapter.

### Task 2: Update Documentation and Inventory

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Add `src/app/bootstrap/bot.js` to the file index.
- [x] Mark root `index.js` as `done-adapter`.
- [x] Record that `package.json` can keep `main: index.js`.

### Task 3: Verify and Review

- [x] Run `node --check` for new bootstrap and root adapter.
- [x] Search for root bootstrap references.
- [x] Run `git diff --check`.
- [x] Review import paths, package entry compatibility, PM2 entry compatibility, docs, and staging scope before committing.
