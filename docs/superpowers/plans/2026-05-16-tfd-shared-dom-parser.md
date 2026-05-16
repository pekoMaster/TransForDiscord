# TFD Shared DOM Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Cheerio DOM parsing helper from `tfd-system/utils/dom-parser.js` to `src/shared/html/dom-parser.js` without changing extractor behavior.

**Architecture:** The real DOM helper belongs under shared HTML utilities because it is used across multiple extractors and is not tied to `tfd-system`. Keep `tfd-system/utils/dom-parser.js` as a legacy adapter while direct runtime consumers move to the shared path.

**Tech Stack:** Node.js CommonJS, Cheerio, local smoke scripts, extractor modules.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `38ae2f0 refactor: move text truncator to shared discord`.
- Keep `tfd-system/utils/dom-parser.js` as an adapter.
- Do not change selector priority, metadata cleanup, return object shape, or Cheerio parser options.
- Do not refactor extractor internals in this phase; only update import paths.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/html/dom-parser.js` | Real `DOMParser` implementation. |
| `tfd-system/utils/dom-parser.js` | Legacy adapter re-exporting `src/shared/html/dom-parser.js`. |
| `scripts/dom-parser-smoke.js` | Verifies shared and legacy imports match, metadata extraction, text/attribute/multiple extraction, and element existence checks. |
| `tfd-system/extractors/ptt.js` | Update runtime import to shared DOM parser. |
| `tfd-system/extractors/instagram.js` | Update runtime import to shared DOM parser. |
| `tfd-system/extractors/pixiv.js` | Update runtime import to shared DOM parser. |
| `src/features/twitter/extractors/twitter-legacy-extractor.js` | Update runtime import to shared DOM parser. |
| `doc/system/FILE_INDEX.md` | Record shared helper and legacy adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Mark DOM parser as moved with adapter. |
| `CLAUDE.md` | Add shared HTML parser location to the quick map. |

## Task 1: Add Smoke Coverage

- [ ] Create `scripts/dom-parser-smoke.js`.
- [ ] Assert `require('../tfd-system/utils/dom-parser') === require('../src/shared/html/dom-parser')`.
- [ ] Assert `extractMetadata()` respects `og:title`, description, image, canonical URL, site name, author, published time, and keywords.
- [ ] Assert `extractText()`, `extractAttribute()`, `extractMultiple()`, and `hasElement()` work.
- [ ] Run `node scripts\dom-parser-smoke.js`; expected output: `dom-parser smoke ok`.

## Task 2: Move Implementation With Adapter

- [ ] Create `src/shared/html/dom-parser.js`.
- [ ] Preserve `defaultOptions = { decodeEntities: true, normalizeWhitespace: true }`.
- [ ] Preserve all public methods: `parse`, `extractMetadata`, `extractTitle`, `extractDescription`, `extractImage`, `extractCanonicalURL`, `extractSiteName`, `extractAuthor`, `extractPublishedTime`, `extractKeywords`, `getFirstValid`, `cleanMetadata`, `extractText`, `extractAttribute`, `extractMultiple`, `hasElement`.
- [ ] Replace `tfd-system/utils/dom-parser.js` with `module.exports = require('../../src/shared/html/dom-parser');`.

## Task 3: Update Runtime Imports

- [ ] Update `tfd-system/extractors/ptt.js` from `../utils/dom-parser` to `../../src/shared/html/dom-parser`.
- [ ] Update `tfd-system/extractors/instagram.js` from `../utils/dom-parser` to `../../src/shared/html/dom-parser`.
- [ ] Update `tfd-system/extractors/pixiv.js` from `../utils/dom-parser` to `../../src/shared/html/dom-parser`.
- [ ] Update `src/features/twitter/extractors/twitter-legacy-extractor.js` to `../../../shared/html/dom-parser`.
- [ ] Run `rg -n "tfd-system/utils/dom-parser|utils/dom-parser|shared/html/dom-parser|dom-parser.js"` and verify old runtime paths are adapter-only or historical docs.

## Task 4: Documentation And Inventory

- [ ] Add `src/shared/html/` section to `doc/system/FILE_INDEX.md`.
- [ ] Mark `tfd-system/utils/dom-parser.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [ ] Update `CLAUDE.md` quick map with the new shared DOM parser path.
- [ ] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` to `done-adapter`.

## Task 5: Verification And Review

- [ ] Run `node scripts\dom-parser-smoke.js`.
- [ ] Run `node scripts\translation-smoke.js`.
- [ ] Run `node --check src\shared\html\dom-parser.js`.
- [ ] Run `node --check tfd-system\utils\dom-parser.js`.
- [ ] Run `node --check` on changed extractor files.
- [ ] Run a require-load check for shared DOM parser, legacy adapter, and changed extractor modules.
- [ ] Compare old `HEAD:tfd-system/utils/dom-parser.js` behavior against new shared implementation for representative HTML metadata cases.
- [ ] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [ ] Review changed files, old adapter path, docs/index, and `rg` output.
- [ ] Commit locally with `refactor: move dom parser to shared html`.

## Review Criteria

- Existing old imports continue to work through `tfd-system/utils/dom-parser.js`.
- New shared path follows naming convention: `src/shared/html/dom-parser.js`.
- Runtime extractor files import the shared path directly.
- Metadata extraction and utility method behavior are covered by smoke tests and parity check.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- Status: implemented locally, pending final commit.
- Restore point before this phase: `38ae2f0 refactor: move text truncator to shared discord`.
- Runtime import review: PTT, Instagram, Pixiv, and Twitter legacy extractors now import `src/shared/html/dom-parser`.
- Legacy adapter review: `tfd-system/utils/dom-parser.js` re-exports the shared implementation for old paths and historical docs.
- Behavior review: compared the old implementation from `HEAD:tfd-system/utils/dom-parser.js` against the new shared implementation for metadata, text, attribute, multiple element, and existence checks; outputs matched.
- Verification review: smoke tests, syntax checks, require-load, `rg` path scan, and `git diff --check` passed; `git diff --check` only reported CRLF warnings.
