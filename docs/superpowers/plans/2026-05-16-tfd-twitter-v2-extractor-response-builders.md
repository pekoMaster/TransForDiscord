# TFD Twitter V2 Extractor Response Builders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move profile embed and simple response builders out of `twitter-v2-extractor.js` without changing profile API fetching or error handling call sites.

**Architecture:** Add `src/features/twitter/extractors/v2/response-builders.js` for pure Discord embed/response object construction. Keep `buildProfileEmbed()`, `createPassthroughResponse()`, and `createErrorResponse()` on the extractor as compatibility wrappers.

**Tech Stack:** Node.js CommonJS, Discord.js `EmbedBuilder`.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/response-builders.js`
  - Owns profile embed formatting.
  - Owns passthrough response object creation.
  - Owns error response object creation.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `response-builders`.
  - Delegates the existing extractor methods.

## Task 1: Extract response builders

**Files:**
- Create: `src/features/twitter/extractors/v2/response-builders.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/response-builders.js` with `buildProfileEmbed`, `createPassthroughResponse`, and `createErrorResponse` copied from the extractor.

- [ ] **Step 2: Import helper and delegate wrappers**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, import:

```js
const responseBuilders = require('./v2/response-builders');
```

Replace wrappers:

```js
buildProfileEmbed(user, originalURL) {
    return responseBuilders.buildProfileEmbed(user, originalURL);
}

createPassthroughResponse(originalURL) {
    return responseBuilders.createPassthroughResponse(originalURL);
}

createErrorResponse(errorMessage, originalURL) {
    return responseBuilders.createErrorResponse(errorMessage, originalURL);
}
```

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\response-builders.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const r=require('./src/features/twitter/extractors/v2/response-builders'); const embed=r.buildProfileEmbed({screen_name:'u',avatar_url:'https://a_normal.jpg',name:'User',verification:{verified:true},followers:1,following:2,tweets:3,likes:4,description:'bio',protected:true}, 'https://x.com/u'); console.log(embed.toJSON().title, embed.toJSON().footer.text, r.createPassthroughResponse('https://fixupx.com/a').contentType, r.createErrorResponse('bad','https://x.com').contentType); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); console.log(x.buildProfileEmbed({screen_name:'u',avatar_url:'https://a_normal.jpg',name:'User'}, 'https://x.com/u').toJSON().author.name, x.createErrorResponse('bad','https://x.com').error); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Helper prints profile title, footer, `passthrough`, and `error`.
- Extractor wrapper prints `@u bad`.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter response builders split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "response-builders|buildProfileEmbed\(|createPassthroughResponse\(|createErrorResponse\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-response-builders.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\response-builders.js
git commit -m "refactor: extract twitter v2 response builders"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts only construction helpers, not profile fetching.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor methods remain available to current call sites.
