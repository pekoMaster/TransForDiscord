# Shared Browser Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move browser automation helper implementations from `utils/` into `src/shared/browser/` while preserving old require paths.

**Architecture:** This is an adapter-first shared helper migration. Real implementations move under `src/shared/browser/`; `utils/lightpanda-client.js` and `utils/playwright-semantic-browser.js` remain thin compatibility adapters. Runtime extractors can import the new shared paths directly when safe.

**Tech Stack:** Node.js CommonJS, optional Puppeteer/Playwright dependencies, static `node --check` verification.

---

## Scope

Move:

- `utils/lightpanda-client.js` -> `src/shared/browser/lightpanda-client.js`
- `utils/playwright-semantic-browser.js` -> `src/shared/browser/playwright-semantic-browser.js`

Keep:

- `utils/lightpanda-client.js` as adapter.
- `utils/playwright-semantic-browser.js` as adapter.

Do not install `puppeteer` or `playwright`; they are optional runtime dependencies in the current checkout and are absent locally.

## Tasks

- [x] **Step 1: Baseline checks**

Run:

```powershell
node --check utils\lightpanda-client.js
node --check utils\playwright-semantic-browser.js
node -e "for(const m of ['puppeteer','playwright']){try{require.resolve(m); console.log(m,'ok')}catch(e){console.log(m,'missing')}}"
rg -n "lightpanda-client|playwright-semantic-browser|shared/browser" . -g "!node_modules/**" -g "!data/**"
```

Expected dependency output in this checkout:

```text
puppeteer missing
playwright missing
```

- [x] **Step 2: Move implementations**

Run:

```powershell
New-Item -ItemType Directory -Force src\shared\browser
git mv utils\lightpanda-client.js src\shared\browser\lightpanda-client.js
git mv utils\playwright-semantic-browser.js src\shared\browser\playwright-semantic-browser.js
```

- [x] **Step 3: Add old-path adapters**

Create:

```js
module.exports = require('../src/shared/browser/lightpanda-client');
```

```js
module.exports = require('../src/shared/browser/playwright-semantic-browser');
```

- [x] **Step 4: Fix moved logger imports**

In moved files:

```js
const tfd = require('../logging/tfd-logger');
```

- [x] **Step 5: Update direct runtime imports**

Update low-risk direct consumers:

```js
require('../../src/shared/browser/playwright-semantic-browser');
require('../../src/shared/browser/lightpanda-client');
```

- [x] **Step 6: Update docs**

Update:

- `doc/system/FILE_INDEX.md`
- `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [x] **Step 7: Static verification and review**

Run:

```powershell
node --check src\shared\browser\lightpanda-client.js
node --check src\shared\browser\playwright-semantic-browser.js
node --check utils\lightpanda-client.js
node --check utils\playwright-semantic-browser.js
node --check tfd-system\extractors\dynamic.js
node --check tfd-system\extractors\threads.js
rg -n "utils/lightpanda-client|utils\\lightpanda-client|utils/playwright-semantic-browser|utils\\playwright-semantic-browser|shared/browser" . -g "!node_modules/**" -g "!data/**"
git diff --check
```

Do not claim require-load success for the moved modules unless `puppeteer` and `playwright` are installed locally.
