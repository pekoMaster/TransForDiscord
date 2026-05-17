# Bahamut Extractor Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Bahamut extractor into the existing Bahamut site feature folder while keeping the legacy extractor path stable.

**Architecture:** `src/features/sites/bahamut/` becomes the canonical Bahamut feature folder for both auth and extraction. `tfd-system/extractors/bahamut.js` remains a thin adapter so `ExtractorManager` and URL routing do not change in this batch.

**Tech Stack:** Node.js CommonJS modules, axios, cheerio, Discord.js embeds, shared logging helpers.

---

### Task 1: Move Bahamut Extractor

**Files:**
- Move: `tfd-system/extractors/bahamut.js` -> `src/features/sites/bahamut/bahamut-extractor.js`

- [x] Move the extractor with `git mv`.
- [x] Change `BahamutAuth` import to `./bahamut-auth`.
- [x] Change shared logging imports to `../../../shared/logging/*`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `tfd-system/extractors/bahamut.js`

- [x] Replace the old path with `module.exports = require('../../src/features/sites/bahamut/bahamut-extractor')`.
- [x] Keep `tfd-system/extractors/index.js` unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old extractor path as `done-adapter`.
- [x] Add canonical Bahamut extractor path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same class as the new canonical module.
- [x] Require `tfd-system/extractors/index.js` and confirm Bahamut manager load.
- [x] Search for old/new paths and Bahamut import references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, index references, docs, and staging scope before committing.
