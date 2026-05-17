# Mixed Site Extractor Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move low-risk non-core site extractors into domain-specific `src/features/sites/*/` folders while keeping legacy extractor paths stable.

**Architecture:** Canonical extractor implementations move to feature-owned site folders. Existing `tfd-system/extractors/*` files become thin CommonJS adapters, so `ExtractorManager` and URL routing stay unchanged for this batch.

**Tech Stack:** Node.js CommonJS modules, Discord.js embeds, shared HTTP/logging helpers, Git file moves.

---

### Task 1: Move Site Extractors

**Files:**
- Move: `tfd-system/extractors/52poke.js` -> `src/features/sites/wiki/52poke-extractor.js`
- Move: `tfd-system/extractors/bilibili.js` -> `src/features/sites/video/bilibili-extractor.js`
- Move: `tfd-system/extractors/hololive-shop.js` -> `src/features/sites/shop/hololive-shop-extractor.js`
- Move: `tfd-system/extractors/mobile01.js` -> `src/features/sites/forum/mobile01-extractor.js`
- Move: `tfd-system/extractors/nikke.js` -> `src/features/sites/game/nikke-extractor.js`
- Move: `tfd-system/extractors/pchome.js` -> `src/features/sites/shop/pchome-extractor.js`
- Move: `tfd-system/extractors/pornhub.js` -> `src/features/sites/adult/pornhub-extractor.js`
- Move: `tfd-system/extractors/xfastest.js` -> `src/features/sites/forum/xfastest-extractor.js`

- [x] Create target domain folders under `src/features/sites/`.
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
- [x] Add canonical site extractor paths to the file index.
- [x] Add canonical implementation rows to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for each moved implementation and adapter.
- [x] Verify old adapters export the same classes as new canonical modules.
- [x] Require `tfd-system/extractors/index.js` and confirm manager load for moved site keys.
- [x] Search for old/new paths and class names.
- [x] Run `git diff --check`.
- [x] Review changed files, old paths, adapters, imports, index references, docs, and staging scope before committing.
