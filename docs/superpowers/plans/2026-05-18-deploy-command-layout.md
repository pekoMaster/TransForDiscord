# Deploy Command Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Discord command deployment script into `scripts/` while preserving the root `node deploy.js` command.

**Architecture:** `scripts/deploy-commands.js` owns slash/context command registration. Root `deploy.js` remains a thin compatibility wrapper.

**Safety:** Do not execute the deployment script in this phase.

---

### Task 1: Move Implementation

**Files:**
- Move: `deploy.js` -> `scripts/deploy-commands.js`

- [x] Move implementation with `git mv`.
- [x] Update commands directory path to project-root `commands/`.
- [x] Update logger import to `../utils/tfd-logger`.
- [x] Keep `dotenv.config()` behavior based on current working directory.
- [x] Move `tfd` logger import to module scope so command load failures can still log.

### Task 2: Preserve Root Command

**Files:**
- Create: `deploy.js`

- [x] Replace root path with wrapper requiring `scripts/deploy-commands`.
- [x] Preserve `node deploy.js` usage.

### Task 3: Update Documentation

**Files:**
- Modify: `docs/system/file-index.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] Mark root `deploy.js` as compatibility wrapper.
- [x] Add canonical `scripts/deploy-commands.js` path to docs.

### Task 4: Verify and Review

- [x] Run `node --check` for implementation and wrapper.
- [x] Static-review root wrapper and script paths without executing deployment.
- [x] Search for deploy script references.
- [x] Run `git diff --check`.
- [x] Review changed files, wrapper, imports, docs, and staging scope before committing.
