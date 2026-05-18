# Pixiv Cache Manager Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Pixiv JSON cache manager into the Pixiv feature folder and fix the known reload API mismatch.

**Architecture:** `src/features/pixiv/cache/` owns Pixiv disk cache helpers. `utils/pixiv-cache-manager.js` remains a compatibility adapter so pagination and reload call sites do not change in this batch.

**Known Bug:** `handlers/pixiv-reload-interactions.js` calls `cacheManager.deleteArtworkCache(artworkId)`, but the current manager only exposes load/save/cache-stat methods.

**Tech Stack:** Node.js CommonJS modules, filesystem JSON cache under project-root `temp/pixiv`, shared TFD logger.

---

### Task 1: Move Pixiv Cache Manager

**Files:**
- Move: `utils/pixiv-cache-manager.js` -> `src/features/pixiv/cache/pixiv-cache-manager.js`

- [x] Move the implementation with `git mv`.
- [x] Keep cache directory anchored to project-root `temp/pixiv`.
- [x] Change logger import to `../../../shared/logging/tfd-logger`.

### Task 2: Fix Reload Cache API

**Files:**
- Modify: `src/features/pixiv/cache/pixiv-cache-manager.js`

- [x] Add `deleteArtworkCache(artworkId)`.
- [x] Return `true` when the cache file is deleted.
- [x] Return `false` when the cache file does not exist.
- [x] Log and rethrow unexpected filesystem errors.

### Task 3: Preserve Legacy Path

**Files:**
- Create: `utils/pixiv-cache-manager.js`

- [x] Replace the old path with `module.exports = require('../src/features/pixiv/cache/pixiv-cache-manager')`.
- [x] Keep pagination and reload call sites unchanged for this batch.

### Task 4: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical Pixiv cache manager path to the file index.
- [x] Add canonical implementation row to the refactor map.
- [x] Mark the known Pixiv reload API mismatch as addressed.

### Task 5: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Verify `deleteArtworkCache` exists and handles a missing cache file without throwing.
- [x] Run syntax checks for Pixiv reload and pagination call sites.
- [x] Search for old/new paths and Pixiv cache manager references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
