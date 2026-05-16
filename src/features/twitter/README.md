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
tweet hydration, and view rebuild/update helpers.
