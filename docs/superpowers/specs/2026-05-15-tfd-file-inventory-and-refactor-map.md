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
| `deploy.js` | Registers Discord slash/context commands. | script | deploy/app | `scripts/deploy-commands.js` | move | Root wrapper optional. |
| `db-pull.bat` | Windows helper to pull DB from server. | script | ops | `scripts/ops/db-pull.bat` | move | Keep root adapter if user uses it. |
| `db-pull.sh` | Shell helper to pull DB from server. | script | ops | `scripts/ops/db-pull.sh` | move | Ops utility. |
| `db-push.sh` | Shell helper to push DB to server. | script | ops | `scripts/ops/db-push.sh` | move | High-risk script; document clearly. |
| `setup-schedule.bat` | Windows scheduling helper. | script | ops | `scripts/ops/setup-schedule.bat` | move | Ops utility. |
| `TFD_UNIFIED_SPEC.md` | Older unified architecture/spec notes. | doc | docs | `docs/archive/TFD_UNIFIED_SPEC.md` | docs-only | Archive or fold into new design. |

## Inventory: App Commands and Events

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `commands/pe.js` | `/pe` command: API keys, model selection, log channel, owner, blacklist settings. | command | app/moderation/translation | `src/app/commands/pe-command.js` | split | Split API-key subcommands from guild/moderation settings later. |
| `commands/tfd-context-actions.js` | Message context actions for delete/spoiler/report flows. | command | app/reports/spoilers | `src/app/commands/context-actions.js` | split | Contains command definition plus interaction-like behavior. |
| `events/interactionCreate.js` | Central interaction router for commands, modals, buttons, selects. | event-router | app | `src/app/events/interaction-create.js` | split | Move prefix routing to feature routers. |
| `events/pixiv-pagination-interactions.js` | Pixiv pagination buttons and memory cache. | interaction-handler | pixiv | `src/features/pixiv/interactions/pagination.js` | move | Should not live in `events/`. |
| `events/ptt-pagination-interactions.js` | PTT pagination, reload, expand/collapse and memory cache. | interaction-handler | ptt | `src/features/ptt/interactions/pagination.js` | split | Contains multiple PTT interaction types. |

## Inventory: Interaction Handlers

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `handlers/content-translation-interactions.js` | Short-lived content text cache for translation buttons. | cache-store | translation/twitter | `src/features/translation/cache/content-cache.js` | move | Name currently suggests handler but is cache only. |
| `handlers/pixiv-reload-interactions.js` | Pixiv reload interaction and webhook edit. | interaction-handler | pixiv | `src/features/pixiv/interactions/reload.js` | move | Depends on Pixiv extractor/cache/webhook. |
| `handlers/report-button-interactions.js` | Report button tree: spoiler, recall, blacklist, admin approval, modals/selects. | interaction-handler | reports/moderation | `src/features/reports/interactions/report-router.js` | split | Large file; split router/actions/modals/admin. |
| `handlers/spoiler-button-interactions.js` | Anti-spoiler transformation and modal handling for normal messages. | interaction-handler | spoilers | `src/features/spoilers/interactions/spoiler-buttons.js` | split | Also contains spoiler rendering helpers. |
| `handlers/twitter-all-interactions.js` | Twitter expand/collapse all for quote/reply/full text. | interaction-handler | twitter | `src/features/twitter/interactions/toggle-all.js` | move | Depends on translation/content caches. |
| `handlers/twitter-expand-interactions.js` | Twitter full-text expand/collapse for classic embeds. | interaction-handler | twitter | `src/features/twitter/interactions/expand.js` | move | Uses cached content and translation state. |
| `handlers/twitter-interactions.js` | Removed legacy owner-only Twitter posting workflow. | adapter | twitter/legacy | n/a | delete-after-verify | TFD does not provide Twitter posting. |
| `handlers/twitter-pagination-interactions.js` | Twitter media pagination and image merge/split controls. | interaction-handler | twitter | `src/features/twitter/interactions/media-pagination.js` | split | Media rendering logic should move to `media/`. |
| `handlers/twitter-reload-interactions.js` | Classic Twitter embed reload flow. | interaction-handler | twitter | `src/features/twitter/interactions/reload.js` | move | Could share reload service with V2. |
| `handlers/twitter-translate-interactions.js` | Classic Twitter translation button flow, cache/state, embed update. | interaction-handler | twitter/translation | `src/features/twitter/interactions/translation.js` | split | Handler still owns too much cache/state/UI mapping. |
| `handlers/twitter-v2-container-builder.js` | Builds Twitter V2 Discord Components container and stores tweet cache. | renderer/cache-store | twitter | `src/features/twitter/containers/v2-container-builder.js` | split | Separate builder from tweet cache. |
| `handlers/twitter-v2-interactions.js` | Twitter V2 translate/original, expand/collapse, reload, spoiler modal flow. | interaction-handler | twitter | `src/features/twitter/interactions/v2-router.js` | split | Break into translation/toggle/reload/spoiler modules. |

## Inventory: Database and Scripts

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `db/index.js` | SQLite connection, schema init, prepared statements and DB API. | db-access | shared/db | `src/shared/db/index.js` | split | Split schema init, API groups, migrations. |
| `db/schema.sql` | SQLite schema. | db-access | shared/db | `src/shared/db/schema.sql` | move | Keep old path adapter difficult for SQL; update loader. |
| `scripts/migrate-from-json.js` | Migrates old JSON settings/API keys into SQLite. | script | migration | `scripts/migrations/migrate-from-json.js` | move | Depends on DB and crypto. |
| `scripts/sync-blacklist-from-4.0.js` | Imports blacklist data from sibling `4.0` project data. | script | migration/moderation | `scripts/migrations/sync-blacklist-from-4.0.js` | move | Project-specific one-off; mark archive after use. |
| `scripts/translation-smoke.js` | Deterministic smoke tests for translation subsystem. | script | translation/test | `scripts/smoke/translation-smoke.js` | move | Add to npm script later. |

## Inventory: Core TFD System

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `tfd-system/index.js` | PekoEmbed system initializer/health/dependency checks. | service | core/app | `src/core/system/pekoembed-system.js` | move | Singleton export can remain via adapter. |
| `tfd-system/config/pekoembed-config.json` | PekoEmbed feature config. | config | core/config | `src/core/config/pekoembed-config.json` | move | Merge with config loader later. |
| `tfd-system/config/supported-sites.json` | Supported site registry. | config | core/config | `src/core/config/supported-sites.json` | move | Could become extractor registry metadata. |
| `tfd-system/config/tfd-config.json` | Runtime config for HTTP/timeouts/rendering. | config | core/config | `src/core/config/tfd-config.json` | move | Add config accessor instead of direct JSON imports. |
| `tfd-system/core/link-processor.js` | URL matching, extractor dispatch, abuse/stat recording. | service | core/routing | `src/core/routing/link-processor.js` | split | Move abuse/stat side effects behind services. |
| `tfd-system/core/message-handler-v2.js` | Main message pipeline: URL handling, render/send/edit, feature branching. | service | core/message | `src/core/message/message-handler.js` | split | Highest-risk file; decompose last. |
| `tfd-system/regex/matcher.js` | URL matcher class using patterns. | service | core/routing | `src/core/routing/url-matcher.js` | move | Clear responsibility. |
| `tfd-system/regex/patterns.js` | URL regex patterns. | config | core/routing | `src/core/routing/url-patterns.js` | move | Could be generated from supported-sites metadata later. |
| `tfd-system/render/html-video-renderer.js` | HTML video page renderer. | renderer | core/rendering | `src/core/rendering/html-video-renderer.js` | move | Shared by Twitter mixed media. |
| `tfd-system/render/mixed-media-html-builder.js` | Mixed media HTML builder. | renderer | core/rendering | `src/core/rendering/mixed-media-html-builder.js` | move | Uses HTMLVideoRenderer. |
| `tfd-system/utils/dom-parser.js` | Cheerio DOM extraction helper. | utility | shared/html | `src/shared/html/dom-parser.js` | move | Shared extractor helper. |
| `tfd-system/utils/embed-builder.js` | Generic Discord embed builder wrapper. | renderer | shared/discord | `src/shared/discord/embed-builder.js` | move | Shared render helper. |
| `tfd-system/utils/http-client.js` | Axios HTTP client with config defaults. | utility | shared/http | `src/shared/http/http-client.js` | move | Widely used by extractors. |
| `tfd-system/utils/text-truncator.js` | Discord-safe text truncation. | utility | shared/discord | `src/shared/discord/text-truncator.js` | move | Used by Twitter/V2. |
| `tfd-system/utils/tunnel-url-provider.js` | Cloudflare tunnel URL and Twitter URL conversion helper. | utility | shared/web | `src/shared/web/tunnel-url-provider.js` | move | Could be feature/twitter if only Twitter remains. |
| `tfd-system/utils/url-converter-logger.js` | Small logger for URL conversion decisions. | utility | shared/logging | `src/shared/logging/url-converter-logger.js` | merge | Could merge into logging utilities. |
| `tfd-system/utils/url-stats.js` | URL repost stats persistence and lookup. | cache-store/service | shared/analytics | `src/shared/analytics/url-stats.js` | move | Used by Twitter V2 and message pipeline. |

## Inventory: Extractors

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `tfd-system/extractors/index.js` | ExtractorManager registry and lazy loading. | service | core/extraction | `src/core/extraction/extractor-manager.js` | split | Registry metadata should be config-driven. |
| `tfd-system/extractors/twitter-v2.js` | Main Twitter/X extractor, V2 components data, quote/reply/media helpers. | extractor | twitter | `src/features/twitter/extractors/twitter-v2-extractor.js` | split | Huge file; separate API/data/media/container boundary. |
| `tfd-system/extractors/twitter-legacy.js` | Legacy Twitter embed extractor. | extractor | twitter | `src/features/twitter/extractors/twitter-legacy-extractor.js` | move | Keep until V2 fully replaces classic. |
| `tfd-system/extractors/twitter-image-attachment-optimizer.js` | Downloads/optimizes Twitter image attachments. | service | twitter/media | `src/features/twitter/media/image-attachment-optimizer.js` | move | Media service. |
| `tfd-system/extractors/twitter-video-attachment-optimizer.js` | Downloads/optimizes Twitter video attachments. | service | twitter/media | `src/features/twitter/media/video-attachment-optimizer.js` | move | Media service. |
| `tfd-system/extractors/pixiv.js` | Pixiv artwork extractor and embed/media preparation. | extractor | pixiv | `src/features/pixiv/extractors/pixiv-extractor.js` | split | Large; cache/media/R18 hooks should be separated. |
| `tfd-system/extractors/pixiv-image-attachment-optimizer.js` | Pixiv image attachment optimizer. | service | pixiv/media | `src/features/pixiv/media/image-attachment-optimizer.js` | move | Pair with ugoira processor. |
| `tfd-system/extractors/ptt.js` | PTT article extractor, cache integration, long text/pagination helpers. | extractor | ptt | `src/features/ptt/extractors/ptt-extractor.js` | split | Large; article parsing/rendering/cache should separate. |
| `tfd-system/extractors/threads.js` | Threads extractor with OG/browser fallback and V2 components. | extractor | sites/threads | `src/features/sites/threads/threads-extractor.js` | split | Browser fallback could use shared browser service. |
| `tfd-system/extractors/facebook.js` | Facebook extractor with Puppeteer/Playwright fallbacks. | extractor | sites/facebook | `src/features/sites/facebook/facebook-extractor.js` | split | Very large; merge strategy with smart/mbasic/login needed. |
| `tfd-system/extractors/facebook-smart.js` | Facebook strategy router across normal/mbasic/login/browser. | extractor/service | sites/facebook | `src/features/sites/facebook/facebook-smart-extractor.js` | merge | Should become the public Facebook extractor entry. |
| `tfd-system/extractors/facebook-mbasic.js` | Facebook mbasic fallback extractor. | extractor | sites/facebook | `src/features/sites/facebook/strategies/mbasic.js` | move | Strategy implementation. |
| `tfd-system/extractors/facebook-with-login.js` | Facebook logged-in browser extractor. | extractor | sites/facebook | `src/features/sites/facebook/strategies/with-login.js` | move | Strategy implementation. |
| `tfd-system/extractors/facebookez.js` | FacebookEZ/fx style extractor. | extractor | sites/facebook | `src/features/sites/facebook/strategies/facebookez.js` | move | Strategy implementation. |
| `tfd-system/extractors/instagram.js` | Instagram extractor. | extractor | sites/instagram | `src/features/sites/instagram/instagram-extractor.js` | move | Platform feature. |
| `tfd-system/extractors/bahamut.js` | Bahamut extractor. | extractor | sites/bahamut | `src/features/sites/bahamut/bahamut-extractor.js` | move | Uses Bahamut auth helper. |
| `tfd-system/extractors/4gamers.js` | 4Gamers news extractor. | extractor | sites/news | `src/features/sites/news/4gamers-extractor.js` | move | News domain. |
| `tfd-system/extractors/52poke.js` | PokeWiki extractor. | extractor | sites/wiki | `src/features/sites/wiki/52poke-extractor.js` | move | Wiki domain. |
| `tfd-system/extractors/bilibili.js` | Bilibili extractor. | extractor | sites/video | `src/features/sites/video/bilibili-extractor.js` | move | Video platform. |
| `tfd-system/extractors/cts.js` | CTS news extractor. | extractor | sites/news | `src/features/sites/news/cts-extractor.js` | move | News domain. |
| `tfd-system/extractors/dynamic.js` | Generic dynamic-page extractor via semantic browser. | extractor | core/extraction | `src/core/extraction/dynamic-extractor.js` | move | Shared fallback extractor. |
| `tfd-system/extractors/hololive-shop.js` | Hololive shop extractor. | extractor | sites/shop | `src/features/sites/shop/hololive-shop-extractor.js` | move | Shop domain. |
| `tfd-system/extractors/line-today.js` | LINE TODAY news extractor. | extractor | sites/news | `src/features/sites/news/line-today-extractor.js` | move | News domain. |
| `tfd-system/extractors/mobile01.js` | Mobile01 extractor. | extractor | sites/forum | `src/features/sites/forum/mobile01-extractor.js` | move | Forum domain. |
| `tfd-system/extractors/msn.js` | MSN news extractor. | extractor | sites/news | `src/features/sites/news/msn-extractor.js` | move | News domain. |
| `tfd-system/extractors/nikke.js` | NIKKE news extractor. | extractor | sites/game | `src/features/sites/game/nikke-extractor.js` | move | Game/news domain. |
| `tfd-system/extractors/pchome.js` | PChome product extractor. | extractor | sites/shop | `src/features/sites/shop/pchome-extractor.js` | move | Shop domain. |
| `tfd-system/extractors/pornhub.js` | Pornhub extractor. | extractor | sites/adult | `src/features/sites/adult/pornhub-extractor.js` | move | Keep isolated. |
| `tfd-system/extractors/storm.js` | Storm Media extractor. | extractor | sites/news | `src/features/sites/news/storm-extractor.js` | move | News domain. |
| `tfd-system/extractors/udn.js` | UDN news extractor. | extractor | sites/news | `src/features/sites/news/udn-extractor.js` | move | News domain. |
| `tfd-system/extractors/xfastest.js` | XFastest extractor. | extractor | sites/forum | `src/features/sites/forum/xfastest-extractor.js` | move | Forum domain. |
| `tfd-system/extractors/youtube.js` | YouTube extractor. | extractor | sites/video | `src/features/sites/video/youtube-extractor.js` | move | Small extractor. |

## Inventory: Utilities and Feature Helpers

| Current path | Purpose | Type | Domain | Proposed target | Action | Notes |
|---|---|---|---|---|---|---|
| `utils/tfd-logger.js` | TFD logging helpers. | utility | shared/logging | `src/shared/logging/tfd-logger.js` | move | Root-level dependency; move early with adapter. |
| `utils/webhook-manager.js` | Webhook create/cache/send/edit and permission checks. | service | shared/webhook | `src/shared/webhook/webhook-manager.js` | move | Widely used; adapter first. |
| `utils/crypto-helper.js` | AES-GCM encryption/decryption and key masking. | utility | shared/crypto | `src/shared/crypto/crypto-helper.js` | move | Used by API key storage. |
| `utils/embed-helpers.js` | Resolve author/platform/url from Discord messages. | utility | shared/discord | `src/shared/discord/message-helpers.js` | move | Used by reports/context commands. |
| `utils/normalize-author.js` | Normalizes extractor/message author data for blacklist. | utility | moderation | `src/features/moderation/normalize-author.js` | move | Feature-owned, not generic. |
| `utils/rate-limiter.js` | Per-user/guild URL rate limiting with SQLite logs. | service | shared/rate-limit | `src/shared/rate-limit/rate-limiter.js` | move | Started from `index.js`. |
| `utils/abuse-detector.js` | Short/long-term abuse detection and auto-exclusion. | service | moderation | `src/features/moderation/abuse-detector.js` | move | Depends on DB and crypto. |
| `utils/recall-limiter.js` | Recall action cooldown limiter. | utility | reports | `src/features/reports/recall-limiter.js` | move | Report-specific. |
| `utils/blacklist-manager.js` | Legacy JSON blacklist manager. | cache-store/service | moderation/legacy | `src/features/moderation/legacy/json-blacklist-manager.js` | delete-after-verify | Confirm no runtime imports before deleting. |
| `utils/guild-blacklist-manager.js` | SQLite-backed guild blacklist manager. | service | moderation | `src/features/moderation/guild-blacklist-manager.js` | move | Used by commands/reports/message pipeline. |
| `utils/spoiler-button-helper.js` | Adds report/spoiler buttons to components. | renderer | reports/spoilers | `src/features/reports/components/report-button-helper.js` | split | Report and spoiler constants should separate. |
| `utils/bahamut-auth.js` | Bahamut cookie/session auth helper. | service | sites/bahamut | `src/features/sites/bahamut/bahamut-auth.js` | move | Feature-owned. |
| `utils/lightpanda-client.js` | Lightpanda/Puppeteer CDP metadata fetch helper. | service | shared/browser | `src/shared/browser/lightpanda-client.js` | move | Shared browser helper. |
| `utils/playwright-semantic-browser.js` | Playwright semantic browser helper. | service | shared/browser | `src/shared/browser/playwright-semantic-browser.js` | move | Shared browser helper. |
| `utils/pixiv-cache-manager.js` | Pixiv JSON cache manager. | cache-store | pixiv | `src/features/pixiv/cache/pixiv-cache-manager.js` | move | Feature-owned. |
| `utils/pixiv-r18-cache-manager.js` | Pixiv R18 cache and attachment manager. | cache-store/service | pixiv | `src/features/pixiv/cache/r18-cache-manager.js` | move | Feature-owned. |
| `utils/pixiv-ugoira-mp4-processor.js` | Pixiv ugoira to MP4 processing. | service | pixiv/media | `src/features/pixiv/media/ugoira-mp4-processor.js` | move | Feature-owned. |
| `utils/ptt-cache-manager.js` | PTT article/image cache manager. | cache-store | ptt | `src/features/ptt/cache/ptt-cache-manager.js` | move | Feature-owned. |
| `utils/twitter-v2-state-store.js` | Runtime state store for Twitter V2 messages. | state-store | twitter | `src/features/twitter/state/v2-state-store.js` | move | Feature-owned. |
| `utils/user-api-key-storage.js` | Encrypted user API keys and preferred provider in SQLite. | db-access/service | translation/identity | `src/features/translation/keys/user-api-key-storage.js` | move | Provider registry should be centralized. |
| `utils/user-api-key-service.js` | Legacy API key service adapter. | adapter | translation/legacy | `src/features/translation/legacy/user-api-key-service-adapter.js` | legacy-adapter | Old path should re-export. |
| `utils/ai-translator.js` | Legacy AI translator adapter to translation service. | adapter | translation/legacy | `src/features/translation/legacy/ai-translator-adapter.js` | legacy-adapter | Old path should re-export. |
| `utils/gemini-translator.js` | Removed legacy Gemini helper for deleted Twitter posting flow. | adapter | translation/legacy | n/a | delete-after-verify | Translation now uses user-selected provider keys through `translation-service`. |
| `utils/openrouter-translator.js` | Legacy OpenRouter translation helper. | provider | translation/legacy | `src/features/translation/legacy/openrouter-translator.js` | legacy-adapter/delete-after-verify | New provider exists under `utils/translation/providers`. |
| `utils/translator.js` | Google Translate + OpenCC translator singleton. | provider | translation/legacy | `src/features/translation/providers/google-translate.js` | move | Used by Gemini legacy fallback. |
| `utils/translation-glossary.js` | Glossary preprocessing/postprocessing for translation. | service | translation/text | `src/features/translation/text/glossary.js` | move | Feature-owned. |
| `utils/shared-translation-cache.js` | Provider-aware persistent translation cache. | cache-store | translation/cache | `src/features/translation/cache/shared-translation-cache.js` | move | Already refactored; move with adapter. |
| `utils/translation/errors.js` | Normalized translation error messages/types. | utility | translation | `src/features/translation/errors.js` | move | Current folder already close. |
| `utils/translation/key-resolver.js` | Provider selection and user/env API key resolution. | service | translation/keys | `src/features/translation/keys/key-resolver.js` | move | Move with storage. |
| `utils/translation/prompt-builder.js` | VTuber-focused translation prompt builder. | service | translation/text | `src/features/translation/text/prompt-builder.js` | move | Feature-owned. |
| `utils/translation/text-bundle.js` | Main/quote/reply bundle combine/split utilities. | utility | translation/text | `src/features/translation/text/text-bundle.js` | move | Feature-owned. |
| `utils/translation/translation-service.js` | Unified translation service orchestration. | service | translation | `src/features/translation/service/translation-service.js` | move | Main translation entry. |
| `utils/translation/providers/index.js` | Translation provider registry. | config/service | translation/providers | `src/features/translation/providers/provider-registry.js` | move | Pair with API key storage provider definitions. |
| `utils/translation/providers/gemini.js` | Gemini provider adapter. | provider | translation/providers | `src/features/translation/providers/gemini-provider.js` | move | Main Gemini implementation. |
| `utils/translation/providers/openrouter.js` | OpenRouter provider adapter and cooldowns. | provider | translation/providers | `src/features/translation/providers/openrouter-provider.js` | move | Main OpenRouter implementation. |
| `utils/translation/providers/openai.js` | OpenAI chat completions provider adapter. | provider | translation/providers | `src/features/translation/providers/openai-provider.js` | move | Main OpenAI implementation. |
| `utils/translation/providers/claude.js` | Anthropic Claude provider adapter. | provider | translation/providers | `src/features/translation/providers/claude-provider.js` | move | Main Claude implementation. |

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
| `doc/INTENT_APPLICATION.md` | Discord Message Content Intent application doc. | doc | docs | `docs/discord/intent-application.md` | docs-only | Normalize docs root later. |
| `doc/PRIVACY_POLICY.md` | Privacy policy. | doc | legal | `docs/legal/privacy-policy.md` | docs-only | Keep public copy if web needs it. |
| `doc/TERMS_OF_SERVICE.md` | Terms of service. | doc | legal | `docs/legal/terms-of-service.md` | docs-only | Keep public copy if web needs it. |
| `doc/PUBLIC_RELEASE_REFACTOR.md` | Public release refactor notes. | doc | docs/archive | `docs/archive/public-release-refactor.md` | docs-only | Archive. |
| `doc/TWITTER_TRANSLATE_AUTO_TRANSLATE_ON_EXPAND_2026-04-12.md` | Older Twitter translation auto-expand design. | doc | docs/archive/twitter | `docs/archive/twitter/translate-auto-expand.md` | docs-only | Archive or supersede. |
| `doc/tfd-1-4-0-blacklist-plan.md` | Blacklist implementation plan. | doc | docs/archive/moderation | `docs/archive/moderation/tfd-1-4-0-blacklist-plan.md` | docs-only | Archive. |
| `doc/system/FILE_INDEX.md` | Current file index. | doc | docs/system | `docs/system/file-index.md` | docs-only | Replace with generated inventory later. |
| `doc/specs/ORACLE_CLOUD_SETUP_GUIDE.md` | Oracle Cloud setup guide. | doc | docs/deploy | `docs/deploy/oracle-cloud-setup-guide.md` | docs-only | Normalize path. |
| `doc/specs/TFD_COST_MODEL_AND_PRICING_SPEC.md` | Cost/pricing spec. | doc | docs/product | `docs/product/cost-model-and-pricing.md` | docs-only | Product spec. |
| `doc/specs/TFD_DATA_MODEL_AND_STATE_MACHINE_SPEC.md` | Data model/state machine spec. | doc | docs/product | `docs/product/data-model-and-state-machine.md` | docs-only | Product spec. |
| `doc/specs/TFD_DISCORD_PRODUCT_FLOW_SPEC.md` | Discord product flow spec. | doc | docs/product | `docs/product/discord-product-flow.md` | docs-only | Product spec. |
| `doc/specs/TFD_MODEL_PRICING_RESEARCH.md` | Model pricing research. | doc | docs/research | `docs/research/model-pricing.md` | docs-only | May need refresh before financial decisions. |
| `doc/specs/TFD_ORACLE_DEPLOYMENT_PLAN.md` | Oracle deployment plan. | doc | docs/deploy | `docs/deploy/oracle-deployment-plan.md` | docs-only | Deployment plan. |
| `doc/specs/TFD_TRANSLATION_MONETIZATION_PLAN.md` | Translation monetization plan. | doc | docs/product | `docs/product/translation-monetization-plan.md` | docs-only | Product plan. |
| `doc/specs/TFD_WALLET_AND_BILLING_SPEC.md` | Wallet/billing spec. | doc | docs/product | `docs/product/wallet-and-billing.md` | docs-only | Product spec. |
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
- Then move extractors.
- Split large extractors after behavior-preserving relocation is stable.

### 5. Reports, Spoilers, Moderation

Current related files:
- `handlers/report-button-interactions.js`
- `handlers/spoiler-button-interactions.js`
- `utils/spoiler-button-helper.js`
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
