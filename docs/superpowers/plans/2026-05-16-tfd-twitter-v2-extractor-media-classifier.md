# TFD Twitter V2 Extractor Media Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `twitter-v2-extractor.js` by extracting pure tweet media/relation classification helpers while preserving the existing public extractor methods.

**Architecture:** Add a focused helper module under the Twitter V2 extractor area. Keep the current `TFDTwitterExtractor` methods as compatibility wrappers so existing call sites, tests, and interaction flows do not need to move in the same step.

**Tech Stack:** Node.js CommonJS, Discord.js integration remains unchanged.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/media-classifier.js`
  - Owns pure helpers for reply/quote/media/count checks.
  - Has no Discord.js, network, logger, or extractor instance dependency.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports the helper module.
  - Delegates existing class methods to the helper module.
  - Keeps method names stable for all current internal and old adapter call sites.

## Tasks

### Task 1: Extract pure media classifier helpers

**Files:**
- Create: `src/features/twitter/extractors/v2/media-classifier.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/media-classifier.js` with these exports:

```js
function getAllMedia(tweet) {
    return Array.isArray(tweet?.media?.all) ? tweet.media.all : [];
}

function isVideoMedia(media) {
    return media && (media.type === 'video' || media.type === 'gif');
}

function isImageLikeMedia(media) {
    return media && media.type !== 'video';
}

function isReplyTweet(tweet) {
    return !!(
        tweet?.replying_to ||
        tweet?.replying_to_status ||
        (tweet?.text && tweet.text.startsWith('@'))
    );
}

function isQuoteTweet(tweet) {
    return !!(tweet?.quote && tweet.quote.author);
}

function hasVideoContent(tweet) {
    return getAllMedia(tweet).some(isVideoMedia);
}

function hasImageContent(tweet) {
    return getAllMedia(tweet).some(isImageLikeMedia);
}

function getImageCount(tweet) {
    return getAllMedia(tweet).filter(isImageLikeMedia).length;
}

function getVideoCount(tweet) {
    return getAllMedia(tweet).filter(isVideoMedia).length;
}

module.exports = {
    isReplyTweet,
    isQuoteTweet,
    hasVideoContent,
    hasImageContent,
    getImageCount,
    getVideoCount,
};
```

- [ ] **Step 2: Import helper in extractor**

Add this import near the other local imports in `src/features/twitter/extractors/twitter-v2-extractor.js`:

```js
const mediaClassifier = require('./v2/media-classifier');
```

- [ ] **Step 3: Delegate existing methods**

Replace method bodies for `isReplyTweet`, `isQuoteTweet`, `hasVideoContent`, `hasImageContent`, `getImageCount`, and `getVideoCount` with compatibility wrappers:

```js
isReplyTweet(tweet) {
    return mediaClassifier.isReplyTweet(tweet);
}
```

Repeat the same pattern for the other five methods.

- [ ] **Step 4: Verify syntax and module load**

Run:

```powershell
node --check src\features\twitter\extractors\v2\media-classifier.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); console.log(x.isQuoteTweet({quote:{author:{}}}), x.hasVideoContent({media:{all:[{type:'video'}]}})); process.exit(0)"
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter extractor helper split ok'); process.exit(0)"
```

Expected:
- `node --check` prints no syntax errors.
- First `node -e` prints `true true`.
- Second `node -e` prints `twitter extractor helper split ok`.

- [ ] **Step 5: Dependency-aware review**

Run:

```powershell
rg -n "media-classifier|isReplyTweet\(|isQuoteTweet\(|hasVideoContent\(|hasImageContent\(|getImageCount\(|getVideoCount\(" src\features\twitter\extractors
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
```

Expected:
- Helper import appears once in `twitter-v2-extractor.js`.
- Class methods still exist as compatibility wrappers.
- No legacy posting/Gemini/Twitter API secrets or dependency references return.
- `git diff --check` has no whitespace errors.

- [ ] **Step 6: Local commit**

Run:

```powershell
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-media-classifier.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\media-classifier.js
git commit -m "refactor: extract twitter v2 media classifier"
```

Expected:
- A local commit is created.
- No push or deploy is performed.

## Self-Review

- Spec coverage: This plan covers the first extractor split only, not the full extractor cleanup.
- Placeholder scan: No placeholder implementation steps are left.
- Compatibility: Existing class method names stay available, so old call sites do not need to change in this task.
