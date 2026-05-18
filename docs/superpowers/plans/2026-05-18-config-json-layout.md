# Config JSON Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move JSON config data from `tfd-system/config/` to `src/core/config/` after active runtime reads have been centralized through `config-loader.js`.

**Architecture:** `src/core/config/` owns both the config loader and JSON config data. Runtime code should use `config-loader.js`; scripts that need file paths should read through loader path helpers.

**Compatibility note:** JSON files do not get legacy adapters because a `.json` adapter would create duplicate sources of truth. This phase updates known active references instead.

---

### Task 1: Move JSON Config Files

**Files:**
- Move: `tfd-system/config/tfd-config.json` -> `src/core/config/tfd-config.json`
- Move: `tfd-system/config/pekoembed-config.json` -> `src/core/config/pekoembed-config.json`
- Move: `tfd-system/config/supported-sites.json` -> `src/core/config/supported-sites.json`

- [x] Move all three JSON files to `src/core/config/`.
- [x] Do not leave duplicate legacy JSON files under `tfd-system/config/`.

### Task 2: Update Accessors and Scripts

**Files:**
- Modify: `src/core/config/config-loader.js`
- Modify: `scripts/migrations/migrate-from-json.js`

- [x] Point `getTfdConfigPath()` at `src/core/config/tfd-config.json`.
- [x] Add path helpers for `pekoembed-config.json` and `supported-sites.json`.
- [x] Update migration script to read the new `tfd-config.json` path.

### Task 3: Update Documentation and Inventory

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Replace active `tfd-system/config/*` guidance with `src/core/config/*`.
- [x] Mark moved JSON rows as `keep`.
- [x] Document that old JSON paths are intentionally removed.

### Task 4: Verify and Review

- [x] Run JSON parse checks for all moved config files.
- [x] Run `node --check` for changed JS files.
- [x] Verify config-loader resolves all moved paths.
- [x] Run config-related smoke checks.
- [x] Search for remaining active old config references and classify intentional leftovers.
- [x] Run `git diff --check`.
- [x] Review moved files, path helpers, migration script, docs, and staging scope before committing.
