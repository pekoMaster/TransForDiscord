# TFD Twitter V2 Extractor Video Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Twitter V2 video URL extraction and formatting into a focused helper without changing extractor call sites.

**Architecture:** Add a pure `video-links` helper beside the existing V2 extractor helpers. Keep `TFDTwitterExtractor.formatVideoUrls`, `extractVideoUrls`, and `videoLinkFormat` as compatibility wrappers.

**Tech Stack:** Node.js CommonJS, existing Discord output format remains unchanged.

---

## File Structure

- Create: `src/features/twitter/extractors/v2/video-links.js`
  - Owns video media filtering, raw URL extraction, link label formatting, and single URL passthrough formatting.
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`
  - Imports `video-links`.
  - Delegates existing methods to the helper.

## Tasks

### Task 1: Extract video link helper

**Files:**
- Create: `src/features/twitter/extractors/v2/video-links.js`
- Modify: `src/features/twitter/extractors/twitter-v2-extractor.js`

- [ ] **Step 1: Create helper module**

Create `src/features/twitter/extractors/v2/video-links.js`:

```js
function isVideoMedia(media) {
    return media && (media.type === 'video' || media.type === 'gif') && media.url;
}

function videoLinkFormat(videoUrl) {
    return videoUrl || '';
}

function extractVideoUrls(tweet, formatVideoUrl = videoLinkFormat) {
    try {
        const mediaItems = Array.isArray(tweet?.media?.all) ? tweet.media.all : [];
        return mediaItems
            .filter(isVideoMedia)
            .map(media => formatVideoUrl(media.url));
    } catch (error) {
        return [];
    }
}

function formatVideoUrls(videoUrls) {
    if (!videoUrls || videoUrls.length === 0) {
        return [];
    }

    return videoUrls.map((url, index) => `[影片${index + 1}](${url})`);
}

module.exports = {
    formatVideoUrls,
    extractVideoUrls,
    videoLinkFormat,
};
```

- [ ] **Step 2: Import helper in extractor**

Add:

```js
const videoLinks = require('./v2/video-links');
```

- [ ] **Step 3: Delegate extractor methods**

Update the three existing methods:

```js
formatVideoUrls(videoUrls) {
    return videoLinks.formatVideoUrls(videoUrls);
}

extractVideoUrls(tweet) {
    return videoLinks.extractVideoUrls(tweet, url => this.videoLinkFormat(url));
}

videoLinkFormat(videoUrl) {
    return videoLinks.videoLinkFormat(videoUrl);
}
```

- [ ] **Step 4: Verify behavior**

Run:

```powershell
node --check src\features\twitter\extractors\v2\video-links.js
node --check src\features\twitter\extractors\twitter-v2-extractor.js
node -e "const v=require('./src/features/twitter/extractors/v2/video-links'); const tweet={media:{all:[{type:'video',url:'https://v/1.mp4'},{type:'gif',url:'https://v/2.mp4'},{type:'photo',url:'https://p/1.jpg'}]}}; console.log(JSON.stringify(v.extractVideoUrls(tweet)), JSON.stringify(v.formatVideoUrls(['https://v/1.mp4']))); process.exit(0)"
node -e "const T=require('./src/features/twitter/extractors/twitter-v2-extractor'); const x=new T(); const tweet={media:{all:[{type:'video',url:'https://v/1.mp4'},{type:'gif',url:'https://v/2.mp4'}]}}; console.log(JSON.stringify(x.extractVideoUrls(tweet)), JSON.stringify(x.formatVideoUrls(['https://v/1.mp4']))); process.exit(0)"
```

Expected:
- Syntax checks pass.
- Helper and extractor wrapper both return `["https://v/1.mp4","https://v/2.mp4"]`.
- Formatting returns `["[影片1](https://v/1.mp4)"]`.

- [ ] **Step 5: Review and commit**

Run:

```powershell
node -e "require('./tfd-system/extractors/twitter-v2'); require('./handlers/twitter-v2-interactions'); console.log('twitter video links split ok'); process.exit(0)"
node scripts\translation-smoke.js
rg -n "video-links|formatVideoUrls\(|extractVideoUrls\(|videoLinkFormat\(" src\features\twitter\extractors
rg -n "twitter-posting-handler|gemini-translator|twitter-api-v2|X_CONSUMER|X_ACCESS_TOKEN" src utils handlers events commands tfd-system package.json package-lock.json
git diff --check
git status --short
git add docs\superpowers\plans\2026-05-16-tfd-twitter-v2-extractor-video-links.md src\features\twitter\extractors\twitter-v2-extractor.js src\features\twitter\extractors\v2\video-links.js
git commit -m "refactor: extract twitter v2 video links"
```

Expected:
- Existing adapter load still passes.
- Translation smoke still passes.
- No legacy posting/Gemini/Twitter API dependency references return.
- Commit is local only; no push or deploy.

## Self-Review

- Spec coverage: This plan only extracts video URL helper logic.
- Placeholder scan: No placeholders remain.
- Compatibility: Existing extractor methods remain in place for current call sites.
