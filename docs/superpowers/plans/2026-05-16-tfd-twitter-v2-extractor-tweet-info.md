# TFD Twitter V2 Extractor Tweet Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move small synchronous tweet info helpers out of `twitter-v2-extractor.js` while preserving extractor method names.

**Architecture:** Add `src/features/twitter/extractors/v2/tweet-info.js` for URL tweet ID extraction and quote tweet info extraction. Do not touch `src/features/twitter/interactions/v2/shared.js` because that parses tweet IDs from interaction custom IDs, not URLs.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/tweet-info.js`
  - Owns `extractTweetId(url)`.
  - Owns `getQuoteTweetInfo(tweet)`.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `tweet-info`.
  - Delegates the existing extractor methods.

## Task 1: Extract tweet info helpers

**Files:**
- Create: `src/features/twitter/extractors/v2/tweet-info.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/tweet-info.js`:

```js
function extractTweetId(url) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
}

function getQuoteTweetInfo(tweet) {
    try {
        if (tweet.quote && tweet.quote.author) {
            const quoteTweet = tweet.quote;
            return {
                tweet: quoteTweet,
                tweetId: quoteTweet.id,
                username: quoteTweet.author.screen_name,
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

module.exports = {
    extractTweetId,
    getQuoteTweetInfo,
};
```

- [ ] **Step 2: Import helper and delegate wrappers**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, import:

```js
const tweetInfo = require('./v2/tweet-info');
```

Replace `extractTweetId(url)`:

```js
return tweetInfo.extractTweetId(url);
```

Replace `getQuoteTweetInfo(tweet)`:

```js
return tweetInfo.getQuoteTweetInfo(tweet);
```

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\tweet-info.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const h=require('./src/features/twitter/extractors/v2/tweet-info'); console.log(h.extractTweetId('https://x.com/a/status/12345'), h.extractTweetId('https://x.com/a')); console.log(JSON.stringify(h.getQuoteTweetInfo({quote:{id:'q1',author:{screen_name:'qq'}}}))); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); console.log(x.extractTweetId('https://twitter.com/a/status/67890'), JSON.stringify(x.getQuoteTweetInfo({quote:{id:'q2',author:{screen_name:'rr'}}}))); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Helper prints `12345 null` and quote info JSON.
- Extractor wrapper prints `67890` and quote info JSON.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter tweet info split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "tweet-info|extractTweetId\(|getQuoteTweetInfo\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-tweet-info.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\tweet-info.js
git commit -m "refactor: extract twitter v2 tweet info helpers"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts only URL tweet ID parsing and quote info extraction.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor methods remain available to GAS mode, toggle-all, and tweet-data call sites.
