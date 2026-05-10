# TFD 公開化重構計畫

## 狀態：進行中
- 建立日期：2026-05-10
- 目標：將 TFD 從個人 bot 改造為可公開讓任何伺服器邀請的多租戶 bot

---

## 一、原始需求（2026-05-10）

用戶要求對 TFD 做完整公開化改造。針對前期審查發現的 11 項安全與架構問題，分別決議如下：

| # | 問題 | 決議 |
|---|------|------|
| 1 | API Key 明文儲存 | 加密儲存（不改成不存） |
| 2 | LOG_CHANNEL_ID 硬編碼 | 改為 per-guild 斜線指令設定，預設不發 log |
| 3 | adminUserId 硬編碼 | 改為 per-guild owner 設定（活動用，各伺服器各自） |
| 4 | excludedUsers/blockedChannels 全域 | 改 per-guild |
| 5 | tfd-config.json 單檔 | 改用 SQLite，欄位細分 |
| 6 | Iwara 帳號共用問題 | 完整移除 Iwara 支援 |
| 7 | Pixiv R18 上傳到私人頻道 | 公開版禁用，預設無視 R18 URL |
| 8 | rate limit 全域 | 改 per-guild + per-user |
| 9 | MessageContent Intent | 準備 Privacy Policy + ToS + 申請文件 |
| 10 | 無濫用偵測 | 加入 |
| 11 | URL stats 無清理 | TFD 與 4.0 都加清理機制 |

---

## 二、施作計畫

### Phase 1：資料層基礎

| 檔案 | 動作 | 說明 |
|------|------|------|
| `data/tfd.db` | 新建 | SQLite 資料庫（執行時自動建立） |
| `db/schema.sql` | 新建 | DDL 定義 |
| `db/index.js` | 新建 | 統一資料層 API |
| `utils/crypto-helper.js` | 新建 | AES-256-GCM 加密工具 |
| `scripts/migrate-from-json.js` | 新建 | 從舊 JSON 匯入 |
| `package.json` | 修改 | 加入 `better-sqlite3` |

### Phase 2：配置改造

| 檔案 | 動作 | 說明 |
|------|------|------|
| `commands/tfd.js` | 重寫 | 全部走 SQLite，per-guild 設定 |
| `handlers/spoiler-button-interactions.js` | 修改 | 移除硬編碼 LOG_CHANNEL_ID |
| `handlers/twitter-interactions.js` | 修改 | 移除硬編碼 adminUserId |
| `tfd-system/core/message-handler-v2.js` | 修改 | 讀 per-guild 設定 |
| `utils/user-api-key-storage.js` | 重寫 | 走 SQLite + 加密 |

### Phase 3：功能裁剪

| 檔案 | 動作 | 說明 |
|------|------|------|
| `tfd-system/extractors/iwara*.js` | 刪除 | 完整移除 |
| `utils/iwara-extractor*.js` | 刪除 | 完整移除 |
| `tfd-system/extractors/index.js` | 修改 | 移除 iwara 註冊 |
| `tfd-system/regex/patterns.js` | 修改 | 移除 iwara pattern |
| `tfd-system/regex/matcher.js` | 修改 | 移除 iwara 邏輯 |
| `tfd-system/extractors/pixiv.js` | 修改 | R18 預設略過 |
| `utils/pixiv-r18-cache-manager.js` | 修改 | 公開版停用上傳 |

### Phase 4：防護

| 檔案 | 動作 | 說明 |
|------|------|------|
| `utils/rate-limiter.js` | 新建 | per-guild + per-user 速率限制 |
| `utils/abuse-detector.js` | 新建 | spam 偵測 |
| `utils/url-stats-cleanup.js` | 新建 | TFD URL stats 清理 |
| `4.0/utils/url-stats-cleanup.js` | 新建 | 4.0 URL stats 清理 |

### Phase 5：法律文件

| 檔案 | 動作 | 說明 |
|------|------|------|
| `doc/PRIVACY_POLICY.md` | 新建 | 隱私政策 |
| `doc/TERMS_OF_SERVICE.md` | 新建 | 服務條款 |
| `doc/INTENT_APPLICATION.md` | 新建 | MessageContent Intent 申請說明 |

---

## 三、進度追蹤

### Phase 1 — 資料層
- [ ] 1.1 SQLite schema + db.js 資料層
- [ ] 1.2 API Key AES-256-GCM 加密層
- [ ] 1.3 JSON → SQLite 遷移腳本

### Phase 2 — 配置改造
- [ ] 2.1 重寫 commands/tfd.js
- [ ] 2.2 修正 LOG_CHANNEL_ID 硬編碼
- [ ] 2.3 修正 adminUserId 硬編碼
- [ ] 2.4 message-handler 讀 per-guild 設定

### Phase 3 — 功能裁剪
- [ ] 3.1 移除 Iwara
- [ ] 3.2 Pixiv R18 公開版禁用

### Phase 4 — 防護
- [ ] 4.1 per-guild + per-user rate limit
- [ ] 4.2 濫用偵測
- [ ] 4.3 TFD URL stats 清理
- [ ] 4.4 4.0 URL stats 清理

### Phase 5 — 法律文件
- [ ] 5.1 Privacy Policy
- [ ] 5.2 Terms of Service
- [ ] 5.3 MessageContent Intent 申請說明

---

## 四、部署平台

預定平台：**nube**（待確認具體服務）

關鍵需求：
- 持久磁碟（SQLite 資料庫需要）
- 永久免費或合理低費用
- 支援 Node.js 18+
- 持續執行（Discord Gateway 長連線）

如果平台不支援持久磁碟，需改用 hosted DB（如 Turso、Neon）。

---

## 五、🔁 下次對話起點

### Context Profile
無對應 profile，直接讀本檔。

### 當前狀態
> 任務剛開始。已完成審查，使用者已對所有 11 項決議。準備進入 Phase 1.1。

### 下一步行動
1. 安裝 `better-sqlite3`（需用戶許可）
2. 建立 `db/schema.sql` 與 `db/index.js`
3. 確認 nube 平台是否支援 native module（better-sqlite3 需編譯）
