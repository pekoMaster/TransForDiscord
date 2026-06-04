# TFD（TransForDiscord）隱私政策

**最後更新：2026-05-10**

本隱私政策說明 TFD 機器人（以下稱「本服務」）在 Discord 平台上運作時，如何收集、使用、儲存與保護您的資料。使用本服務即表示您同意本政策內容。

---

## 一、本服務簡介

TFD 是一個 Discord 機器人，主要功能為偵測訊息中的特定 URL（如 Twitter/X、Pixiv、PTT、Threads 等），並產生增強的預覽 embed。它需要 Discord 的 **Message Content Intent** 才能讀取訊息內容以偵測 URL。

---

## 二、我們收集的資料

### 2.1 自動處理但**不儲存**

本服務在偵測到支援的 URL 時會讀取以下資料以**即時處理**，**處理完成後不留存**：

- 訊息文字內容（僅用於 URL 偵測與引用）
- 訊息附件（僅用於重新發送至 webhook）
- 使用者顯示名稱與頭像（僅用於 webhook 模擬發送）

### 2.2 短期儲存（伺服器端）

| 資料 | 用途 | 保留期限 |
|------|------|----------|
| URL 統計（規範化後的 URL key、出現次數、伺服器/頻道 ID） | 顯示「同一 URL 在本頻道/本伺服器出現 N 次」於 footer；全域總數僅記錄、不顯示 | 7 天滾動 + 條目級 TTL，超量自動清理 |
| Rate-limit 計數（使用者 ID、伺服器 ID、每分鐘 bucket） | 防止單一使用者/伺服器濫用本服務 | 5 分鐘滾動，自動清理 |
| 濫用記錄（使用者 ID、頻道 ID、事件類型） | 偵測 spam 行為 | 30 天 |
| 翻譯快取（譯文文字 hash） | 避免重複翻譯耗用 API 配額 | 7 天 |

### 2.3 長期儲存

| 資料 | 用途 | 保留期限 |
|------|------|----------|
| 您主動透過 `/tfd api add` 提供的 AI API Key | 翻譯按鈕的 AI 翻譯來源 | 直到您執行 `/tfd api del` 或主動移除為止；**儲存時使用 AES-256-GCM 加密** |
| 伺服器設定（log channel、排除清單、owner 設定） | 維持伺服器管理員設定的 TFD 行為 | 直到伺服器管理員修改或機器人離開伺服器 |

### 2.4 我們**不會**收集

- 訊息歷史紀錄
- 私訊內容
- 您的真實姓名、Email、IP 位址
- Discord OAuth Token
- 不含支援 URL 的一般訊息內容

---

## 三、資料儲存與安全

### 3.1 加密
- 使用者 API Key 在儲存前以 **AES-256-GCM** 加密
- 加密金鑰僅存於主機端的 `data/.encryption-key` 或環境變數 `TFD_ENCRYPTION_KEY`
- 即使資料庫檔案外洩，攻擊者無法解出 API Key

### 3.2 儲存位置
- 所有資料儲存於 TFD 服務主機的本地檔案系統（SQLite + JSON）
- **不會傳送到任何第三方分析平台**
- 翻譯請求會經過您指定的 AI 服務商（OpenAI/Anthropic/Google/DeepL/OpenRouter）— 這些請求受對應服務商的隱私政策約束

### 3.3 第三方服務

當您使用 TFD 預覽 URL 或翻譯時，本服務會與以下第三方互動：

| 服務 | 用途 | 觸發時機 |
|------|------|----------|
| Discord API | 接收訊息、發送預覽 | 全程 |
| 各支援平台（Twitter、Pixiv 等） | 抓取公開內容資料 | 偵測到對應 URL 時 |
| DeepL / OpenRouter / OpenAI / Anthropic / Google Gemini | 翻譯文字 | 使用者點擊翻譯按鈕時 |

---

## 四、您的權利

### 4.1 查看
- `/tfd api status` — 查看您已設定哪些 AI provider（不顯示 Key 內容）
- `/tfd status` — 伺服器管理員可查看本伺服器的 TFD 設定

### 4.2 刪除
- `/tfd api del` — 刪除您的 AI API Key
- 伺服器管理員可隨時透過 `/tfd nouser`、`/tfd noch`、`/tfd log del` 修改設定
- 移除機器人後，伺服器設定會在下一次 GC 清除

### 4.3 不參與
- 伺服器管理員可使用 `/tfd nouser <你> add` 將你排除於 TFD 處理
- 你也可以將訊息中的 URL 用 `<...>` 包起來，TFD 將不會處理

---

## 五、政策變更

本政策可能不定期更新。重大變更會在 GitHub repository 與機器人公告中公告至少 7 天。

---

## 六、聯絡方式

如有疑問或要求刪除資料，請聯繫：
- GitHub Issues：https://github.com/pekoMaster/TransForDiscord/issues
- Discord 支援伺服器 ID：`143689490156879872`（需要邀請連結請至 GitHub Issues 索取）

---

## 七、適用法律

本服務之資料處理盡力符合 GDPR、CCPA、台灣個資法等主要隱私法規之精神。如有衝突，以您所在地區之法律為準。
