# TFD Twitter V2 Extractor Multiple Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 `multipleImages` URL extraction into the existing image helper while preserving extractor logging and current spoiler behavior.

**Architecture:** Extend `src/features/twitter/extractors/v2/images.js` with `extractMultipleImages()`. Keep `TFDTwitterExtractor.extractMultipleImages()` as a compatibility wrapper that passes the current `tfd.sysError` behavior as an error callback.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Modify: `src/features/twitter/extractors/v2/images.js`
  - Add URL-array extraction for `result.multipleImages`.
  - Preserve `SPOILER_` prefix for blacklist level 2.
  - Preserve existing media filter: include any media where `type !== 'video'` and `url` exists.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Delegate `extractMultipleImages()` to the helper.
  - Keep current `tfd.sysError('Enhanced-Twitter', ...)` logging via callback.

## Task 1: Extract multiple image helper

**Files:**
- Modify: `src/features/twitter/extractors/v2/images.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Add helper function**

Add to `src/features/twitter/extractors/v2/images.js`:

```js
function withSpoilerPrefix(url, blacklistEntry) {
    return blacklistEntry && blacklistEntry.level === 2 ? `SPOILER_${url}` : url;
}

function extractMultipleImages(tweet, onError = null) {
    const images = [];
    const blacklistEntry = tweet._blacklistEntry;

    try {
        if (tweet.media && tweet.media.all) {
            tweet.media.all.forEach(media => {
                if (media && media.type !== 'video' && media.url) {
                    const optimizedUrl = media.url.replace('?name=orig', '?name=large');
                    images.push(withSpoilerPrefix(optimizedUrl, blacklistEntry));
                }
            });
        }

        if (images.length === 0 && tweet.card && tweet.card.image && tweet.card.image.url) {
            const cardImageUrl = tweet.card.image.url;
            const optimizedUrl = cardImageUrl.replace(/\?name=\w+/, '?name=large');
            images.push(withSpoilerPrefix(optimizedUrl, blacklistEntry));
        }
    } catch (error) {
        if (onError) {
            onError(error);
        }
    }
    return images;
}
```

Export `extractMultipleImages`.

- [ ] **Step 2: Delegate extractor method**

Replace the body of `extractMultipleImages(tweet)` in `src/features/twitter/extractors/twitter-v2-extractor.js`:

```js
return imageHelpers.extractMultipleImages(tweet, error => {
    tfd.sysError('Enhanced-Twitter', `提取多圖片失敗: ${error.message}`);
});
```

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\images.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const h=require('./src/features/twitter/extractors/v2/images'); console.log(JSON.stringify(h.extractMultipleImages({media:{all:[{type:'photo',url:'https://pbs/a?name=orig'},{type:'gif',url:'https://pbs/b?name=orig'},{type:'video',url:'https://pbs/c?name=orig'}]}}))); console.log(JSON.stringify(h.extractMultipleImages({_blacklistEntry:{level:2},media:{all:[{type:'photo',url:'https://pbs/a?name=orig'}]}}))); console.log(JSON.stringify(h.extractMultipleImages({card:{image:{url:'https://pbs/card?name=small'}}}))); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); console.log(JSON.stringify(x.extractMultipleImages({_blacklistEntry:{level:2},media:{all:[{type:'photo',url:'https://pbs/a?name=orig'}]}}))); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Photo and GIF are included; video is excluded.
- Blacklist level 2 result has `SPOILER_`.
- Card fallback uses `?name=large`.
- Extractor wrapper returns the same spoiler result.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter multiple images split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "extractMultipleImages\(|extractImagesFromTweet\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-multiple-images.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\images.js
git commit -m "refactor: extract twitter v2 multiple image helper"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts only `multipleImages` URL-array logic.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor method remains available to current result-building paths.
