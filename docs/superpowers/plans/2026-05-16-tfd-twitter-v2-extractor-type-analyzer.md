# TFD Twitter V2 Extractor Type Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tweet type classification out of `twitter-v2-extractor.js` into the existing media classifier helper.

**Architecture:** Extend `src/features/twitter/extractors/v2/media-classifier.js` with `analyzeTweetType(tweet)`. Keep `TFDTwitterExtractor.analyzeTweetType()` as a compatibility wrapper.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Modify: `src/features/twitter/extractors/v2/media-classifier.js`
  - Add `analyzeTweetType(tweet)` using existing classifier helpers.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Delegate `analyzeTweetType(tweet)`.

## Task 1: Extract tweet type analyzer

**Files:**
- Modify: `src/features/twitter/extractors/v2/media-classifier.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Add analyzer helper**

Move the existing classification logic into `media-classifier.js` and export `analyzeTweetType`.

- [ ] **Step 2: Delegate extractor wrapper**

Replace `TFDTwitterExtractor.analyzeTweetType(tweet)` with:

```js
return mediaClassifier.analyzeTweetType(tweet);
```

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\media-classifier.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const c=require('./src/features/twitter/extractors/v2/media-classifier'); console.log(c.analyzeTweetType({article:{}}), c.analyzeTweetType({media:{all:[{type:'video'}]}}), c.analyzeTweetType({media:{all:[{type:'photo'},{type:'photo'}]}}), c.analyzeTweetType({quote:{author:{}},media:{all:[{type:'photo'}]}})); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); console.log(x.analyzeTweetType({replying_to:'u',media:{all:[{type:'photo'}]}})); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Helper prints `article video multi-image quote-with-media`.
- Extractor wrapper prints `reply-with-media`.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter type analyzer split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "analyzeTweetType\(|media-classifier" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-type-analyzer.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\media-classifier.js
git commit -m "refactor: extract twitter v2 type analyzer"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts only pure tweet type classification.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor method remains available to current extraction flow.
