# TFD Shared URL Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move URL repost statistics from `tfd-system/utils/url-stats.js` to `src/shared/analytics/url-stats.js` without changing persistence path, URL normalization, 7-day window behavior, or public API shape.

**Architecture:** The implementation belongs under shared analytics because both message processing and Twitter interaction views consume the same URL stats service. Keep `tfd-system/utils/url-stats.js` as a legacy adapter while direct runtime consumers move to the shared path.

**Tech Stack:** Node.js CommonJS, built-in `fs`/`path`, existing TFD logger, local no-real-data smoke script.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `5d039ce refactor: move url converter logger to shared logging`.
- Keep `tfd-system/utils/url-stats.js` as an adapter.
- Do not create, edit, delete, or read real `data/url-stats.json`.
- Do not change `recordUrl(url, guildId, channelId)` or `lookupUrl(url, guildId, channelId)` return shape.
- Do not stage unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/analytics/url-stats.js` | Real URL stats implementation. Reads/writes project-root `data/url-stats.json` and logs through shared TFD logger. |
| `tfd-system/utils/url-stats.js` | Legacy adapter re-exporting `src/shared/analytics/url-stats.js`. |
| `scripts/url-stats-smoke.js` | Verifies shared and legacy imports match, record/lookup counts, Twitter URL normalization, missing input, window reset, TTL prune, and file write behavior with mocked `fs`. |
| `tfd-system/core/message-handler-v2.js` | Update `recordUrl` import to shared analytics. |
| `src/features/twitter/interactions/media-pagination.js` | Update `lookupUrl` import to shared analytics. |
| `src/features/twitter/interactions/v2/view-updater.js` | Update `lookupUrl` import to shared analytics. |
| `doc/system/FILE_INDEX.md` | Records shared analytics helper and old adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Marks URL stats as moved with adapter. |
| `CLAUDE.md` | Adds shared analytics helper to quick map. |

## Task 1: Add Smoke Coverage

- [x] Create `scripts/url-stats-smoke.js`.
- [x] Monkey-patch `fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync`, `fs.renameSync`, and `fs.mkdirSync` only for paths ending in `data/url-stats.json` or `data/url-stats.json.tmp`; restore all functions in `finally`.
- [x] Assert `require('../tfd-system/utils/url-stats') === require('../src/shared/analytics/url-stats')`.
- [x] Verify missing input returns `{ channel: 0, guild: 0, total: 0 }`.
- [x] Verify `recordUrl()` increments channel/guild/total counts.
- [x] Verify `lookupUrl()` reads without incrementing counts.
- [x] Verify Twitter/X/vxtwitter/fxtwitter URLs normalize to the same tweet ID key.
- [x] Verify a stale `windowStart` resets the stats window.
- [x] Verify stale per-URL entries are pruned on record.
- [x] Run `node scripts\url-stats-smoke.js`; expected output: `url-stats smoke ok`.

## Task 2: Move Implementation With Adapter

- [x] Create `src/shared/analytics/` if missing.
- [x] Move implementation to `src/shared/analytics/url-stats.js`.
- [x] Change logger import from `../../utils/tfd-logger` to `../logging/tfd-logger`.
- [x] Change `STATS_FILE` from `path.join(__dirname, '../../data/url-stats.json')` to `path.join(__dirname, '..', '..', '..', 'data', 'url-stats.json')`.
- [x] Preserve public exports: `recordUrl`, `lookupUrl`.
- [x] Replace `tfd-system/utils/url-stats.js` with `module.exports = require('../../src/shared/analytics/url-stats');`.

## Task 3: Update Runtime Imports

- [x] Update `tfd-system/core/message-handler-v2.js` import from `../utils/url-stats` to `../../src/shared/analytics/url-stats`.
- [x] Update `src/features/twitter/interactions/media-pagination.js` import from `../../../../tfd-system/utils/url-stats` to `../../../shared/analytics/url-stats`.
- [x] Update `src/features/twitter/interactions/v2/view-updater.js` import from `../../../../../tfd-system/utils/url-stats` to `../../../../shared/analytics/url-stats`.
- [x] Run `rg -n "url-stats|shared/analytics/url-stats|recordUrl|lookupUrl"` and verify old runtime paths are adapter-only or documentation.

## Task 4: Documentation And Inventory

- [x] Add `src/shared/analytics/` section to `doc/system/FILE_INDEX.md`.
- [x] Mark `tfd-system/utils/url-stats.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [x] Add `scripts/url-stats-smoke.js` to the scripts section in `doc/system/FILE_INDEX.md`.
- [x] Update `CLAUDE.md` quick map with the new shared analytics path.
- [x] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` to `done-adapter`.

## Task 5: Verification And Review

- [x] Run `node scripts\url-stats-smoke.js`.
- [x] Run `node --check src\shared\analytics\url-stats.js`.
- [x] Run `node --check tfd-system\utils\url-stats.js`.
- [x] Run `node --check scripts\url-stats-smoke.js`.
- [x] Run `node --check` on changed runtime consumers.
- [x] Run a require-load check for shared implementation, legacy adapter, and changed runtime consumers.
- [x] Compare old `HEAD:tfd-system/utils/url-stats.js` behavior against new shared implementation for record/lookup, Twitter normalization, missing input, window reset, and TTL prune.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review changed files, old adapter path, docs/index, search output, and staged files to confirm unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` are excluded.
- [x] Commit locally with `refactor: move url stats to shared analytics`.

## Review Criteria

- Existing old imports continue to work through `tfd-system/utils/url-stats.js`.
- Runtime message/Twitter consumers import `src/shared/analytics/url-stats.js`.
- Real data path remains project-root `data/url-stats.json`.
- Public return shape remains `{ channel, guild, total }`.
- Smoke and parity checks do not touch real data files.

## Execution Review

- `scripts/url-stats-smoke.js` passed with mocked `fs` methods and did not touch real `data/url-stats.json`.
- `node --check` passed for the shared implementation, legacy adapter, smoke script, `tfd-system/core/message-handler-v2.js`, `src/features/twitter/interactions/media-pagination.js`, and `src/features/twitter/interactions/v2/view-updater.js`.
- Require-load passed for the shared implementation, legacy adapter, and changed runtime consumers when each module was loaded in a separate child process to avoid existing require-time handles.
- Parity check passed against `HEAD:tfd-system/utils/url-stats.js` for missing input, record/lookup counts, Twitter URL normalization, stale window reset, and TTL prune.
- `rg` confirmed old URL stats runtime paths are adapter-only; remaining `recordUrl` in `utils/abuse-detector.js` is a separate abuse detector API, not this URL stats module.
- `git diff --check` passed with only CRLF normalization warnings and no whitespace errors.
- Staged review included only this phase's ten files and excluded unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/`.
