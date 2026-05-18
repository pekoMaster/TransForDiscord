# Facebook Disabled Cleanup Plan

**Status:** Planned only. Do not delete files in this note-only phase.

**Decision:** Facebook support is considered disabled in TFD. Existing Facebook extractor files are residual code paths and should be removed or archived in a focused cleanup phase.

**Current runtime facts:**
- `tfd-system/extractors/index.js` does not register Facebook extractors.
- `package.json` does not include `playwright` or `puppeteer`.
- Facebook URL patterns still exist in `src/core/routing/url-patterns.js`.
- Facebook extractor files and strategy adapters still exist under `tfd-system/extractors/` and `src/features/sites/facebook/`.

**Cleanup scope for a later phase:**
- Remove or archive Facebook extractor implementations and strategy adapters.
- Remove Facebook entries from the refactor map and file index after deletion.
- Decide whether Facebook URL patterns should be removed from routing or left as explicitly unsupported.
- Recheck optional browser dependency references after removal.
- Verify `ExtractorManager`, URL matching, and unsupported-site behavior.
