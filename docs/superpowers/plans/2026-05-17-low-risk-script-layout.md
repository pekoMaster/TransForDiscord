# Low Risk Script Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move low-risk non-runtime scripts into domain folders while keeping old script paths executable.

**Architecture:** This is an adapter-first file layout cleanup. Real scripts move under `scripts/smoke/` and `scripts/migrations/`; old `scripts/*.js` paths stay as thin wrappers so historical commands and docs do not break.

**Tech Stack:** Node.js CommonJS, PowerShell workflow, `node --check`, deterministic smoke scripts.

---

## Scope

This phase intentionally avoids bot runtime files, deploy registration, core message handling, Pixiv/PTT runtime handlers, and Twitter extractor behavior. The only moved files are standalone scripts:

- `scripts/translation-smoke.js` -> `scripts/smoke/translation-smoke.js`
- `scripts/migrate-from-json.js` -> `scripts/migrations/migrate-from-json.js`
- `scripts/sync-blacklist-from-4.0.js` -> `scripts/migrations/sync-blacklist-from-4.0.js`

## Files

- Move: `scripts/translation-smoke.js`
- Move: `scripts/migrate-from-json.js`
- Move: `scripts/sync-blacklist-from-4.0.js`
- Create wrappers: old `scripts/*.js` paths
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

## Tasks

- [x] **Step 1: Baseline check**

Run:

```powershell
node --check scripts\translation-smoke.js
node --check scripts\migrate-from-json.js
node --check scripts\sync-blacklist-from-4.0.js
node scripts\translation-smoke.js
```

Expected:

```text
translation smoke ok
```

- [x] **Step 2: Move script implementations**

Create target folders:

```powershell
New-Item -ItemType Directory -Force scripts\smoke, scripts\migrations
git mv scripts\translation-smoke.js scripts\smoke\translation-smoke.js
git mv scripts\migrate-from-json.js scripts\migrations\migrate-from-json.js
git mv scripts\sync-blacklist-from-4.0.js scripts\migrations\sync-blacklist-from-4.0.js
```

- [x] **Step 3: Fix moved script relative imports**

Update moved implementations:

```js
// scripts/smoke/translation-smoke.js
require('../../utils/translation/text-bundle');
require('../../src/features/translation');

// scripts/migrations/migrate-from-json.js
require('../../db');
require('../../src/shared/crypto/crypto-helper.js');
const ROOT = path.join(__dirname, '..', '..');

// scripts/migrations/sync-blacklist-from-4.0.js
require('../../db');
const BASE_4 = path.resolve(__dirname, '..', '..', '..', '4.0', 'data', 'link');
```

- [x] **Step 4: Add old-path wrappers**

Old paths should delegate to new paths:

```js
require('./smoke/translation-smoke');
```

```js
require('./migrations/migrate-from-json');
```

```js
require('./migrations/sync-blacklist-from-4.0');
```

- [x] **Step 5: Update documentation indexes**

Update `doc/system/FILE_INDEX.md` and the refactor map so moved targets are marked as adapter-backed or done.

- [x] **Step 6: Verify new and old paths**

Run:

```powershell
node --check scripts\smoke\translation-smoke.js
node --check scripts\translation-smoke.js
node --check scripts\migrations\migrate-from-json.js
node --check scripts\migrate-from-json.js
node --check scripts\migrations\sync-blacklist-from-4.0.js
node --check scripts\sync-blacklist-from-4.0.js
node scripts\smoke\translation-smoke.js
node scripts\translation-smoke.js
```

Expected:

```text
translation smoke ok
translation smoke ok
```

- [x] **Step 7: Dependency-aware review**

Run:

```powershell
rg -n "translation-smoke\.js|migrate-from-json\.js|sync-blacklist-from-4\.0\.js|scripts/smoke|scripts/migrations" . -g "!node_modules/**" -g "!data/**"
git diff --check
git status --short --branch
```

Confirm:

- Old paths exist as wrappers.
- New paths are documented.
- No runtime bot files changed.
- `doc/SSH_FIX_LOG.md` remains untouched unless explicitly staged later.
