# Pixiv Image Optimizer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Pixiv image attachment optimizer into the Pixiv media feature folder while preserving the legacy extractor path.

**Architecture:** `src/features/pixiv/media/` owns Pixiv media helpers. `tfd-system/extractors/pixiv-image-attachment-optimizer.js` remains a compatibility adapter for current message-handler imports.

---

### Task 1: Move Implementation

**Files:**
- Move: `tfd-system/extractors/pixiv-image-attachment-optimizer.js` -> `src/features/pixiv/media/image-attachment-optimizer.js`

- [x] Move implementation with `git mv`.
- [x] Change logger import to `../../../shared/logging/tfd-logger`.
- [x] Keep runtime temp directory at project-root `temp/`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `tfd-system/extractors/pixiv-image-attachment-optimizer.js`

- [x] Replace old path with adapter to `src/features/pixiv/media/image-attachment-optimizer`.
- [x] Keep `tfd-system/core/message-handler-v2.js` import unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old Pixiv image optimizer path as `done-adapter`.
- [x] Add canonical Pixiv media path to the refactor map.
- [x] Mark already-adapted Twitter media optimizer paths as `done-adapter`.

### Task 4: Verify and Review

- [x] Run `node --check` for canonical implementation and adapter.
- [x] Verify adapter exports the same module as canonical path.
- [x] Verify optimizer temp directory still resolves to project-root `temp/`.
- [x] Run syntax check for `tfd-system/core/message-handler-v2.js`.
- [x] Search for Pixiv/Twitter optimizer references.
- [x] Run `git diff --check`.
- [x] Review changed files, adapter, imports, call sites, docs, and staging scope before committing.
