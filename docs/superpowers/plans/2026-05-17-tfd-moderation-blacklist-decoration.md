# TFD Moderation Blacklist Decoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move blacklist result decoration out of `message-handler-v2` and make Level 1/2 blacklist output safe for both traditional embeds and V2 Containers.

**Architecture:** Keep blacklist lookup and Level 3 blocking in the message pipeline, but delegate Level 1 warning and Level 2 spoiler decoration to a moderation helper. The helper must avoid unsafe `result.embed.data` access, preserve existing embed footer icons where possible, and append V2 Container warning/spoiler text using `TextDisplayBuilder`.

**Tech Stack:** Node.js CommonJS, Discord.js builders, existing TFD message pipeline, local smoke script.

---

## Safety Boundaries

- Do not push or deploy.
- Do not edit `D:\OneDrive\RB\DISCORDBOT\4.0`; use its docs only as reference.
- Do not stage unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.
- Preserve Level 3 behavior in `tfd-system/core/message-handler-v2.js`.
- Preserve existing Level 2 behavior while making it safer and easier to test.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/moderation/blacklist-result-decorator.js` | Applies Level 1/2 blacklist decoration to extracted results. |
| `scripts/blacklist-result-decorator-smoke.js` | Verifies embed footer simplification, V2 warning append, Level 2 spoiler wrapping, and unsafe missing-embed cases. |
| `tfd-system/core/message-handler-v2.js` | Imports and calls the moderation decorator after blacklist lookup. |
| `doc/system/FILE_INDEX.md` | Records the new moderation helper and smoke script. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Marks imported moderation pipeline follow-up as started/completed for this phase. |

## Task 1: Add Smoke Coverage

- [x] Create `scripts/blacklist-result-decorator-smoke.js`.
- [x] Assert Level 1 traditional embeds set footer to `⚠️ <label>` when no footer exists.
- [x] Assert Level 1 traditional embeds preserve and append an existing footer as `⚠️ <label> | <existing>`.
- [x] Assert Level 1 V2 Containers append a `TextDisplayBuilder` warning and do not require `result.embed`.
- [x] Assert Level 2 traditional embeds spoiler title, description, and field values without throwing when `embed.data` exists.
- [x] Assert Level 2 V2 Containers spoiler text display body lines while preserving marker lines.
- [x] Assert missing embed/container input does not throw.

## Task 2: Create Moderation Decorator

- [x] Create `src/features/moderation/blacklist-result-decorator.js`.
- [x] Export `applyBlacklistDecoration(result, entry, logger)`.
- [x] Implement `applyLevelOneWarning(result, entry, logger)` for V2 and traditional embed paths.
- [x] Implement `applyLevelTwoSpoiler(result, entry, logger)` for V2 and traditional embed paths.
- [x] Implement safe helpers for `embed.data`, footer text, and footer icon URL.
- [x] Keep warning footer text concise: `⚠️ ${label}` or `⚠️ ${label} | ${existingFooter}`.

## Task 3: Wire Message Pipeline

- [x] Import `applyBlacklistDecoration` in `tfd-system/core/message-handler-v2.js`.
- [x] Replace inline Level 1 and Level 2 decoration blocks with `applyBlacklistDecoration(result, entry, this.log.bind(this))`.
- [x] Keep Level 3 block-and-continue behavior unchanged.
- [x] Verify no `BL-DBG` log remains.

## Task 4: Docs And Verification

- [x] Add `blacklist-result-decorator.js` to `doc/system/FILE_INDEX.md` moderation section.
- [x] Add `blacklist-result-decorator-smoke.js` to `doc/system/FILE_INDEX.md` scripts section.
- [x] Update the refactor map imported-fix status for V2 blacklist Level 1 warning and unsafe `result.embed.data` access.
- [x] Run `node scripts\blacklist-result-decorator-smoke.js`.
- [x] Run `node --check` for the new helper, smoke, and `message-handler-v2`.
- [x] Run require-load for helper and `message-handler-v2`.
- [x] Run `rg -n "BL-DBG|entry\.level === 1|entry\.level === 2|applyBlacklistDecoration|blacklist-result-decorator"` to review call sites and old inline code removal.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review staged files and confirm unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` are excluded.
- [x] Commit locally with `refactor: extract blacklist result decoration`.

## Deferred Follow-Up Phases

- `/pe blacklist list` Embed pagination remains a focused slash-command phase.
- Twitter quote auto-expand and V1/V2 transition behavior remains a focused Twitter phase.

## Execution Review

- `node scripts\blacklist-result-decorator-smoke.js` passed and covers Level 1/2 traditional embed and V2 Container decoration.
- `node --check` passed for `src/features/moderation/blacklist-result-decorator.js`, `scripts/blacklist-result-decorator-smoke.js`, and `tfd-system/core/message-handler-v2.js`.
- Require-load passed for the decorator and `message-handler-v2`.
- `rg` confirmed no `BL-DBG` references and no remaining inline `entry.level === 1` branch in `message-handler-v2`; Level 2 remains only as a post-decoration log line.
- `git diff --check` passed with CRLF warnings only; no whitespace errors were reported.
- Smoke review confirmed Discord.js V2 MediaGallery stores items under `.items`; the decorator handles both `.components` and `.items`.
- UTF-8 readback confirmed the new warning/spoiler strings are stored correctly despite PowerShell default output showing mojibake.
- Staged review confirmed only the 6 blacklist-decoration phase files are included; unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` remain untracked and unstaged.
