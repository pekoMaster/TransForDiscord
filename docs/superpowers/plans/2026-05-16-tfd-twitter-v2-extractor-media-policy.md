# TFD Twitter V2 Extractor Media Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move simple Twitter V2 media display policy decisions out of `twitter-v2-extractor.js`.

**Architecture:** Add `src/features/twitter/extractors/v2/media-policy.js` for synchronous policy helpers. Keep extractor methods as compatibility wrappers. Do not touch GAS URL construction or environment handling.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/media-policy.js`
  - Owns `shouldUseMultipleEmbeds(tweetId, tweetType)`.
  - Owns `shouldUseGASVideoMode(tweetId, tweetType)`.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `media-policy`.
  - Delegates the existing extractor methods.

## Task 1: Extract media policy helpers

**Files:**
- Create: `src/features/twitter/extractors/v2/media-policy.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/media-policy.js`:

```js
function shouldUseMultipleEmbeds(tweetId, tweetType) {
    return tweetType === 'multi-image';
}

function shouldUseGASVideoMode(tweetId, tweetType) {
    const supportedTypes = [
        // 'multi-video',
        // 'multi-image',
    ];

    supportedTypes.includes(tweetType);
    return false;
}

module.exports = {
    shouldUseMultipleEmbeds,
    shouldUseGASVideoMode,
};
```

- [ ] **Step 2: Import helper and delegate wrappers**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, import:

```js
const mediaPolicy = require('./v2/media-policy');
```

Replace wrappers:

```js
shouldUseMultipleEmbeds(tweetId, tweetType) {
    return mediaPolicy.shouldUseMultipleEmbeds(tweetId, tweetType);
}

shouldUseGASVideoMode(tweetId, tweetType) {
    return mediaPolicy.shouldUseGASVideoMode(tweetId, tweetType);
}
```

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\media-policy.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const p=require('./src/features/twitter/extractors/v2/media-policy'); console.log(p.shouldUseMultipleEmbeds('1','multi-image'), p.shouldUseMultipleEmbeds('1','video'), p.shouldUseGASVideoMode('1','multi-video')); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); console.log(x.shouldUseMultipleEmbeds('1','multi-image'), x.shouldUseGASVideoMode('1','multi-video')); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Helper prints `true false false`.
- Extractor wrapper prints `true false`.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter media policy split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "media-policy|shouldUseMultipleEmbeds\(|shouldUseGASVideoMode\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-media-policy.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\media-policy.js
git commit -m "refactor: extract twitter v2 media policy"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts only policy decisions, not GAS execution.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor methods remain available to current extraction flow.
