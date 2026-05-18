# Twitter Interaction Adapter Inventory Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the refactor inventory for Twitter interaction handlers that are already legacy adapters.

**Architecture:** Old `handlers/twitter-*-interactions.js` paths stay as thin adapters. Canonical implementations live under `src/features/twitter/interactions/`.

---

### Task 1: Update Inventory

**Files:**
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Modify: `docs/system/file-index.md`

- [x] Mark `handlers/twitter-pagination-interactions.js` as `done-adapter`.
- [x] Mark `handlers/twitter-translate-interactions.js` as `done-adapter`.
- [x] Mark `handlers/twitter-v2-interactions.js` as `done-adapter`.
- [x] Ensure canonical Twitter interaction files are listed under `src/features/twitter/interactions/`.

### Task 2: Verify and Review

- [x] Confirm old handler files are one-line adapters to canonical paths.
- [x] Require old and canonical paths and confirm they return the same modules.
- [x] Recompute remaining inventory count.
- [x] Run `git diff --check`.
- [x] Review documentation-only scope before committing.
