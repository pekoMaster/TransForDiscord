# TFD Twitter V2 Extractor Tweet Fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tweet API fallback orchestration out of `twitter-v2-extractor.js` while preserving fxtwitter-first behavior and vxtwitter normalization.

**Architecture:** Add `src/features/twitter/extractors/v2/tweet-fetcher.js`. The helper receives injected `fetchJSON`, `normalizeVxTwitterResponse`, and `logFallback` callbacks so network behavior, normalization, and logging remain controlled by the extractor.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/tweet-fetcher.js`
  - Owns fxtwitter -> vxtwitter fallback order.
  - Does not import the logger or HTTP client directly.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `tweet-fetcher`.
  - Delegates `fetchTweetData(tid)` with callbacks.

## Task 1: Extract tweet fetcher

**Files:**
- Create: `src/features/twitter/extractors/v2/tweet-fetcher.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/tweet-fetcher.js`:

```js
async function fetchTweetData(tid, { fetchJSON, normalizeVxTwitterResponse, logFallback }) {
    const fxResp = await fetchJSON(`https://api.fxtwitter.com/i/status/${tid}`);
    if (fxResp && fxResp.tweet) {
        return { tweet: fxResp.tweet, source: 'fxtwitter' };
    }

    if (logFallback) {
        logFallback(tid);
    }

    const vxResp = await fetchJSON(`https://api.vxtwitter.com/i/status/${tid}`);
    if (vxResp) {
        const normalized = normalizeVxTwitterResponse(vxResp, tid);
        if (normalized) {
            return { tweet: normalized, source: 'vxtwitter' };
        }
    }

    return null;
}

module.exports = {
    fetchTweetData,
};
```

- [ ] **Step 2: Import helper and delegate wrapper**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, import:

```js
const tweetFetcher = require('./v2/tweet-fetcher');
```

Replace `fetchTweetData(tid)` with:

```js
return tweetFetcher.fetchTweetData(tid, {
    fetchJSON: url => this.httpClient.fetchJSON(url),
    normalizeVxTwitterResponse: (data, tweetId) => this.normalizeVxTwitterResponse(data, tweetId),
    logFallback: tweetId => tfd.sys('Twitter-Extractor', `fxtwitter 失敗，嘗試 vxtwitter fallback | TweetID: ${tweetId}`),
});
```

- [ ] **Step 3: Verify behavior with mocks**

Run:

```powershell
node --check src\features\twitter\extractors\v2\tweet-fetcher.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const f=require('./src/features/twitter/extractors/v2/tweet-fetcher'); let calls=[]; f.fetchTweetData('1',{fetchJSON:async url=>{calls.push(url); return url.includes('fxtwitter')?{tweet:{id:'fx'}}:null;}, normalizeVxTwitterResponse:()=>null, logFallback:()=>calls.push('fallback')}).then(r=>{console.log(r.source,r.tweet.id,calls.length); process.exit(0);})"
node -e "const f=require('./src/features/twitter/extractors/v2/tweet-fetcher'); let calls=[]; f.fetchTweetData('2',{fetchJSON:async url=>{calls.push(url); return url.includes('fxtwitter')?null:{user_screen_name:'u',description:'v'};}, normalizeVxTwitterResponse:(data,id)=>({id,text:data.description}), logFallback:id=>calls.push('fallback:'+id)}).then(r=>{console.log(r.source,r.tweet.id,r.tweet.text,calls.length,calls[1]); process.exit(0);})"
```

Expected:
- Syntax checks pass.
- fxtwitter success prints `fxtwitter fx 1`.
- vxtwitter fallback prints `vxtwitter 2 v 3 fallback:2`.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter tweet fetcher split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "tweet-fetcher|fetchTweetData\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-tweet-fetcher.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\tweet-fetcher.js
git commit -m "refactor: extract twitter v2 tweet fetcher"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts fetch orchestration but not HTTP client setup.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor `fetchTweetData()` method remains the call site used by extraction flow.
