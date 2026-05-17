# News Extractor Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move low-risk news site extractors into `src/features/sites/news/` while keeping legacy extractor paths stable.

**Architecture:** Canonical extractor implementations live under the feature-oriented `src/features/sites/news/` folder. Existing `tfd-system/extractors/*` files become thin CommonJS adapters, so `ExtractorManager` can keep its current registry imports until the registry is refactored later.

**Tech Stack:** Node.js CommonJS modules, Discord.js embeds, shared HTTP/logging helpers, Git file moves.

---

### Task 1: Move News Extractors

**Files:**
- Move: `tfd-system/extractors/4gamers.js` -> `src/features/sites/news/4gamers-extractor.js`
- Move: `tfd-system/extractors/cts.js` -> `src/features/sites/news/cts-extractor.js`
- Move: `tfd-system/extractors/line-today.js` -> `src/features/sites/news/line-today-extractor.js`
- Move: `tfd-system/extractors/msn.js` -> `src/features/sites/news/msn-extractor.js`
- Move: `tfd-system/extractors/storm.js` -> `src/features/sites/news/storm-extractor.js`
- Move: `tfd-system/extractors/udn.js` -> `src/features/sites/news/udn-extractor.js`

- [x] Create `src/features/sites/news/`.
- [x] Move each extractor with `git mv`.
- [x] Update moved extractor imports from old project-relative paths to `../../../shared/*`.

### Task 2: Preserve Legacy Paths

**Files:**
- Create adapters under `tfd-system/extractors/`.

- [x] Replace each old extractor path with `module.exports = require(...)`.
- [x] Keep `tfd-system/extractors/index.js` unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old extractor paths as `done-adapter`.
- [x] Add canonical news extractor paths to the file index.
- [x] Add canonical implementation rows to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for each moved implementation and adapter.
- [x] Verify old adapters export the same classes as new canonical modules.
- [x] Require `tfd-system/extractors/index.js` and confirm manager load.
- [x] Search for old/new paths and class names.
- [x] Run `git diff --check`.
- [x] Review changed files, old paths, adapters, imports, index references, docs, and staging scope before committing.
