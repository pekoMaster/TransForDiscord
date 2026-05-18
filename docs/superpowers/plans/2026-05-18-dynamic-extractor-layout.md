# Dynamic Extractor Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the generic dynamic-page extractor into core extraction while preserving the legacy extractor path.

**Architecture:** `src/core/extraction/` owns shared extraction fallback helpers. `tfd-system/extractors/dynamic.js` remains a compatibility adapter for the extractor registry.

---

### Task 1: Move Implementation

**Files:**
- Move: `tfd-system/extractors/dynamic.js` -> `src/core/extraction/dynamic-extractor.js`

- [x] Move implementation with `git mv`.
- [x] Update shared browser import to `../../shared/browser/playwright-semantic-browser`.
- [x] Update logger import to `../../shared/logging/tfd-logger`.
- [x] Keep screenshot path at project-root `temp/`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `tfd-system/extractors/dynamic.js`

- [x] Replace old path with adapter to `src/core/extraction/dynamic-extractor`.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old dynamic extractor path as `done-adapter`.
- [x] Add canonical core extraction path to the refactor map and file index.

### Task 4: Verify and Review

- [x] Run `node --check` for canonical implementation and adapter.
- [x] Verify old adapter exports the same module as canonical path.
- [x] Verify screenshot path still resolves to project-root `temp/`.
- [x] Search for dynamic extractor references.
- [x] Run `git diff --check`.
- [x] Review changed files, adapter, imports, call sites, docs, and staging scope before committing.
