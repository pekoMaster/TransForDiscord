# TFD Twitter V2 Extractor Normalizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move vxtwitter-to-fxtwitter response normalization out of `twitter-v2-extractor.js` without touching network fallback behavior.

**Architecture:** Add a pure normalizer helper under `src/features/twitter/extractors/v2/`. Keep `TFDTwitterExtractor.normalizeVxTwitterResponse()` as a compatibility wrapper used by `fetchTweetData()`.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/normalizer.js`
  - Owns vxtwitter response normalization.
  - Produces fxtwitter-compatible tweet objects.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `normalizer`.
  - Delegates `normalizeVxTwitterResponse()`.

## Task 1: Extract vxtwitter normalizer

**Files:**
- Create: `src/features/twitter/extractors/v2/normalizer.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/normalizer.js`:

```js
function normalizeVxTwitterResponse(data, tid) {
    if (!data) return null;

    const tweetId = data.tweetID || tid;
    const text = data.text || data.description || '';
    const userScreenName = data.user_screen_name || '';
    const userName = data.user_name || userScreenName;
    const profileImageUrl = data.user_profile_image_url || '';

    if (!userScreenName) return null;

    const tweet = {
        id: tweetId,
        text,
        created_timestamp: data.date_epoch || null,
        author: {
            id: null,
            name: userName,
            screen_name: userScreenName,
            profile_image_url_https: profileImageUrl,
            avatar_url: profileImageUrl,
        },
        engagement: {
            likes: data.likes || 0,
            retweets: data.retweets || 0,
            replies: data.replies || 0,
            views: data.views || 0,
        },
        media: null,
        replying_to: null,
        replying_to_status: null,
        quote: null,
        _fromVxTwitter: true,
    };

    if (data.media_extended && data.media_extended.length > 0) {
        tweet.media = {
            all: data.media_extended.map(media => {
                const mediaType = media.type === 'image' ? 'photo' : (media.type || 'photo');
                if (mediaType === 'video' || mediaType === 'gif') {
                    return {
                        type: mediaType,
                        url: media.thumbnail_url || media.url,
                        variants: media.url ? [{ url: media.url, bitrate: 2176000, content_type: 'video/mp4' }] : [],
                    };
                }
                return { type: 'photo', url: media.url };
            }),
        };
    } else if (data.mediaURLs && data.mediaURLs.length > 0) {
        tweet.media = { all: data.mediaURLs.map(url => ({ type: 'photo', url })) };
    }

    return tweet;
}

module.exports = {
    normalizeVxTwitterResponse,
};
```

- [ ] **Step 2: Import helper and delegate wrapper**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, import:

```js
const normalizer = require('./v2/normalizer');
```

Replace the body of `normalizeVxTwitterResponse(data, tid)` with:

```js
return normalizer.normalizeVxTwitterResponse(data, tid);
```

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\normalizer.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const n=require('./src/features/twitter/extractors/v2/normalizer'); const out=n.normalizeVxTwitterResponse({tweetID:'1',text:'hi',user_screen_name:'user',media_extended:[{type:'image',url:'https://p/1.jpg'},{type:'video',url:'https://v/1.mp4',thumbnail_url:'https://v/t.jpg'}]}, 'fallback'); console.log(out.id, out.author.screen_name, out.media.all[0].type, out.media.all[1].variants[0].content_type); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); const out=x.normalizeVxTwitterResponse({description:'desc',user_screen_name:'user',mediaURLs:['https://p/1.jpg']}, 'fallback'); console.log(out.id, out.text, out.media.all[0].url); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Helper prints `1 user photo video/mp4`.
- Extractor wrapper prints `fallback desc https://p/1.jpg`.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter normalizer split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "normalizer|normalizeVxTwitterResponse\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-normalizer.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\normalizer.js
git commit -m "refactor: extract twitter v2 normalizer"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts only response normalization, not network fetch fallback.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor method remains available to `fetchTweetData()`.
