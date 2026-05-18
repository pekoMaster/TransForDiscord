# Pixiv Ugoira Processor Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Pixiv Ugoira MP4 processor into the Pixiv media feature folder while keeping the legacy utility path stable.

**Architecture:** `src/features/pixiv/media/` owns Pixiv media conversion helpers. `utils/pixiv-ugoira-mp4-processor.js` remains a compatibility adapter for any existing or future old-path imports.

**Tech Stack:** Node.js CommonJS modules, HTTPS download, Discord.js attachments/embeds, shared TFD logger, temp files under project-root `Pixiv_temp`.

---

### Task 1: Move Pixiv Ugoira Processor

**Files:**
- Move: `utils/pixiv-ugoira-mp4-processor.js` -> `src/features/pixiv/media/ugoira-mp4-processor.js`

- [x] Move the implementation with `git mv`.
- [x] Keep temp directory anchored to project-root `Pixiv_temp`.
- [x] Change logger import to `../../../shared/logging/tfd-logger`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `utils/pixiv-ugoira-mp4-processor.js`

- [x] Replace the old path with `module.exports = require('../src/features/pixiv/media/ugoira-mp4-processor')`.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical Pixiv Ugoira processor path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Verify instantiated temp directory still resolves to project-root `Pixiv_temp`.
- [x] Search for old/new paths and Ugoira processor references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, docs, and staging scope before committing.
