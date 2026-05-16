# TFD Shared URL Converter Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the URL conversion logging helper from `tfd-system/utils/url-converter-logger.js` to `src/shared/logging/url-converter-logger.js` without changing platform labels, log output format, or extractor call sites.

**Architecture:** The real implementation belongs with shared logging utilities because it is a cross-extractor logger, not an extractor-specific helper. Keep `tfd-system/utils/url-converter-logger.js` as a legacy adapter while direct runtime consumers move to the shared path.

**Tech Stack:** Node.js CommonJS, existing shared TFD logger, extractor modules, local smoke script.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `066d6e6 refactor: move tunnel url provider to shared web`.
- Keep `tfd-system/utils/url-converter-logger.js` as an adapter.
- Do not change log format, platform labels, fallback values, or static method names.
- Do not stage unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/logging/url-converter-logger.js` | Real `URLConverterLogger` implementation. Depends on `src/shared/logging/tfd-logger.js`. |
| `tfd-system/utils/url-converter-logger.js` | Legacy adapter re-exporting `src/shared/logging/url-converter-logger.js`. |
| `scripts/url-converter-logger-smoke.js` | Verifies shared and legacy imports match, platform label mapping, conversion log output, error log output, and fallback message fields. |
| `tfd-system/extractors/*.js` | Update direct imports to `../../src/shared/logging/url-converter-logger`. |
| `src/features/twitter/extractors/twitter-v2-extractor.js` | Update direct import to `../../../shared/logging/url-converter-logger`. |
| `doc/system/FILE_INDEX.md` | Records shared logging helper and old adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Marks URL converter logger as moved with adapter. |
| `CLAUDE.md` | Adds shared logging helper to quick map. |

## Task 1: Add Smoke Coverage

- [x] Create `scripts/url-converter-logger-smoke.js`.
- [x] Assert `require('../tfd-system/utils/url-converter-logger') === require('../src/shared/logging/url-converter-logger')`.
- [x] Assert selected `PLATFORM_LABELS` values: `twitter -> X`, `instagram -> IG`, `bahamut-gnn -> GNN`, `pokewiki -> PokeWiki`.
- [x] Stub `console.log` and verify `logConversion('twitter', message, 'https://vxtwitter.com/a')` includes `[網址轉換] [Guild] [channel] [Display] [X] https://vxtwitter.com/a`.
- [x] Stub `console.log` and verify fallback message fields become `[—] [—] [—]` and unknown platform becomes uppercase.
- [x] Stub `console.error` and verify `logError('pixiv', originalURL, 'broken')` includes `[Pixiv] ❌ ${originalURL} - broken`.
- [x] Run `node scripts\url-converter-logger-smoke.js`; expected output: `url-converter-logger smoke ok`.

## Task 2: Move Implementation With Adapter

- [x] Move implementation to `src/shared/logging/url-converter-logger.js`.
- [x] Change logger import from `../../utils/tfd-logger` to `./tfd-logger`.
- [x] Preserve public class name `URLConverterLogger`.
- [x] Preserve public static members: `PLATFORM_LABELS`, `logConversion`, `logError`.
- [x] Replace `tfd-system/utils/url-converter-logger.js` with `module.exports = require('../../src/shared/logging/url-converter-logger');`.

## Task 3: Update Runtime Imports

- [x] Update `tfd-system/extractors/4gamers.js`, `52poke.js`, `bahamut.js`, `bilibili.js`, `cts.js`, `facebook.js`, `instagram.js`, `line-today.js`, `msn.js`, `nikke.js`, `pixiv.js`, `pornhub.js`, `storm.js`, `udn.js`, and `xfastest.js` from `../utils/url-converter-logger` to `../../src/shared/logging/url-converter-logger`.
- [x] Update `src/features/twitter/extractors/twitter-v2-extractor.js` from `../../../../tfd-system/utils/url-converter-logger` to `../../../shared/logging/url-converter-logger`.
- [x] Run `rg -n "url-converter-logger|shared/logging/url-converter-logger|URLConverterLogger"` and verify old runtime paths are adapter-only or documentation.

## Task 4: Documentation And Inventory

- [x] Add `url-converter-logger.js` to `src/shared/logging/` section in `doc/system/FILE_INDEX.md`.
- [x] Mark `tfd-system/utils/url-converter-logger.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [x] Add `scripts/url-converter-logger-smoke.js` to the scripts section in `doc/system/FILE_INDEX.md`.
- [x] Update `CLAUDE.md` quick map with the new shared logger path.
- [x] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` to `done-adapter`.

## Task 5: Verification And Review

- [x] Run `node scripts\url-converter-logger-smoke.js`.
- [x] Run `node scripts\tfd-logger-smoke.js`.
- [x] Run `node --check src\shared\logging\url-converter-logger.js`.
- [x] Run `node --check tfd-system\utils\url-converter-logger.js`.
- [x] Run `node --check scripts\url-converter-logger-smoke.js`.
- [x] Run `node --check` on changed extractor files.
- [x] Run a require-load check for the shared implementation, legacy adapter, and changed extractor modules. Stub existing optional browser dependencies such as `puppeteer` and `playwright` when loading Facebook modules.
- [x] Compare old `HEAD:tfd-system/utils/url-converter-logger.js` behavior against the new shared implementation for platform labels, conversion output, fallback output, and error output.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review changed files, old adapter path, docs/index, search output, and staged files to confirm unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` are excluded.
- [x] Commit locally with `refactor: move url converter logger to shared logging`.

## Review Criteria

- Existing old imports continue to work through `tfd-system/utils/url-converter-logger.js`.
- Runtime extractor imports use `src/shared/logging/url-converter-logger.js`.
- Log output format remains unchanged.
- Platform label mapping remains unchanged.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- Initial PowerShell bulk import replacement corrupted UTF-8 text in extractor files; those self-made changes were immediately restored from `HEAD`, then imports were reapplied with `apply_patch` one line at a time.
- `scripts/url-converter-logger-smoke.js` and `scripts/tfd-logger-smoke.js` passed.
- `node --check` passed for the shared implementation, legacy adapter, smoke script, and every changed extractor/Twitter runtime file.
- Require-load passed for the shared implementation, legacy adapter, and changed runtime modules with existing optional browser dependencies (`puppeteer`, `playwright`) stubbed.
- Parity check passed against `HEAD:tfd-system/utils/url-converter-logger.js` for platform labels, conversion output, fallback output, and error output.
- `rg` confirmed old URL converter logger runtime paths are adapter-only; remaining mentions are documentation, smoke, and the new shared implementation.
- `git diff --check` passed with only CRLF normalization warnings and no whitespace errors.
- Staged review included only this phase's files and excluded unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/`.
