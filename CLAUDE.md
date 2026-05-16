# TransForDiscord (TFD) — AI 開發指南

## 語言
固定使用**繁體中文**回應。

## 專案概述
TFD 是一個 Discord Bot，核心功能是**自動偵測使用者貼的 URL → 擷取內容 → 用 Webhook 轉發美化後的 Embed**。附加翻譯、防爆雷、黑名單、回報等互動功能。

## 架構總覽

```
使用者貼 URL
  ↓
index.js (MessageCreate)
  ↓
message-handler-v2.js ← 核心路由，匹配 URL → 呼叫 extractor → 組裝 Embed → webhook 發送
  ↓                    ← 黑名單執行點（level 1/2/3）
  ├── tfd-system/regex/        URL 匹配規則
  ├── tfd-system/extractors/   各站台擷取器（20+）
  ├── tfd-system/render/       影片 HTML 渲染
  └── utils/webhook-manager.js Webhook 建立/快取/發送

使用者點按鈕/選單
  ↓
interactionCreate.js ← prefix 路由分流
  ├── commands/pe.js                 /pe 斜線指令（設定、API Key、黑名單）
  ├── commands/tfd-context-actions.js 右鍵選單「PekoEmbed 操作」
  ├── handlers/report-button-interactions.js 回報系統（按鈕/Modal/Select）
  ├── handlers/twitter-v2-interactions.js    V2 Container 互動
  ├── handlers/twitter-translate-interactions.js 翻譯按鈕
  ├── handlers/spoiler-button-interactions.js    防爆雷
  └── handlers/twitter-*.js                      展開/分頁/重整/引用
```

## 部署

| 環境 | 位置 | 方式 |
|------|------|------|
| VPS（線上） | `root@64.118.148.130:/root/TransForDiscord` | SSH |
| 本機（開發） | `d:\OneDrive\RB\DISCORDBOT\TransForDiscord` | 直接執行 |

**推送 + 部署 SOP：**
```bash
# 1. 本機 commit + push
git add [精準檔案]
git commit -m "type(scope): 描述"
git push origin master

# 2. VPS 部署
ssh root@64.118.148.130 "cd /root/TransForDiscord && git fetch origin && git stash && git rebase origin/master && pm2 restart transfordiscord"

# 3. 驗證
ssh root@64.118.148.130 "pm2 logs transfordiscord --lines 15 --nostream"
```

**斜線指令變動時**須額外執行：
```bash
ssh root@64.118.148.130 "cd /root/TransForDiscord && node deploy.js"
```

## 資料庫

SQLite（better-sqlite3），單一檔案 `data/tfd.db`。

- **Schema 定義**：`db/schema.sql`
- **API 層**：`db/index.js` — 所有外部存取必須透過此模組的 API 物件
- **禁止**：直接 `db.getDB().prepare(...)` 寫 ad-hoc SQL，必須在 `db/index.js` 加 prepared statement

| API 物件 | 對應表 | 用途 |
|----------|--------|------|
| `db.guilds` | guild_settings | 伺服器設定（含 blacklist_enabled） |
| `db.blockedChannels` | guild_blocked_channels | 排除頻道 |
| `db.excludedUsers` | guild_excluded_users | 排除使用者 |
| `db.apiKeys` | user_api_keys | 加密 API Key（AES-256-GCM） |
| `db.urlStats` | url_stats | URL 統計 |
| `db.rateLimit` | rate_limit_log | 速率限制 |
| `db.abuse` | abuse_records | 濫用記錄 |
| `db.blacklist` | guild_blacklist | per-guild 作者黑名單 |
| `db.blacklistReports` | blacklist_reports | 黑名單回報（待審/通過/拒絕） |

## 修改前必讀

根據任務類型，**先讀對應的索引檔再動手**：

| 要做什麼 | 先讀 | 原因 |
|----------|------|------|
| 新增/改 extractor | `tfd-system/config/supported-sites.json` + `tfd-system/extractors/index.js` | 站台註冊表 + 載入邏輯 |
| 改 URL 匹配規則 | `tfd-system/regex/patterns.js` + `matcher.js` | 所有 regex 定義 |
| 改互動（按鈕/Modal） | `events/interactionCreate.js` | prefix 路由表，確認不衝突 |
| 改黑名單邏輯 | `utils/guild-blacklist-manager.js` → `db/index.js` → `db/schema.sql` | Manager → DB API → Schema 三層 |
| 改回報流程 | `handlers/report-button-interactions.js` | 完整的 button→modal→admin 鏈 |
| 改翻譯功能 | `src/features/translation/` | 統一翻譯 domain；舊 `utils/*` 路徑為 adapter |
| 改 Twitter/X | `src/features/twitter/` | Twitter domain；沒有發推功能；舊 `handlers/twitter-*`、`utils/twitter-v2-state-store.js`、`tfd-system/extractors/twitter-*` 路徑為 adapter |
| 改 Twitter V2 互動 | `src/features/twitter/interactions/v2/` | `v2-router.js` 只做分派；翻譯/展開/重整/防爆雷在 v2 子模組 |
| 改 Twitter V2 擷取 helper | `src/features/twitter/extractors/v2/` | `twitter-v2-extractor.js` 保留相容 method；純 helper 優先放在 v2 子模組 |
| 改 webhook 行為 | `utils/webhook-manager.js` + `src/features/discord/component-sanitizer.js` | Webhook 建立/快取/討論串邏輯；送出前 components 必須合法化 |
| 改支援網域開關 | `src/features/link-support/` + `commands/pe.js` + `db/schema.sql` | `/pe linksup` per-guild domain on/off，domain registry → DB → command 三層 |
| 改 Embed 元件 | `utils/spoiler-button-helper.js` + `utils/embed-helpers.js` | 按鈕附加 + 作者解析 |

## 命名規則

| 類型 | 規則 | 範例 |
|------|------|------|
| 檔案 | kebab-case | `guild-blacklist-manager.js` |
| customId | `{系統}_{動作}_{參數}` | `report_btn_{ts}`, `ctx_delete_{ch}_{msg}`, `rbl_level_{reportId}` |
| DB 欄位 | snake_case | `guild_id`, `created_at`, `blacklist_enabled` |
| Prepared Statement | camelCase | `blacklistAdd`, `reportInsert` |
| DB API 方法 | camelCase 動詞 | `guilds.get()`, `blacklist.add()`, `blacklistReports.setLogMessageId()` |

## 共用模組

以下模組設計為多處共用，修改時注意影響範圍：

| 模組 | 消費者 | 說明 |
|------|--------|------|
| `utils/embed-helpers.js` | tfd-context-actions, report-button-interactions | `resolveAuthorId` / `detectPlatformFromUrl` / `extractUrlFromMessage` |
| `utils/recall-limiter.js` | tfd-context-actions, report-button-interactions | 共用收回次數限制（3次/10分鐘） |
| `utils/spoiler-button-helper.js` | message-handler-v2, twitter-reload, pixiv-reload, twitter-v2-container-builder | 回報/防爆雷按鈕附加 |
| `src/features/discord/component-sanitizer.js` | message-handler-v2, webhook-manager | 送出/編輯 Discord components 前過濾空 ActionRow、拆分超過 5 個子元件的 row |
| `utils/normalize-author.js` | message-handler-v2 | 各平台作者名正規化（for 黑名單比對） |
| `utils/tfd-logger.js` | 全專案 | 統一日誌格式 `[MM/DD-HH:mm:ss] [Server] [Fn] [User] detail` |

## interactionCreate 路由表

路由按 prefix 分流，**順序敏感**（先匹配先執行）：

| 優先序 | prefix | 導向 |
|--------|--------|------|
| Modal | `v2_spoiler_modal_` | twitter-v2-interactions |
| Modal | `ctx_delete_modal_` / `ctx_spoiler_modal_` / `ctx_report_modal_` | tfd-context-actions |
| Modal | `report_spoiler_modal_` / `report_recall_modal_` / `report_blacklist_modal_` / `rbl_admin_modal_` | report-button-interactions |
| Modal | `spoiler_modal_` | spoiler-button-interactions |
| Button | `spoiler_btn` | spoiler-button-interactions |
| Button | `ctx_*` | tfd-context-actions |
| Button/Select | `report_*` / `rbl_*` | report-button-interactions |
| Button | `v2_*` | twitter-v2-interactions |
| Button | `twitter_expand_all_` / `twitter_collapse_all_` | twitter-all-interactions（必須在 expand_ 之前） |
| Button | `twitter_expand_` / `twitter_collapse_` | twitter-expand-interactions |
| Button | `twitter_translate_` / `twitter_original_` | twitter-translate-interactions |
| Button | `twitter_reload_` | twitter-reload-interactions |
| Button | `twitter_page_` | twitter-pagination-interactions |
| Button | `pixiv_reload_` | pixiv-reload-interactions（必須在 pixiv_ 之前） |
| Button | `pixiv_*` | pixiv-pagination-interactions |
| Button | `ptt_*` | ptt-pagination-interactions |

新增 customId prefix 時必須確認不與現有 prefix 衝突。

## 禁止事項

- **不要直接執行 `index.js` 或 `pm2 restart`** — 由用戶操作
- **不要讀取/輸出 `.env` 內容**
- **不要 `git push --force`**
- **不要繞過 `db/index.js`** 直接寫 SQL

## Commit 格式

```
type(scope): 描述
```
type: `feat` / `fix` / `refactor` / `docs` / `chore`
scope: 模組名（如 `blacklist`, `twitter-v2`, `pe`, `db`）
