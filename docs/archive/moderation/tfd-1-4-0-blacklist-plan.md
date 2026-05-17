# TFD：黑名單移植 + 收回訊息 + 回報按鈕整合

**日期**：2026-05-12
**專案**：TransForDiscord (`d:\OneDrive\RB\DISCORDBOT\TransForDiscord`)
**狀態**：待審核

---

## 一、Context（為什麼要做）

TFD 目前有三個功能分散且不一致：
1. **黑名單**（`utils/blacklist-manager.js`）：平台作者黑名單，但儲存為全域 JSON，所有伺服器共用同一份
2. **防爆雷**（`handlers/spoiler-button-interactions.js`）：獨立 🕶️ 按鈕，功能正常但入口與其他功能分散
3. **黑名單回報**：目前不存在，無法讓一般用戶回報

目標：
- 黑名單改為 **per-server SQLite**，各伺服器互不干擾
- 新增 **[收回訊息]** 功能（任何人可觸發，記錄誰收回了誰的訊息）
- 整合三個功能進一個 **[回報]** 按鈕，減少按鈕數量

---

## 二、功能規格

### 2-1. [回報] 按鈕（取代現有 🕶️）

- **位置**：所有 TFD 轉發訊息的 ActionRow（原 🕶️ 位置）
- **30 秒失效**：timestamp 編碼在 customId `report_btn_{createdTs}`，按下時判斷是否過期
- **5 秒冷卻**：per-user in-memory Map，防止刷按鈕
- **按下後**：ephemeral 私人訊息出現 3 個黑色按鈕（僅自己可見，非密頻）
  - `[上防爆雷]`
  - `[收回訊息]`
  - `[黑名單回報]`
- 子選單按鈕 customId 格式：`report_{action}_{channelId}_{msgId}_{subMenuTs}`
  - 子選單自身也有 30 秒失效判斷（`subMenuTs`）

### 2-2. [上防爆雷]

沿用現有邏輯（`handlers/spoiler-button-interactions.js`），但入口改為從子選單觸發：

1. 按下 `[上防爆雷]` → 顯示 modal（理由輸入，可空白）
   - modal customId：`report_spoiler_modal_{channelId}_{msgId}`
2. modal 送出 → 從 channelId + msgId 拉取原始訊息
3. 執行現有 `handleSpoilerModalSubmit` 的核心邏輯（需重構為接受 `targetMessage` 參數）
4. 記錄到日誌頻道（若有）

### 2-3. [收回訊息]

**觸發方式**：
- 按下 `[收回訊息]` → handler 先判斷身份

**身份判斷邏輯**：
- TFD 轉發訊息格式：`-# <@userId> originalUrl`（content 或 TextDisplay）
- 用 regex `/^-# <@(\d+)>/m` 提取第一個 `<@userId>`
- 比對 `interaction.user.id`

**若是原作者**：
- 直接 `deferUpdate()` → 刪除原始訊息 → 記錄日誌

**若不是原作者**：
- `showModal()`（理由輸入，可空白）
  - modal customId：`report_recall_modal_{channelId}_{msgId}`
- modal 送出 → 刪除原始訊息 → 記錄日誌（含理由）

**日誌格式**（embed）：
```
🗑️ <@操作者> 收回了 <@原作者> 的訊息
頻道：#頻道名
理由：（若有）
原始連結：[已刪除，無法點擊]
時間：timestamp
```

**日誌目標**：有 `log_channel_id` → 日誌頻道；無 → 訊息所在頻道

### 2-4. [黑名單回報]

**No-log-channel 警告流程（重要）**：
- 按下 `[黑名單回報]` 前先查 `guild_settings.log_channel_id`
- 若**無**日誌頻道：先 ephemeral 顯示警告訊息 + `[確認送出]` 按鈕
  - 警告文：`⚠️ 此伺服器未設定日誌頻道，回報內容（含作者帳號、理由）將顯示在當前頻道，所有人可見。確定繼續？`
- 若**有**日誌頻道：直接顯示 modal

**Modal 欄位**：
- 下拉選單：黑名單等級（1=提示、2=防爆雷、3=封鎖）
- 文字輸入：回報理由（可空白，最多 200 字）

> ⚠️ Discord modal 只支援 TextInput，不支援 SelectMenu。
> **解決方案**：改用 TextInput 讓使用者輸入 `1` / `2` / `3`，加上說明文字：
> `請輸入等級（1=僅提示, 2=防爆雷, 3=封鎖）`
> 驗證：若輸入非 1/2/3，ephemeral 報錯並拒絕

**Modal 送出後**：
1. 從訊息 embed URL 解析 `platform` + `target_author`（用 `tfd-system/regex/matcher.js`）
2. 若解析失敗：`target_author = null`，`platform = 'unknown'`，仍允許送出（管理員審核時手動判斷）
3. 在 DB 建立 `blacklist_reports` 記錄
4. 發送到日誌頻道（或當前頻道）的管理員審核訊息：

```
📋 黑名單回報 #ID
回報者：@用戶
平台：twitter（若可解析）
作者：@username（若可解析）
原始 URL：https://...
建議等級：2（防爆雷）
理由：...

[✅ 審核通過] [❌ 拒絕]
```

5. ephemeral 確認給回報者：`✅ 已送出回報，等待管理員審核`

**管理員 [審核通過]** 流程：
1. 按下 `rbl_approve_{reportId}` → 顯示 modal
   - TextInput：等級（預填回報者建議值）
   - TextInput：審核備註（可空白）
2. modal 送出 → 驗證等級 → 呼叫 `guildBlacklistManager.approveReport()`
3. 更新日誌訊息（append `✅ 已核准 by @admin，等級 X`）
4. 若已有同一 `guild_id + platform + author` 的黑名單 → UPSERT（更新等級）

**管理員 [拒絕]** 流程：
1. 按下 `rbl_reject_{reportId}` → 直接更新 DB `status = 'rejected'`
2. 更新日誌訊息（append `❌ 已拒絕 by @admin`）

---

## 三、黑名單執法（Enforcement）

**觸發時機**：`tfd-system/core/message-handler-v2.js` 提取平台/作者後、送出訊息前

```
check(guildId, platform, author, uid)
→ level 1：轉發訊息加入警告 footer embed（橘色）：
  "⚠️ 此作者在本伺服器有 [提示] 等級標記：{label}"
→ level 2：自動套用防爆雷邏輯（與 [上防爆雷] 相同轉換）
→ level 3：不轉發，直接刪除原始訊息，ephemeral 通知發訊者：
  "-# 兔兔不轉發這個作者的內容（本伺服器管理員設定）"
```

---

## 四、新增 `/pe blacklist` 指令

在 `commands/pe.js` 的 `/pe` Subcommand Group 下新增：

| 指令 | 說明 |
|------|------|
| `/pe blacklist add <platform> <author> <level> [label]` | 管理員直接加入黑名單 |
| `/pe blacklist remove <platform> <author>` | 移除黑名單 |
| `/pe blacklist list [platform]` | 列出本伺服器黑名單 |

---

## 五、架構（新建 / 修改的檔案）

### 新建

| 檔案 | 說明 |
|------|------|
| `handlers/report-button-interactions.js` | [回報] 主按鈕 + 子選單路由 + [收回訊息] + [黑名單回報] + 管理員審核 |
| `utils/guild-blacklist-manager.js` | per-server SQLite 黑名單 CRUD（class GuildBlacklistManager） |

### 修改

| 檔案 | 變更說明 |
|------|----------|
| `db/index.js` | 新增 `guild_blacklist` + `blacklist_reports` 的 table 建立、CRUD 方法 |
| `db/schema.sql` | 補充兩張新表的 DDL |
| `utils/spoiler-button-helper.js` | `appendSpoilerButton` → `appendReportButton`；customId 加入 timestamp |
| `handlers/spoiler-button-interactions.js` | 重構 `handleSpoilerModalSubmit` 接受 `targetMessage` 參數（解耦 interaction.message 依賴） |
| `events/interactionCreate.js` | 新增 `report_btn_` / `report_spoiler_` / `report_recall_` / `report_blacklist_` / `rbl_approve_` / `rbl_reject_` 路由 |
| `commands/pe.js` | 新增 `/pe blacklist` subcommand group |
| `tfd-system/core/message-handler-v2.js` | 送出前插入 blacklist enforcement 檢查 |

### 舊系統處理

- `utils/blacklist-manager.js`：**保留但停用執法邏輯**，改用 `guild-blacklist-manager.js`
- 現有 `data/link/*/black_list.json`：**不自動遷移**（全域資料無法對應特定伺服器），在 `/pe blacklist` 指令說明中告知管理員重新設定

---

## 六、Button CustomId 完整列表

| customId 格式 | 觸發 |
|---------------|------|
| `report_btn_{ts}` | 原始 [回報] 按鈕（在 TFD 訊息上） |
| `report_spoiler_{chId}_{msgId}_{subTs}` | 子選單 [上防爆雷] |
| `report_recall_{chId}_{msgId}_{subTs}` | 子選單 [收回訊息] |
| `report_blacklist_{chId}_{msgId}_{subTs}` | 子選單 [黑名單回報] |
| `report_bl_nowarning_{chId}_{msgId}_{subTs}` | 無日誌頻道警告後的 [確認送出] |
| `rbl_approve_{reportId}` | 管理員 [審核通過] |
| `rbl_reject_{reportId}` | 管理員 [拒絕] |

| Modal customId 格式 | 對應 |
|---------------------|------|
| `report_spoiler_modal_{chId}_{msgId}` | 防爆雷理由 |
| `report_recall_modal_{chId}_{msgId}` | 收回理由（非原作者） |
| `report_blacklist_modal_{chId}_{msgId}_{subTs}` | 黑名單等級 + 理由 |
| `rbl_admin_modal_{reportId}` | 管理員審核等級 + 備註 |

---

## 七、已識別風險與處理方案

| 風險 | 說明 | 處理方式 |
|------|------|----------|
| **Discord modal 不支援 SelectMenu** | 原設計用下拉選單選等級，但 modal 只允許 TextInput | 改為 TextInput 讓使用者輸入 1/2/3，加說明文字，後端驗證 |
| **子選單 interaction.message ≠ 原始 TFD 訊息** | 子選單按鈕的 `interaction.message` 是 ephemeral 訊息 | customId 編碼 `channelId + msgId`，handler 用 `channel.messages.fetch(msgId)` 拉原始訊息 |
| **spoiler handler 依賴 interaction.message** | 現有 `handleSpoilerModalSubmit` 直接用 `interaction.message` | 重構：接受 `targetMessage` 參數，解除與 interaction 的耦合 |
| **CustomId 長度限制 100 字元** | channelId(18) + msgId(19) + ts(13) + prefix(20) ≈ 70 字元 | 在限制內，安全 |
| **全域舊黑名單資料無法遷移** | `data/link/*/black_list.json` 是全域資料，無 guild_id | 不遷移，保留舊檔案，`/pe blacklist list` 會提示管理員重新設定 |
| **UPSERT 衝突：同作者重複加入** | 管理員 approve 時若該作者已在黑名單 | `INSERT OR REPLACE` 或 `ON CONFLICT(guild_id, platform, author) DO UPDATE` |
| **任何人可收回訊息的濫用風險** | 規格確認允許任何人收回，可能被惡意使用 | 非原作者收回必須走 modal + 日誌強制記錄操作者 ID，管理員可追蹤 |
| **無日誌頻道時黑名單回報外漏** | 回報內容含作者資訊若發在公開頻道會讓被回報者看到 | 無日誌頻道時強制彈出警告確認步驟，用戶需主動確認才繼續 |
| **平台作者解析失敗** | 部分 URL 無法解析出作者（PTT、Facebook 等） | `target_author = null`，`platform = 'unknown'`，仍允許回報，管理員審核時手動判斷 |
| **冷卻 Map 記憶體增長** | per-user 5 秒冷卻 Map 若不清理會緩慢增長 | 每次存入時清除超過 10 秒的舊 entry |
| **管理員審核按鈕無限存活** | 日誌頻道的 [審核通過]/[拒絕] 按鈕在 bot 重啟後依然存在 | handler 先查 DB 狀態，若 `status != 'pending'` 則 ephemeral 顯示「此回報已處理」並退出 |
| **V2 Container 訊息收回的原作者解析** | V2 Container 用 TextDisplay 而非 message.content | 用 `message.content` + components 雙路徑 regex，找不到則視為「非原作者」路徑（要求填理由） |
| **[回報] 30 秒後按鈕視覺上沒消失** | 30 秒過後按鈕在 Discord UI 上還是顯示可用 | 按下時才判斷過期，回應 ephemeral「此按鈕已失效（訊息超過 30 秒）」，無法透過 Discord API 主動 disable |

---

## 八、資料庫 Schema（完整 DDL）

```sql
-- 各伺服器黑名單
CREATE TABLE IF NOT EXISTS guild_blacklist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  platform    TEXT NOT NULL,
  author      TEXT NOT NULL,
  uid         TEXT,
  level       INTEGER NOT NULL CHECK(level IN (1, 2, 3)),
  label       TEXT,
  added_by    TEXT NOT NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(guild_id, platform, author)
);

-- 待審核回報
CREATE TABLE IF NOT EXISTS blacklist_reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  channel_id      TEXT NOT NULL,
  message_id      TEXT,
  original_url    TEXT,
  target_author   TEXT,
  platform        TEXT,
  reporter_id     TEXT NOT NULL,
  suggested_level INTEGER NOT NULL CHECK(suggested_level IN (1, 2, 3)),
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_id        TEXT,
  final_level     INTEGER CHECK(final_level IN (1, 2, 3)),
  admin_reason    TEXT,
  log_message_id  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guild_blacklist_lookup
  ON guild_blacklist(guild_id, platform, author);

CREATE INDEX IF NOT EXISTS idx_blacklist_reports_pending
  ON blacklist_reports(guild_id, status);
```

---

## 九、`guild-blacklist-manager.js` 介面

```javascript
class GuildBlacklistManager {
  // 黑名單 CRUD
  add(guildId, platform, author, { uid, level, label, addedBy, reason })
  remove(guildId, platform, author)  → rowsDeleted
  list(guildId, platform = null)     → [ ...entries ]
  check(guildId, platform, author, uid = null)  → entry | null

  // 回報系統
  createReport(guildId, channelId, messageId, {
    originalUrl, targetAuthor, platform,
    reporterId, suggestedLevel, reason
  })  → reportId

  getReport(reportId)
  approveReport(reportId, adminId, finalLevel, adminReason)  → entry
  rejectReport(reportId, adminId)
  isPending(reportId)  → boolean
}
```

---

## 十、執行順序（實作步驟）

1. **db/schema.sql + db/index.js** — 新增兩張 table + CRUD 方法
2. **utils/guild-blacklist-manager.js** — 實作完整 class
3. **handlers/spoiler-button-interactions.js** — 重構 `handleSpoilerModalSubmit` 接受 `targetMessage`
4. **utils/spoiler-button-helper.js** — `appendSpoilerButton` → `appendReportButton`，customId 加 timestamp
5. **handlers/report-button-interactions.js** — 主要新檔案，實作全部路由與邏輯
6. **events/interactionCreate.js** — 新增路由規則
7. **commands/pe.js** — 新增 `/pe blacklist` subcommand
8. **tfd-system/core/message-handler-v2.js** — 插入 blacklist enforcement

---

## 十一、驗證清單

- [ ] TFD 轉發訊息出現 [回報] 按鈕，🕶️ 消失
- [ ] 30 秒後按 [回報] → ephemeral「按鈕已失效」
- [ ] 5 秒內連按 [回報] → ephemeral「操作冷卻中」
- [ ] [上防爆雷] → 出現 modal → 送出 → 原訊息變防爆雷
- [ ] [收回訊息]（原作者）→ 直接刪除 → 日誌記錄
- [ ] [收回訊息]（非原作者）→ modal 出現 → 送出 → 刪除 → 日誌記錄
- [ ] [黑名單回報]（有日誌頻道）→ modal 直接出現 → 送出 → 日誌顯示管理員審核訊息
- [ ] [黑名單回報]（無日誌頻道）→ 警告訊息 → 確認 → modal → 送出 → 回報發在當前頻道
- [ ] 管理員 [審核通過] → modal 等級驗證 → DB 更新 → 日誌訊息更新為「已核准」
- [ ] 管理員 [拒絕] → DB 更新 → 日誌訊息更新為「已拒絕」
- [ ] 重複按 [審核通過] → ephemeral「此回報已處理」
- [ ] `/pe blacklist add` → DB 新增
- [ ] `/pe blacklist remove` → DB 刪除
- [ ] `/pe blacklist list` → 顯示本伺服器黑名單
- [ ] 黑名單 level 1 → 轉發訊息多橘色警告 footer
- [ ] 黑名單 level 2 → 轉發訊息自動防爆雷
- [ ] 黑名單 level 3 → 原訊息刪除 + ephemeral 通知
- [ ] 等級輸入非 1/2/3 → ephemeral 報錯
