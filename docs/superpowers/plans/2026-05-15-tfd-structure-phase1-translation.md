# TFD Structure Phase 1 and Translation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the new `src/` architecture skeleton and migrate the translation subsystem into `src/features/translation` while preserving every old public require path through adapters.

**Architecture:** This is an adapter-first, behavior-preserving migration. New code lives under `src/`; old `utils/*` and `utils/translation/*` paths remain as thin `module.exports = require(...)` bridges until all callers are migrated. This first phase intentionally avoids moving Twitter/Pixiv/PTT/core message pipeline files so the migration pattern can be verified on the already-refactored translation domain.

**Tech Stack:** Node.js CommonJS, Discord.js v14, axios, `@google/genai`, better-sqlite3, current PowerShell workflow, `node --check`, existing `scripts/translation-smoke.js`.

---

## Source Documents

- Inventory/spec: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`
- Baseline rollback tag: `baseline/pre-translation-refactor-2026-05-15`
- Current translation smoke script: `scripts/translation-smoke.js`

## Safety Rules

- Do not push.
- Do not deploy.
- Do not change runtime behavior intentionally.
- Use `git mv` for moved files where possible so history remains readable.
- Keep old require paths working until a later cleanup phase.
- After every task, run the listed verification before committing.

## Target File Structure for This Plan

Create:

```txt
src/
  features/
    translation/
      index.js
      errors.js
      service/
        translation-service.js
      text/
        text-bundle.js
        prompt-builder.js
        glossary.js
      keys/
        key-resolver.js
        user-api-key-storage.js
      cache/
        shared-translation-cache.js
        content-cache.js
      providers/
        claude-provider.js
        gemini-provider.js
        google-translate-provider.js
        openai-provider.js
        openrouter-provider.js
        provider-registry.js
      legacy/
        ai-translator-adapter.js
        gemini-translator.js
        openrouter-translator.js
        user-api-key-service-adapter.js
```

Keep as adapters:

```txt
utils/ai-translator.js
utils/gemini-translator.js
utils/openrouter-translator.js
utils/shared-translation-cache.js
utils/translation-glossary.js
utils/translator.js
utils/user-api-key-service.js
utils/user-api-key-storage.js
utils/translation/errors.js
utils/translation/key-resolver.js
utils/translation/prompt-builder.js
utils/translation/text-bundle.js
utils/translation/translation-service.js
utils/translation/providers/claude.js
utils/translation/providers/gemini.js
utils/translation/providers/index.js
utils/translation/providers/openai.js
utils/translation/providers/openrouter.js
handlers/content-translation-interactions.js
```

## Task 1: Add Translation Feature Skeleton

**Files:**
- Create: `src/features/translation/README.md`

- [ ] **Step 1: Create the destination directory**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\translation | Out-Null
```

Expected: command exits 0.

- [ ] **Step 2: Create `src/features/translation/README.md`**

Create this file:

```md
# Translation Feature

This folder owns translation orchestration, providers, user API key resolution,
translation caches, prompt/text helpers, and legacy adapter exports.

Old runtime paths under `utils/` remain as compatibility adapters during the
project-wide restructure.
```

- [ ] **Step 3: Verify syntax**

Run:

```powershell
Test-Path src\features\translation\README.md
```

Expected:

```txt
True
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src\features\translation\README.md
git commit -m "docs: add translation feature skeleton"
```

## Task 2: Move Translation Core Files

**Files:**
- Move: `utils/translation/errors.js` -> `src/features/translation/errors.js`
- Move: `utils/translation/translation-service.js` -> `src/features/translation/service/translation-service.js`
- Move: `utils/translation/text-bundle.js` -> `src/features/translation/text/text-bundle.js`
- Move: `utils/translation/prompt-builder.js` -> `src/features/translation/text/prompt-builder.js`
- Move: `utils/translation/key-resolver.js` -> `src/features/translation/keys/key-resolver.js`
- Modify adapters under `utils/translation/`

- [ ] **Step 1: Create destination directories**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\translation\service | Out-Null
New-Item -ItemType Directory -Force src\features\translation\text | Out-Null
New-Item -ItemType Directory -Force src\features\translation\keys | Out-Null
```

Expected: commands exit 0.

- [ ] **Step 2: Move files with git**

Run:

```powershell
git mv utils\translation\errors.js src\features\translation\errors.js
git mv utils\translation\translation-service.js src\features\translation\service\translation-service.js
git mv utils\translation\text-bundle.js src\features\translation\text\text-bundle.js
git mv utils\translation\prompt-builder.js src\features\translation\text\prompt-builder.js
git mv utils\translation\key-resolver.js src\features\translation\keys\key-resolver.js
```

Expected: commands exit 0.

- [ ] **Step 3: Update moved `translation-service.js` requires**

In `src/features/translation/service/translation-service.js`, replace the top requires with:

```js
const { buildPrompt } = require('../text/prompt-builder');
const { splitTranslatedBundle } = require('../text/text-bundle');
const { resolveTranslationKey } = require('../keys/key-resolver');
const { failure } = require('../errors');

const providers = {
    gemini: require('../../../../utils/translation/providers/gemini'),
    openrouter: require('../../../../utils/translation/providers/openrouter'),
    openai: require('../../../../utils/translation/providers/openai'),
    claude: require('../../../../utils/translation/providers/claude')
};
```

These temporary provider paths keep Task 2 independently verifiable. Task 3 replaces them with the final `../providers/*-provider` paths.

- [ ] **Step 4: Update moved `key-resolver.js` requires**

In `src/features/translation/keys/key-resolver.js`, replace the top requires with:

```js
const { getKey, getPreferredProvider } = require('../../../../utils/user-api-key-storage');
const { PROVIDERS, isSupportedProvider } = require('../../../../utils/translation/providers');
const { failure } = require('../errors');
```

These temporary paths keep Task 2 independently verifiable. Task 3 and Task 4 replace them with final feature-local paths.

- [ ] **Step 5: Add old-path adapters**

Create `utils/translation/errors.js`:

```js
module.exports = require('../../src/features/translation/errors');
```

Create `utils/translation/translation-service.js`:

```js
module.exports = require('../../src/features/translation/service/translation-service');
```

Create `utils/translation/text-bundle.js`:

```js
module.exports = require('../../src/features/translation/text/text-bundle');
```

Create `utils/translation/prompt-builder.js`:

```js
module.exports = require('../../src/features/translation/text/prompt-builder');
```

Create `utils/translation/key-resolver.js`:

```js
module.exports = require('../../src/features/translation/keys/key-resolver');
```

- [ ] **Step 6: Verify syntax and smoke**

Run:

```powershell
node --check src\features\translation\errors.js
node --check src\features\translation\service\translation-service.js
node --check src\features\translation\text\text-bundle.js
node --check src\features\translation\text\prompt-builder.js
node --check src\features\translation\keys\key-resolver.js
node --check utils\translation\errors.js
node --check utils\translation\translation-service.js
node --check utils\translation\text-bundle.js
node --check utils\translation\prompt-builder.js
node --check utils\translation\key-resolver.js
node scripts\translation-smoke.js
```

Expected:

```txt
translation smoke ok
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add src\features\translation utils\translation scripts\translation-smoke.js
git commit -m "refactor: move translation core into feature folder"
```

## Task 3: Move Translation Provider Files

**Files:**
- Move: `utils/translation/providers/claude.js` -> `src/features/translation/providers/claude-provider.js`
- Move: `utils/translation/providers/gemini.js` -> `src/features/translation/providers/gemini-provider.js`
- Move: `utils/translation/providers/openai.js` -> `src/features/translation/providers/openai-provider.js`
- Move: `utils/translation/providers/openrouter.js` -> `src/features/translation/providers/openrouter-provider.js`
- Move: `utils/translation/providers/index.js` -> `src/features/translation/providers/provider-registry.js`
- Modify adapters under `utils/translation/providers/`

- [ ] **Step 1: Create provider directory**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\translation\providers | Out-Null
```

Expected: command exits 0.

- [ ] **Step 2: Move provider files with git**

Run:

```powershell
git mv utils\translation\providers\claude.js src\features\translation\providers\claude-provider.js
git mv utils\translation\providers\gemini.js src\features\translation\providers\gemini-provider.js
git mv utils\translation\providers\openai.js src\features\translation\providers\openai-provider.js
git mv utils\translation\providers\openrouter.js src\features\translation\providers\openrouter-provider.js
git mv utils\translation\providers\index.js src\features\translation\providers\provider-registry.js
```

Expected: commands exit 0.

- [ ] **Step 3: Update provider internal error requires**

In each of these files:

```txt
src/features/translation/providers/claude-provider.js
src/features/translation/providers/gemini-provider.js
src/features/translation/providers/openai-provider.js
src/features/translation/providers/openrouter-provider.js
```

Replace:

```js
require('../errors')
```

with:

```js
require('../errors')
```

Expected: no textual change is needed if the moved file already uses `../errors`. This step exists so the executor verifies the path intentionally.

- [ ] **Step 4: Point `translation-service.js` at final provider paths**

In `src/features/translation/service/translation-service.js`, replace the temporary provider block with:

```js
const providers = {
    gemini: require('../providers/gemini-provider'),
    openrouter: require('../providers/openrouter-provider'),
    openai: require('../providers/openai-provider'),
    claude: require('../providers/claude-provider')
};
```

- [ ] **Step 5: Point `key-resolver.js` at the final provider registry path**

In `src/features/translation/keys/key-resolver.js`, replace:

```js
const { PROVIDERS, isSupportedProvider } = require('../../../../utils/translation/providers');
```

with:

```js
const { PROVIDERS, isSupportedProvider } = require('../providers/provider-registry');
```

Keep the temporary user key storage require for now:

```js
const { getKey, getPreferredProvider } = require('../../../../utils/user-api-key-storage');
```

Task 4 replaces that remaining temporary require after moving `user-api-key-storage.js`.

- [ ] **Step 6: Add old-path provider adapters**

Create `utils/translation/providers/claude.js`:

```js
module.exports = require('../../../src/features/translation/providers/claude-provider');
```

Create `utils/translation/providers/gemini.js`:

```js
module.exports = require('../../../src/features/translation/providers/gemini-provider');
```

Create `utils/translation/providers/openai.js`:

```js
module.exports = require('../../../src/features/translation/providers/openai-provider');
```

Create `utils/translation/providers/openrouter.js`:

```js
module.exports = require('../../../src/features/translation/providers/openrouter-provider');
```

Create `utils/translation/providers/index.js`:

```js
module.exports = require('../../../src/features/translation/providers/provider-registry');
```

- [ ] **Step 7: Verify provider syntax**

Run:

```powershell
node --check src\features\translation\providers\claude-provider.js
node --check src\features\translation\providers\gemini-provider.js
node --check src\features\translation\providers\openai-provider.js
node --check src\features\translation\providers\openrouter-provider.js
node --check src\features\translation\providers\provider-registry.js
node --check utils\translation\providers\claude.js
node --check utils\translation\providers\gemini.js
node --check utils\translation\providers\openai.js
node --check utils\translation\providers\openrouter.js
node --check utils\translation\providers\index.js
node scripts\translation-smoke.js
```

Expected:

```txt
translation smoke ok
```

- [ ] **Step 8: Commit**

Run:

```powershell
git add src\features\translation\providers utils\translation\providers
git commit -m "refactor: move translation providers into feature folder"
```

## Task 4: Move Translation Key Storage and Cache Files

**Files:**
- Move: `utils/user-api-key-storage.js` -> `src/features/translation/keys/user-api-key-storage.js`
- Move: `utils/user-api-key-service.js` -> `src/features/translation/legacy/user-api-key-service-adapter.js`
- Move: `utils/shared-translation-cache.js` -> `src/features/translation/cache/shared-translation-cache.js`
- Move: `handlers/content-translation-interactions.js` -> `src/features/translation/cache/content-cache.js`
- Modify adapters at old paths.

- [ ] **Step 1: Create destination directories**

Run:

```powershell
New-Item -ItemType Directory -Force src\features\translation\cache | Out-Null
New-Item -ItemType Directory -Force src\features\translation\legacy | Out-Null
```

Expected: commands exit 0.

- [ ] **Step 2: Move files with git**

Run:

```powershell
git mv utils\user-api-key-storage.js src\features\translation\keys\user-api-key-storage.js
git mv utils\user-api-key-service.js src\features\translation\legacy\user-api-key-service-adapter.js
git mv utils\shared-translation-cache.js src\features\translation\cache\shared-translation-cache.js
git mv handlers\content-translation-interactions.js src\features\translation\cache\content-cache.js
```

Expected: commands exit 0.

- [ ] **Step 3: Update moved `user-api-key-storage.js` requires**

In `src/features/translation/keys/user-api-key-storage.js`, replace the top requires with:

```js
const db = require('../../../../db');
const { encrypt, decrypt } = require('../../../../utils/crypto-helper.js');
const tfd = require('../../../../utils/tfd-logger');
```

These temporary old-root requires are intentional. Shared logging/crypto move in a later project-wide phase, not this translation migration plan.

- [ ] **Step 4: Update moved `user-api-key-service-adapter.js` requires**

In `src/features/translation/legacy/user-api-key-service-adapter.js`, replace the top requires with:

```js
const { getKey } = require('../keys/user-api-key-storage');
const { getEnvFallbackKey } = require('../keys/key-resolver');
```

- [ ] **Step 5: Update moved `key-resolver.js` to use final key storage path**

In `src/features/translation/keys/key-resolver.js`, replace:

```js
const { getKey, getPreferredProvider } = require('../../../../utils/user-api-key-storage');
```

with:

```js
const { getKey, getPreferredProvider } = require('./user-api-key-storage');
```

- [ ] **Step 6: Update moved `shared-translation-cache.js` requires and data path**

In `src/features/translation/cache/shared-translation-cache.js`, replace the top logger require:

```js
const tfd = require('../../../../utils/tfd-logger');
```

Replace the cache dir with:

```js
const CACHE_DIR = path.join(__dirname, '../../../../data/translation_cache');
```

- [ ] **Step 7: Add old-path adapters**

Create `utils/user-api-key-storage.js`:

```js
module.exports = require('../src/features/translation/keys/user-api-key-storage');
```

Create `utils/user-api-key-service.js`:

```js
module.exports = require('../src/features/translation/legacy/user-api-key-service-adapter');
```

Create `utils/shared-translation-cache.js`:

```js
module.exports = require('../src/features/translation/cache/shared-translation-cache');
```

Create `handlers/content-translation-interactions.js`:

```js
module.exports = require('../src/features/translation/cache/content-cache');
```

- [ ] **Step 8: Verify key/cache adapters**

Run:

```powershell
node --check src\features\translation\keys\user-api-key-storage.js
node --check src\features\translation\legacy\user-api-key-service-adapter.js
node --check src\features\translation\cache\shared-translation-cache.js
node --check src\features\translation\cache\content-cache.js
node --check utils\user-api-key-storage.js
node --check utils\user-api-key-service.js
node --check utils\shared-translation-cache.js
node --check handlers\content-translation-interactions.js
node scripts\translation-smoke.js
node -e "require('./utils/user-api-key-storage'); require('./utils/shared-translation-cache'); require('./handlers/content-translation-interactions'); console.log('key cache adapters ok'); process.exit(0)"
```

Expected:

```txt
translation smoke ok
key cache adapters ok
```

- [ ] **Step 9: Commit**

Run:

```powershell
git add src\features\translation utils handlers\content-translation-interactions.js
git commit -m "refactor: move translation keys and cache into feature folder"
```

## Task 5: Move Legacy Translation Adapters and Text Helpers

**Files:**
- Move: `utils/ai-translator.js` -> `src/features/translation/legacy/ai-translator-adapter.js`
- Move: `utils/gemini-translator.js` -> `src/features/translation/legacy/gemini-translator.js`
- Move: `utils/openrouter-translator.js` -> `src/features/translation/legacy/openrouter-translator.js`
- Move: `utils/translator.js` -> `src/features/translation/providers/google-translate-provider.js`
- Move: `utils/translation-glossary.js` -> `src/features/translation/text/glossary.js`
- Modify adapters at old paths.

- [ ] **Step 1: Move files with git**

Run:

```powershell
git mv utils\ai-translator.js src\features\translation\legacy\ai-translator-adapter.js
git mv utils\gemini-translator.js src\features\translation\legacy\gemini-translator.js
git mv utils\openrouter-translator.js src\features\translation\legacy\openrouter-translator.js
git mv utils\translator.js src\features\translation\providers\google-translate-provider.js
git mv utils\translation-glossary.js src\features\translation\text\glossary.js
```

Expected: commands exit 0.

- [ ] **Step 2: Update moved `ai-translator-adapter.js` requires**

In `src/features/translation/legacy/ai-translator-adapter.js`, replace the top requires with:

```js
const { EmbedBuilder } = require('discord.js');
const { getAllKeys, PROVIDERS } = require('../keys/user-api-key-storage');
const { buildTextBundle, combineTranslatedBundle } = require('../text/text-bundle');
const { translateTweet } = require('../service/translation-service');
```

- [ ] **Step 3: Update moved `gemini-translator.js` requires**

In `src/features/translation/legacy/gemini-translator.js`, replace:

```js
const tfd = require('./tfd-logger');
```

with:

```js
const tfd = require('../../../../utils/tfd-logger');
```

Replace:

```js
this.googleTranslator = require('./translator.js');
```

with:

```js
this.googleTranslator = require('../providers/google-translate-provider');
```

- [ ] **Step 4: Update moved `openrouter-translator.js` requires**

In `src/features/translation/legacy/openrouter-translator.js`, replace:

```js
const tfd = require('./tfd-logger');
```

with:

```js
const tfd = require('../../../../utils/tfd-logger');
```

- [ ] **Step 5: Update moved `google-translate-provider.js` requires**

In `src/features/translation/providers/google-translate-provider.js`, replace:

```js
const tfd = require('./tfd-logger');
```

with:

```js
const tfd = require('../../../../utils/tfd-logger');
```

- [ ] **Step 6: Update moved `glossary.js` requires and data path**

In `src/features/translation/text/glossary.js`, replace:

```js
const tfd = require('./tfd-logger');
```

with:

```js
const tfd = require('../../../../utils/tfd-logger');
```

Replace the glossary path with:

```js
const GLOSSARY_PATH = path.join(__dirname, '../../../../data/translation-glossary.json');
```

- [ ] **Step 7: Add old-path adapters**

Create `utils/ai-translator.js`:

```js
module.exports = require('../src/features/translation/legacy/ai-translator-adapter');
```

Create `utils/gemini-translator.js`:

```js
module.exports = require('../src/features/translation/legacy/gemini-translator');
```

Create `utils/openrouter-translator.js`:

```js
module.exports = require('../src/features/translation/legacy/openrouter-translator');
```

Create `utils/translator.js`:

```js
module.exports = require('../src/features/translation/providers/google-translate-provider');
```

Create `utils/translation-glossary.js`:

```js
module.exports = require('../src/features/translation/text/glossary');
```

- [ ] **Step 8: Verify legacy adapters**

Run:

```powershell
node --check src\features\translation\legacy\ai-translator-adapter.js
node --check src\features\translation\legacy\gemini-translator.js
node --check src\features\translation\legacy\openrouter-translator.js
node --check src\features\translation\providers\google-translate-provider.js
node --check src\features\translation\text\glossary.js
node --check utils\ai-translator.js
node --check utils\gemini-translator.js
node --check utils\openrouter-translator.js
node --check utils\translator.js
node --check utils\translation-glossary.js
node scripts\translation-smoke.js
node -e "require('./utils/ai-translator'); require('./utils/gemini-translator'); require('./utils/openrouter-translator'); require('./utils/translator'); require('./utils/translation-glossary'); console.log('legacy translation adapters ok'); process.exit(0)"
```

Expected:

```txt
translation smoke ok
legacy translation adapters ok
```

- [ ] **Step 9: Commit**

Run:

```powershell
git add src\features\translation utils
git commit -m "refactor: move legacy translation adapters into feature folder"
```

## Task 6: Add Translation Barrel and Update Smoke Script

**Files:**
- Create: `src/features/translation/index.js`
- Modify: `scripts/translation-smoke.js`

- [ ] **Step 1: Create `src/features/translation/index.js`**

Create this file:

```js
const { translateTweet } = require('./service/translation-service');
const textBundle = require('./text/text-bundle');
const errors = require('./errors');
const keyResolver = require('./keys/key-resolver');
const providers = require('./providers/provider-registry');

module.exports = {
    translateTweet,
    ...textBundle,
    ...errors,
    ...keyResolver,
    ...providers
};
```

- [ ] **Step 2: Add new-path imports beside old-path imports**

At the top of `scripts/translation-smoke.js`, add:

```js
const newTranslation = require('../src/features/translation');
```

- [ ] **Step 3: Add a new public API test**

Before `testBundleRoundTrip();`, add:

```js
function testNewTranslationBarrel() {
    assert.strictEqual(typeof newTranslation.translateTweet, 'function');
    assert.strictEqual(typeof newTranslation.buildTextBundle, 'function');
    assert.strictEqual(typeof newTranslation.resolveTranslationKey, 'function');
}
```

Then call it:

```js
testNewTranslationBarrel();
testBundleRoundTrip();
```

- [ ] **Step 4: Verify smoke**

Run:

```powershell
node --check src\features\translation\index.js
node --check scripts\translation-smoke.js
node scripts\translation-smoke.js
```

Expected:

```txt
translation smoke ok
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add src\features\translation\index.js scripts\translation-smoke.js
git commit -m "test: cover translation feature barrel"
```

## Task 7: Update Documentation Index for Phase 1

**Files:**
- Modify: `CLAUDE.md`
- Modify: `doc/system/FILE_INDEX.md`
- Modify: `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`

- [ ] **Step 1: Update `CLAUDE.md` translation row**

Replace the translation guidance row with:

```md
| 改翻譯功能 | `src/features/translation/` | 統一翻譯 domain；舊 `utils/*` 路徑為 adapter |
```

- [ ] **Step 2: Update `doc/system/FILE_INDEX.md` translation section**

Add this note at the top of the translation section:

```md
> 新主路徑：`src/features/translation/`。舊的 `utils/translation/*`、`utils/ai-translator.js`、`utils/user-api-key-*` 目前保留為相容 adapter。
```

- [ ] **Step 3: Mark the inventory phase status**

In `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md`, replace:

```md
Status: Draft inventory for project-wide structure refactor.
```

with:

```md
Status: Phase 1 implementation plan created; inventory remains the source map for later phases.
```

- [ ] **Step 4: Verify docs references**

Run:

```powershell
rg -n "src/features/translation|舊.*adapter|legacy" CLAUDE.md doc\system\FILE_INDEX.md docs\superpowers\specs\2026-05-15-tfd-file-inventory-and-refactor-map.md
```

Expected: output includes all three edited files.

- [ ] **Step 5: Commit**

Run:

```powershell
git add CLAUDE.md doc\system\FILE_INDEX.md docs\superpowers\specs\2026-05-15-tfd-file-inventory-and-refactor-map.md
git commit -m "docs: mark translation feature as src-owned"
```

## Task 8: Final Local Verification

**Files:**
- No intended code changes.

- [ ] **Step 1: Check full translation syntax**

Run:

```powershell
node --check src\features\translation\index.js
node --check src\features\translation\errors.js
node --check src\features\translation\service\translation-service.js
node --check src\features\translation\text\text-bundle.js
node --check src\features\translation\text\prompt-builder.js
node --check src\features\translation\text\glossary.js
node --check src\features\translation\keys\key-resolver.js
node --check src\features\translation\keys\user-api-key-storage.js
node --check src\features\translation\cache\shared-translation-cache.js
node --check src\features\translation\cache\content-cache.js
node --check src\features\translation\providers\provider-registry.js
node --check src\features\translation\providers\gemini-provider.js
node --check src\features\translation\providers\openrouter-provider.js
node --check src\features\translation\providers\openai-provider.js
node --check src\features\translation\providers\claude-provider.js
node --check src\features\translation\providers\google-translate-provider.js
node --check src\features\translation\legacy\ai-translator-adapter.js
node --check src\features\translation\legacy\gemini-translator.js
node --check src\features\translation\legacy\openrouter-translator.js
node --check src\features\translation\legacy\user-api-key-service-adapter.js
```

Expected: all commands exit 0.

- [ ] **Step 2: Check old adapters**

Run:

```powershell
node --check utils\ai-translator.js
node --check utils\gemini-translator.js
node --check utils\openrouter-translator.js
node --check utils\translator.js
node --check utils\translation-glossary.js
node --check utils\shared-translation-cache.js
node --check utils\user-api-key-storage.js
node --check utils\user-api-key-service.js
node --check utils\translation\errors.js
node --check utils\translation\key-resolver.js
node --check utils\translation\prompt-builder.js
node --check utils\translation\text-bundle.js
node --check utils\translation\translation-service.js
node --check utils\translation\providers\index.js
node --check utils\translation\providers\gemini.js
node --check utils\translation\providers\openrouter.js
node --check utils\translation\providers\openai.js
node --check utils\translation\providers\claude.js
node --check handlers\content-translation-interactions.js
```

Expected: all commands exit 0.

- [ ] **Step 3: Run smoke and handler load checks**

Run:

```powershell
node scripts\translation-smoke.js
node -e "require('./src/features/translation'); require('./utils/ai-translator'); require('./handlers/twitter-translate-interactions'); require('./handlers/twitter-v2-interactions'); console.log('translation migration load ok'); process.exit(0)"
```

Expected:

```txt
translation smoke ok
translation migration load ok
```

- [ ] **Step 4: Check for unintended dirty files**

Run:

```powershell
git status --short
git diff --check baseline/pre-translation-refactor-2026-05-15..HEAD
```

Expected:
- `git status --short` only shows intended files before final commit, or nothing after final commit.
- `git diff --check` exits 0.

- [ ] **Step 5: Final commit if needed**

If verification required small fixes, commit them:

```powershell
git add src utils handlers scripts CLAUDE.md doc\system\FILE_INDEX.md docs\superpowers
git commit -m "refactor: complete translation feature migration"
```

If no files are dirty, do not create an empty commit.

## Rollback

Rollback to the stable version before the translation refactor:

```powershell
git reset --hard baseline/pre-translation-refactor-2026-05-15
```

Rollback only this phase after commits have been made:

```powershell
git revert <phase-commit-sha>
```

Prefer `git revert` over destructive reset once work has been shared or deployed.

## Self-Review

- Spec coverage: This plan implements the inventory recommendation to start with `src/` skeleton and the translation domain migration only. Later domains remain planned but not implemented here.
- Scope control: Twitter/Pixiv/PTT/report/core files are intentionally not moved in this plan except `handlers/content-translation-interactions.js`, which is translation cache rather than a true handler.
- Adapter policy: Every old runtime translation path listed in the inventory remains available as an adapter.
- Verification: The plan includes syntax checks for new files, old adapters, smoke tests, and handler load checks.
- Deployment: No deployment or push is included.
