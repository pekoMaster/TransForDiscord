# TFD External Fix Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the actionable findings from `doc/FIX_TFD_IS_NOT_DEFINED.md` and `D:\OneDrive\RB\DISCORDBOT\4.0\docs\twitter-quote-expand-optimization.md` into the TFD refactor stream without pushing or deploying.

**Architecture:** Apply only low-risk runtime fixes in this phase: logger scope fixes that prevent `tfd is not defined`, and moderation author normalization coverage that prevents blacklist misses. Record the larger Twitter quote V1/V2 transition design as a separate future phase because it changes interaction behavior and requires broader state/webhook verification.

**Tech Stack:** Node.js CommonJS, Discord.js builders, existing TFD smoke scripts, local Git commits only.

---

## Safety Boundaries

- Do not push or deploy.
- Keep `doc/FIX_TFD_IS_NOT_DEFINED.md` as a reference input unless the user asks to commit the raw report.
- Do not edit files under `D:\OneDrive\RB\DISCORDBOT\4.0`; copy only requirements into TFD docs/plans.
- Do not stage unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.
- Preserve old adapter paths and existing public exports.

## Source Requirement Mapping

| Source | Requirement | Current TFD Status | Action |
|---|---|---|---|
| `doc/FIX_TFD_IS_NOT_DEFINED.md` Bug #1 | Move `tfd` logger requires to module scope. | `twitter-v2`, `link-processor`, and extractor manager are already safe; `facebook`, `dynamic`, `tfd-system/index`, and `playwright-semantic-browser` still need cleanup. | Fix in this phase. |
| `doc/FIX_TFD_IS_NOT_DEFINED.md` Bug #2 | Support `embed.data.author/footer` in blacklist author normalization. | Already implemented in `src/features/moderation/normalize-author.js`. | Keep smoke coverage. |
| `doc/FIX_TFD_IS_NOT_DEFINED.md` Bug #3 | Support PTT `result.data.author`. | Missing. | Fix in this phase and add smoke. |
| `doc/FIX_TFD_IS_NOT_DEFINED.md` Bug #4/#5 | Simplify Level 1 footer and support V2 Container warning. | Needs separate `message-handler-v2` review. | Defer to a focused moderation pipeline phase. |
| `doc/FIX_TFD_IS_NOT_DEFINED.md` `/pe blacklist list` | Embed pagination for blacklist list. | Needs command/UI work. | Defer to a focused slash-command phase. |
| `4.0/docs/twitter-quote-expand-optimization.md` | Quote tweet auto-expand and V1/V2 transitions. | TFD paths differ and Twitter interactions are already partially split. | Defer to a dedicated Twitter quote transition phase. |

## File Structure

| File | Responsibility |
|---|---|
| `tfd-system/extractors/facebook.js` | Move `tfd` logger require to module scope so all methods can log safely. |
| `tfd-system/extractors/dynamic.js` | Move `tfd` logger require to module scope so early logging does not hit TDZ/scope errors. |
| `tfd-system/index.js` | Move `tfd` logger require to module scope so initializer/process methods can log safely. |
| `utils/playwright-semantic-browser.js` | Move `tfd` logger require to module scope so debug lifecycle logs are safe. |
| `src/features/moderation/normalize-author.js` | Add PTT `result.data.author` fallback. |
| `scripts/normalize-author-smoke.js` | Add PTT `result.data.author` smoke assertion. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Record the imported follow-up requirements and current phase status. |

## Task 1: Logger Scope Fixes

- [x] Add `const tfd = require('../../utils/tfd-logger');` near the top of `tfd-system/extractors/facebook.js`.
- [x] Remove the inner `const tfd = require('../../utils/tfd-logger');` from `facebook.js` `autoLogin()`.
- [x] Add `const tfd = require('../../utils/tfd-logger');` near the top of `tfd-system/extractors/dynamic.js`.
- [x] Remove the inner `const tfd = require('../../utils/tfd-logger');` from `dynamic.js` `extract()`.
- [x] Add `const tfd = require('../utils/tfd-logger');` near the top of `tfd-system/index.js`.
- [x] Remove the inner `const tfd = require('../utils/tfd-logger');` from `_getMessageHandler()`.
- [x] Add `const tfd = require('./tfd-logger');` near the top of `utils/playwright-semantic-browser.js`.
- [x] Remove the inner `const tfd = require('./tfd-logger');` from `loadSession()`.

## Task 2: PTT Blacklist Author Fallback

- [x] In `src/features/moderation/normalize-author.js`, change PTT normalization to read `result.author || result.data?.author`.
- [x] Keep the existing `^([^\s(]+)` extraction so `l00011799z (暱稱)` normalizes to `l00011799z`.
- [x] Add a smoke assertion for `siteName: 'ptt', data: { author: 'l00011799z (暱稱)' }`.

## Task 3: Documentation And Review

- [x] Update the file inventory/refactor map with imported follow-up notes.
- [x] Run `node scripts\normalize-author-smoke.js`.
- [x] Run `node --check` for all changed JS files.
- [x] Run require-load for the changed modules.
- [x] Run `rg -n "^const\s+tfd\s*="` over the four logger-scope files and confirm one top-level require per file.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review staged files and confirm unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` are excluded.
- [x] Commit locally with `fix: sync external tfd hotfix notes`.

## Deferred Follow-Up Phases

- Moderation pipeline phase: review `message-handler-v2` blacklist Level 1 footer text, V2 Container warning display, and any unsafe `result.embed.data` direct access.
- Slash command phase: implement `/pe blacklist list` Embed pagination if not already present.
- Twitter quote phase: port the quote auto-expand and V1/V2 transition design into current TFD paths under `src/features/twitter`.

## Execution Review

- `node scripts\normalize-author-smoke.js` passed and now covers PTT `result.data.author`.
- `node --check` passed for `normalize-author`, smoke, `facebook`, `dynamic`, `tfd-system/index`, and `playwright-semantic-browser`.
- Direct require-load hit pre-existing missing local dependencies: `playwright` and `puppeteer` are not listed in `package.json`.
- Require-load passed with local dependency mocks for `playwright` and `puppeteer`, confirming changed modules load when those runtime dependencies are available.
- `rg` confirmed exactly one module-scope `tfd` require in each logger-scope file.
- `git diff --check` passed with CRLF warnings only; no whitespace errors were reported.
- Staged review confirmed only the 8 external-fix-sync phase files are included; unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` remain untracked and unstaged.
