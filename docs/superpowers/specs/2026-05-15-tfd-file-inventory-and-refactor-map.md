# TFD File Inventory and Refactor Map

Date: 2026-05-15

Status: Phase 1 translation migration and Phase 3 Twitter migration plans created; inventory remains the source map for later phases.

Scope: Whole TransForDiscord repository, not only translation.

Non-goals for this document:
- It does not move files.
- It does not change runtime behavior.
- It does not replace the implementation plan. It is the input for that plan.

## Why This Exists

The repository currently mixes domains, infrastructure, platform-specific code, interaction handlers, caches, and compatibility adapters in broad folders such as `handlers/`, `utils/`, and `tfd-system/`. That makes human maintenance difficult because the folder name often describes the old file type rather than the actual feature or responsibility.

The refactor should be driven by a file inventory first. Each file needs a known purpose, owner domain, target location, and migration action before we move anything.

## Classification Rules

File types:

| Type | Meaning |
|---|---|
| `entrypoint` | Starts the bot, web API, or deployment flow. |
| `event-router` | Routes Discord events or component IDs to feature handlers. |
| `command` | Slash/context command definition and execution. |
| `interaction-handler` | Discord button/modal/select behavior. |
| `extractor` | Fetches and normalizes external platform content. |
| `renderer` | Builds Discord embeds/components or HTML/video output. |
| `service` | Business workflow that coordinates lower-level modules. |
| `provider` | External API implementation such as Gemini/OpenRouter. |
| `cache-store` | Cache persistence or in-memory cache API. |
| `state-store` | Runtime state for messages/interactions. |
| `db-access` | Database schema and prepared statements. |
| `utility` | Shared helper with no feature ownership. |
| `adapter` | Legacy compatibility export or bridge. |
| `config` | Static configuration. |
| `doc` | Documentation/specification. |
| `script` | Local migration/sync/test/deployment helper. |
| `web` | Web dashboard or serverless web endpoint. |

Recommended actions:

| Action | Meaning |
|---|---|
| `move` | Move as-is into a clearer domain folder. |
| `split` | File has multiple responsibilities and should be decomposed. |
| `merge` | Combine with closely related duplicate logic. |
| `keep` | Leave in place for now. |
| `legacy-adapter` | Keep old path as a thin `module.exports = require(...)` bridge. |
| `docs-only` | Documentation only; organize but no runtime risk. |
| `delete-after-verify` | Candidate for removal after confirming no runtime dependency. |
| `done-removed` | Removed after confirming no runtime dependency. |

## Target Dependency Direction

Allowed direction:

```txt
app -> features -> core -> shared
app -> core -> shared
features -> shared
features -> core only through stable service interfaces
```

Avoid:

```txt
shared -> features
core -> app
feature A -> feature B internals
extractors -> handlers
handlers -> random utils by relative path
```

Known current violations or smell:
- `tfd-system/extractors/twitter-v2.js` reaches into `handlers/twitter-v2-container-builder`.
- `tfd-system/core/message-handler-v2.js` imports handlers and many feature utilities directly.
- `events/interactionCreate.js` contains the routing table inline instead of delegating to feature routers.
- `utils/` contains feature-owned modules for translation, Pixiv, PTT, Twitter state, moderation, browser, webhook, auth, and cache.

## Imported Fix Requirements

2026-05-16 reference inputs:

- `doc/FIX_TFD_IS_NOT_DEFINED.md`: local reference report for blacklist misses, `tfd is not defined`, PTT author fallback, V2 blacklist warning behavior, and `/pe blacklist list` pagination.
- `D:\OneDrive\RB\DISCORDBOT\4.0\docs\twitter-quote-expand-optimization.md`: external 4.0 design reference for Twitter quote auto-expand and V1/V2 transition behavior; do not edit 4.0 as part of TFD work.

Imported status:

- `tfd is not defined`: fix by moving logger requires to module scope where they are still block-scoped.
- `normalize-author` embed compatibility: done in `src/features/moderation/normalize-author.js`; old `utils/normalize-author.js` remains an adapter.
- PTT `result.data.author`: add to moderation author normalization and smoke coverage.
- V2 blacklist Level 1 warning and unsafe `result.embed.data` access: moved to `src/features/moderation/blacklist-result-decorator.js`; `message-handler-v2` now delegates Level 1/2 decoration.
- `/pe blacklist list` Embed pagination: moved to `src/features/moderation/blacklist-list-presenter.js`; `commands/pe.js` delegates list rendering and pagination.
- Twitter quote auto-expand and V1/V2 transition behavior: moved initial display policy to `src/features/twitter/extractors/v2/quote-display-policy.js`; extractor now applies V1/V2 default state, V1 expand can route to V2, and V2 collapse attempts V1 edit with bot-send fallback if Discord rejects Components V2 -> Embed edits.
- Pixiv reload production error: addressed in `src/features/pixiv/cache/pixiv-cache-manager.js` by adding `deleteArtworkCache`; verify reload handler and cache manager API before further Pixiv moves.

## Proposed Top-Level Structure

```txt
src/
  app/
    bootstrap/
    commands/
    events/
    web-api/

  core/
    config/
    extraction/
    message/
    rendering/
    routing/

  features/
    translation/
    twitter/
    pixiv/
    ptt/
    reports/
    spoilers/
    moderation/
    sites/

  shared/
    browser/
    cache/
    crypto/
    db/
    discord/
    http/
    logging/
    rate-limit/
    webhook/

scripts/
docs/
web/
```

Migration principle: create new files under `src/`, then turn old paths into compatibility adapters until all callers are migrated.

## Inventory: Root and Operations

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `.env.example` | Example environment variables. | config | app/config | `src/core/config/.env.example` or root | keep | Root is acceptable for env examples. |
| `.gitignore` | Git ignore rules. | config | repo | root | keep | Repo-level file. |
| `CLAUDE.md` | Developer guide and working notes. | doc | docs | `docs/CLAUDE.md` or root | keep | Root visibility is useful; update after restructure. |
| `Dockerfile` | Container build entry. | config | deploy | root | keep | Deployment-facing root file. |
| `ecosystem.config.js` | PM2 process config. | config | deploy | root | keep | Deployment-facing root file. |
| `index.js` | Main bot entrypoint, Discord client, startup GC, Express stats endpoint. | entrypoint | app | `src/app/bootstrap/bot.js` | move + legacy-adapter | Keep root `index.js` as launcher. |
| `package.json` | NPM scripts and dependencies. | config | repo | root | keep | Add future scripts for inventory/checks. |
| `package-lock.json` | Dependency lockfile. | config | repo | root | keep | Do not hand-edit. |
| `scripts/deploy-commands.js` | Canonical Discord slash/context command deployment script. | script | deploy/app | `scripts/deploy-commands.js` | keep | Do not run during refactor verification. |
| `deploy.js` | Root compatibility wrapper for command deployment script. | adapter | deploy/app | `scripts/deploy-commands.js` | done-adapter | Preserves `node deploy.js` usage. |
| `db-pull.bat` | Legacy root wrapper for Windows DB pull. | adapter | ops | `scripts/ops/db-pull.bat` | done-adapter | Root command remains; real implementation reads root paths through `ROOT_DIR`. |
| `db-pull.sh` | Legacy root wrapper for shell DB pull. | adapter | ops | `scripts/ops/db-pull.sh` | done-adapter | Root command remains; real implementation reads root `.env`. |
| `db-push.sh` | Legacy root wrapper for shell DB push/restore. | adapter | ops | `scripts/ops/db-push.sh` | done-adapter | High-risk command remains available through wrapper; not executed during refactor. |
| `setup-schedule.bat` | Legacy root wrapper for Windows scheduling helper. | adapter | ops | `scripts/ops/setup-schedule.bat` | done-adapter | Schedules root `db-pull.bat` wrapper for path stability. |
| `scripts/ops/db-pull.bat` | Windows helper to pull DB from server. | script | ops | `scripts/ops/db-pull.bat` | keep | Implementation. |
| `scripts/ops/db-pull.sh` | Shell helper to pull DB from server. | script | ops | `scripts/ops/db-pull.sh` | keep | Implementation. |
| `scripts/ops/db-push.sh` | Shell helper to push DB to server. | script | ops | `scripts/ops/db-push.sh` | keep | High-risk recovery implementation. |
| `scripts/ops/setup-schedule.bat` | Windows scheduling helper. | script | ops | `scripts/ops/setup-schedule.bat` | keep | Implementation. |
| `TFD_UNIFIED_SPEC.md` | Older unified architecture/spec notes. | doc | docs | `docs/archive/TFD_UNIFIED_SPEC.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |

## Inventory: App Commands and Events

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `commands/pe.js` | `/pe` command: API keys, model selection, log channel, owner, blacklist settings. | command | app/moderation/translation | `src/app/commands/pe-command.js` | split | Split API-key subcommands from guild/moderation settings later. |
| `commands/tfd-context-actions.js` | Message context actions for delete/spoiler/report flows. | command | app/reports/spoilers | `src/app/commands/context-actions.js` | split | Contains command definition plus interaction-like behavior. |
| `events/interactionCreate.js` | Central interaction router for commands, modals, buttons, selects. | event-router | app | `src/app/events/interaction-create.js` | split | Move prefix routing to feature routers. |
| `src/features/pixiv/interactions/pagination.js` | Canonical Pixiv pagination buttons and memory cache. | interaction-handler | pixiv | `src/features/pixiv/interactions/pagination.js` | keep | Owns Pixiv pagination button behavior. |
| `events/pixiv-pagination-interactions.js` | Legacy adapter for Pixiv pagination buttons. | adapter | pixiv | `src/features/pixiv/interactions/pagination.js` | done-adapter | Preserves interactionCreate old require path. |
| `events/ptt-pagination-interactions.js` | PTT pagination, reload, expand/collapse and memory cache. | interaction-handler | ptt | `src/features/ptt/interactions/pagination.js` | split | Contains multiple PTT interaction types. |

## Inventory: Interaction Handlers

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `src/features/translation/cache/content-cache.js` | Canonical short-lived content text cache for translation buttons. | cache-store | translation/twitter | `src/features/translation/cache/content-cache.js` | keep | Used by Twitter classic/V2 translation flows. |
| `handlers/content-translation-interactions.js` | Legacy adapter for content translation cache. | adapter | translation/twitter | `src/features/translation/cache/content-cache.js` | done-adapter | Old name suggests handler but now only preserves require compatibility. |
| `src/features/pixiv/interactions/reload.js` | Canonical Pixiv reload interaction and webhook edit. | interaction-handler | pixiv | `src/features/pixiv/interactions/reload.js` | keep | Depends on Pixiv extractor/cache/webhook. |
| `handlers/pixiv-reload-interactions.js` | Legacy adapter for Pixiv reload interaction. | adapter | pixiv | `src/features/pixiv/interactions/reload.js` | done-adapter | Preserves interactionCreate old require path. |
| `handlers/report-button-interactions.js` | Report button tree: spoiler, recall, blacklist, admin approval, modals/selects. | interaction-handler | reports/moderation | `src/features/reports/interactions/report-router.js` | split | Large file; split router/actions/modals/admin. |
| `handlers/spoiler-button-interactions.js` | Anti-spoiler transformation and modal handling for normal messages. | interaction-handler | spoilers | `src/features/spoilers/interactions/spoiler-buttons.js` | split | Also contains spoiler rendering helpers. |
| `src/features/twitter/interactions/toggle-all.js` | Canonical Twitter expand/collapse all for quote/reply/full text. | interaction-handler | twitter | `src/features/twitter/interactions/toggle-all.js` | keep | Depends on translation/content caches. |
| `src/features/twitter/interactions/expand.js` | Canonical Twitter full-text expand/collapse for classic embeds. | interaction-handler | twitter | `src/features/twitter/interactions/expand.js` | keep | Uses cached content and translation state. |
| `handlers/twitter-all-interactions.js` | Legacy adapter for Twitter expand/collapse all handler. | adapter | twitter | `src/features/twitter/interactions/toggle-all.js` | done-adapter | Preserves old interactionCreate require path. |
| `handlers/twitter-expand-interactions.js` | Legacy adapter for Twitter full-text expand/collapse handler. | adapter | twitter | `src/features/twitter/interactions/expand.js` | done-adapter | Preserves old interactionCreate require path. |
| `handlers/twitter-interactions.js` | Removed legacy owner-only Twitter posting workflow. | adapter | twitter/legacy | n/a | done-removed | Removed or already absent after runtime reference search found no active internal dependency. |
| `handlers/twitter-pagination-interactions.js` | Twitter media pagination and image merge/split controls. | interaction-handler | twitter | `src/features/twitter/interactions/media-pagination.js` | split | Media rendering logic should move to `media/`. |
| `src/features/twitter/interactions/reload.js` | Canonical classic Twitter embed reload flow. | interaction-handler | twitter | `src/features/twitter/interactions/reload.js` | keep | Could share reload service with V2. |
| `handlers/twitter-reload-interactions.js` | Legacy adapter for classic Twitter reload flow. | adapter | twitter | `src/features/twitter/interactions/reload.js` | done-adapter | Preserves old interactionCreate require path. |
| `handlers/twitter-translate-interactions.js` | Classic Twitter translation button flow, cache/state, embed update. | interaction-handler | twitter/translation | `src/features/twitter/interactions/translation.js` | split | Handler still owns too much cache/state/UI mapping. |
| `handlers/twitter-v2-container-builder.js` | Builds Twitter V2 Discord Components container and re-exports legacy cache/state helpers. | renderer | twitter | `src/features/twitter/containers/v2-container-builder.js` | split-done | Tweet runtime cache lives in `src/features/twitter/state/v2-tweet-cache.js`; component state lives in `src/features/twitter/state/v2-component-state.js`; action rows live in `src/features/twitter/containers/v2/action-rows.js`. |
| `handlers/twitter-v2-interactions.js` | Twitter V2 translate/original, expand/collapse, reload, spoiler modal flow. | interaction-handler | twitter | `src/features/twitter/interactions/v2-router.js` | split | Translate/toggle/reload/spoiler modules are split; render-state fallback/merge lives in `src/features/twitter/interactions/v2/render-state.js`; Components edit payload building lives in `src/features/twitter/interactions/v2/view-payload.js`; continue separating edit/render concerns incrementally. |

## Inventory: Database and Scripts

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `db/index.js` | SQLite connection, schema init, prepared statements and DB API. | db-access | shared/db | `src/shared/db/index.js` | split | Split schema init, API groups, migrations. |
| `src/shared/db/schema.sql` | Canonical SQLite schema. | db-access | shared/db | `src/shared/db/schema.sql` | keep | Loaded by `db/index.js`; SQL file has no legacy adapter. |
| `scripts/migrate-from-json.js` | Legacy wrapper for old JSON settings/API keys migration. | adapter | migration | `scripts/migrations/migrate-from-json.js` | done-adapter | Real script moved; old command still calls `main()`. |
| `scripts/sync-blacklist-from-4.0.js` | Legacy wrapper for sibling `4.0` blacklist import. | adapter | migration/moderation | `scripts/migrations/sync-blacklist-from-4.0.js` | done-adapter | Real script moved; old command still calls `main()`. |
| `scripts/translation-smoke.js` | Legacy wrapper for deterministic translation subsystem smoke tests. | adapter | translation/test | `scripts/smoke/translation-smoke.js` | done-adapter | Real smoke moved; old command still executes it. |
| `scripts/migrations/migrate-from-json.js` | Migrates old JSON settings/API keys into SQLite. | script | migration | `scripts/migrations/migrate-from-json.js` | keep | Depends on DB and crypto. |
| `scripts/migrations/sync-blacklist-from-4.0.js` | Imports blacklist data from sibling `4.0` project data. | script | migration/moderation | `scripts/migrations/sync-blacklist-from-4.0.js` | keep | Project-specific one-off; guarded behind `main()` for safe require. |
| `scripts/smoke/translation-smoke.js` | Deterministic smoke tests for translation subsystem. | script | translation/test | `scripts/smoke/translation-smoke.js` | keep | Old `scripts/translation-smoke.js` remains as wrapper. |

## Inventory: Core TFD System

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `tfd-system/index.js` | PekoEmbed system initializer/health/dependency checks. | service | core/app | `src/core/system/pekoembed-system.js` | move | Singleton export can remain via adapter. |
| `src/core/config/config-loader.js` | Runtime config loader/accessor for current JSON config files. | service | core/config | `src/core/config/config-loader.js` | keep | Transitional layer before moving JSON config files. |
| `tfd-system/config/pekoembed-config.json` | PekoEmbed feature config. | config | core/config | `src/core/config/pekoembed-config.json` | move | Move only after config loader covers all active reads. |
| `tfd-system/config/supported-sites.json` | Supported site registry. | config | core/config | `src/core/config/supported-sites.json` | move | Validate JSON/encoding before moving; could become extractor registry metadata. |
| `tfd-system/config/tfd-config.json` | Runtime config data for HTTP/timeouts/rendering. | config | core/config | `src/core/config/tfd-config.json` | move | Active runtime reads now go through `src/core/config/config-loader.js`; file move remains pending. |
| `tfd-system/core/link-processor.js` | URL matching, extractor dispatch, abuse/stat recording. | service | core/routing | `src/core/routing/link-processor.js` | split | Move abuse/stat side effects behind services. |
| `tfd-system/core/message-handler-v2.js` | Main message pipeline: URL handling, render/send/edit, feature branching. | service | core/message | `src/core/message/message-handler.js` | split | Highest-risk file; decompose last. |
| `src/core/routing/url-matcher.js` | Canonical URL matcher class using patterns. | service | core/routing | `src/core/routing/url-matcher.js` | keep | Clear responsibility. |
| `src/core/routing/url-patterns.js` | Canonical URL regex patterns. | config | core/routing | `src/core/routing/url-patterns.js` | keep | Could be generated from supported-sites metadata later. |
| `tfd-system/regex/matcher.js` | Legacy adapter for URL matcher class. | adapter | core/routing | `src/core/routing/url-matcher.js` | done-adapter | Preserves link-processor import path. |
| `tfd-system/regex/patterns.js` | Legacy adapter for URL regex patterns. | adapter | core/routing | `src/core/routing/url-patterns.js` | done-adapter | Preserves old regex import path. |
| `src/core/rendering/html-video-renderer.js` | Canonical HTML video page renderer. | renderer | core/rendering | `src/core/rendering/html-video-renderer.js` | keep | Shared by Twitter mixed media. |
| `src/core/rendering/mixed-media-html-builder.js` | Canonical mixed media HTML builder. | renderer | core/rendering | `src/core/rendering/mixed-media-html-builder.js` | keep | Uses HTMLVideoRenderer. |
| `tfd-system/render/html-video-renderer.js` | Legacy adapter for HTML video page renderer. | adapter | core/rendering | `src/core/rendering/html-video-renderer.js` | done-adapter | Preserves old render import path. |
| `tfd-system/render/mixed-media-html-builder.js` | Legacy adapter for mixed media HTML builder. | adapter | core/rendering | `src/core/rendering/mixed-media-html-builder.js` | done-adapter | Preserves old render import path. |
| `tfd-system/utils/dom-parser.js` | Legacy adapter for Cheerio DOM extraction helper. | adapter | shared/html | `src/shared/html/dom-parser.js` | done-adapter | Runtime extractor imports moved to shared path. |
| `tfd-system/utils/embed-builder.js` | Legacy adapter for generic Discord embed builder wrapper. | adapter | shared/discord | `src/shared/discord/embed-builder.js` | done-adapter | Runtime extractor imports moved to shared path. |
| `tfd-system/utils/http-client.js` | Legacy adapter for Axios HTTP client with config defaults. | adapter | shared/http | `src/shared/http/http-client.js` | done-adapter | Runtime extractor and Twitter imports moved to shared path. |
| `tfd-system/utils/text-truncator.js` | Legacy adapter for Discord-safe text truncation. | adapter | shared/discord | `src/shared/discord/text-truncator.js` | done-adapter | Runtime Twitter imports moved to shared path. |
| `tfd-system/utils/tunnel-url-provider.js` | Legacy adapter for Cloudflare tunnel URL and Twitter URL conversion helper. | adapter | shared/web | `src/shared/web/tunnel-url-provider.js` | done-adapter | No runtime consumers currently; old path remains compatible for future tunnel/proxy work. |
| `tfd-system/utils/url-converter-logger.js` | Legacy adapter for URL conversion decision logger. | adapter | shared/logging | `src/shared/logging/url-converter-logger.js` | done-adapter | Runtime extractor imports moved to shared logging path. |
| `tfd-system/utils/url-stats.js` | Legacy adapter for URL repost stats persistence and lookup. | adapter | shared/analytics | `src/shared/analytics/url-stats.js` | done-adapter | Runtime message and Twitter imports moved to shared analytics path. |

## Inventory: Extractors

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `tfd-system/extractors/index.js` | ExtractorManager registry and lazy loading. | service | core/extraction | `src/core/extraction/extractor-manager.js` | split | Registry metadata should be config-driven. |
| `tfd-system/extractors/twitter-v2.js` | Main Twitter/X extractor, V2 components data, quote/reply/media helpers. | extractor | twitter | `src/features/twitter/extractors/twitter-v2-extractor.js` | split | Huge file; separate API/data/media/container boundary. |
| `src/features/twitter/extractors/twitter-legacy-extractor.js` | Canonical legacy Twitter embed extractor. | extractor | twitter | `src/features/twitter/extractors/twitter-legacy-extractor.js` | keep | Keep until V2 fully replaces classic. |
| `tfd-system/extractors/twitter-legacy.js` | Legacy adapter for Twitter legacy embed extractor. | adapter | twitter | `src/features/twitter/extractors/twitter-legacy-extractor.js` | done-adapter | Preserves old extractor registry path. |
| `src/features/twitter/media/image-attachment-optimizer.js` | Canonical Twitter image attachment optimizer. | service | twitter/media | `src/features/twitter/media/image-attachment-optimizer.js` | keep | Media service. |
| `src/features/twitter/media/video-attachment-optimizer.js` | Canonical Twitter video attachment optimizer. | service | twitter/media | `src/features/twitter/media/video-attachment-optimizer.js` | keep | Media service. |
| `tfd-system/extractors/twitter-image-attachment-optimizer.js` | Legacy adapter for Twitter image attachment optimizer. | adapter | twitter/media | `src/features/twitter/media/image-attachment-optimizer.js` | done-adapter | Preserves old extractor path. |
| `tfd-system/extractors/twitter-video-attachment-optimizer.js` | Legacy adapter for Twitter video attachment optimizer. | adapter | twitter/media | `src/features/twitter/media/video-attachment-optimizer.js` | done-adapter | Preserves old extractor path. |
| `tfd-system/extractors/pixiv.js` | Pixiv artwork extractor and embed/media preparation. | extractor | pixiv | `src/features/pixiv/extractors/pixiv-extractor.js` | split | Large; cache/media/R18 hooks should be separated. |
| `src/features/pixiv/media/image-attachment-optimizer.js` | Canonical Pixiv image attachment optimizer. | service | pixiv/media | `src/features/pixiv/media/image-attachment-optimizer.js` | keep | Pair with ugoira processor. |
| `tfd-system/extractors/pixiv-image-attachment-optimizer.js` | Legacy adapter for Pixiv image attachment optimizer. | adapter | pixiv/media | `src/features/pixiv/media/image-attachment-optimizer.js` | done-adapter | Preserves message-handler import path. |
| `tfd-system/extractors/ptt.js` | PTT article extractor, cache integration, long text/pagination helpers. | extractor | ptt | `src/features/ptt/extractors/ptt-extractor.js` | split | Large; article parsing/rendering/cache should separate. |
| `tfd-system/extractors/threads.js` | Threads extractor with OG/browser fallback and V2 components. | extractor | sites/threads | `src/features/sites/threads/threads-extractor.js` | split | Browser fallback could use shared browser service. |
| `tfd-system/extractors/facebook.js` | Disabled Facebook extractor with Puppeteer/Playwright fallbacks. | disabled | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `tfd-system/extractors/facebook-smart.js` | Disabled Facebook strategy router across normal/mbasic/login/browser. | disabled | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `src/features/sites/facebook/strategies/mbasic.js` | Disabled Facebook mbasic fallback extractor. | disabled | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `src/features/sites/facebook/strategies/with-login.js` | Disabled Facebook logged-in browser extractor. | disabled | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `src/features/sites/facebook/strategies/facebookez.js` | Disabled FacebookEZ/fx style extractor. | disabled | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `tfd-system/extractors/facebook-mbasic.js` | Disabled legacy adapter for Facebook mbasic fallback extractor. | disabled-adapter | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `tfd-system/extractors/facebook-with-login.js` | Disabled legacy adapter for Facebook logged-in browser extractor. | disabled-adapter | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `tfd-system/extractors/facebookez.js` | Disabled legacy adapter for FacebookEZ/fx style extractor. | disabled-adapter | sites/facebook | n/a | remove-pending | Facebook support is closed; remove or archive in focused cleanup. |
| `tfd-system/extractors/instagram.js` | Legacy adapter for Instagram extractor. | adapter | sites/instagram | `src/features/sites/instagram/instagram-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `src/features/sites/instagram/instagram-extractor.js` | Instagram extractor. | extractor | sites/instagram | `src/features/sites/instagram/instagram-extractor.js` | keep | Canonical site extractor implementation. |
| `tfd-system/extractors/bahamut.js` | Legacy adapter for Bahamut extractor. | adapter | sites/bahamut | `src/features/sites/bahamut/bahamut-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `src/features/sites/bahamut/bahamut-extractor.js` | Bahamut extractor. | extractor | sites/bahamut | `src/features/sites/bahamut/bahamut-extractor.js` | keep | Canonical site extractor implementation. |
| `tfd-system/extractors/4gamers.js` | Legacy adapter for 4Gamers news extractor. | adapter | sites/news | `src/features/sites/news/4gamers-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/52poke.js` | Legacy adapter for PokeWiki extractor. | adapter | sites/wiki | `src/features/sites/wiki/52poke-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/bilibili.js` | Legacy adapter for Bilibili extractor. | adapter | sites/video | `src/features/sites/video/bilibili-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/cts.js` | Legacy adapter for CTS news extractor. | adapter | sites/news | `src/features/sites/news/cts-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `src/core/extraction/dynamic-extractor.js` | Canonical generic dynamic-page extractor via semantic browser. | extractor | core/extraction | `src/core/extraction/dynamic-extractor.js` | keep | Shared fallback extractor. |
| `tfd-system/extractors/dynamic.js` | Legacy adapter for generic dynamic-page extractor. | adapter | core/extraction | `src/core/extraction/dynamic-extractor.js` | done-adapter | Preserves extractor registry import path. |
| `tfd-system/extractors/hololive-shop.js` | Legacy adapter for Hololive shop extractor. | adapter | sites/shop | `src/features/sites/shop/hololive-shop-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/line-today.js` | Legacy adapter for LINE TODAY news extractor. | adapter | sites/news | `src/features/sites/news/line-today-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/mobile01.js` | Legacy adapter for Mobile01 extractor. | adapter | sites/forum | `src/features/sites/forum/mobile01-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/msn.js` | Legacy adapter for MSN news extractor. | adapter | sites/news | `src/features/sites/news/msn-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/nikke.js` | Legacy adapter for NIKKE news extractor. | adapter | sites/game | `src/features/sites/game/nikke-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/pchome.js` | Legacy adapter for PChome product extractor. | adapter | sites/shop | `src/features/sites/shop/pchome-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/pornhub.js` | Legacy adapter for Pornhub extractor. | adapter | sites/adult | `src/features/sites/adult/pornhub-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/storm.js` | Legacy adapter for Storm Media extractor. | adapter | sites/news | `src/features/sites/news/storm-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `tfd-system/extractors/udn.js` | Legacy adapter for UDN news extractor. | adapter | sites/news | `src/features/sites/news/udn-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `src/features/sites/news/4gamers-extractor.js` | 4Gamers news extractor. | extractor | sites/news | `src/features/sites/news/4gamers-extractor.js` | keep | Canonical news extractor implementation. |
| `src/features/sites/news/cts-extractor.js` | CTS news extractor. | extractor | sites/news | `src/features/sites/news/cts-extractor.js` | keep | Canonical news extractor implementation. |
| `src/features/sites/news/line-today-extractor.js` | LINE TODAY news extractor. | extractor | sites/news | `src/features/sites/news/line-today-extractor.js` | keep | Canonical news extractor implementation. |
| `src/features/sites/news/msn-extractor.js` | MSN news extractor. | extractor | sites/news | `src/features/sites/news/msn-extractor.js` | keep | Canonical news extractor implementation. |
| `src/features/sites/news/storm-extractor.js` | Storm Media extractor. | extractor | sites/news | `src/features/sites/news/storm-extractor.js` | keep | Canonical news extractor implementation. |
| `src/features/sites/news/udn-extractor.js` | UDN news extractor. | extractor | sites/news | `src/features/sites/news/udn-extractor.js` | keep | Canonical news extractor implementation. |
| `tfd-system/extractors/xfastest.js` | Legacy adapter for XFastest extractor. | adapter | sites/forum | `src/features/sites/forum/xfastest-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `src/features/sites/adult/pornhub-extractor.js` | Pornhub extractor. | extractor | sites/adult | `src/features/sites/adult/pornhub-extractor.js` | keep | Canonical site extractor implementation. |
| `src/features/sites/forum/mobile01-extractor.js` | Mobile01 extractor. | extractor | sites/forum | `src/features/sites/forum/mobile01-extractor.js` | keep | Canonical site extractor implementation. |
| `src/features/sites/forum/xfastest-extractor.js` | XFastest extractor. | extractor | sites/forum | `src/features/sites/forum/xfastest-extractor.js` | keep | Canonical site extractor implementation. |
| `src/features/sites/game/nikke-extractor.js` | NIKKE news extractor. | extractor | sites/game | `src/features/sites/game/nikke-extractor.js` | keep | Canonical site extractor implementation. |
| `src/features/sites/shop/hololive-shop-extractor.js` | Hololive shop extractor. | extractor | sites/shop | `src/features/sites/shop/hololive-shop-extractor.js` | keep | Canonical site extractor implementation. |
| `src/features/sites/shop/pchome-extractor.js` | PChome product extractor. | extractor | sites/shop | `src/features/sites/shop/pchome-extractor.js` | keep | Canonical site extractor implementation. |
| `src/features/sites/video/bilibili-extractor.js` | Bilibili extractor. | extractor | sites/video | `src/features/sites/video/bilibili-extractor.js` | keep | Canonical site extractor implementation. |
| `src/features/sites/wiki/52poke-extractor.js` | PokeWiki extractor. | extractor | sites/wiki | `src/features/sites/wiki/52poke-extractor.js` | keep | Canonical site extractor implementation. |
| `tfd-system/extractors/youtube.js` | Legacy adapter for YouTube extractor. | adapter | sites/video | `src/features/sites/video/youtube-extractor.js` | done-adapter | Keeps extractor manager old-path import stable. |
| `src/features/sites/video/youtube-extractor.js` | YouTube extractor. | extractor | sites/video | `src/features/sites/video/youtube-extractor.js` | keep | Small extractor moved into site feature tree. |

## Inventory: Utilities and Feature Helpers

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `utils/tfd-logger.js` | Legacy adapter for TFD logging helpers. | adapter | shared/logging | `src/shared/logging/tfd-logger.js` | done-adapter | Implementation moved; broad runtime import migration can happen in later slices. |
| `utils/webhook-manager.js` | Legacy adapter for webhook create/cache/send/edit and permission checks. | adapter | shared/webhook | `src/shared/webhook/webhook-manager.js` | done-adapter | Keeps current runtime imports stable. |
| `src/shared/webhook/webhook-manager.js` | Webhook create/cache/send/edit and permission checks. | service | shared/webhook | `src/shared/webhook/webhook-manager.js` | keep | Canonical shared webhook implementation. |
| `utils/crypto-helper.js` | Legacy adapter for AES-GCM encryption/decryption and key masking. | adapter | shared/crypto | `src/shared/crypto/crypto-helper.js` | done-adapter | Runtime imports moved where safe; fallback key path stays anchored to project `data/.encryption-key`. |
| `utils/embed-helpers.js` | Legacy adapter for Discord message author/platform/url helpers. | adapter | shared/discord | `src/shared/discord/message-helpers.js` | done-adapter | Runtime imports moved to shared Discord message helpers. |
| `utils/normalize-author.js` | Legacy adapter for extractor/message author normalization used by blacklist matching. | adapter | moderation | `src/features/moderation/normalize-author.js` | done-adapter | Runtime message pipeline imports moved to moderation feature path; embed.data author/footer compatibility added. |
| `utils/rate-limiter.js` | Legacy adapter for per-user/guild URL rate limiting. | adapter | shared/rate-limit | `src/shared/rate-limit/rate-limiter.js` | done-adapter | Keeps current message-handler import stable. |
| `src/shared/rate-limit/rate-limiter.js` | Per-user/guild URL rate limiting with SQLite logs. | service | shared/rate-limit | `src/shared/rate-limit/rate-limiter.js` | keep | Canonical shared rate limiter implementation. |
| `utils/abuse-detector.js` | Legacy adapter for short/long-term abuse detection and auto-exclusion. | adapter | moderation | `src/features/moderation/abuse-detector.js` | done-adapter | Keeps GC startup and message-handler imports stable. |
| `src/features/moderation/abuse-detector.js` | Short/long-term abuse detection and auto-exclusion. | service | moderation | `src/features/moderation/abuse-detector.js` | keep | Canonical moderation abuse detector implementation. |
| `utils/recall-limiter.js` | Legacy adapter for recall action cooldown limiter. | adapter | reports | `src/features/reports/recall-limiter.js` | done-adapter | Context actions and report button handler import the feature path directly. |
| `src/features/reports/recall-limiter.js` | Recall action cooldown limiter. | utility | reports | `src/features/reports/recall-limiter.js` | keep | Shared by context actions and report button handler. |
| `utils/blacklist-manager.js` | Legacy JSON blacklist manager. | cache-store/service | moderation/legacy | `src/features/moderation/legacy/json-blacklist-manager.js` | done-removed | Removed or already absent after runtime reference search found no active internal dependency. |
| `utils/guild-blacklist-manager.js` | Legacy adapter for SQLite-backed guild blacklist manager. | adapter | moderation | `src/features/moderation/guild-blacklist-manager.js` | done-adapter | Keeps commands, reports, and message pipeline imports stable. |
| `src/features/moderation/guild-blacklist-manager.js` | SQLite-backed guild blacklist manager. | service | moderation | `src/features/moderation/guild-blacklist-manager.js` | keep | Canonical moderation guild blacklist implementation. |
| `utils/spoiler-button-helper.js` | Legacy adapter for report/spoiler component helper. | adapter | shared/discord | `src/shared/discord/spoiler-button-helper.js` | done-adapter | Implementation moved to shared Discord; future split can separate report/spoiler semantics. |
| `utils/bahamut-auth.js` | Legacy adapter for Bahamut cookie/session auth helper. | adapter | sites/bahamut | `src/features/sites/bahamut/bahamut-auth.js` | done-adapter | Runtime Bahamut extractor imports feature path directly. |
| `src/features/sites/bahamut/bahamut-auth.js` | Bahamut cookie/session auth helper. | service | sites/bahamut | `src/features/sites/bahamut/bahamut-auth.js` | keep | Feature-owned; cookie cache remains anchored to project-root `data/`. |
| `utils/lightpanda-client.js` | Legacy adapter for Lightpanda/Puppeteer CDP metadata fetch helper. | adapter | shared/browser | `src/shared/browser/lightpanda-client.js` | done-adapter | Runtime Threads import moved to shared path; optional `puppeteer` dependency is not installed locally. |
| `utils/playwright-semantic-browser.js` | Legacy adapter for Playwright semantic browser helper. | adapter | shared/browser | `src/shared/browser/playwright-semantic-browser.js` | done-adapter | Runtime dynamic extractor import moved to shared path; optional `playwright` dependency is not installed locally. |
| `src/shared/browser/lightpanda-client.js` | Lightpanda/Puppeteer CDP metadata fetch helper. | service | shared/browser | `src/shared/browser/lightpanda-client.js` | keep | Shared browser helper implementation. |
| `src/shared/browser/playwright-semantic-browser.js` | Playwright semantic browser helper. | service | shared/browser | `src/shared/browser/playwright-semantic-browser.js` | keep | Shared browser helper implementation. |
| `utils/pixiv-cache-manager.js` | Legacy adapter for Pixiv JSON cache manager. | adapter | pixiv | `src/features/pixiv/cache/pixiv-cache-manager.js` | done-adapter | Keeps reload and pagination imports stable. |
| `src/features/pixiv/cache/pixiv-cache-manager.js` | Pixiv JSON cache manager. | cache-store | pixiv | `src/features/pixiv/cache/pixiv-cache-manager.js` | keep | Canonical Pixiv cache implementation; includes reload cache deletion API. |
| `utils/pixiv-r18-cache-manager.js` | Legacy adapter for Pixiv R18 cache and attachment manager. | adapter | pixiv | `src/features/pixiv/cache/r18-cache-manager.js` | done-adapter | Keeps message-handler R18 paths stable. |
| `src/features/pixiv/cache/r18-cache-manager.js` | Pixiv R18 cache and attachment manager. | cache-store/service | pixiv | `src/features/pixiv/cache/r18-cache-manager.js` | keep | Canonical Pixiv R18 cache implementation. |
| `utils/pixiv-ugoira-mp4-processor.js` | Legacy adapter for Pixiv ugoira to MP4 processing. | adapter | pixiv/media | `src/features/pixiv/media/ugoira-mp4-processor.js` | done-adapter | Keeps old-path import compatibility. |
| `src/features/pixiv/media/ugoira-mp4-processor.js` | Pixiv ugoira to MP4 processing. | service | pixiv/media | `src/features/pixiv/media/ugoira-mp4-processor.js` | keep | Canonical Pixiv media processor implementation. |
| `utils/ptt-cache-manager.js` | Legacy adapter for PTT article/image cache manager. | adapter | ptt | `src/features/ptt/cache/ptt-cache-manager.js` | done-adapter | Keeps PTT extractor and pagination imports stable. |
| `src/features/ptt/cache/ptt-cache-manager.js` | PTT article/image cache manager. | cache-store | ptt | `src/features/ptt/cache/ptt-cache-manager.js` | keep | Canonical PTT cache implementation. |
| `utils/twitter-v2-state-store.js` | Legacy adapter for Twitter V2 message state store. | adapter | twitter | `src/features/twitter/state/v2-state-store.js` | done-adapter | Runtime message pipeline keeps old import stable. |
| `src/features/twitter/state/v2-state-store.js` | Runtime state store for Twitter V2 messages. | state-store | twitter | `src/features/twitter/state/v2-state-store.js` | keep | Canonical Twitter V2 state store implementation. |
| `utils/user-api-key-storage.js` | Legacy adapter for encrypted user API keys and preferred provider in SQLite. | adapter | translation/identity | `src/features/translation/keys/user-api-key-storage.js` | done-adapter | Keeps `/pe` command old-path import stable. |
| `src/features/translation/keys/user-api-key-storage.js` | Encrypted user API keys and preferred provider in SQLite. | db-access/service | translation/identity | `src/features/translation/keys/user-api-key-storage.js` | keep | Canonical user API key storage implementation. |
| `utils/user-api-key-service.js` | Legacy API key service adapter. | adapter | translation/legacy | `src/features/translation/legacy/user-api-key-service-adapter.js` | done-adapter | Old path re-exports canonical adapter. |
| `utils/ai-translator.js` | Legacy AI translator adapter to translation service. | adapter | translation/legacy | `src/features/translation/legacy/ai-translator-adapter.js` | done-adapter | Old path re-exports canonical adapter. |
| `utils/gemini-translator.js` | Removed legacy Gemini helper for deleted Twitter posting flow. | adapter | translation/legacy | n/a | done-removed | Removed or already absent after runtime reference search found no active internal dependency. |
| `utils/openrouter-translator.js` | Legacy OpenRouter translation helper. | provider | translation/legacy | `src/features/translation/legacy/openrouter-translator.js` | done-removed | Removed or already absent after runtime reference search found no active internal dependency. |
| `utils/translator.js` | Legacy adapter for Google Translate + OpenCC translator singleton. | adapter | translation/legacy | `src/features/translation/providers/google-translate-provider.js` | done-adapter | Old path re-exports canonical Google Translate provider. |
| `src/features/translation/providers/google-translate-provider.js` | Google Translate + OpenCC translator singleton. | provider | translation/providers | `src/features/translation/providers/google-translate-provider.js` | keep | Canonical Google Translate provider implementation. |
| `utils/translation-glossary.js` | Legacy adapter for glossary preprocessing/postprocessing. | adapter | translation/text | `src/features/translation/text/glossary.js` | done-adapter | Old path re-exports canonical glossary helper. |
| `src/features/translation/text/glossary.js` | Glossary preprocessing/postprocessing for translation. | service | translation/text | `src/features/translation/text/glossary.js` | keep | Canonical glossary implementation. |
| `utils/shared-translation-cache.js` | Legacy adapter for provider-aware persistent translation cache. | adapter | translation/cache | `src/features/translation/cache/shared-translation-cache.js` | done-adapter | Keeps startup import stable. |
| `src/features/translation/cache/shared-translation-cache.js` | Provider-aware persistent translation cache. | cache-store | translation/cache | `src/features/translation/cache/shared-translation-cache.js` | keep | Canonical translation cache implementation. |
| `utils/translation/errors.js` | Legacy adapter for normalized translation error messages/types. | adapter | translation | `src/features/translation/errors.js` | done-adapter | Old path re-exports canonical error helper. |
| `src/features/translation/errors.js` | Normalized translation error messages/types. | utility | translation | `src/features/translation/errors.js` | keep | Canonical translation error helper. |
| `utils/translation/key-resolver.js` | Legacy adapter for provider selection and user/env API key resolution. | adapter | translation/keys | `src/features/translation/keys/key-resolver.js` | done-adapter | Old path re-exports canonical key resolver. |
| `src/features/translation/keys/key-resolver.js` | Provider selection and user/env API key resolution. | service | translation/keys | `src/features/translation/keys/key-resolver.js` | keep | Canonical translation key resolver. |
| `utils/translation/prompt-builder.js` | Legacy adapter for VTuber-focused translation prompt builder. | adapter | translation/text | `src/features/translation/text/prompt-builder.js` | done-adapter | Old path re-exports canonical prompt builder. |
| `src/features/translation/text/prompt-builder.js` | VTuber-focused translation prompt builder. | service | translation/text | `src/features/translation/text/prompt-builder.js` | keep | Canonical translation prompt builder. |
| `utils/translation/text-bundle.js` | Legacy adapter for main/quote/reply bundle utilities. | adapter | translation/text | `src/features/translation/text/text-bundle.js` | done-adapter | Old path re-exports canonical text bundle helper. |
| `src/features/translation/text/text-bundle.js` | Main/quote/reply bundle combine/split utilities. | utility | translation/text | `src/features/translation/text/text-bundle.js` | keep | Canonical translation text bundle helper. |
| `utils/translation/translation-service.js` | Legacy adapter for unified translation service orchestration. | adapter | translation | `src/features/translation/service/translation-service.js` | done-adapter | Old path re-exports canonical translation service. |
| `src/features/translation/service/translation-service.js` | Unified translation service orchestration. | service | translation | `src/features/translation/service/translation-service.js` | keep | Canonical translation service entry. |
| `utils/translation/providers/index.js` | Legacy adapter for translation provider registry. | adapter | translation/providers | `src/features/translation/providers/provider-registry.js` | done-adapter | Old path re-exports canonical provider registry. |
| `src/features/translation/providers/provider-registry.js` | Translation provider registry. | config/service | translation/providers | `src/features/translation/providers/provider-registry.js` | keep | Canonical provider registry. |
| `utils/translation/providers/gemini.js` | Legacy adapter for Gemini provider. | adapter | translation/providers | `src/features/translation/providers/gemini-provider.js` | done-adapter | Old path re-exports canonical Gemini provider. |
| `src/features/translation/providers/gemini-provider.js` | Gemini provider adapter. | provider | translation/providers | `src/features/translation/providers/gemini-provider.js` | keep | Canonical Gemini provider implementation. |
| `utils/translation/providers/openrouter.js` | Legacy adapter for OpenRouter provider. | adapter | translation/providers | `src/features/translation/providers/openrouter-provider.js` | done-adapter | Old path re-exports canonical OpenRouter provider. |
| `src/features/translation/providers/openrouter-provider.js` | OpenRouter provider adapter and cooldowns. | provider | translation/providers | `src/features/translation/providers/openrouter-provider.js` | keep | Canonical OpenRouter provider implementation. |
| `utils/translation/providers/openai.js` | Legacy adapter for OpenAI provider. | adapter | translation/providers | `src/features/translation/providers/openai-provider.js` | done-adapter | Old path re-exports canonical OpenAI provider. |
| `src/features/translation/providers/openai-provider.js` | OpenAI chat completions provider adapter. | provider | translation/providers | `src/features/translation/providers/openai-provider.js` | keep | Canonical OpenAI provider implementation. |
| `utils/translation/providers/claude.js` | Legacy adapter for Anthropic Claude provider. | adapter | translation/providers | `src/features/translation/providers/claude-provider.js` | done-adapter | Old path re-exports canonical Claude provider. |
| `src/features/translation/providers/claude-provider.js` | Anthropic Claude provider adapter. | provider | translation/providers | `src/features/translation/providers/claude-provider.js` | keep | Canonical Claude provider implementation. |

## Inventory: Web

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `web/api/bot-stats.js` | Vercel/serverless bot stats API endpoint. | web | web | `web/api/bot-stats.js` | keep | Separate web app can stay under `web/`. |
| `web/index.html` | Public web dashboard/home page. | web | web | `web/index.html` | keep | Keep web app self-contained. |
| `web/privacy.html` | Web privacy page. | web | web | `web/privacy.html` | keep | Static. |
| `web/serverconsole.html` | Web server console page. | web | web | `web/serverconsole.html` | keep | Static/admin-facing. |
| `web/style.css` | Web CSS. | web | web | `web/style.css` | keep | Static. |
| `web/terms.html` | Web terms page. | web | web | `web/terms.html` | keep | Static. |
| `web/package.json` | Web app package metadata. | config | web | `web/package.json` | keep | Separate web app. |
| `web/vercel.json` | Vercel config. | config | web/deploy | `web/vercel.json` | keep | Separate web deployment config. |

## Inventory: Documentation

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `doc/INTENT_APPLICATION.md` | Discord Message Content Intent application doc. | doc | docs | `docs/discord/intent-application.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/PRIVACY_POLICY.md` | Privacy policy. | doc | legal | `docs/legal/privacy-policy.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/TERMS_OF_SERVICE.md` | Terms of service. | doc | legal | `docs/legal/terms-of-service.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/PUBLIC_RELEASE_REFACTOR.md` | Public release refactor notes. | doc | docs/archive | `docs/archive/public-release-refactor.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/TWITTER_TRANSLATE_AUTO_TRANSLATE_ON_EXPAND_2026-04-12.md` | Older Twitter translation auto-expand design. | doc | docs/archive/twitter | `docs/archive/twitter/translate-auto-expand.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/tfd-1-4-0-blacklist-plan.md` | Blacklist implementation plan. | doc | docs/archive/moderation | `docs/archive/moderation/tfd-1-4-0-blacklist-plan.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/system/FILE_INDEX.md` | Current file index. | doc | docs/system | `docs/system/file-index.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/ORACLE_CLOUD_SETUP_GUIDE.md` | Oracle Cloud setup guide. | doc | docs/deploy | `docs/deploy/oracle-cloud-setup-guide.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/TFD_COST_MODEL_AND_PRICING_SPEC.md` | Cost/pricing spec. | doc | docs/product | `docs/product/cost-model-and-pricing.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/TFD_DATA_MODEL_AND_STATE_MACHINE_SPEC.md` | Data model/state machine spec. | doc | docs/product | `docs/product/data-model-and-state-machine.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/TFD_DISCORD_PRODUCT_FLOW_SPEC.md` | Discord product flow spec. | doc | docs/product | `docs/product/discord-product-flow.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/TFD_MODEL_PRICING_RESEARCH.md` | Model pricing research. | doc | docs/research | `docs/research/model-pricing.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/TFD_ORACLE_DEPLOYMENT_PLAN.md` | Oracle deployment plan. | doc | docs/deploy | `docs/deploy/oracle-deployment-plan.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/TFD_TRANSLATION_MONETIZATION_PLAN.md` | Translation monetization plan. | doc | docs/product | `docs/product/translation-monetization-plan.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `doc/specs/TFD_WALLET_AND_BILLING_SPEC.md` | Wallet/billing spec. | doc | docs/product | `docs/product/wallet-and-billing.md` | done-adapter | Canonical content moved to target path; old path remains as a Markdown compatibility pointer. |
| `docs/superpowers/plans/2026-05-15-translation-subsystem-refactor.md` | Existing translation refactor implementation plan. | doc | docs/plans | `docs/superpowers/plans/...` | keep | Keep as historical execution plan. |
| `docs/superpowers/specs/2026-05-15-tfd-file-inventory-and-refactor-map.md` | This inventory/refactor map. | doc | docs/specs | `docs/superpowers/specs/...` | keep | Source of truth for next plan. |

## Primary Merge and Split Opportunities

### 1. Translation

Current related files:
- `utils/translation/*`
- `utils/ai-translator.js`
- `utils/openrouter-translator.js`
- `utils/translator.js`
- `utils/translation-glossary.js`
- `utils/shared-translation-cache.js`
- `utils/user-api-key-storage.js`
- `utils/user-api-key-service.js`
- `handlers/content-translation-interactions.js`

Target:

```txt
src/features/translation/
  service/translation-service.js
  providers/
  keys/
  cache/
  text/
  legacy/
```

Plan:
- Move current unified translation files first.
- Move cache/key/glossary into subfolders.
- Keep old `utils/*` paths as adapters.
- Remove `gemini-translator.js`: the legacy 5CH/Twitter posting flow is not part of TFD.

### 2. Twitter

Current related files:
- `handlers/twitter-*`
- `handlers/twitter-v2-container-builder.js`
- `utils/twitter-v2-state-store.js`
- `tfd-system/extractors/twitter-*`

Target:

```txt
src/features/twitter/
  extractors/
  interactions/
  containers/
  media/
  state/
  posting/
  services/
```

Plan:
- Move state/container/media first.
- Move interactions with old-path adapters.
- Decouple `twitter-v2.js` extractor from handler container builder.
- Split `twitter-v2-interactions.js` into translate/toggle/reload/spoiler modules.
- Split `twitter-translate-interactions.js` into handler, state mapper, cache mapper, embed updater.

### 3. Core Message Pipeline

Current related files:
- `index.js`
- `tfd-system/core/message-handler-v2.js`
- `tfd-system/core/link-processor.js`
- `tfd-system/extractors/index.js`
- `tfd-system/regex/*`

Target:

```txt
src/core/
  message/
  routing/
  extraction/
  rendering/
  config/
```

Plan:
- Move low-risk helpers first.
- Keep `message-handler-v2.js` for last because it is the largest behavioral risk.
- Extract output rendering, webhook delivery, abuse/rate checks, and feature-specific branches from message handler.

### 4. Pixiv and PTT

Pixiv target:

```txt
src/features/pixiv/
  extractors/
  interactions/
  cache/
  media/
```

PTT target:

```txt
src/features/ptt/
  extractors/
  interactions/
  cache/
```

Plan:
- Move caches and interaction handlers.
- Pixiv reload cache API mismatch is addressed in `src/features/pixiv/cache/pixiv-cache-manager.js`; keep verifying reload/pagination behavior while moving remaining Pixiv modules.
- Then move extractors.
- Split large extractors after behavior-preserving relocation is stable.

### 5. Reports, Spoilers, Moderation

Current related files:
- `handlers/report-button-interactions.js`
- `handlers/spoiler-button-interactions.js`
- `src/shared/discord/spoiler-button-helper.js` (`utils/spoiler-button-helper.js` adapter)
- `utils/guild-blacklist-manager.js`
- `utils/blacklist-manager.js`
- `utils/abuse-detector.js`
- `utils/recall-limiter.js`
- `commands/tfd-context-actions.js`

Target:

```txt
src/features/reports/
src/features/spoilers/
src/features/moderation/
```

Plan:
- Separate report routing from report actions/modals/admin approval.
- Separate spoiler UI/component building from spoiler message rewrite.
- Move blacklist/abuse into moderation.
- Confirm whether legacy JSON blacklist manager is still needed.

### 6. Site Extractors

Current related files:
- Many files under `tfd-system/extractors`.

Target:

```txt
src/features/sites/
  facebook/
  instagram/
  threads/
  news/
  forum/
  shop/
  video/
  game/
  wiki/
  adult/
```

Plan:
- Move platform extractors by family.
- Keep ExtractorManager adapter to avoid touching all routing at once.
- Convert supported-sites metadata into the long-term registry source.

## Migration Phases

### Phase 0: Safety Setup

- Confirm rollback tag exists.
- Add `scripts/smoke/` commands to package scripts.
- Add a require-all smoke script for current public adapters.
- Do not deploy until each phase is verified locally.

### Phase 1: Create New Skeleton and Aliases

- Add `src/` folder structure.
- Add `src/shared/logging`, `src/shared/http`, `src/shared/discord`, `src/shared/webhook`.
- Move nothing yet, or move only with adapters.
- Verify current entrypoints still load.

### Phase 2: Translation Domain Move

- Move `utils/translation/*` into `src/features/translation/*`.
- Move translation cache/key/glossary files.
- Convert old `utils/*` paths to re-export adapters.
- Verify Classic/V2 translation handlers still load.

### Phase 3: Twitter Domain Move

- Move Twitter state/container/media/interactions/extractors.
- Keep `handlers/twitter-*` and `tfd-system/extractors/twitter-*` as adapters.
- Decouple extractor from handler container builder.
- Verify V2 translate/reload/expand/spoiler code loads.

### Phase 4: Pixiv and PTT Domain Move

- Pixiv reload cache manager mismatch is addressed: `deleteArtworkCache` exists on the loaded cache manager adapter.
- Move Pixiv cache/media/interactions/extractor.
- Move PTT cache/interactions/extractor.
- Convert old event files to adapters or route imports.

### Phase 5: Reports, Spoilers, Moderation

- Move report/spoiler handlers into feature folders.
- Move blacklist/abuse/recall helpers.
- Split large files after relocation.

### Phase 6: Core Message Pipeline

- Move `link-processor`, matcher, patterns, renderers.
- Split `message-handler-v2.js`.
- This phase should have the most verification and possibly be broken into separate plans.

### Phase 7: Docs and Legacy Cleanup

- Update `CLAUDE.md`, `docs/system/file-index.md`, and architecture docs.
- Remove old adapters only after a deployment cycle proves stability.
- Archive obsolete docs and one-off scripts.

## Verification Strategy

Each phase should run:

```powershell
node --check index.js
node --check events\interactionCreate.js
node scripts\translation-smoke.js
node -e "require('./events/interactionCreate'); require('./tfd-system/core/message-handler-v2'); console.log('core load ok')"
```

Feature-specific checks:

```powershell
node -e "require('./handlers/twitter-v2-interactions'); require('./handlers/twitter-translate-interactions'); console.log('twitter handlers ok')"
node -e "require('./events/pixiv-pagination-interactions'); require('./handlers/pixiv-reload-interactions'); console.log('pixiv handlers ok')"
node -e "require('./events/ptt-pagination-interactions'); console.log('ptt handlers ok')"
node -e "require('./handlers/report-button-interactions'); require('./handlers/spoiler-button-interactions'); console.log('report spoiler handlers ok')"
```

Before deployment:

```powershell
git status --short
git diff --check baseline/pre-translation-refactor-2026-05-15..HEAD
```

## Open Decisions

1. Whether `src/` should become the only runtime source root, with old root folders retained as adapters until cleanup.
2. Whether docs should standardize on `docs/` and retire `doc/`.
3. Whether old legacy extractors should remain as first-class modules or be archived after V2 replacements stabilize.
4. Whether to add path aliases. Recommendation: avoid aliases for now because CommonJS relative paths are predictable and deployment-safe.
5. Whether `web/` should remain a separate mini-app. Recommendation: keep it separate.

## Recommendation

Proceed with a behavior-preserving, adapter-first restructure. The best first implementation plan should cover Phase 1 and Phase 2 only:

1. Create `src/` skeleton.
2. Move translation domain into `src/features/translation`.
3. Keep old `utils/translation/*`, `utils/ai-translator.js`, `utils/shared-translation-cache.js`, and `utils/user-api-key-*` as adapters.
4. Verify all translation and interaction handler load checks.

After that is stable, plan Twitter as its own large phase.
