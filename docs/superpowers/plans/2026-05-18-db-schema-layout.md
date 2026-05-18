# DB Schema Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move SQLite schema definition into `src/shared/db/` and update the DB loader.

**Architecture:** `src/shared/db/schema.sql` owns schema DDL. `db/index.js` remains the runtime DB access API and reads the canonical schema path.

**Compatibility note:** SQL files cannot be preserved as CommonJS adapters. This phase updates all active code references instead of leaving `db/schema.sql`.

---

### Task 1: Move Schema

**Files:**
- Move: `db/schema.sql` -> `src/shared/db/schema.sql`

- [x] Move schema with `git mv`.
- [x] Update `db/index.js` `SCHEMA_PATH` to the canonical schema file.

### Task 2: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Modify: `CLAUDE.md`

- [x] Mark old schema path as moved without adapter.
- [x] Add canonical shared DB schema path to docs.
- [x] Update developer guidance references from `db/schema.sql`.

### Task 3: Verify and Review

- [x] Run `node --check db/index.js`.
- [x] Verify `SCHEMA_PATH` resolves to `src/shared/db/schema.sql`.
- [x] Search for active `db/schema.sql` references.
- [x] Run `git diff --check`.
- [x] Review changed files, schema path, docs, and staging scope before committing.
