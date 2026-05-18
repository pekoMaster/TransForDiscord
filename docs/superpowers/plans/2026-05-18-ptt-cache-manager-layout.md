# PTT Cache Manager Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the PTT article/image cache manager into the PTT feature folder while keeping the legacy utility path stable.

**Architecture:** `src/features/ptt/cache/` owns PTT cache helpers. `utils/ptt-cache-manager.js` remains a compatibility adapter so the PTT extractor and pagination event do not change in this batch.

**Tech Stack:** Node.js CommonJS modules, filesystem JSON cache under project-root `temp/ptt`, shared TFD logger.

---

### Task 1: Move PTT Cache Manager

**Files:**
- Move: `utils/ptt-cache-manager.js` -> `src/features/ptt/cache/ptt-cache-manager.js`

- [x] Move the implementation with `git mv`.
- [x] Keep cache directory anchored to project-root `temp/ptt`.
- [x] Change logger import to `../../../shared/logging/tfd-logger`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `utils/ptt-cache-manager.js`

- [x] Replace the old path with `module.exports = require('../src/features/ptt/cache/ptt-cache-manager')`.
- [x] Keep current PTT extractor and pagination call sites unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical PTT cache manager path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Verify instantiated cache directory still resolves to project-root `temp/ptt`.
- [x] Run syntax checks for PTT extractor and pagination event.
- [x] Search for old/new paths and PTT cache manager references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
