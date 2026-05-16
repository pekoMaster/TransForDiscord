# TFD Moderation Normalize Author Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move blacklist author normalization from `utils/normalize-author.js` to `src/features/moderation/normalize-author.js` and make embed author/footer extraction compatible with both plain embed objects and Discord EmbedBuilder-style `embed.data`.

**Architecture:** This helper is moderation-owned because it prepares extractor results for blacklist matching. Keep `utils/normalize-author.js` as a legacy adapter while `message-handler-v2` imports the feature path directly.

**Tech Stack:** Node.js CommonJS, existing TFD message pipeline, local smoke script.

---

## Safety Boundaries

- Do not push or deploy.
- Current pre-phase restore point: `908c28f refactor: move url stats to shared analytics`.
- Keep `utils/normalize-author.js` as an adapter.
- Preserve public export name: `normalizeAuthorForBlacklist`.
- Keep existing author normalization behavior: trim and lowercase returned author values.
- Do not stage unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/moderation/normalize-author.js` | Real author normalization helper for blacklist matching. |
| `utils/normalize-author.js` | Legacy adapter re-exporting `src/features/moderation/normalize-author.js`. |
| `scripts/normalize-author-smoke.js` | Verifies adapter identity, Twitter/PTT/Pixiv/Instagram/unknown behavior, lowercase trimming, and `embed.data.author/footer` compatibility. |
| `tfd-system/core/message-handler-v2.js` | Update runtime import to feature path. |
| `doc/system/FILE_INDEX.md` | Records moderation helper and old adapter. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Marks normalize-author as moved with adapter. |
| `CLAUDE.md` | Updates quick map to point at the moderation feature path. |

## Task 1: Add Smoke Coverage

- [x] Create `scripts/normalize-author-smoke.js`.
- [x] Assert `require('../utils/normalize-author') === require('../src/features/moderation/normalize-author')`.
- [x] Verify Twitter `tweet.author.screen_name` is trimmed/lowercased and `uid` is stringified.
- [x] Verify Twitter plain `embed.author.name` fallback removes a leading `@`.
- [x] Verify PTT plain `embed.author.name` fallback works.
- [x] Verify Pixiv `embed.data.author.name` and `embed.data.footer.text` are supported.
- [x] Verify Instagram `embed.data.author.name` removes a leading `@`.
- [x] Verify unknown site returns `{ platform: siteName, author: null, uid: null }`.
- [x] Run `node scripts\normalize-author-smoke.js`; expected output: `normalize-author smoke ok`.

## Task 2: Move Implementation With Adapter

- [x] Create `src/features/moderation/` if missing.
- [x] Move implementation to `src/features/moderation/normalize-author.js`.
- [x] Add small helpers `getEmbedAuthorName(embed)` and `getEmbedFooterText(embed)` to support both `embed.author` / `embed.footer` and `embed.data.author` / `embed.data.footer`.
- [x] Replace all direct `result.embed.author.name` reads with `getEmbedAuthorName(result.embed)`.
- [x] Replace Pixiv footer read with `getEmbedFooterText(result.embed)`.
- [x] Preserve `normalizeAuthorForBlacklist(result, message)` export.
- [x] Replace `utils/normalize-author.js` with `module.exports = require('../src/features/moderation/normalize-author');`.

## Task 3: Update Runtime Import

- [x] Update `tfd-system/core/message-handler-v2.js` import from `../../utils/normalize-author.js` to `../../src/features/moderation/normalize-author`.
- [x] Run `rg -n "normalize-author|normalizeAuthorForBlacklist"` and verify old runtime path is adapter-only or documentation.

## Task 4: Documentation And Inventory

- [x] Add `src/features/moderation/normalize-author.js` to `doc/system/FILE_INDEX.md`.
- [x] Mark `utils/normalize-author.js` as a legacy adapter in `doc/system/FILE_INDEX.md`.
- [x] Add `scripts/normalize-author-smoke.js` to the scripts section in `doc/system/FILE_INDEX.md`.
- [x] Update `CLAUDE.md` quick map from `utils/normalize-author.js` to `src/features/moderation/normalize-author.js`.
- [x] Update `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` to `done-adapter`.

## Task 5: Verification And Review

- [x] Run `node scripts\normalize-author-smoke.js`.
- [x] Run `node --check src\features\moderation\normalize-author.js`.
- [x] Run `node --check utils\normalize-author.js`.
- [x] Run `node --check scripts\normalize-author-smoke.js`.
- [x] Run `node --check tfd-system\core\message-handler-v2.js`.
- [x] Run a require-load check for shared implementation, legacy adapter, and `message-handler-v2`.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review changed files, old adapter path, docs/index, search output, and staged files to confirm unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` are excluded.
- [x] Commit locally with `refactor: move normalize author to moderation feature`.

## Review Criteria

- Existing old imports continue to work through `utils/normalize-author.js`.
- `message-handler-v2` imports the moderation feature path directly.
- Embed author/footer extraction works for both plain object embeds and `embed.data` embeds.
- Author output remains lowercased and trimmed.
- Documentation and inventory reflect both the new real path and the legacy adapter.

## Execution Review

- `scripts/normalize-author-smoke.js` passed and covers adapter identity, legacy plain embed behavior, and new `embed.data.author/footer` compatibility.
- `node --check` passed for the moderation implementation, legacy adapter, smoke script, and `tfd-system/core/message-handler-v2.js`.
- Require-load passed for the implementation, adapter, and `message-handler-v2`.
- Legacy behavior comparison passed against `HEAD:utils/normalize-author.js` for pre-existing supported cases; the only behavior expansion is `embed.data` compatibility.
- `rg` confirmed old normalize-author runtime paths are adapter-only; remaining mentions are documentation, smoke, and the new moderation implementation.
- `git diff --check` passed with CRLF warnings only; no whitespace errors were reported.
- Staged review confirmed only the 8 normalize-author phase files are included; unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` remain untracked and unstaged.
