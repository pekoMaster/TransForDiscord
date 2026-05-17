# YouTube Extractor Layout

Date: 2026-05-17

Scope: Move the low-risk YouTube `/live/` URL conversion extractor into the feature-oriented site tree while preserving the legacy extractor path.

Non-goals:
- Do not change YouTube conversion behavior.
- Do not rewrite the extractor manager.
- Do not push or deploy.

## Plan

- [x] Move `tfd-system/extractors/youtube.js` to `src/features/sites/video/youtube-extractor.js`.
- [x] Keep `tfd-system/extractors/youtube.js` as a compatibility adapter.
- [x] Update the moved implementation to use the shared logger path.
- [x] Update file inventory and refactor map documentation.
- [x] Verify syntax, adapter identity, behavior smoke, and old/new path references.
- [x] Review changed files plus coupled imports, naming, folder location, adapter, index, and call-site fallout before committing.
