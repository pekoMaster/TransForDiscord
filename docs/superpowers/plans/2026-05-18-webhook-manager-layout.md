# Webhook Manager Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Discord webhook send/edit/cache helpers into shared infrastructure while keeping the legacy utility path stable.

**Architecture:** `src/shared/webhook/` owns webhook delivery helpers. `utils/webhook-manager.js` remains a compatibility adapter so current message, handler, and Twitter interaction imports do not change in this batch.

**Tech Stack:** Node.js CommonJS modules, Discord.js WebhookClient, shared Discord component sanitizer, shared TFD logger.

---

### Task 1: Move Webhook Manager

**Files:**
- Move: `utils/webhook-manager.js` -> `src/shared/webhook/webhook-manager.js`

- [x] Move the implementation with `git mv`.
- [x] Change logger import to `../logging/tfd-logger`.
- [x] Change component sanitizer import to `../discord/component-sanitizer`.

### Task 2: Preserve Legacy Path

**Files:**
- Create: `utils/webhook-manager.js`

- [x] Replace the old path with `module.exports = require('../src/shared/webhook/webhook-manager')`.
- [x] Keep current runtime call sites unchanged for this batch.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark old utility path as `done-adapter`.
- [x] Add canonical shared webhook manager path to the file index.
- [x] Add canonical implementation row to the refactor map.

### Task 4: Verify and Review

- [x] Run `node --check` for moved implementation and adapter.
- [x] Verify old adapter exports the same module as the new canonical module.
- [x] Run syntax checks for known webhook manager call sites.
- [x] Search for old/new paths and webhook manager import references.
- [x] Run `git diff --check`.
- [x] Review changed files, old path, adapter, imports, call sites, docs, and staging scope before committing.
