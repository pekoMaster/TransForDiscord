# TFD Twitter V2 Extractor Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 extractor image list extraction into a focused helper while preserving the extractor method used by embed building, pagination, and interaction handlers.

**Architecture:** Add a pure helper under `src/features/twitter/extractors/v2/`. The extractor keeps `extractImagesFromTweet()` as a compatibility wrapper. `media-pagination.js` is intentionally not changed in this task because its local function has different behavior for GIF media and no card-image fallback.

**Tech Stack:** Node.js CommonJS.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/images.js`
  - Owns extractor-specific image collection rules.
  - Optimizes Twitter `name=orig` and card image `name=*` URLs to `name=large`.
  - Falls back to video/GIF thumbnails only when no direct image media exists.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `images`.
  - Delegates `extractImagesFromTweet()`.

## Task 1: Extract image helper

**Files:**
- Create: `src/features/twitter/extractors/v2/images.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/images.js`:

```js
function optimizeTwitterImageUrl(url) {
    return url.replace('?name=orig', '?name=large');
}

function optimizeCardImageUrl(url) {
    return url.replace(/([?&])name=\w+/g, '$1name=large');
}

function extractImagesFromTweet(tweet) {
    const images = [];
    try {
        if (tweet.media && tweet.media.all && tweet.media.all.length > 0) {
            tweet.media.all.forEach(media => {
                if (media && media.type !== 'video' && media.type !== 'gif' && media.url) {
                    images.push({ ...media, url: optimizeTwitterImageUrl(media.url) });
                }
            });

            if (images.length === 0) {
                tweet.media.all.forEach(media => {
                    if (media && (media.type === 'video' || media.type === 'gif') && media.thumbnail_url) {
                        images.push({ ...media, url: optimizeTwitterImageUrl(media.thumbnail_url) });
                    }
                });
            }
        }

        if (images.length === 0 && tweet.card && tweet.card.image && tweet.card.image.url) {
            const cardImage = tweet.card.image;
            images.push({
                type: 'card',
                url: optimizeCardImageUrl(cardImage.url),
                width: cardImage.width,
                height: cardImage.height,
                alt: cardImage.alt,
            });
        }
    } catch (error) {
        return images;
    }
    return images;
}

module.exports = {
    extractImagesFromTweet,
};
```

- [ ] **Step 2: Import helper and delegate wrapper**

In `src/features/twitter/extractors/twitter-v2-extractor.js`, import:

```js
const imageHelpers = require('./v2/images');
```

Replace the body of `extractImagesFromTweet(tweet)` with:

```js
return imageHelpers.extractImagesFromTweet(tweet);
```

- [ ] **Step 3: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\images.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const h=require('./src/features/twitter/extractors/v2/images'); console.log(JSON.stringify(h.extractImagesFromTweet({media:{all:[{type:'photo',url:'https://pbs/img?name=orig'}]}}))); console.log(JSON.stringify(h.extractImagesFromTweet({media:{all:[{type:'video',thumbnail_url:'https://pbs/thumb?name=orig'}]}}))); console.log(JSON.stringify(h.extractImagesFromTweet({card:{image:{url:'https://pbs/card?format=jpg&name=small',width:1,height:2,alt:'a'}}}))); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); console.log(JSON.stringify(x.extractImagesFromTweet({media:{all:[{type:'photo',url:'https://pbs/img?name=orig'}]}}))); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Direct photo URL becomes `?name=large`.
- Video thumbnail fallback returns thumbnail URL with `?name=large`.
- Card URL changes `name=small` to `name=large`.
- Extractor wrapper returns the same direct photo result.

- [ ] **Step 4: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter images split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "v2/images|extractImagesFromTweet\(" src\features\twitter tfd-system handlers events
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-images.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\images.js
git commit -m "refactor: extract twitter v2 image helpers"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- `media-pagination.js` still has its separate local function because it is not behavior-equivalent.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This extracts extractor-specific image collection only.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing `extractImagesFromTweet()` method remains available to current interaction handlers.
