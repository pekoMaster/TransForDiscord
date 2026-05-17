# Rate Limiter Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the SQLite-backed rate limiter into shared infrastructure while keeping the legacy utility path stable.

**Architecture:** `src/shared/rate-limit/` owns rate limiting. `utils/rate-limiter.js` remains a compatibility adapter so `message-handler-v2` can continue using its current import during this low-risk batch.

**Tech Stack:** Node.js CommonJS modules, SQLite-backed `db.rateLimit`, shared TFD logger.

---

### Task 1: Move Rate Limiter

**Files:**
- Move: `utils/rate-limiter.js` -> `src/shared/rate-limit/rate-limiter.js`

- [x] Move the implementation with `git mv`.
- [x] Change `db` import to project-root relative `../../../db`.
- [x] Change logger import to `../logging/tfd-logger`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `utils/rate-limiter.js`

- [x] Replace the old path with `module.exports = require('../src/shared/rate-limit/rate-limiter')`.
- [x] Keep `tfd-system/core/message-handler-v2.js` unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical shared rate limiter path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Require `tfd-system/core/message-handler-v2.js` far enough to validate the rate limiter adapter path is parseable without changing behavior.
- [x] Search for old/new paths and rate limiter import references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
