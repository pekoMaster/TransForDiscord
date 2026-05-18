# URL Routing Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move URL matcher and URL regex patterns into core routing while preserving existing `tfd-system/regex/*` imports.

**Architecture:** `src/core/routing/` owns URL matching primitives. `tfd-system/regex/*.js` remain compatibility adapters for current link-processor imports.

---

### Task 1: Move Routing Primitives

**Files:**
- Move: `tfd-system/regex/matcher.js` -> `src/core/routing/url-matcher.js`
- Move: `tfd-system/regex/patterns.js` -> `src/core/routing/url-patterns.js`

- [x] Move both implementations with `git mv`.
- [x] Update matcher pattern import to `./url-patterns`.

### Task 2: Preserve Legacy Paths

**Files:**
- Create: `tfd-system/regex/matcher.js`
- Create: `tfd-system/regex/patterns.js`

- [x] Replace old paths with adapters to `src/core/routing/*`.
- [x] Keep `tfd-system/core/link-processor.js` import unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old regex paths as `done-adapter`.
- [x] Add canonical core routing paths to the refactor map and file index.

### Task 4: Verify and Review

- [x] Run `node --check` for canonical implementations and adapters.
- [x] Verify old adapters export the same modules as canonical paths.
- [x] Run syntax check for `tfd-system/core/link-processor.js`.
- [x] Smoke test URLMatcher extraction/matching.
- [x] Search for matcher/pattern references.
- [x] Run `git diff --check`.
- [x] Review changed files, adapters, imports, call sites, docs, and staging scope before committing.
