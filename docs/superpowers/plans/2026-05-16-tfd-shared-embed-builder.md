# TFD Shared Embed Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the generic Discord embed builder from `tfd-system/utils/embed-builder.js` to `src/shared/discord/embed-builder.js` without changing extractor embed output.

**Architecture:** The real implementation belongs under shared Discord helpers because it creates generic `EmbedBuilder` instances for multiple extractors. Keep `tfd-system/utils/embed-builder.js` as a legacy adapter while direct runtime consumers move to the shared path.

**Tech Stack:** Node.js CommonJS, Discord.js `EmbedBuilder`, local smoke scripts, extractor modules.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `1769733 refactor: move dom parser to shared html`.
- Keep `tfd-system/utils/embed-builder.js` as an adapter.
- Do not change embed field names, colors, number/date/duration formatting, truncation behavior, or public method names.
- Do not split extractor behavior in this phase; only update import paths.
- Do not stage unrelated untracked `SQL/migrate_blacklist_from_4.0.sql`.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/discord/embed-builder.js` | Real `TFDEmbedBuilder` implementation. |
| `tfd-system/utils/embed-builder.js` | Legacy adapter re-exporting `src/shared/discord/embed-builder.js`. |
| `scripts/embed-builder-smoke.js` | Verifies shared and legacy imports match plus basic/social/artwork/forum/video/error embed behavior. |
| `tfd-system/extractors/ptt.js` | Update runtime import to shared embed builder. |
| `tfd-system/extractors/instagram.js` | Update runtime import to shared embed builder. |
| `tfd-system/extractors/pixiv.js` | Update runtime import to shared embed builder. |
| `tfd-system/extractors/threads.js` | Update runtime import to shared embed builder. |
| `tfd-system/extractors/facebookez.js` | Update runtime import to shared embed builder. |
| `tfd-system/extractors/facebook.js` | Update runtime import to shared embed builder. |
| `src/features/twitter/extractors/twitter-legacy-extractor.js` | Update runtime import to shared embed builder. |
| `doc/system/FILE_INDEX.md` | Record shared helper and legacy adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Mark embed builder as moved with adapter. |
| `CLAUDE.md` | Add shared embed builder location to the quick map. |

## Task 1: Add Smoke Coverage

- [ ] Create `scripts/embed-builder-smoke.js`.
- [ ] Assert `require('../tfd-system/utils/embed-builder') === require('../src/shared/discord/embed-builder')`.
- [ ] Assert `createBasicEmbed()` sets title, description, URL, image, color, author, footer, and timestamp.
- [ ] Assert `createSocialMediaEmbed()`, `createArtworkEmbed()`, `createForumEmbed()`, and `createVideoEmbed()` add expected fields.
- [ ] Assert `createErrorEmbed()` sets red color, title, description, and optional URL.
- [ ] Assert helper methods `truncateText()`, `formatNumber()`, `formatDuration()`, `formatDate()`, and `getSiteColor()` keep expected outputs.
- [ ] Run `node scripts\embed-builder-smoke.js`; expected output: `embed-builder smoke ok`.

## Task 2: Move Implementation With Adapter

- [ ] Move implementation to `src/shared/discord/embed-builder.js`.
- [ ] Preserve public class name `TFDEmbedBuilder`.
- [ ] Preserve all public methods: `createBasicEmbed`, `createSocialMediaEmbed`, `createArtworkEmbed`, `createForumEmbed`, `createVideoEmbed`, `createErrorEmbed`, `truncateText`, `formatNumber`, `formatDuration`, `formatDate`, `getSiteColor`.
- [ ] Replace `tfd-system/utils/embed-builder.js` with `module.exports = require('../../src/shared/discord/embed-builder');`.

## Task 3: Update Runtime Imports

- [ ] Update `tfd-system/extractors/ptt.js` from `../utils/embed-builder` to `../../src/shared/discord/embed-builder`.
- [ ] Update `tfd-system/extractors/instagram.js` from `../utils/embed-builder` to `../../src/shared/discord/embed-builder`.
- [ ] Update `tfd-system/extractors/pixiv.js` from `../utils/embed-builder` to `../../src/shared/discord/embed-builder`.
- [ ] Update `tfd-system/extractors/threads.js` from `../utils/embed-builder` to `../../src/shared/discord/embed-builder`.
- [ ] Update `tfd-system/extractors/facebookez.js` from `../utils/embed-builder` to `../../src/shared/discord/embed-builder`.
- [ ] Update `tfd-system/extractors/facebook.js` from `../utils/embed-builder` to `../../src/shared/discord/embed-builder`.
- [ ] Update `src/features/twitter/extractors/twitter-legacy-extractor.js` to `../../../shared/discord/embed-builder`.
- [ ] Run `rg -n "tfd-system/utils/embed-builder|utils/embed-builder|shared/discord/embed-builder|embed-builder.js"` and verify old runtime paths are adapter-only or historical docs.

## Task 4: Documentation And Inventory

- [ ] Add `embed-builder.js` to the `src/shared/discord/` section in `doc/system/FILE_INDEX.md`.
- [ ] Mark `tfd-system/utils/embed-builder.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [ ] Update `CLAUDE.md` quick map with the new shared embed builder path.
- [ ] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` to `done-adapter`.

## Task 5: Verification And Review

- [ ] Run `node scripts\embed-builder-smoke.js`.
- [ ] Run `node scripts\dom-parser-smoke.js`.
- [ ] Run `node scripts\translation-smoke.js`.
- [ ] Run `node --check src\shared\discord\embed-builder.js`.
- [ ] Run `node --check tfd-system\utils\embed-builder.js`.
- [ ] Run `node --check` on changed extractor files.
- [ ] Run a require-load check for shared embed builder, legacy adapter, and changed extractor modules.
- [ ] Compare old `HEAD:tfd-system/utils/embed-builder.js` behavior against new shared implementation for representative embed cases.
- [ ] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [ ] Review changed files, old adapter path, docs/index, `rg` output, and staged files to confirm `SQL/` is excluded.
- [ ] Commit locally with `refactor: move embed builder to shared discord`.

## Review Criteria

- Existing old imports continue to work through `tfd-system/utils/embed-builder.js`.
- New shared path follows naming convention: `src/shared/discord/embed-builder.js`.
- Runtime extractor files import the shared path directly.
- Public method behavior is covered by smoke tests and parity check.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- Status: implemented locally, pending final commit.
- Restore point before this phase: `1769733 refactor: move dom parser to shared html`.
- Runtime import review: PTT, Instagram, Pixiv, Threads, FacebookEZ, Facebook, and Twitter legacy extractors now import `src/shared/discord/embed-builder`.
- Legacy adapter review: `tfd-system/utils/embed-builder.js` re-exports the shared implementation for old paths and historical docs.
- Behavior review: compared the old implementation from `HEAD:tfd-system/utils/embed-builder.js` against the new shared implementation for basic, social, artwork, forum, video, and error embed cases; outputs matched. Timestamp was excluded from the VM parity check because Discord.js rejects cross-context `Date` objects in this test harness, while direct smoke coverage verifies timestamp still serializes.
- Verification review: smoke tests, syntax checks, require-load with a `puppeteer` stub for the existing Facebook optional dependency, `rg` path scan, and `git diff --check` passed; `git diff --check` only reported CRLF warnings.
- Staging review: unrelated untracked `SQL/migrate_blacklist_from_4.0.sql` must remain unstaged.
