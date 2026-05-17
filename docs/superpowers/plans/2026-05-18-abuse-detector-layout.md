# Abuse Detector Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move URL abuse detection into the moderation feature folder while keeping the legacy utility path stable.

**Architecture:** `src/features/moderation/` owns moderation-related helpers. `utils/abuse-detector.js` remains a compatibility adapter so `index.js` GC startup and `message-handler-v2` checks do not change in this batch.

**Tech Stack:** Node.js CommonJS modules, crypto, SQLite-backed `db.abuse`, shared TFD logger.

---

### Task 1: Move Abuse Detector

**Files:**
- Move: `utils/abuse-detector.js` -> `src/features/moderation/abuse-detector.js`

- [x] Move the implementation with `git mv`.
- [x] Change `db` import to project-root relative `../../../db`.
- [x] Change logger import to `../../shared/logging/tfd-logger`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `utils/abuse-detector.js`

- [x] Replace the old path with `module.exports = require('../src/features/moderation/abuse-detector')`.
- [x] Keep current runtime call sites unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical moderation abuse detector path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Run syntax checks for known abuse detector call sites.
- [x] Search for old/new paths and abuse detector import references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
