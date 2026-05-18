# Pixiv R18 Cache Manager Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Pixiv R18 cache manager into the Pixiv feature cache folder while keeping the legacy utility path stable.

**Architecture:** `src/features/pixiv/cache/` owns Pixiv cache helpers. `utils/pixiv-r18-cache-manager.js` remains a compatibility adapter so `message-handler-v2` does not change in this batch.

**Tech Stack:** Node.js CommonJS modules, filesystem JSON cache under project-root `data/pixiv_r18_cache`, Discord.js attachments, shared TFD logger.

---

### Task 1: Move Pixiv R18 Cache Manager

**Files:**
- Move: `utils/pixiv-r18-cache-manager.js` -> `src/features/pixiv/cache/r18-cache-manager.js`

- [x] Move the implementation with `git mv`.
- [x] Keep cache directory anchored to project-root `data/pixiv_r18_cache`.
- [x] Change logger import to `../../../shared/logging/tfd-logger`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `utils/pixiv-r18-cache-manager.js`

- [x] Replace the old path with `module.exports = require('../src/features/pixiv/cache/r18-cache-manager')`.
- [x] Keep current `message-handler-v2` call sites unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical Pixiv R18 cache manager path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Verify instantiated cache directory still resolves to project-root `data/pixiv_r18_cache`.
- [x] Run syntax check for `message-handler-v2`.
- [x] Search for old/new paths and Pixiv R18 cache manager references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
