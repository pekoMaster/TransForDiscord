# Peko Embed (TransForDiscord) 檔案索引

本文檔提供完整的檔案與資料夾索引，幫助快速定位特定功能的實作位置。

**最後更新**: 2026-05-12

---

## 🚨 重要架構說明

### Bot 啟動流程
```
index.js
  ├── 初始化 Discord Client（Guilds, GuildMessages, MessageContent, GuildWebhooks）
  ├── 建立 TFDMessageHandler（tfd-system/core/message-handler-v2.js）
  ├── 綁定事件：
  │     ├── ClientReady → 初始化 shared-translation-cache、SQLite、rate-limiter、abuse-detector、url-stats GC
  │     ├── MessageCreate → tfdHandler.handleMessage()
  │     ├── MessageUpdate → tfdHandler.handleMessageUpdate()
  │     └── InteractionCreate → interactionCreate.execute()
  └── client.login()
```

### 互動路由
- 所有按鈕/斜線指令互動進入 `events/interactionCreate.js`
- 路由規則：
  - `v2_*` → `handlers/twitter-v2-interactions.js`
  - `spoiler_btn` / `spoiler_modal_*` → `handlers/spoiler-button-interactions.js`
  - `twitter_expand_*` / `twitter_collapse_*` → `handlers/twitter-expand-interactions.js`
  - `twitter_translate_*` / `twitter_original_*` → `handlers/twitter-translate-interactions.js`
  - `twitter_reload_*` → `handlers/twitter-reload-interactions.js`
  - `twitter_page_*` → `handlers/twitter-pagination-interactions.js`
  - `pixiv_*` → `events/pixiv-pagination-interactions.js`
  - `ptt_*` → `events/ptt-pagination-interactions.js`

### 訊息處理流程
```
MessageCreate
  → tfdHandler.handleMessage(message)
    → link-processor.js 解析 URL
    → matcher.js 比對支援站台
    → 呼叫對應 extractor 抓取資料
    → message-handler-v2.js 組裝 Embed/V2 Container
    → webhook-manager.js 發送（自訂名稱/頭像）
```

---

## 📂 根目錄檔案

| 檔案 | 功能 |
|------|------|
| `index.js` | Bot 主程式入口，初始化所有系統 |
| `deploy.js` | Discord 斜線指令部署 wrapper，保留 `node deploy.js` 並轉接至 `scripts/deploy-commands.js` |
| `ecosystem.config.js` | PM2 部署配置（進程名 `transfordiscord`） |
| `package.json` | 依賴與專案定義 |

---

## 💻 指令系統 (`commands/`)

| 檔案 | 功能 |
|------|------|
| `pe.js` | `/pe` 斜線指令主入口，含設定管理、黑名單、API Key 綁定、站台狀態查詢 |

---

## 🔄 事件處理 (`events/`)

| 檔案 | 功能 |
|------|------|
| `interactionCreate.js` | **互動總路由** — 所有按鈕/斜線指令/Modal 進入點 |
| `pixiv-pagination-interactions.js` | Pixiv 多圖翻頁按鈕處理（含記憶體快取） |
| `ptt-pagination-interactions.js` | PTT 多圖翻頁按鈕處理 |

---

## 🔗 互動處理器 (`handlers/`)

> Twitter/X 主路徑：`src/features/twitter/`。舊的 `handlers/twitter-*` 目前保留為相容 adapter，讓 `events/interactionCreate.js` 與舊文件先維持穩定。
> Twitter V2 互動細節在 `src/features/twitter/interactions/v2/`；`v2-router.js` 現在只負責分派 `v2_*` 按鈕與 modal。

| 檔案 | 功能 |
|------|------|
| `content-translation-interactions.js` | 舊路徑 adapter，轉接至 `src/features/translation/cache/content-cache.js` |
| `pixiv-reload-interactions.js` | Pixiv 重新載入按鈕（切換 Proxy） |
| `spoiler-button-interactions.js` | 通用防爆雷按鈕 + Modal（V2 Components 版） |
| `twitter-all-interactions.js` | 舊路徑 adapter，轉接至 `src/features/twitter/interactions/toggle-all.js` |
| `twitter-expand-interactions.js` | 舊路徑 adapter，轉接至 `src/features/twitter/interactions/expand.js` |
| `twitter-pagination-interactions.js` | Twitter 多圖分頁按鈕 |
| `twitter-quote-interactions.js` | Twitter 引用/回覆展開按鈕 |
| `twitter-reload-interactions.js` | 舊路徑 adapter，轉接至 `src/features/twitter/interactions/reload.js` |
| `twitter-translate-interactions.js` | Twitter AI 翻譯按鈕切換 |
| `twitter-v2-container-builder.js` | Twitter V2 Container 建構器（Discord Components V2） |
| `twitter-v2-interactions.js` | Twitter V2 Container 互動（翻譯/展開/引用/防爆雷） |

---

## 🧠 TFD 核心系統 (`tfd-system/`)

### 核心 (`tfd-system/core/`)

| 檔案 | 功能 |
|------|------|
| `link-processor.js` | 連結處理器 — 解析訊息中的 URL 並協調各元件 |
| `message-handler-v2.js` | **訊息處理主引擎** ⭐ — Embed 組裝、Webhook 發送、N/M/O 注入、V2 Container 路由 |

### 擷取器 (`tfd-system/extractors/`)

> Twitter/X 擷取器主路徑：`src/features/twitter/extractors/`。舊的 `tfd-system/extractors/twitter-*` 目前保留為相容 adapter。

| 檔案 | 支援站台 |
|------|----------|
| `index.js` | 擷取器管理器 — 統一註冊與路由 |
| `4gamers.js` | Legacy adapter to `src/features/sites/news/4gamers-extractor.js` |
| `52poke.js` | Legacy adapter to `src/features/sites/wiki/52poke-extractor.js` |
| `bahamut.js` | Legacy adapter to `src/features/sites/bahamut/bahamut-extractor.js` |
| `bilibili.js` | Legacy adapter to `src/features/sites/video/bilibili-extractor.js` |
| `cts.js` | Legacy adapter to `src/features/sites/news/cts-extractor.js` |
| `dynamic.js` | 舊路徑 adapter，轉接至 `src/core/extraction/dynamic-extractor.js` |
| `facebook.js` | Facebook — Puppeteer 無頭抓取 |
| `facebook-mbasic.js` | 舊路徑 adapter，轉接至 `src/features/sites/facebook/strategies/mbasic.js` |
| `facebook-smart.js` | Facebook 智慧選擇器 |
| `facebook-with-login.js` | 舊路徑 adapter，轉接至 `src/features/sites/facebook/strategies/with-login.js` |
| `facebookez.js` | 舊路徑 adapter，轉接至 `src/features/sites/facebook/strategies/facebookez.js` |
| `instagram.js` | Legacy adapter to `src/features/sites/instagram/instagram-extractor.js` |
| `hololive-shop.js` | Legacy adapter to `src/features/sites/shop/hololive-shop-extractor.js` |
| `line-today.js` | Legacy adapter to `src/features/sites/news/line-today-extractor.js` |
| `mobile01.js` | Legacy adapter to `src/features/sites/forum/mobile01-extractor.js` |
| `msn.js` | Legacy adapter to `src/features/sites/news/msn-extractor.js` |
| `nikke.js` | Legacy adapter to `src/features/sites/game/nikke-extractor.js` |
| `pchome.js` | Legacy adapter to `src/features/sites/shop/pchome-extractor.js` |
| `pixiv.js` | Pixiv 作品 — 多圖分頁、Ugoira 動圖 |
| `pixiv-image-attachment-optimizer.js` | 舊路徑 adapter，轉接至 `src/features/pixiv/media/image-attachment-optimizer.js` |
| `pornhub.js` | Legacy adapter to `src/features/sites/adult/pornhub-extractor.js` |
| `ptt.js` | PTT 文章 — 多圖分頁快取 |
| `storm.js` | Legacy adapter to `src/features/sites/news/storm-extractor.js` |
| `threads.js` | Threads — fixthreads.seria.moe OG meta + V2 Container |
| `twitter-legacy.js` | 舊路徑 adapter，轉接至 `src/features/twitter/extractors/twitter-legacy-extractor.js` |
| `twitter-v2.js` | Twitter/X — V2 Components 版 ⭐ |
| `twitter-image-attachment-optimizer.js` | 舊路徑 adapter，轉接至 `src/features/twitter/media/image-attachment-optimizer.js` |
| `twitter-video-attachment-optimizer.js` | 舊路徑 adapter，轉接至 `src/features/twitter/media/video-attachment-optimizer.js` |
| `udn.js` | Legacy adapter to `src/features/sites/news/udn-extractor.js` |
| `xfastest.js` | Legacy adapter to `src/features/sites/forum/xfastest-extractor.js` |
| `youtube.js` | Legacy adapter to `src/features/sites/video/youtube-extractor.js` |

### Twitter 功能模組 (`src/features/twitter/`)

> Twitter/X 新主路徑：`src/features/twitter/`。舊的 `handlers/twitter-*`、`utils/twitter-v2-state-store.js`、`tfd-system/extractors/twitter-*` 目前保留為相容 adapter。

| 路徑 | 功能 |
|------|------|
| `extractors/twitter-v2-extractor.js` | Twitter V2 擷取 orchestrator，保留舊 method 介面並委派到 `extractors/v2/` helpers |
| `extractors/v2/article-response.js` | Twitter V2 article tweet classic response and action row builder |
| `extractors/v2/classic-components.js` | Classic Embed 分頁、翻譯、展開、重整按鈕建構 |
| `extractors/v2/enhanced-embed.js` | Twitter V2 classic enhanced embed body, quote, footer, and image selection builder |
| `extractors/v2/images.js` | 圖片清單、多圖片 URL、卡片圖片 fallback、防爆雷 URL prefix |
| `extractors/v2/media-classifier.js` | 回覆/引用/媒體類型判斷與圖片/影片數量 |
| `extractors/v2/media-policy.js` | 多 Embed 與 GAS 模式顯示策略 |
| `extractors/v2/mixed-media-response.js` | Twitter V2 mixed-media classic response and fallback response builder |
| `extractors/v2/normalizer.js` | vxtwitter API 回應轉 fxtwitter 相容格式 |
| `extractors/v2/quote-display-policy.js` | Twitter quote V1/V2 initial display and transition policy |
| `extractors/v2/response-builders.js` | Profile Embed、passthrough、error response 建構 |
| `extractors/v2/tweet-fetcher.js` | fxtwitter 優先、vxtwitter fallback 的推文抓取流程 |
| `extractors/v2/tweet-info.js` | URL 推文 ID、引用推文資訊、回覆目標解析 |
| `extractors/v2/video-mode-response.js` | Twitter V2 GAS/HTML video mode response and basic embed builder |
| `extractors/v2/video-links.js` | 影片 URL 擷取與 Discord 連結文字格式 |
| `containers/v2/action-rows.js` | Twitter V2 translate/expand/reload/report action row builder |
| `state/v2-component-state.js` | Twitter V2 Discord component tree state derivation for translate/quote/reply/expand buttons |
| `interactions/v2/` | Twitter V2 Container 翻譯、展開、重整、防爆雷等互動子模組 |
| `interactions/v2/render-state.js` | Twitter V2 reload/expand/translate render state fallback and merge helper |
| `interactions/v2/view-message-state.js` | Twitter V2 interaction message ID to render state-store bridge |
| `interactions/v2/view-payload.js` | Twitter V2 Components edit payload builder for view rebuild/update flows |
| `interactions/v2/view-stats.js` | Twitter V2 optional URL repost stats lookup helper for rebuilt views |
| `interactions/v2/tweet-data.js` | Twitter V2 tweet bundle hydration and cache-vs-refresh resolution helper |
| `interactions/v2/v1-transition.js` | Twitter V2 quote-collapse transition back to classic V1 embed payload and fallback send flow |
| `state/v2-tweet-cache.js` | Twitter V2 tweet bundle runtime cache for rebuild/interaction flows |

### Site Extractors (`src/features/sites/`)

| Module | Purpose |
|------|------|
| `video/youtube-extractor.js` | YouTube `/live/{videoId}` to `/watch?v={videoId}` URL conversion extractor |
| `news/4gamers-extractor.js` | 4Gamers news extractor |
| `news/cts-extractor.js` | CTS news extractor |
| `news/line-today-extractor.js` | LINE TODAY news extractor |
| `news/msn-extractor.js` | MSN news extractor |
| `news/storm-extractor.js` | Storm Media news extractor |
| `news/udn-extractor.js` | UDN news extractor |
| `adult/pornhub-extractor.js` | Pornhub video extractor |
| `forum/mobile01-extractor.js` | Mobile01 forum extractor |
| `forum/xfastest-extractor.js` | XFastest forum/news extractor |
| `game/nikke-extractor.js` | NIKKE official notice extractor |
| `instagram/instagram-extractor.js` | Instagram URL conversion and embed extractor |
| `shop/hololive-shop-extractor.js` | Hololive Shop product extractor |
| `shop/pchome-extractor.js` | PChome product extractor |
| `video/bilibili-extractor.js` | Bilibili URL conversion extractor |
| `wiki/52poke-extractor.js` | 52Poke wiki extractor |
| `bahamut/bahamut-extractor.js` | Bahamut article and GNN extractor |

### Shared Discord 模組 (`src/shared/discord/`)

| 路徑 | 功能 |
|------|------|
| `component-sanitizer.js` | Discord 訊息 components 送出前合法化，過濾空 ActionRow 並拆分超過 5 個子元件的 row |
| `embed-builder.js` | Generic Discord EmbedBuilder wrapper，舊 `tfd-system/utils/embed-builder.js` 僅保留 adapter |
| `message-helpers.js` | 從 Discord message 解析原作者、URL 與平台 |
| `spoiler-button-helper.js` | 回報/防爆雷按鈕共用 helper，舊 `utils/spoiler-button-helper.js` 僅保留 adapter |
| `text-truncator.js` | Discord-safe 文字截斷 helper，含 CJK 權重計算與 URL 保護 |

### Shared Logging 模組 (`src/shared/logging/`)

| 路徑 | 功能 |
|------|------|
| `tfd-logger.js` | TFD 統一日誌 helper，舊 `utils/tfd-logger.js` 僅保留 adapter |
| `url-converter-logger.js` | URL 轉換決策 logger，舊 `tfd-system/utils/url-converter-logger.js` 僅保留 adapter |

### Shared Crypto 模組 (`src/shared/crypto/`)

| 路徑 | 功能 |
|------|------|
| `crypto-helper.js` | AES-256-GCM API Key 加解密 helper；fallback key 固定為專案 `data/.encryption-key` |

### Shared HTML 模組 (`src/shared/html/`)

| 路徑 | 功能 |
|------|------|
| `dom-parser.js` | Cheerio DOM/metadata parser，舊 `tfd-system/utils/dom-parser.js` 僅保留 adapter |

### Shared HTTP 模組 (`src/shared/http/`)

| 路徑 | 功能 |
|------|------|
| `http-client.js` | Axios HTTP client，含 timeout/retry/bot-block handling；舊 `tfd-system/utils/http-client.js` 僅保留 adapter |

### Shared Web 模組 (`src/shared/web/`)

| 路徑 | 功能 |
|------|------|
| `tunnel-url-provider.js` | Cloudflare Tunnel URL 狀態與 Twitter embed proxy URL helper；舊 `tfd-system/utils/tunnel-url-provider.js` 僅保留 adapter |

### Shared Webhook 模組 (`src/shared/webhook/`)

| 檔案 | 作用 |
|------|------|
| `webhook-manager.js` | Discord webhook send/edit/cache helper，`utils/webhook-manager.js` 保留 adapter |

### Shared Analytics 模組 (`src/shared/analytics/`)

| 路徑 | 功能 |
|------|------|
| `url-stats.js` | URL 重複貼文統計（channel/guild/total），舊 `tfd-system/utils/url-stats.js` 僅保留 adapter |

### Shared Rate Limit 模組 (`src/shared/rate-limit/`)

| 檔案 | 作用 |
|------|------|
| `rate-limiter.js` | SQLite-backed per-user/guild URL rate limiter，`utils/rate-limiter.js` 保留 adapter |

### Link Support 功能模組 (`src/features/link-support/`)

| 路徑 | 功能 |
|------|------|
| `link-support/domain-registry.js` | TFD 支援網域 registry，負責網域正規化與 domain → siteName 對應 |
| `link-support/link-support-service.js` | Per-guild 支援網域 on/off 服務，轉接 SQLite `guild_link_domains` |

### Moderation 功能模組 (`src/features/moderation/`)

| 路徑 | 功能 |
|------|------|
| `blacklist-list-presenter.js` | `/pe blacklist list` Embed 分頁呈現與按鈕 collector |
| `blacklist-result-decorator.js` | 黑名單 Level 1/2 顯示套用，支援傳統 embed 與 V2 Container |
| `abuse-detector.js` | URL abuse detection and auto-exclusion helper，`utils/abuse-detector.js` 保留 adapter |
| `guild-blacklist-manager.js` | SQLite-backed guild blacklist CRUD and reports helper，`utils/guild-blacklist-manager.js` 保留 adapter |
| `normalize-author.js` | 黑名單比對用作者正規化，支援 plain embed 與 Discord EmbedBuilder `data` 結構；舊 `utils/normalize-author.js` 僅保留 adapter |

### Pixiv 功能模組 (`src/features/pixiv/`)

| 檔案 | 作用 |
|------|------|
| `cache/pixiv-cache-manager.js` | Pixiv disk JSON cache manager with reload cache deletion API，`utils/pixiv-cache-manager.js` 保留 adapter |
| `cache/r18-cache-manager.js` | Pixiv R18 attachment cache manager，`utils/pixiv-r18-cache-manager.js` 保留 adapter |
| `media/ugoira-mp4-processor.js` | Pixiv Ugoira MP4 conversion helper，`utils/pixiv-ugoira-mp4-processor.js` 保留 adapter |

### PTT 功能模組 (`src/features/ptt/`)

| 檔案 | 作用 |
|------|------|
| `cache/ptt-cache-manager.js` | PTT article/image disk cache manager，`utils/ptt-cache-manager.js` 保留 adapter |

### URL 路由核心 (`src/core/routing/`)

| 檔案 | 功能 |
|------|------|
| `url-matcher.js` | URL 比對器 canonical 實作，判斷 URL 屬於哪個站台 |
| `url-patterns.js` | URL 正規表達式模式 canonical 定義 |

### URL 路由相容層 (`tfd-system/regex/`)

| 檔案 | 功能 |
|------|------|
| `matcher.js` | 舊路徑 adapter，轉接至 `src/core/routing/url-matcher.js` |
| `patterns.js` | 舊路徑 adapter，轉接至 `src/core/routing/url-patterns.js` |

### 渲染核心 (`src/core/rendering/`)

| 檔案 | 功能 |
|------|------|
| `html-video-renderer.js` | HTML 影片渲染器 canonical 實作（FxEmbed 技術嵌入式播放） |
| `mixed-media-html-builder.js` | 混合媒體 HTML 建構器 canonical 實作（影片+圖片組合頁面） |

### 渲染器相容層 (`tfd-system/render/`)

| 檔案 | 功能 |
|------|------|
| `html-video-renderer.js` | 舊路徑 adapter，轉接至 `src/core/rendering/html-video-renderer.js` |
| `mixed-media-html-builder.js` | 舊路徑 adapter，轉接至 `src/core/rendering/mixed-media-html-builder.js` |

### 工具 (`tfd-system/utils/`)

| 檔案 | 功能 |
|------|------|
| `dom-parser.js` | 舊路徑 adapter，轉接至 `src/shared/html/dom-parser.js` |
| `embed-builder.js` | 舊路徑 adapter，轉接至 `src/shared/discord/embed-builder.js` |
| `http-client.js` | 舊路徑 adapter，轉接至 `src/shared/http/http-client.js` |
| `text-truncator.js` | 舊路徑 adapter，轉接至 `src/shared/discord/text-truncator.js` |
| `translation-button-builder.js` | 翻譯按鈕建構器 |
| `tunnel-url-provider.js` | 舊路徑 adapter，轉接至 `src/shared/web/tunnel-url-provider.js` |
| `url-converter-logger.js` | 舊路徑 adapter，轉接至 `src/shared/logging/url-converter-logger.js` |
| `url-stats.js` | 舊路徑 adapter，轉接至 `src/shared/analytics/url-stats.js` |

### 設定 (`tfd-system/config/`)

| 檔案 | 功能 |
|------|------|
| `pekoembed-config.json` | pekoembed 系統全域設定 |
| `supported-sites.json` | 支援站台清單 |
| `tfd-config.json` | TFD 系統設定（排除頻道、使用者等） |

---

## 🛠️ 工具函式 (`utils/`)

### 安全與限制

> `utils/twitter-v2-state-store.js` 目前是 `src/features/twitter/state/v2-state-store.js` 的相容 adapter。

| 檔案 | 功能 |
|------|------|
| `rate-limiter.js` | 舊路徑 adapter，轉接至 `src/shared/rate-limit/rate-limiter.js` |
| `abuse-detector.js` | 舊路徑 adapter，轉接至 `src/features/moderation/abuse-detector.js` |
| `guild-blacklist-manager.js` | 舊路徑 adapter，轉接至 `src/features/moderation/guild-blacklist-manager.js` |
| `blacklist-manager.js` | Removed legacy global JSON blacklist manager; active runtime uses `guild-blacklist-manager.js` |
| `crypto-helper.js` | 舊路徑 adapter，轉接至 `src/shared/crypto/crypto-helper.js` |
| `normalize-author.js` | 舊路徑 adapter，轉接至 `src/features/moderation/normalize-author.js` |
| `recall-limiter.js` | 舊路徑 adapter，轉接至 `src/features/reports/recall-limiter.js` |
| `src/features/reports/recall-limiter.js` | 回報/Context Action 共用的收回訊息冷卻限制器 |

### 翻譯系統

> 新主路徑：`src/features/translation/`。舊的 `utils/translation/*`、`utils/ai-translator.js`、`utils/user-api-key-*` 目前保留為相容 adapter。

| 檔案 | 功能 |
|------|------|
| `translation/service/translation-service.js` | 統一翻譯服務入口（Classic Twitter / Twitter V2 共用 provider、key、prompt、錯誤格式） |
| `translation/cache/shared-translation-cache.js` | Provider-aware cross-channel translation cache implementation |
| `translation/errors.js` | Normalized translation error helper |
| `translation/keys/key-resolver.js` | Provider selection and API key resolution helper |
| `translation/text/glossary.js` | Translation glossary preprocessing/postprocessing helper |
| `translation/text/prompt-builder.js` | VTuber-focused translation prompt builder |
| `translation/text/text-bundle.js` | Main/quote/reply text bundle helper |
| `translation/providers/` | Gemini / OpenRouter / OpenAI / Claude / Google provider adapters |
| `translation/providers/provider-registry.js` | Translation provider registry |
| `translation/providers/gemini-provider.js` | Gemini provider implementation |
| `translation/providers/openrouter-provider.js` | OpenRouter provider implementation |
| `translation/providers/openai-provider.js` | OpenAI provider implementation |
| `translation/providers/claude-provider.js` | Claude provider implementation |
| `translation/providers/google-translate-provider.js` | Google Translate + OpenCC provider implementation |
| `ai-translator.js` | Legacy adapter，保留舊 exports 並轉接 translation-service |
| `deepl-translator.js` | DeepL 翻譯器 |
| `openrouter-translator.js` | Removed unused legacy adapter; active provider code remains under `src/features/translation/legacy/` and `utils/translation/providers/` |
| `translator.js` | Legacy adapter，轉接至 `src/features/translation/providers/google-translate-provider.js` |
| `shared-translation-cache.js` | Legacy adapter，轉接至 `src/features/translation/cache/shared-translation-cache.js` |
| `translation-glossary.js` | Legacy adapter，轉接至 `src/features/translation/text/glossary.js` |

### 快取系統

| 檔案 | 功能 |
|------|------|
| `pixiv-cache-manager.js` | 舊路徑 adapter，轉接至 `src/features/pixiv/cache/pixiv-cache-manager.js` |
| `pixiv-r18-cache-manager.js` | 舊路徑 adapter，轉接至 `src/features/pixiv/cache/r18-cache-manager.js` |
| `ptt-cache-manager.js` | 舊路徑 adapter，轉接至 `src/features/ptt/cache/ptt-cache-manager.js` |

### Webhook 與 Discord

| 檔案 | 功能 |
|------|------|
| `webhook-manager.js` | 舊路徑 adapter，轉接至 `src/shared/webhook/webhook-manager.js` |
| `spoiler-button-helper.js` | 舊路徑 adapter，轉接至 `src/shared/discord/spoiler-button-helper.js` |
| `embed-helpers.js` | 舊路徑 adapter，轉接至 `src/shared/discord/message-helpers.js` |
| `tfd-logger.js` | 舊路徑 adapter，轉接至 `src/shared/logging/tfd-logger.js` |

### 外部服務

| 檔案 | 功能 |
|------|------|
| `bahamut-auth.js` | Legacy adapter for `src/features/sites/bahamut/bahamut-auth.js` |
| `src/features/sites/bahamut/bahamut-auth.js` | 巴哈姆特認證管理（Cookie），Cookie cache 固定寫入專案根 `data/` |
| `lightpanda-client.js` | Legacy adapter for `src/shared/browser/lightpanda-client.js` |
| `playwright-semantic-browser.js` | Legacy adapter for `src/shared/browser/playwright-semantic-browser.js` |
| `src/shared/browser/lightpanda-client.js` | Lightpanda CDP shared browser helper implementation |
| `src/shared/browser/playwright-semantic-browser.js` | Playwright semantic shared browser helper implementation |
| `pixiv-ugoira-mp4-processor.js` | 舊路徑 adapter，轉接至 `src/features/pixiv/media/ugoira-mp4-processor.js` |

### 用戶 API Key

| 檔案 | 功能 |
|------|------|
| `user-api-key-service.js` | Legacy API Key service adapter，轉接 translation/key-resolver |
| `user-api-key-storage.js` | Legacy adapter，轉接至 `src/features/translation/keys/user-api-key-storage.js` |

---

## 💾 資料層 (`db/`)

| 檔案 | 功能 |
|------|------|
| `index.js` | SQLite 統一介面（better-sqlite3，WAL 模式）— rate_limits、abuse_log、url_stats、guild_settings、user_api_keys、guild_link_domains |
| `schema.sql` | 資料庫 Schema 定義 |

---

## 📜 腳本 (`scripts/`)

| 檔案 | 功能 |
|------|------|
| `ops/db-pull.bat` | Windows DB pull implementation used by scheduler |
| `ops/db-pull.sh` | Bash DB pull implementation; reads root `.env` |
| `ops/db-push.sh` | Bash DB push/restore implementation; high-risk manual recovery script |
| `ops/setup-schedule.bat` | Windows scheduled task setup implementation |
| `db-pull.bat` | Legacy root wrapper for `scripts/ops/db-pull.bat` |
| `db-pull.sh` | Legacy root wrapper for `scripts/ops/db-pull.sh` |
| `db-push.sh` | Legacy root wrapper for `scripts/ops/db-push.sh` |
| `setup-schedule.bat` | Legacy root wrapper for `scripts/ops/setup-schedule.bat` |
| `migrate-from-json.js` | Legacy wrapper for `scripts/migrations/migrate-from-json.js` |
| `component-sanitizer-smoke.js` | Discord components 合法化 smoke test |
| `migrations/migrate-from-json.js` | JSON to SQLite/API-key migration implementation |
| `migrations/sync-blacklist-from-4.0.js` | One-off 4.0 blacklist JSON to TFD SQLite migration implementation |
| `smoke/translation-smoke.js` | Deterministic translation subsystem smoke test implementation |
| `translation-smoke.js` | Legacy wrapper for `scripts/smoke/translation-smoke.js` |
| `sync-blacklist-from-4.0.js` | Legacy wrapper for `scripts/migrations/sync-blacklist-from-4.0.js` |
| `message-helpers-smoke.js` | Shared Discord message helper smoke test |
| `spoiler-button-helper-smoke.js` | Shared Discord 回報/防爆雷按鈕 helper smoke test |
| `text-truncator-smoke.js` | Shared Discord text truncator smoke test |
| `tfd-logger-smoke.js` | Shared logging adapter smoke test |
| `url-converter-logger-smoke.js` | Shared logging URL converter logger smoke test |
| `url-stats-smoke.js` | Shared analytics URL stats adapter and persistence smoke test |
| `blacklist-list-presenter-smoke.js` | Moderation blacklist list embed pagination smoke test |
| `blacklist-result-decorator-smoke.js` | Moderation blacklist Level 1/2 embed and V2 Container decoration smoke test |
| `normalize-author-smoke.js` | Moderation author normalization adapter and embed compatibility smoke test |
| `crypto-helper-smoke.js` | Shared crypto adapter and key-path smoke test |
| `dom-parser-smoke.js` | Shared HTML DOM parser smoke test |
| `embed-builder-smoke.js` | Shared Discord embed builder smoke test |
| `http-client-smoke.js` | Shared HTTP client adapter and retry behavior smoke test |
| `tunnel-url-provider-smoke.js` | Shared web tunnel URL provider adapter and cache smoke test |
| `twitter-quote-display-policy-smoke.js` | Twitter quote V1/V2 display policy smoke test |
| `twitter-v2-tweet-cache-smoke.js` | Twitter V2 tweet cache TTL and prune smoke test |
| `twitter-v2-tweet-bundle-resolution-smoke.js` | Twitter V2 cache-vs-refresh tweet bundle resolution smoke test |
| `twitter-v2-action-rows-smoke.js` | Twitter V2 action row button and row-length smoke test |
| `twitter-v2-component-state-smoke.js` | Twitter V2 component tree state derivation smoke test |
| `twitter-v2-render-state-smoke.js` | Twitter V2 render-state fallback and merge smoke test |
| `twitter-v2-view-payload-smoke.js` | Twitter V2 Components edit payload smoke test |
| `twitter-v2-view-stats-smoke.js` | Twitter V2 URL repost stats lookup smoke test |
| `twitter-v2-view-updater-exports-smoke.js` | Twitter V2 view updater public export surface smoke test |
| `twitter-v2-view-message-state-smoke.js` | Twitter V2 interaction message state bridge smoke test |
| `twitter-v2-v1-transition-smoke.js` | Twitter V2 to classic V1 quote-collapse transition payload smoke test |
| `twitter-v2-article-response-smoke.js` | Twitter V2 article response payload smoke test |
| `twitter-v2-mixed-media-response-smoke.js` | Twitter V2 mixed-media response payload smoke test |
| `twitter-v2-video-mode-response-smoke.js` | Twitter V2 GAS/HTML video mode response smoke test |
| `twitter-v2-enhanced-embed-smoke.js` | Twitter V2 classic enhanced embed construction smoke test |
| `link-support-smoke.js` | `/pe linksup` domain registry 與 DB override smoke test |

---

## 📄 文件 (`doc/`)

| 檔案 | 功能 |
|------|------|
| `docs/system/file-index.md` | Canonical file index |
| `docs/discord/intent-application.md` | Discord MessageContent Intent application doc |
| `docs/legal/privacy-policy.md` | Privacy policy |
| `docs/legal/terms-of-service.md` | Terms of service |
| `docs/archive/public-release-refactor.md` | Public release refactor archive |
| `docs/archive/twitter/translate-auto-expand.md` | Twitter expand auto-translate archive |
| `docs/archive/moderation/tfd-1-4-0-blacklist-plan.md` | Blacklist implementation archive |
| `docs/deploy/oracle-cloud-setup-guide.md` | Oracle Cloud setup guide |
| `docs/deploy/oracle-deployment-plan.md` | Oracle deployment plan |
| `docs/product/cost-model-and-pricing.md` | Cost model and pricing spec |
| `docs/product/data-model-and-state-machine.md` | Data model and state machine spec |
| `docs/product/discord-product-flow.md` | Discord product flow spec |
| `docs/product/translation-monetization-plan.md` | Translation monetization plan |
| `docs/product/wallet-and-billing.md` | Wallet and billing spec |
| `docs/research/model-pricing.md` | Model pricing research |
| `doc/**` / `TFD_UNIFIED_SPEC.md` stubs | Compatibility pointers to canonical `docs/` files |
