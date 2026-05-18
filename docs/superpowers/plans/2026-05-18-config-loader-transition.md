# Config Loader Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stable config loader before moving JSON config files.

**Architecture:** `src/core/config/config-loader.js` centralizes config file paths, cached loads, and fresh reloads. Runtime modules should call the loader instead of directly requiring `tfd-system/config/tfd-config.json`.

**Compatibility note:** This phase does not move JSON files. It keeps existing JSON paths stable and prepares for a later JSON move.

---

### Task 1: Add Loader

**Files:**
- Create: `src/core/config/config-loader.js`

- [x] Add `getTfdConfigPath()`.
- [x] Add `loadTfdConfig()`.
- [x] Add `reloadTfdConfig()`.

### Task 2: Update Runtime Call Sites

**Files:**
- Modify: `tfd-system/index.js`
- Modify: `tfd-system/core/message-handler-v2.js`
- Modify: `tfd-system/core/link-processor.js`
- Modify: `src/shared/http/http-client.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
- Modify: `scripts/http-client-smoke.js`

- [x] Replace direct runtime `tfd-config.json` imports with loader calls.
- [x] Replace manual `require.cache` deletion with `reloadTfdConfig()`.
- [x] Keep migration scripts unchanged because they intentionally read legacy JSON as migration input.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Add loader to config/core inventory.
- [x] Mark JSON config move as blocked on later file move, not current phase.

### Task 4: Verify and Review

- [x] Run `node --check` for loader and changed runtime files.
- [x] Verify loader path resolves to current `tfd-system/config/tfd-config.json`.
- [x] Run config-related smoke checks.
- [x] Search for remaining direct `tfd-config.json` imports and classify intentional leftovers.
- [x] Run `git diff --check`.
- [x] Review changed files, imports, reload behavior, docs, and staging scope before committing.
