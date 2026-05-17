# Twitter Feature

This folder owns Twitter/X extraction, V2 container rendering, message state,
media attachment optimization, and Discord interaction handlers.

TFD does not provide Twitter posting. Translation uses the user's configured
provider API key through `src/features/translation`.

Old runtime paths under `handlers/`, `utils/`, and `tfd-system/extractors/`
remain as compatibility adapters during the project-wide restructure.

## V2 Interactions

`interactions/v2-router.js` is the stable dispatcher for Discord `v2_*`
buttons and modals. Detailed action logic lives in `interactions/v2/`:
translation, expand/collapse toggles, reload, spoiler handling, shared cache,
tweet hydration and cache-vs-refresh resolution, render-state preservation,
interaction message state access, view payload construction, optional repost
stats lookup, V2-to-classic V1 quote-collapse transition payloads, and view
rebuild/update helpers.

## V2 Extractor Helpers

`extractors/twitter-v2-extractor.js` remains the compatibility-facing
orchestrator. Focused helper logic lives in `extractors/v2/`:

| File | Responsibility |
|------|----------------|
| `article-response.js` | Article tweet classic embed response and action row construction |
| `classic-components.js` | Classic embed pagination, translate, expand, and reload buttons |
| `images.js` | Extractor-specific image lists, multiple image URLs, card fallback, spoiler URL prefixing |
| `media-classifier.js` | Reply/quote/media type checks and media counts |
| `media-policy.js` | Multiple embed and GAS-mode display policy decisions |
| `normalizer.js` | vxtwitter API response normalization into fxtwitter-compatible tweet data |
| `response-builders.js` | Profile embed, passthrough response, and error response builders |
| `tweet-fetcher.js` | fxtwitter first, vxtwitter fallback tweet fetch orchestration |
| `tweet-info.js` | URL tweet ID, quote info, and reply reference parsing |
| `video-links.js` | Video URL extraction and Discord link label formatting |
