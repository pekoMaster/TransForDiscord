# Facebook Strategy Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Facebook strategy extractors into the Facebook site feature folder while preserving legacy extractor imports.

**Architecture:** `src/features/sites/facebook/strategies/` owns individual Facebook fallback strategies. `tfd-system/extractors/facebook-*.js` legacy paths remain compatibility adapters for the current extractor registry and `facebook-smart.js`.

---

### Task 1: Move Strategy Implementations

**Files:**
- Move: `tfd-system/extractors/facebook-mbasic.js` -> `src/features/sites/facebook/strategies/mbasic.js`
- Move: `tfd-system/extractors/facebook-with-login.js` -> `src/features/sites/facebook/strategies/with-login.js`
- Move: `tfd-system/extractors/facebookez.js` -> `src/features/sites/facebook/strategies/facebookez.js`

- [x] Move implementations with `git mv`.
- [x] Update logger imports to `../../../../shared/logging/tfd-logger`.
- [x] Update `facebookez` shared helper imports to `../../../../shared/*`.
- [x] Keep Facebook session/auth paths at project-root `data/`.

### Task 2: Preserve Legacy Paths

**Files:**
- Create: `tfd-system/extractors/facebook-mbasic.js`
- Create: `tfd-system/extractors/facebook-with-login.js`
- Create: `tfd-system/extractors/facebookez.js`

- [x] Replace old paths with adapters to `src/features/sites/facebook/strategies/*`.
- [x] Keep `tfd-system/extractors/facebook-smart.js` imports unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old Facebook strategy paths as `done-adapter`.
- [x] Add canonical Facebook strategy paths to the refactor map and file index.

### Task 4: Verify and Review

- [x] Run `node --check` for canonical implementations and adapters.
- [x] Verify old adapters export the same modules as canonical paths.
- [x] Verify Facebook session/auth paths still resolve to project-root `data/`.
- [x] Run syntax check for `tfd-system/extractors/facebook-smart.js`.
- [x] Search for Facebook strategy references.
- [x] Run `git diff --check`.
- [x] Review changed files, adapters, imports, call sites, docs, and staging scope before committing.
