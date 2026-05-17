# Guild Blacklist Manager Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the SQLite-backed guild blacklist manager into the moderation feature folder while keeping the legacy utility path stable.

**Architecture:** `src/features/moderation/` owns blacklist and moderation helpers. `utils/guild-blacklist-manager.js` remains a compatibility adapter so commands, report handlers, and message pipeline imports do not change in this batch.

**Tech Stack:** Node.js CommonJS modules, SQLite-backed `db.blacklist` and `db.blacklistReports`, in-memory cache.

---

### Task 1: Move Guild Blacklist Manager

**Files:**
- Move: `utils/guild-blacklist-manager.js` -> `src/features/moderation/guild-blacklist-manager.js`

- [x] Move the implementation with `git mv`.
- [x] Change `db` import to project-root relative `../../../db`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `utils/guild-blacklist-manager.js`

- [x] Replace the old path with `module.exports = require('../src/features/moderation/guild-blacklist-manager')`.
- [x] Keep current runtime call sites unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical moderation guild blacklist manager path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Run syntax checks for known guild blacklist manager call sites.
- [x] Search for old/new paths and guild blacklist manager import references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
