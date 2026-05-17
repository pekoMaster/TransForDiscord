# Reports Recall Limiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the shared recall cooldown limiter into the reports feature folder while preserving the old utility path.

**Architecture:** This is an adapter-first feature helper migration. The implementation lives at `src/features/reports/recall-limiter.js`; `utils/recall-limiter.js` remains a thin compatibility adapter. Existing recall consumers should import the feature-owned path directly.

**Tech Stack:** Node.js CommonJS, Discord.js handlers, static `node --check`, require-load smoke.

---

## Scope

Move:

- `utils/recall-limiter.js` -> `src/features/reports/recall-limiter.js`

Update runtime consumers:

- `commands/tfd-context-actions.js`
- `handlers/report-button-interactions.js`

Keep:

- `utils/recall-limiter.js` as adapter.

## Tasks

- [x] **Step 1: Baseline checks**

Run:

```powershell
node --check utils\recall-limiter.js
rg -n "recall-limiter|checkRecallLimit|recallCounts" commands handlers events src utils tfd-system -g "*.js"
```

- [x] **Step 2: Move implementation and add adapter**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\reports
git mv utils\recall-limiter.js src\features\reports\recall-limiter.js
```

Create adapter:

```js
module.exports = require('../src/features/reports/recall-limiter');
```

- [x] **Step 3: Update runtime imports**

Use:

```js
require('../src/features/reports/recall-limiter');
```

for root-level `commands/` and `handlers/` consumers.

- [x] **Step 4: Update docs**

Update:

- `doc/system/FILE_INDEX.md`
- `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] **Step 5: Verify**

Run:

```powershell
node --check src\features\reports\recall-limiter.js
node --check utils\recall-limiter.js
node --check commands\tfd-context-actions.js
node --check handlers\report-button-interactions.js
node -e "const a=require('./src/features/reports/recall-limiter'); const b=require('./utils/recall-limiter'); if(a!==b) throw new Error('adapter mismatch'); if(typeof a.checkRecallLimit!=='function') throw new Error('missing checkRecallLimit'); console.log('recall limiter adapter ok'); process.exit(0)"
rg -n "utils/recall-limiter|utils\\recall-limiter|features/reports/recall-limiter|checkRecallLimit|recallCounts" commands handlers events src utils tfd-system -g "*.js"
git diff --check
```

- [x] **Step 6: Review and commit**

Confirm:

- Old utility path still works.
- Both runtime consumers use the feature path.
- No unrelated report/spoiler behavior changed.
- `doc/SSH_FIX_LOG.md` remains untouched.
