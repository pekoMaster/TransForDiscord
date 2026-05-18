# Facebook Disabled Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove disabled Facebook runtime code from TFD because Facebook support is closed.

**Architecture:** TFD should not register, match, extract, or specially render Facebook links. Historical plans can remain, but runtime code and active file indexes should no longer carry Facebook extractor code.

**Compatibility note:** This phase intentionally does not keep adapters for Facebook extractor paths because the feature is closed and `tfd-system/extractors/index.js` does not register Facebook extractors.

---

### Task 1: Remove Runtime Facebook Code

**Files:**
- Delete: `tfd-system/extractors/facebook.js`
- Delete: `tfd-system/extractors/facebook-smart.js`
- Delete: `tfd-system/extractors/facebook-mbasic.js`
- Delete: `tfd-system/extractors/facebook-with-login.js`
- Delete: `tfd-system/extractors/facebookez.js`
- Delete: `src/features/sites/facebook/strategies/mbasic.js`
- Delete: `src/features/sites/facebook/strategies/with-login.js`
- Delete: `src/features/sites/facebook/strategies/facebookez.js`
- Modify: `src/core/routing/url-patterns.js`
- Modify: `src/core/routing/url-matcher.js`
- Modify: `tfd-system/core/message-handler-v2.js`
- Modify: `tfd-system/config/pekoembed-config.json`

- [x] Delete disabled Facebook extractor and strategy files.
- [x] Remove Facebook URL patterns and extracted-data mapping.
- [x] Remove Facebook full-URL matching exception.
- [x] Remove Facebook-specific message send branch.
- [x] Remove `facebookPreview` config block.

### Task 2: Update Documentation and Inventory

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Modify: `CLAUDE.md`
- Modify: `docs/discord/intent-application.md`

- [x] Remove active Facebook extractor rows from the file index.
- [x] Mark Facebook remove-pending rows as `done-removed`.
- [x] Remove Facebook from active feature guidance.
- [x] Keep historical plans untouched as archive evidence.

### Task 3: Verify and Review

- [x] Run `node --check` for changed runtime files.
- [x] Require `ExtractorManager` and confirm Facebook is not registered.
- [x] Verify URL matcher no longer matches a Facebook URL.
- [x] Search for remaining active Facebook/runtime references and classify docs/history.
- [x] Run `git diff --check`.
- [x] Review deleted files, routing behavior, config cleanup, docs, and staging scope before committing.
