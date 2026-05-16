# TFD Twitter V2 Extractor Reply Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move reply target parsing out of `getReplyTweetInfo()` while keeping reply tweet fetching in the extractor.

**Architecture:** Extend `src/features/twitter/extractors/v2/tweet-info.js` with `getReplyReference(tweet)`. The helper returns only `{ replyTweetId, replyUsername }`; `getReplyTweetInfo()` continues to own HTTP fetch and result assembly.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Modify: `src/features/twitter/extractors/v2/tweet-info.js`
  - Add reply target parsing from `replying_to`, `replying_to_status`, leading mention, and current special mappings.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Use `tweetInfo.getReplyReference(tweet)` inside `getReplyTweetInfo()`.
  - Keep the existing fetch logic unchanged.

## Task 1: Extract reply reference parsing

**Files:**
- Modify: `src/features/twitter/extractors/v2/tweet-info.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Add helper**

Add to `src/features/twitter/extractors/v2/tweet-info.js`:

```js
function getReplyReference(tweet) {
    let replyTweetId = null;
    let replyUsername = null;

    if (tweet.replying_to) {
        replyUsername = tweet.replying_to;
    }

    if (tweet.replying_to_status) {
        replyTweetId = tweet.replying_to_status;
    }

    if (!replyUsername && tweet.text) {
        const mentionMatch = tweet.text.match(/^@(\w+)/);
        if (mentionMatch) {
            replyUsername = mentionMatch[1];
        }
    }

    if (!replyTweetId && replyUsername) {
        const testMappings = {
            hikosan333: {
                '1970330275587736012': '1970128496702980398',
            },
            Wadai__2: {
                '1970348758677495897': '1970114575598280800',
            },
        };

        if (testMappings[replyUsername] && testMappings[replyUsername][tweet.id]) {
            replyTweetId = testMappings[replyUsername][tweet.id];
        }
    }

    return {
        replyTweetId,
        replyUsername,
    };
}
```

Export `getReplyReference`.

- [ ] **Step 2: Use helper in extractor**

Replace the parsing section in `getReplyTweetInfo(tweet)` with:

```js
const { replyTweetId, replyUsername } = tweetInfo.getReplyReference(tweet);
```

Leave the HTTP fetch and return object unchanged.

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\tweet-info.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const h=require('./src/features/twitter/extractors/v2/tweet-info'); console.log(JSON.stringify(h.getReplyReference({replying_to:'user',replying_to_status:'123'}))); console.log(JSON.stringify(h.getReplyReference({text:'@abc hello'}))); console.log(JSON.stringify(h.getReplyReference({id:'1970330275587736012',replying_to:'hikosan333'}))); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); x.httpClient.fetchJSON=async()=>({tweet:{id:'r'}}); x.getReplyTweetInfo({replying_to:'user',replying_to_status:'123'}).then(r=>{console.log(r.username,r.tweetId,r.tweet.id); process.exit(0);})"
```

Expected:
- Syntax checks pass.
- Helper prints parsed username/id, mention fallback, and special mapping.
- Extractor wrapper prints `user 123 r`.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter reply reference split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "getReplyReference|getReplyTweetInfo\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-reply-reference.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\tweet-info.js
git commit -m "refactor: extract twitter v2 reply reference helper"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts reply reference parsing only, not network fetch.
- Placeholder scan: No placeholders remain.
- Compatibility: `getReplyTweetInfo()` remains the public extractor method used by interaction handlers.
