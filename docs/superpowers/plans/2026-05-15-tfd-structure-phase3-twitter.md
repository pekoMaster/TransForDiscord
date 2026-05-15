# TFD Structure Phase 3 Twitter Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Twitter/X domain into `src/features/twitter` while preserving all existing runtime behavior and old public require paths.

**Architecture:** This is an adapter-first relocation, not a behavioral rewrite. New Twitter code lives under `src/features/twitter`; old paths under `handlers/`, `utils/`, and `tfd-system/extractors/` remain thin compatibility adapters. Large files such as `twitter-v2-interactions.js` and `twitter-v2.js` are intentionally moved as-is first, then split in a later phase after the new folder boundary is stable.

**Tech Stack:** Node.js CommonJS, Discord.js v14, current PowerShell workflow, `git mv`, `node --check`, require-load smoke checks.

---

## Superseded Follow-Up

After this plan was executed, the user clarified that TFD does not provide
Twitter posting and translation must rely on each user's configured provider
API key. The legacy Twitter posting handler and its legacy Gemini helper were
removed in the follow-up cleanup commit. Treat any posting-related steps below
as historical context, not current architecture.

## Source Documents

- Inventory/spec: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Previous stable rollback tag: `baseline/pre-translation-refactor-2026-05-15`
- Completed Phase 1/2 translation migration: `docs/superpowers/plans/2026-05-15-tfd-structure-phase1-translation.md`

## Safety Rules

- Do not push.
- Do not deploy.
- Do not intentionally change runtime behavior.
- Use `git mv` for file relocations where possible.
- Keep every old Twitter runtime path working through adapters.
- After every task, review old dependencies, new dependencies, naming, folder location, adapters, docs/index references, and run the listed verification before committing.

## Target File Structure

```txt
src/features/twitter/
  README.md
  index.js
  containers/
    v2-container-builder.js
  extractors/
    twitter-legacy-extractor.js
    twitter-v2-extractor.js
  interactions/
    expand.js
    media-pagination.js
    reload.js
    toggle-all.js
    translation.js
    v2-router.js
  media/
    image-attachment-optimizer.js
    video-attachment-optimizer.js
  posting/
    twitter-posting-handler.js
  state/
    v2-state-store.js
```

Keep these old paths as adapters:

```txt
handlers/twitter-all-interactions.js
handlers/twitter-expand-interactions.js
handlers/twitter-interactions.js
handlers/twitter-pagination-interactions.js
handlers/twitter-reload-interactions.js
handlers/twitter-translate-interactions.js
handlers/twitter-v2-container-builder.js
handlers/twitter-v2-interactions.js
utils/twitter-v2-state-store.js
tfd-system/extractors/twitter-image-attachment-optimizer.js
tfd-system/extractors/twitter-legacy.js
tfd-system/extractors/twitter-v2.js
tfd-system/extractors/twitter-video-attachment-optimizer.js
```

## Task 1: Add Twitter Feature Skeleton

**Files:**
- Create: `src/features/twitter/README.md`

- [ ] **Step 1: Create destination directories**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\twitter\containers | Out-Null
New-Item -ItemType Directory -Force src\features\twitter\extractors | Out-Null
New-Item -ItemType Directory -Force src\features\twitter\interactions | Out-Null
New-Item -ItemType Directory -Force src\features\twitter\media | Out-Null
New-Item -ItemType Directory -Force src\features\twitter\posting | Out-Null
New-Item -ItemType Directory -Force src\features\twitter\state | Out-Null
```

Expected: commands exit 0.

- [ ] **Step 2: Create `src/features/twitter/README.md`**

Create this file:

```md
# Twitter Feature

This folder owns Twitter/X extraction, V2 container rendering, message state,
media attachment optimization, and Discord interaction handlers.

Old runtime paths under `handlers/`, `utils/`, and `tfd-system/extractors/`
remain as compatibility adapters during the project-wide restructure.
```

- [ ] **Step 3: Verify skeleton**

Run:

```powershell
Test-Path src\features\twitter\README.md
```

Expected:

```txt
True
```

- [ ] **Step 4: Review and commit**

Review checklist:
- `git status --short` shows only the intended README and directories.
- No runtime files changed.

Run:

```powershell
git add src\features\twitter\README.md
git commit -m "docs: add twitter feature skeleton"
```

## Task 2: Move Twitter State, Container, and Media Helpers

**Files:**
- Move: `utils/twitter-v2-state-store.js` -> `src/features/twitter/state/v2-state-store.js`
- Move: `handlers/twitter-v2-container-builder.js` -> `src/features/twitter/containers/v2-container-builder.js`
- Move: `tfd-system/extractors/twitter-image-attachment-optimizer.js` -> `src/features/twitter/media/image-attachment-optimizer.js`
- Move: `tfd-system/extractors/twitter-video-attachment-optimizer.js` -> `src/features/twitter/media/video-attachment-optimizer.js`
- Modify old paths as adapters.

- [ ] **Step 1: Move files with git**

Run:

```powershell
git mv utils\twitter-v2-state-store.js src\features\twitter\state\v2-state-store.js
git mv handlers\twitter-v2-container-builder.js src\features\twitter\containers\v2-container-builder.js
git mv tfd-system\extractors\twitter-image-attachment-optimizer.js src\features\twitter\media\image-attachment-optimizer.js
git mv tfd-system\extractors\twitter-video-attachment-optimizer.js src\features\twitter\media\video-attachment-optimizer.js
```

Expected: commands exit 0.

- [ ] **Step 2: Update moved container requires**

In `src/features/twitter/containers/v2-container-builder.js`, replace:

```js
const TextTruncator = require('../tfd-system/utils/text-truncator');
const { REPORT_BTN_PREFIX } = require('../utils/spoiler-button-helper');
```

with:

```js
const TextTruncator = require('../../../../tfd-system/utils/text-truncator');
const { REPORT_BTN_PREFIX } = require('../../../../utils/spoiler-button-helper');
```

- [ ] **Step 3: Update moved media optimizer logger requires**

In both `src/features/twitter/media/image-attachment-optimizer.js` and `src/features/twitter/media/video-attachment-optimizer.js`, replace:

```js
const tfd = require('../../utils/tfd-logger');
```

with:

```js
const tfd = require('../../../../utils/tfd-logger');
```

- [ ] **Step 4: Add old-path adapters**

Create `utils/twitter-v2-state-store.js`:

```js
module.exports = require('../src/features/twitter/state/v2-state-store');
```

Create `handlers/twitter-v2-container-builder.js`:

```js
module.exports = require('../src/features/twitter/containers/v2-container-builder');
```

Create `tfd-system/extractors/twitter-image-attachment-optimizer.js`:

```js
module.exports = require('../../src/features/twitter/media/image-attachment-optimizer');
```

Create `tfd-system/extractors/twitter-video-attachment-optimizer.js`:

```js
module.exports = require('../../src/features/twitter/media/video-attachment-optimizer');
```

- [ ] **Step 5: Verify and review**

Run:

```powershell
node --check src\features\twitter\state\v2-state-store.js
node --check src\features\twitter\containers\v2-container-builder.js
node --check src\features\twitter\media\image-attachment-optimizer.js
node --check src\features\twitter\media\video-attachment-optimizer.js
node --check utils\twitter-v2-state-store.js
node --check handlers\twitter-v2-container-builder.js
node --check tfd-system\extractors\twitter-image-attachment-optimizer.js
node --check tfd-system\extractors\twitter-video-attachment-optimizer.js
node -e "require('./utils/twitter-v2-state-store'); require('./handlers/twitter-v2-container-builder'); require('./tfd-system/extractors/twitter-image-attachment-optimizer'); require('./tfd-system/extractors/twitter-video-attachment-optimizer'); console.log('twitter state container media ok'); process.exit(0)"
```

Expected:

```txt
twitter state container media ok
```

Review checklist:
- `rg -n "twitter-v2-state-store|twitter-v2-container-builder|twitter-image-attachment-optimizer|twitter-video-attachment-optimizer" .` still shows old path references only where adapters or docs intentionally mention them.
- `src/features/twitter/containers/v2-container-builder.js` no longer imports from `../tfd-system` or `../utils`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src\features\twitter utils\twitter-v2-state-store.js handlers\twitter-v2-container-builder.js tfd-system\extractors
git commit -m "refactor: move twitter state container and media helpers"
```

## Task 3: Move Twitter Extractors

**Files:**
- Move: `tfd-system/extractors/twitter-v2.js` -> `src/features/twitter/extractors/twitter-v2-extractor.js`
- Move: `tfd-system/extractors/twitter-legacy.js` -> `src/features/twitter/extractors/twitter-legacy-extractor.js`
- Modify old extractor paths as adapters.

- [ ] **Step 1: Move extractor files with git**

Run:

```powershell
git mv tfd-system\extractors\twitter-v2.js src\features\twitter\extractors\twitter-v2-extractor.js
git mv tfd-system\extractors\twitter-legacy.js src\features\twitter\extractors\twitter-legacy-extractor.js
```

Expected: commands exit 0.

- [ ] **Step 2: Update moved V2 extractor requires**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, update the top-level requires to use:

```js
const HTTPClient = require('../../../../tfd-system/utils/http-client');
const TwitterVideoAttachmentOptimizer = require('../media/video-attachment-optimizer');
const MixedMediaHTMLBuilder = require('../../../../tfd-system/render/mixed-media-html-builder');
const TextTruncator = require('../../../../tfd-system/utils/text-truncator');
const URLConverterLogger = require('../../../../tfd-system/utils/url-converter-logger');
```

Update the lazy container require inside `getV2ContainerBuilder()` to:

```js
_v2ContainerBuilder = require('../containers/v2-container-builder');
```

Update the config/logger requires to:

```js
const config = require('../../../../tfd-system/config/tfd-config.json');
const tfd = require('../../../../utils/tfd-logger');
```

- [ ] **Step 3: Update moved legacy extractor requires**

In `src/features/twitter/extractors/twitter-legacy-extractor.js`, replace the top-level requires with:

```js
const HTTPClient = require('../../../../tfd-system/utils/http-client');
const DOMParser = require('../../../../tfd-system/utils/dom-parser');
const TFDEmbedBuilder = require('../../../../tfd-system/utils/embed-builder');
const tfd = require('../../../../utils/tfd-logger');
```

- [ ] **Step 4: Add old-path extractor adapters**

Create `tfd-system/extractors/twitter-v2.js`:

```js
module.exports = require('../../src/features/twitter/extractors/twitter-v2-extractor');
```

Create `tfd-system/extractors/twitter-legacy.js`:

```js
module.exports = require('../../src/features/twitter/extractors/twitter-legacy-extractor');
```

- [ ] **Step 5: Verify and review**

Run:

```powershell
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node --check src\features\twitter\extractors\twitter-legacy-extractor.js
node --check tfd-system\extractors\twitter-v2.js
node --check tfd-system\extractors\twitter-legacy.js
node -e "require('./tfd-system/extractors/twitter-v2'); require('./tfd-system/extractors/twitter-legacy'); console.log('twitter extractors ok'); process.exit(0)"
```

Expected:

```txt
twitter extractors ok
```

Review checklist:
- `tfd-system/extractors/index.js` may keep requiring `./twitter-v2` because that file is now an adapter.
- `src/features/twitter/extractors/twitter-v2-extractor.js` must not require `../../handlers/twitter-v2-container-builder`.
- `src/features/twitter/extractors/twitter-v2-extractor.js` must use feature-local media optimizer paths.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src\features\twitter\extractors tfd-system\extractors
git commit -m "refactor: move twitter extractors into feature folder"
```

## Task 4: Move Twitter Interaction Handlers

**Files:**
- Move: `handlers/twitter-all-interactions.js` -> `src/features/twitter/interactions/toggle-all.js`
- Move: `handlers/twitter-expand-interactions.js` -> `src/features/twitter/interactions/expand.js`
- Move: `handlers/twitter-interactions.js` -> `src/features/twitter/posting/twitter-posting-handler.js`
- Move: `handlers/twitter-pagination-interactions.js` -> `src/features/twitter/interactions/media-pagination.js`
- Move: `handlers/twitter-reload-interactions.js` -> `src/features/twitter/interactions/reload.js`
- Move: `handlers/twitter-translate-interactions.js` -> `src/features/twitter/interactions/translation.js`
- Move: `handlers/twitter-v2-interactions.js` -> `src/features/twitter/interactions/v2-router.js`
- Modify old paths as adapters.

- [ ] **Step 1: Move interaction files with git**

Run:

```powershell
git mv handlers\twitter-all-interactions.js src\features\twitter\interactions\toggle-all.js
git mv handlers\twitter-expand-interactions.js src\features\twitter\interactions\expand.js
git mv handlers\twitter-interactions.js src\features\twitter\posting\twitter-posting-handler.js
git mv handlers\twitter-pagination-interactions.js src\features\twitter\interactions\media-pagination.js
git mv handlers\twitter-reload-interactions.js src\features\twitter\interactions\reload.js
git mv handlers\twitter-translate-interactions.js src\features\twitter\interactions\translation.js
git mv handlers\twitter-v2-interactions.js src\features\twitter\interactions\v2-router.js
```

Expected: commands exit 0.

- [ ] **Step 2: Update moved interaction require roots**

Use these final dependency directions:

```txt
src/features/twitter/interactions/* -> src/features/twitter/*
src/features/twitter/interactions/* -> src/features/translation/*
src/features/twitter/interactions/* -> old shared/core paths only until later phases
```

Concrete path replacements:

```txt
../utils/tfd-logger -> ../../../../utils/tfd-logger
../db -> ../../../../db
../utils/webhook-manager.js -> ../../../../utils/webhook-manager.js
../utils/spoiler-button-helper.js -> ../../../../utils/spoiler-button-helper.js
../utils/gemini-translator.js -> ../../translation/legacy/gemini-translator
../utils/ai-translator.js -> ../../translation/legacy/ai-translator-adapter
../utils/user-api-key-storage.js -> ../../translation/keys/user-api-key-storage
../utils/user-api-key-storage -> ../../translation/keys/user-api-key-storage
../utils/translation/text-bundle -> ../../translation/text/text-bundle
../utils/translation/translation-service -> ../../translation/service/translation-service
../utils/shared-translation-cache -> ../../translation/cache/shared-translation-cache
./content-translation-interactions.js -> ../../translation/cache/content-cache
./twitter-translate-interactions.js -> ./translation
./twitter-v2-container-builder -> ../containers/v2-container-builder
../utils/twitter-v2-state-store -> ../state/v2-state-store
../tfd-system/extractors/twitter-v2.js -> ../extractors/twitter-v2-extractor
../tfd-system/extractors/twitter-v2 -> ../extractors/twitter-v2-extractor
../tfd-system/utils/http-client -> ../../../../tfd-system/utils/http-client
../tfd-system/utils/text-truncator.js -> ../../../../tfd-system/utils/text-truncator.js
../tfd-system/utils/text-truncator -> ../../../../tfd-system/utils/text-truncator
../tfd-system/utils/url-stats -> ../../../../tfd-system/utils/url-stats
```

- [ ] **Step 3: Add old-path adapters**

Create each adapter:

```js
// handlers/twitter-all-interactions.js
module.exports = require('../src/features/twitter/interactions/toggle-all');

// handlers/twitter-expand-interactions.js
module.exports = require('../src/features/twitter/interactions/expand');

// handlers/twitter-interactions.js
module.exports = require('../src/features/twitter/posting/twitter-posting-handler');

// handlers/twitter-pagination-interactions.js
module.exports = require('../src/features/twitter/interactions/media-pagination');

// handlers/twitter-reload-interactions.js
module.exports = require('../src/features/twitter/interactions/reload');

// handlers/twitter-translate-interactions.js
module.exports = require('../src/features/twitter/interactions/translation');

// handlers/twitter-v2-interactions.js
module.exports = require('../src/features/twitter/interactions/v2-router');
```

- [ ] **Step 4: Verify and review**

Run:

```powershell
node --check src\features\twitter\interactions\toggle-all.js
node --check src\features\twitter\interactions\expand.js
node --check src\features\twitter\posting\twitter-posting-handler.js
node --check src\features\twitter\interactions\media-pagination.js
node --check src\features\twitter\interactions\reload.js
node --check src\features\twitter\interactions\translation.js
node --check src\features\twitter\interactions\v2-router.js
node --check handlers\twitter-all-interactions.js
node --check handlers\twitter-expand-interactions.js
node --check handlers\twitter-interactions.js
node --check handlers\twitter-pagination-interactions.js
node --check handlers\twitter-reload-interactions.js
node --check handlers\twitter-translate-interactions.js
node --check handlers\twitter-v2-interactions.js
node -e "require('./handlers/twitter-all-interactions'); require('./handlers/twitter-expand-interactions'); require('./handlers/twitter-interactions'); require('./handlers/twitter-pagination-interactions'); require('./handlers/twitter-reload-interactions'); require('./handlers/twitter-translate-interactions'); require('./handlers/twitter-v2-interactions'); console.log('twitter interaction adapters ok'); process.exit(0)"
```

Expected:

```txt
twitter interaction adapters ok
```

Review checklist:
- `events/interactionCreate.js` may keep old handler paths because adapters preserve them.
- Moved files must not use `./content-translation-interactions.js` or old sibling `./twitter-*` paths except feature-local `./translation`.
- Moved files should use `src/features/translation/*` direct paths instead of old `utils/translation/*` where practical.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src\features\twitter handlers
git commit -m "refactor: move twitter interactions into feature folder"
```

## Task 5: Add Twitter Barrel and Documentation Updates

**Files:**
- Create: `src/features/twitter/index.js`
- Modify: `CLAUDE.md`
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [ ] **Step 1: Create `src/features/twitter/index.js`**

Create this file:

```js
module.exports = {
    state: require('./state/v2-state-store'),
    containers: require('./containers/v2-container-builder'),
    extractors: {
        TwitterV2Extractor: require('./extractors/twitter-v2-extractor'),
        TwitterLegacyExtractor: require('./extractors/twitter-legacy-extractor')
    },
    interactions: {
        toggleAll: require('./interactions/toggle-all'),
        expand: require('./interactions/expand'),
        mediaPagination: require('./interactions/media-pagination'),
        reload: require('./interactions/reload'),
        translation: require('./interactions/translation'),
        v2Router: require('./interactions/v2-router')
    },
    posting: require('./posting/twitter-posting-handler')
};
```

- [ ] **Step 2: Update docs**

Update `CLAUDE.md` and `doc/system/FILE_INDEX.md` to say Twitter/X runtime code now lives under `src/features/twitter/`, while old `handlers/twitter-*`, `utils/twitter-v2-state-store.js`, and `tfd-system/extractors/twitter-*` paths are adapters.

Update the inventory status line to:

```md
Status: Phase 1 translation migration and Phase 3 Twitter migration plans created; inventory remains the source map for later phases.
```

- [ ] **Step 3: Verify docs and barrel**

Run:

```powershell
node --check src\features\twitter\index.js
node -e "require('./src/features/twitter'); console.log('twitter barrel ok'); process.exit(0)"
rg -n "src/features/twitter|twitter.*adapter|Twitter" CLAUDE.md doc\system\FILE_INDEX.md docs\superpowers\specs\2026-05-15-tfd-file-inventory-and-refactor-map.md
```

Expected:

```txt
twitter barrel ok
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src\features\twitter\index.js CLAUDE.md doc\system\FILE_INDEX.md docs\superpowers\specs\2026-05-15-tfd-file-inventory-and-refactor-map.md
git commit -m "docs: mark twitter feature as src-owned"
```

## Task 6: Final Local Verification and Review

**Files:**
- No intended code changes.

- [ ] **Step 1: Check syntax for new Twitter files and old adapters**

Run:

```powershell
node --check src\features\twitter\index.js
node --check src\features\twitter\state\v2-state-store.js
node --check src\features\twitter\containers\v2-container-builder.js
node --check src\features\twitter\media\image-attachment-optimizer.js
node --check src\features\twitter\media\video-attachment-optimizer.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node --check src\features\twitter\extractors\twitter-legacy-extractor.js
node --check src\features\twitter\interactions\toggle-all.js
node --check src\features\twitter\interactions\expand.js
node --check src\features\twitter\interactions\media-pagination.js
node --check src\features\twitter\interactions\reload.js
node --check src\features\twitter\interactions\translation.js
node --check src\features\twitter\interactions\v2-router.js
node --check src\features\twitter\posting\twitter-posting-handler.js
node --check handlers\twitter-all-interactions.js
node --check handlers\twitter-expand-interactions.js
node --check handlers\twitter-interactions.js
node --check handlers\twitter-pagination-interactions.js
node --check handlers\twitter-reload-interactions.js
node --check handlers\twitter-translate-interactions.js
node --check handlers\twitter-v2-container-builder.js
node --check handlers\twitter-v2-interactions.js
node --check utils\twitter-v2-state-store.js
node --check tfd-system\extractors\twitter-image-attachment-optimizer.js
node --check tfd-system\extractors\twitter-legacy.js
node --check tfd-system\extractors\twitter-v2.js
node --check tfd-system\extractors\twitter-video-attachment-optimizer.js
```

Expected: all commands exit 0.

- [ ] **Step 2: Run load checks**

Run:

```powershell
node -e "require('./src/features/twitter'); require('./handlers/twitter-v2-interactions'); require('./handlers/twitter-translate-interactions'); require('./handlers/twitter-reload-interactions'); require('./tfd-system/extractors/twitter-v2'); console.log('twitter migration load ok'); process.exit(0)"
node -e "require('./events/interactionCreate'); require('./tfd-system/core/message-handler-v2'); console.log('core load ok'); process.exit(0)"
node scripts\translation-smoke.js
```

Expected:

```txt
twitter migration load ok
core load ok
translation smoke ok
```

- [ ] **Step 3: Review dependency drift**

Run:

```powershell
rg -n "require\('\.\.?/.*/twitter|require\(\""\.\.?/.*/twitter|twitter-v2-state-store|twitter-v2-container-builder|twitter-v2\.js|twitter-legacy\.js" src handlers utils tfd-system events CLAUDE.md doc\system\FILE_INDEX.md docs\superpowers\specs\2026-05-15-tfd-file-inventory-and-refactor-map.md
git status --short
git diff --check baseline/pre-translation-refactor-2026-05-15..HEAD
```

Expected:
- Old path references are adapters, docs, or intentional legacy entrypoints.
- `git status --short` is empty after commits.
- `git diff --check` exits 0.

- [ ] **Step 4: Final fix commit if needed**

If review finds small required fixes, commit them:

```powershell
git add src\features\twitter handlers utils tfd-system CLAUDE.md doc\system\FILE_INDEX.md docs\superpowers
git commit -m "refactor: complete twitter feature migration"
```

If no files are dirty, do not create an empty commit.

## Rollback

Rollback only this phase after commits have been made:

```powershell
git revert <twitter-phase-commit-sha>
```

Rollback to the stable version before the broader structure refactor:

```powershell
git reset --hard baseline/pre-translation-refactor-2026-05-15
```

Prefer `git revert` over destructive reset once work has been shared or deployed.

## Self-Review

- Spec coverage: This plan implements the inventory Phase 3 recommendation for Twitter state, container, media, interactions, and extractors.
- Scope control: It does not split `twitter-v2.js`, `twitter-v2-interactions.js`, or classic translation interaction internals yet. That belongs to a follow-up behavioral refactor after the folder migration is stable.
- Adapter policy: Every old Twitter path listed in the inventory remains available.
- Dependency review: Each task requires old and new path checks, with docs/index updates at the end.
- Verification: The plan includes syntax checks, adapter require checks, core load checks, and translation smoke to catch cross-feature breakage.
- Deployment: No deployment or push is included.
