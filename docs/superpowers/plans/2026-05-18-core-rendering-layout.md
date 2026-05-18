# Core Rendering Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move HTML rendering helpers into core rendering while keeping the legacy render paths stable.

**Architecture:** `src/core/rendering/` owns reusable HTML rendering helpers. `tfd-system/render/*.js` remain compatibility adapters so Twitter V2 extractor imports do not change in this batch.

**Tech Stack:** Node.js CommonJS modules, shared TFD logger.

---

### Task 1: Move Rendering Helpers

**Files:**
- Move: `tfd-system/render/html-video-renderer.js` -> `src/core/rendering/html-video-renderer.js`
- Move: `tfd-system/render/mixed-media-html-builder.js` -> `src/core/rendering/mixed-media-html-builder.js`

- [x] Move both implementations with `git mv`.
- [x] Keep internal `./html-video-renderer` import in mixed-media builder.
- [x] Change logger imports to `../../shared/logging/tfd-logger`.

### Task 2: Preserve Legacy Paths

**Files:**
- Create: `tfd-system/render/html-video-renderer.js`
- Create: `tfd-system/render/mixed-media-html-builder.js`

- [x] Replace old paths with adapters to `src/core/rendering/*`.
- [x] Keep Twitter V2 extractor import unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old render paths as `done-adapter`.
- [x] Add canonical core rendering paths to the file index.
- [x] Add canonical implementation rows to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementations and adapters.
- [x] Verify old adapters export the same modules as canonical paths.
- [x] Run syntax check for Twitter V2 extractor call site.
- [x] Search for old/new paths and render helper references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
