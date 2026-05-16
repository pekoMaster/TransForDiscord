# PE Blacklist List Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `/pe blacklist list` from a 10-row plain text response into an Embed response with user-scoped pagination buttons.

**Architecture:** Keep command execution in `commands/pe.js`, but move list rendering and collector setup to a focused moderation helper. The helper receives already-fetched blacklist rows, builds a Discord Embed page, and starts a short-lived collector that only accepts the original command user's button clicks.

**Tech Stack:** Node.js CommonJS, Discord.js v14 builders, existing SQLite-backed guild blacklist manager, local smoke script.

---

## Safety Boundaries

- Do not push or deploy.
- Do not edit `D:\OneDrive\RB\DISCORDBOT\4.0`; use its docs only as reference.
- Do not stage unrelated untracked `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, or `tools/`.
- Keep blacklist data access through `utils/guild-blacklist-manager.js`.
- Keep the command ephemeral to avoid exposing moderation data.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/moderation/blacklist-list-presenter.js` | Builds blacklist list embeds/buttons and attaches a page collector. |
| `scripts/blacklist-list-presenter-smoke.js` | Verifies page rendering, level formatting, button state, and page bounds. |
| `commands/pe.js` | Calls the presenter from `/pe blacklist list`. |
| `doc/system/FILE_INDEX.md` | Records the new helper and smoke script. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | Marks `/pe blacklist list` imported follow-up as completed. |

## Task 1: Build Presenter Smoke Coverage

- [x] Create `scripts/blacklist-list-presenter-smoke.js`.
- [x] Assert an empty list returns no embed page requirement by keeping empty handling in `commands/pe.js`.
- [x] Assert page 0 for 12 entries renders entries 1-10 and footer `第 1/2 頁 • 共 12 條`.
- [x] Assert page 1 renders entries 11-12 and disables the next button.
- [x] Assert previous button is disabled on page 0 and enabled on page 1.
- [x] Assert Twitter authors are rendered with `@`.

## Task 2: Create Presenter Helper

- [x] Create `src/features/moderation/blacklist-list-presenter.js`.
- [x] Export `buildBlacklistListPage(entries, options)`.
- [x] Export `sendPaginatedBlacklistList(interaction, entries, options)`.
- [x] Use `EmbedBuilder`, `ActionRowBuilder`, `ButtonBuilder`, and `ButtonStyle`.
- [x] Use custom IDs prefixed with `pe_blacklist_page_`.
- [x] Limit button handling to `interaction.user.id`.
- [x] Remove buttons after 120 seconds.

## Task 3: Wire `/pe blacklist list`

- [x] Import `sendPaginatedBlacklistList` in `commands/pe.js`.
- [x] Replace plain text list response with `sendPaginatedBlacklistList(interaction, list, { platform })`.
- [x] Keep the existing empty-list reply unchanged.

## Task 4: Docs And Verification

- [x] Add `blacklist-list-presenter.js` to `doc/system/FILE_INDEX.md` moderation section.
- [x] Add `blacklist-list-presenter-smoke.js` to `doc/system/FILE_INDEX.md` scripts section.
- [x] Update imported-fix status for `/pe blacklist list` pagination in the refactor map.
- [x] Run `node scripts\blacklist-list-presenter-smoke.js`.
- [x] Run `node --check` for helper, smoke, and `commands/pe.js`.
- [x] Run require-load for helper and `commands/pe.js`.
- [x] Run `rg -n "pe_blacklist_page|sendPaginatedBlacklistList|blacklist-list-presenter"` to review references.
- [x] Run `git diff --check`; CRLF warnings are acceptable, whitespace errors are not.
- [x] Review staged files and confirm unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` are excluded.
- [x] Commit locally with `feat: paginate pe blacklist list`.

## Execution Review

- `node scripts\blacklist-list-presenter-smoke.js` passed and covers 12-entry pagination, button disabled states, page clamping, and Twitter author display.
- `node --check` passed for `src/features/moderation/blacklist-list-presenter.js`, `scripts/blacklist-list-presenter-smoke.js`, and `commands/pe.js`.
- Require-load passed for the presenter and `commands/pe.js`.
- `rg` confirmed references are limited to the presenter, smoke, command import/call, and docs.
- `git diff --check` passed with CRLF warnings only; no whitespace errors were reported.
- Staged review confirmed only the 6 blacklist-list pagination files are included; unrelated `SQL/`, `doc/FIX_TFD_IS_NOT_DEFINED.md`, and `tools/` remain untracked and unstaged.
