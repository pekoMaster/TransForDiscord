# Instagram Extractor Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Instagram extractor into the site feature folder while keeping the legacy extractor path stable.

**Architecture:** `src/features/sites/instagram/` becomes the canonical Instagram site feature folder. `tfd-system/extractors/instagram.js` remains a thin adapter so `ExtractorManager`, regex routing, and URL support settings do not change in this batch.

**Tech Stack:** Node.js CommonJS modules, axios, Discord.js embeds, shared HTTP/HTML/Discord/logging helpers.

---

### Task 1: Move Instagram Extractor

**Files:**
- Move: `tfd-system/extractors/instagram.js` -> `src/features/sites/instagram/instagram-extractor.js`

- [x] Move the extractor with `git mv`.
- [x] Change shared helper imports to `../../../shared/*`.
- [x] Change TFD logger import to `../../../shared/logging/tfd-logger`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `tfd-system/extractors/instagram.js`

- [x] Replace the old path with `module.exports = require('../../src/features/sites/instagram/instagram-extractor')`.
- [x] Keep `tfd-system/extractors/index.js` unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old extractor path as `done-adapter`.
- [x] Add canonical Instagram extractor path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same class as the new canonical module.
- [x] Require `tfd-system/extractors/index.js` and confirm Instagram manager load.
- [x] Search for old/new paths and Instagram import references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, index references, docs, and staging scope before committing.
