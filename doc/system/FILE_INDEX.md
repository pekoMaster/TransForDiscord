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
| `deploy.js` | Discord 斜線指令部署腳本（`node deploy.js`） |
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
| `content-translation-interactions.js` | 內容翻譯按鈕互動（Twitter/Facebook 等） |
| `pixiv-reload-interactions.js` | Pixiv 重新載入按鈕（切換 Proxy） |
| `spoiler-button-interactions.js` | 通用防爆雷按鈕 + Modal（V2 Components 版） |
| `twitter-all-interactions.js` | Twitter 全文展開/收起按鈕 |
| `twitter-expand-interactions.js` | Twitter 單則展開/收起按鈕 |
| `twitter-pagination-interactions.js` | Twitter 多圖分頁按鈕 |
| `twitter-quote-interactions.js` | Twitter 引用/回覆展開按鈕 |
| `twitter-reload-interactions.js` | Twitter 重新載入按鈕（V1 重抓） |
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
| `4gamers.js` | 4Gamers 遊戲新聞 |
| `52poke.js` | 神奇寶貝百科（52Poke Wiki） |
| `bahamut.js` | 巴哈姆特 — 勇者小屋、哈啦區 |
| `bilibili.js` | Bilibili — bilibili.com / b23.tv / vxbilibili |
| `cts.js` | 華視新聞（Nuxt SSR JSON 解析） |
| `dynamic.js` | 動態通用擷取器（fallback） |
| `facebook.js` | Facebook — Puppeteer 無頭抓取 |
| `facebook-mbasic.js` | Facebook mbasic 版（輕量 fallback） |
| `facebook-smart.js` | Facebook 智慧選擇器 |
| `facebook-with-login.js` | Facebook 登入版抓取 |
| `facebookez.js` | Facebook/Instagram — 透過 facebed.com / EmbedEZ |
| `instagram.js` | Instagram 貼文擷取 |
| `line-today.js` | LINE TODAY 新聞 |
| `mobile01.js` | Mobile01 論壇（HTTP + cheerio） |
| `msn.js` | MSN 新聞（CAPI API） |
| `nikke.js` | 勝利女神：妮姬 官網公告 |
| `pchome.js` | PChome 24h 商品頁 |
| `pixiv.js` | Pixiv 作品 — 多圖分頁、Ugoira 動圖 |
| `pixiv-image-attachment-optimizer.js` | Pixiv 圖片附件優化器 |
| `pornhub.js` | Pornhub 影片擷取 |
| `ptt.js` | PTT 文章 — 多圖分頁快取 |
| `threads.js` | Threads — fixthreads.seria.moe OG meta + V2 Container |
| `twitter-legacy.js` | Twitter/X — V1 傳統 Embed 版 |
| `twitter-v2.js` | Twitter/X — V2 Components 版 ⭐ |
| `twitter-image-attachment-optimizer.js` | Twitter 圖片附件優化器 |
| `twitter-video-attachment-optimizer.js` | Twitter 影片 URL 轉附件 |
| `udn.js` | UDN 聯合新聞 |
| `xfastest.js` | XFastest 滄者極限 |
| `youtube.js` | YouTube — /live/ 轉換、短網址解析 |

### Twitter 功能模組 (`src/features/twitter/`)

> Twitter/X 新主路徑：`src/features/twitter/`。舊的 `handlers/twitter-*`、`utils/twitter-v2-state-store.js`、`tfd-system/extractors/twitter-*` 目前保留為相容 adapter。

| 路徑 | 功能 |
|------|------|
| `extractors/twitter-v2-extractor.js` | Twitter V2 擷取 orchestrator，保留舊 method 介面並委派到 `extractors/v2/` helpers |
| `extractors/v2/classic-components.js` | Classic Embed 分頁、翻譯、展開、重整按鈕建構 |
| `extractors/v2/images.js` | 圖片清單、多圖片 URL、卡片圖片 fallback、防爆雷 URL prefix |
| `extractors/v2/media-classifier.js` | 回覆/引用/媒體類型判斷與圖片/影片數量 |
| `extractors/v2/media-policy.js` | 多 Embed 與 GAS 模式顯示策略 |
| `extractors/v2/normalizer.js` | vxtwitter API 回應轉 fxtwitter 相容格式 |
| `extractors/v2/response-builders.js` | Profile Embed、passthrough、error response 建構 |
| `extractors/v2/tweet-fetcher.js` | fxtwitter 優先、vxtwitter fallback 的推文抓取流程 |
| `extractors/v2/tweet-info.js` | URL 推文 ID、引用推文資訊、回覆目標解析 |
| `extractors/v2/video-links.js` | 影片 URL 擷取與 Discord 連結文字格式 |
| `interactions/v2/` | Twitter V2 Container 翻譯、展開、重整、防爆雷等互動子模組 |

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

### Shared Analytics 模組 (`src/shared/analytics/`)

| 路徑 | 功能 |
|------|------|
| `url-stats.js` | URL 重複貼文統計（channel/guild/total），舊 `tfd-system/utils/url-stats.js` 僅保留 adapter |

### Link Support 功能模組 (`src/features/link-support/`)

| 路徑 | 功能 |
|------|------|
| `link-support/domain-registry.js` | TFD 支援網域 registry，負責網域正規化與 domain → siteName 對應 |
| `link-support/link-support-service.js` | Per-guild 支援網域 on/off 服務，轉接 SQLite `guild_link_domains` |

### Moderation 功能模組 (`src/features/moderation/`)

| 路徑 | 功能 |
|------|------|
| `blacklist-result-decorator.js` | 黑名單 Level 1/2 顯示套用，支援傳統 embed 與 V2 Container |
| `normalize-author.js` | 黑名單比對用作者正規化，支援 plain embed 與 Discord EmbedBuilder `data` 結構；舊 `utils/normalize-author.js` 僅保留 adapter |

### 正規表達式 (`tfd-system/regex/`)

| 檔案 | 功能 |
|------|------|
| `matcher.js` | URL 比對器 — 判斷 URL 屬於哪個站台 |
| `patterns.js` | 正規表達式模式定義 |

### 渲染器 (`tfd-system/render/`)

| 檔案 | 功能 |
|------|------|
| `html-video-renderer.js` | HTML 影片渲染器（FxEmbed 技術嵌入式播放） |
| `mixed-media-html-builder.js` | 混合媒體 HTML 建構器（影片+圖片組合頁面） |

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
| `rate-limiter.js` | 速率限制器（SQLite 後端，含自動 GC） |
| `abuse-detector.js` | 濫用偵測器（SQLite 後端，含自動 GC） |
| `blacklist-manager.js` | 黑名單管理器（PTT/Twitter 等） |
| `crypto-helper.js` | 舊路徑 adapter，轉接至 `src/shared/crypto/crypto-helper.js` |
| `normalize-author.js` | 舊路徑 adapter，轉接至 `src/features/moderation/normalize-author.js` |

### 翻譯系統

> 新主路徑：`src/features/translation/`。舊的 `utils/translation/*`、`utils/ai-translator.js`、`utils/user-api-key-*` 目前保留為相容 adapter。

| 檔案 | 功能 |
|------|------|
| `translation/translation-service.js` | 統一翻譯服務入口（Classic Twitter / Twitter V2 共用 provider、key、prompt、錯誤格式） |
| `translation/text-bundle.js` | 主推文 / 引用 / 回覆文字 bundle 組合與拆分 |
| `translation/key-resolver.js` | 翻譯 provider 選擇與 API Key 解析 |
| `translation/providers/` | Gemini / OpenRouter / OpenAI / Claude provider adapters |
| `ai-translator.js` | Legacy adapter，保留舊 exports 並轉接 translation-service |
| `deepl-translator.js` | DeepL 翻譯器 |
| `openrouter-translator.js` | Legacy OpenRouter helper，保留相容用途 |
| `translator.js` | Google Translate API 翻譯器 |
| `shared-translation-cache.js` | Provider-aware 跨頻道翻譯快取（sourceId + provider，磁碟持久化） |
| `translation-glossary.js` | 翻譯術語表（DeepL 詞彙修正） |

### 快取系統

| 檔案 | 功能 |
|------|------|
| `pixiv-cache-manager.js` | Pixiv 作品快取管理（磁碟 JSON） |
| `pixiv-r18-cache-manager.js` | Pixiv R18 快取管理（已禁用） |
| `ptt-cache-manager.js` | PTT 文章快取管理（磁碟 JSON） |

### Webhook 與 Discord

| 檔案 | 功能 |
|------|------|
| `webhook-manager.js` | Webhook 管理器 ⭐ — 自訂名稱/頭像發送、閒置重命名、flags 傳遞 |
| `spoiler-button-helper.js` | 舊路徑 adapter，轉接至 `src/shared/discord/spoiler-button-helper.js` |
| `embed-helpers.js` | 舊路徑 adapter，轉接至 `src/shared/discord/message-helpers.js` |
| `tfd-logger.js` | 舊路徑 adapter，轉接至 `src/shared/logging/tfd-logger.js` |

### 外部服務

| 檔案 | 功能 |
|------|------|
| `bahamut-auth.js` | 巴哈姆特認證管理（Cookie） |
| `lightpanda-client.js` | Lightpanda CDP 無頭瀏覽器客戶端（Docker） |
| `playwright-semantic-browser.js` | Playwright 語意瀏覽器 |
| `pixiv-ugoira-mp4-processor.js` | Pixiv Ugoira 動圖轉 MP4 |

### 用戶 API Key

| 檔案 | 功能 |
|------|------|
| `user-api-key-service.js` | Legacy API Key service adapter，轉接 translation/key-resolver |
| `user-api-key-storage.js` | 用戶 API Key 儲存層（SQLite + 加密） |

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
| `migrate-from-json.js` | 從舊版 JSON 遷移到 SQLite + 加密 API Key（含 `--dry-run`） |
| `component-sanitizer-smoke.js` | Discord components 合法化 smoke test |
| `message-helpers-smoke.js` | Shared Discord message helper smoke test |
| `spoiler-button-helper-smoke.js` | Shared Discord 回報/防爆雷按鈕 helper smoke test |
| `text-truncator-smoke.js` | Shared Discord text truncator smoke test |
| `tfd-logger-smoke.js` | Shared logging adapter smoke test |
| `url-converter-logger-smoke.js` | Shared logging URL converter logger smoke test |
| `url-stats-smoke.js` | Shared analytics URL stats adapter and persistence smoke test |
| `blacklist-result-decorator-smoke.js` | Moderation blacklist Level 1/2 embed and V2 Container decoration smoke test |
| `normalize-author-smoke.js` | Moderation author normalization adapter and embed compatibility smoke test |
| `crypto-helper-smoke.js` | Shared crypto adapter and key-path smoke test |
| `dom-parser-smoke.js` | Shared HTML DOM parser smoke test |
| `embed-builder-smoke.js` | Shared Discord embed builder smoke test |
| `http-client-smoke.js` | Shared HTTP client adapter and retry behavior smoke test |
| `tunnel-url-provider-smoke.js` | Shared web tunnel URL provider adapter and cache smoke test |
| `link-support-smoke.js` | `/pe linksup` domain registry 與 DB override smoke test |

---

## 📄 文件 (`doc/`)

| 檔案 | 功能 |
|------|------|
| `system/FILE_INDEX.md` | 本文件 — 檔案索引 |
| `INTENT_APPLICATION.md` | Discord MessageContent Intent 特權申請說明書 |
| `PRIVACY_POLICY.md` | 隱私權政策 |
| `TERMS_OF_SERVICE.md` | 服務條款 |
| `PUBLIC_RELEASE_REFACTOR.md` | 公開發布重構記錄 |
| `TWITTER_TRANSLATE_AUTO_TRANSLATE_ON_EXPAND_2026-04-12.md` | Twitter 展開自動翻譯功能設計文件 |
