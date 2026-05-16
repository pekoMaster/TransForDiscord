# TFD Shared Text Truncator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Discord-safe text truncation from `tfd-system/utils/text-truncator.js` to `src/shared/discord/text-truncator.js` without changing display behavior.

**Architecture:** Add the real implementation under shared Discord helpers, because the class enforces Discord-facing text length and URL-preservation behavior. Keep `tfd-system/utils/text-truncator.js` as a legacy adapter so older imports keep working while runtime feature code can move to the shared path.

**Tech Stack:** Node.js CommonJS, local smoke scripts, Twitter feature modules, existing TFD file inventory.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `a72ca2b refactor: move crypto helper to shared crypto`.
- Keep `tfd-system/utils/text-truncator.js` as an adapter.
- Do not change truncation limits, CJK weighting, URL extraction, smart word-boundary truncation, or return object shape.
- Do not edit high-risk message pipeline files unless only import path review proves they are direct consumers.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/discord/text-truncator.js` | Real `TextTruncator` implementation. |
| `tfd-system/utils/text-truncator.js` | Legacy adapter re-exporting `src/shared/discord/text-truncator.js`. |
| `scripts/text-truncator-smoke.js` | Verifies shared and legacy imports match, CJK weighting, no-truncate, truncate, URL preservation, and `processTweetContent()` shape. |
| `src/features/twitter/interactions/translation.js` | Update runtime import to shared truncator. |
| `src/features/twitter/interactions/toggle-all.js` | Update runtime import to shared truncator. |
| `src/features/twitter/interactions/expand.js` | Update runtime import to shared truncator. |
| `src/features/twitter/extractors/twitter-v2-extractor.js` | Update runtime import to shared truncator. |
| `src/features/twitter/containers/v2-container-builder.js` | Update runtime import to shared truncator. |
| `doc/system/FILE_INDEX.md` | Record shared helper and legacy adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Mark text truncator as moved with adapter. |
| `CLAUDE.md` | Add text truncator shared location to the quick map. |

## Task 1: Add Smoke Coverage

- [ ] Create `scripts/text-truncator-smoke.js`.
- [ ] Assert `require('../tfd-system/utils/text-truncator') === require('../src/shared/discord/text-truncator')`.
- [ ] Assert `calculateCharacterCount('abc中文') === 7`.
- [ ] Assert short text returns `isTruncated: false` and preserves text.
- [ ] Assert long English text truncates and ends with `...(其餘請進入原推文觀看)`.
- [ ] Assert a URL cut by truncation is preserved in appended form.
- [ ] Assert `processTweetContent()` returns `{ text, isTruncated, fullText }`.
- [ ] Run `node scripts\text-truncator-smoke.js`; expected output: `text-truncator smoke ok`.

## Task 2: Move Implementation With Adapter

- [ ] Create `src/shared/discord/text-truncator.js`.
- [ ] Implement the same public class name and methods: `calculateCharacterCount`, `isCJKCharacter`, `truncateText`, `extractURLs`, `protectURLs`, `smartTruncate`, `isEnglishLetter`, `isWordBoundary`, `processTweetContent`.
- [ ] Preserve `maxCharacters = 300`.
- [ ] Preserve `truncateMessage = '...(其餘請進入原推文觀看)'`.
- [ ] Replace `tfd-system/utils/text-truncator.js` with `module.exports = require('../../src/shared/discord/text-truncator');`.

## Task 3: Update Runtime Imports

- [ ] Replace direct runtime imports in Twitter feature files with `src/shared/discord/text-truncator`.
- [ ] Leave historical plan files untouched unless they describe current inventory.
- [ ] Run `rg -n "tfd-system/utils/text-truncator|shared/discord/text-truncator|text-truncator.js"` and verify old runtime paths are adapter-only or historical docs.

## Task 4: Documentation And Inventory

- [ ] Add `text-truncator.js` to the `src/shared/discord/` section in `doc/system/FILE_INDEX.md`.
- [ ] Mark `tfd-system/utils/text-truncator.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [ ] Update `CLAUDE.md` quick map with the new shared text truncator path.
- [ ] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` to `done-adapter`.

## Task 5: Verification And Review

- [ ] Run `node scripts\text-truncator-smoke.js`.
- [ ] Run `node scripts\component-sanitizer-smoke.js`.
- [ ] Run `node scripts\spoiler-button-helper-smoke.js`.
- [ ] Run `node scripts\message-helpers-smoke.js`.
- [ ] Run `node scripts\translation-smoke.js`.
- [ ] Run `node --check src\shared\discord\text-truncator.js`.
- [ ] Run `node --check tfd-system\utils\text-truncator.js`.
- [ ] Run `node --check` on changed Twitter feature files.
- [ ] Run a require-load check for shared truncator, legacy adapter, and changed Twitter modules.
- [ ] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [ ] Review changed files, old adapter path, docs/index, and `rg` output.
- [ ] Commit locally with `refactor: move text truncator to shared discord`.

## Review Criteria

- Existing old imports continue to work through `tfd-system/utils/text-truncator.js`.
- New shared path follows naming convention: `src/shared/discord/text-truncator.js`.
- Twitter runtime files import the shared path directly.
- Truncation output, URL protection, and return object shapes are covered by smoke tests.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- Status: implemented locally, pending final commit.
- Restore point before this phase: `a72ca2b refactor: move crypto helper to shared crypto`.
- Runtime import review: Twitter translation, expand, toggle-all, V2 extractor, and V2 container builder now import `src/shared/discord/text-truncator`.
- Legacy adapter review: `tfd-system/utils/text-truncator.js` re-exports the shared implementation for old paths and historical docs.
- Behavior review: compared the old implementation from `HEAD:tfd-system/utils/text-truncator.js` against the new shared implementation for short text, mixed CJK text, long text, URL truncation, and long English word-boundary cases; outputs matched.
- Verification review: smoke tests, syntax checks, require-load, `rg` path scan, and `git diff --check` passed; `git diff --check` only reported CRLF warnings.
