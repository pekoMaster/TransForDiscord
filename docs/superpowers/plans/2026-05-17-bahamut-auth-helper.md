# Bahamut Auth Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Bahamut authentication helper into the Bahamut site feature folder while preserving the old utility path.

**Architecture:** This is an adapter-first feature helper migration. The implementation moves to `src/features/sites/bahamut/bahamut-auth.js`; `utils/bahamut-auth.js` remains a compatibility adapter. The moved implementation must keep its cookie file anchored to project-root `data/`.

**Tech Stack:** Node.js CommonJS, axios, filesystem cookie cache, static `node --check`, require-load smoke.

---

## Scope

Move:

- `utils/bahamut-auth.js` -> `src/features/sites/bahamut/bahamut-auth.js`

Update:

- `tfd-system/extractors/bahamut.js` import path
- `doc/system/FILE_INDEX.md`
- `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

Keep:

- `utils/bahamut-auth.js` as adapter.

## Tasks

- [x] **Step 1: Baseline checks**

Run:

```powershell
node --check utils\bahamut-auth.js
node --check tfd-system\extractors\bahamut.js
rg -n "bahamut-auth|BahamutAuth|features/sites/bahamut" . -g "!node_modules/**" -g "!data/**"
```

- [x] **Step 2: Move implementation and add adapter**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\sites\bahamut
git mv utils\bahamut-auth.js src\features\sites\bahamut\bahamut-auth.js
```

Create adapter:

```js
module.exports = require('../src/features/sites/bahamut/bahamut-auth');
```

- [x] **Step 3: Fix moved implementation paths**

Use shared logger and root data path:

```js
const tfd = require('../../../shared/logging/tfd-logger');
this.cookiePath = path.join(__dirname, '..', '..', '..', '..', 'data', 'bahamut_cookies.json');
```

- [x] **Step 4: Update direct runtime import**

In `tfd-system/extractors/bahamut.js`:

```js
const BahamutAuth = require('../../src/features/sites/bahamut/bahamut-auth');
```

- [x] **Step 5: Update docs**

Update `doc/system/FILE_INDEX.md` and the refactor map to mark old path as `done-adapter`.

- [x] **Step 6: Verify**

Run:

```powershell
node --check src\features\sites\bahamut\bahamut-auth.js
node --check utils\bahamut-auth.js
node --check tfd-system\extractors\bahamut.js
node -e "const A=require('./src/features/sites/bahamut/bahamut-auth'); const B=require('./utils/bahamut-auth'); if(A!==B) throw new Error('adapter mismatch'); console.log('bahamut auth adapter ok'); process.exit(0)"
rg -n "utils/bahamut-auth|utils\\bahamut-auth|features/sites/bahamut/bahamut-auth|BahamutAuth" . -g "!node_modules/**" -g "!data/**"
git diff --check
```

- [x] **Step 7: Review and commit**

Confirm:

- Old utility path still works.
- Runtime extractor imports the feature path directly.
- Cookie path still resolves to project-root `data/bahamut_cookies.json`.
- No network login was executed.
- `doc/SSH_FIX_LOG.md` and `utils/peko-kv.js` remain untouched.
