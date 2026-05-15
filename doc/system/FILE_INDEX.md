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

| 檔案 | 功能 |
|------|------|
| `content-translation-interactions.js` | 內容翻譯按鈕互動（Twitter/Facebook 等） |
| `pixiv-reload-interactions.js` | Pixiv 重新載入按鈕（切換 Proxy） |
| `spoiler-button-interactions.js` | 通用防爆雷按鈕 + Modal（V2 Components 版） |
| `twitter-all-interactions.js` | Twitter 全文展開/收起按鈕 |
| `twitter-expand-interactions.js` | Twitter 單則展開/收起按鈕 |
| `twitter-interactions.js` | Twitter 通用互動處理（Modal、API 調用） |
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
| `dom-parser.js` | DOM 解析工具 |
| `embed-builder.js` | Embed 建構輔助 |
| `http-client.js` | HTTP 請求客戶端（含 User-Agent 輪替） |
| `text-truncator.js` | 文字截斷工具（Discord 字數限制） |
| `translation-button-builder.js` | 翻譯按鈕建構器 |
| `tunnel-url-provider.js` | Cloudflare Tunnel URL 提供器 |
| `url-converter-logger.js` | URL 轉換記錄器 |
| `url-stats.js` | URL 統計系統（N/M/O 計數：頻道/伺服器/全域） |

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
| `crypto-helper.js` | AES-256-GCM 加解密（API Key 儲存用） |

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
| `gemini-translator.js` | Legacy Gemini helper，保留相容用途 |
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
| `spoiler-button-helper.js` | 防爆雷按鈕輔助（為 Embed 附加防雷 components） |

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
| `index.js` | SQLite 統一介面（better-sqlite3，WAL 模式）— rate_limits、abuse_log、url_stats、guild_settings、user_api_keys |
| `schema.sql` | 資料庫 Schema 定義 |

---

## 📜 腳本 (`scripts/`)

| 檔案 | 功能 |
|------|------|
| `migrate-from-json.js` | 從舊版 JSON 遷移到 SQLite + 加密 API Key（含 `--dry-run`） |

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
