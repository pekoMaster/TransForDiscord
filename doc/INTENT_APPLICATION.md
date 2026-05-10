# Message Content Intent 申請說明書

> **填寫對象**：Discord Developer Portal → Bot → Privileged Gateway Intents → Message Content Intent → 申請審核時的 Application Form
> **預期觸發時機**：當 TFD bot 加入第 75 個伺服器時 Discord 會發信通知必須申請；超過 100 個伺服器未通過審核將被自動關閉 intent

---

## 1. 機器人用途簡介（Application Description）

**英文（建議貼到表單）：**

> TFD (TransForDiscord) is a URL preview bot for Discord. When a user posts a link from supported platforms — Twitter/X, Pixiv, PTT, Threads, Facebook, etc. — TFD detects the URL inside message content and replaces the default Discord embed with a richer preview that supports multi-image pagination, AI translation, spoiler buttons, and webhook-based delivery (so the preview appears posted by the original user).

**中文：**

TFD 是 Discord 上的 URL 預覽機器人。當使用者貼出 Twitter/X、Pixiv、PTT、Threads、Facebook 等支援平台的連結時，TFD 會偵測訊息內容中的 URL，並用更豐富的預覽（含多圖分頁、AI 翻譯、防爆雷按鈕、以原作者身份發送等）取代 Discord 預設的簡單 embed。

---

## 2. 為什麼必須使用 Message Content Intent

> Without Message Content Intent, TFD cannot read the actual URL strings inside messages. The bot's entire purpose — detecting URLs and producing previews — is impossible without this intent.

具體解釋：

- TFD 沒有使用斜線指令觸發預覽（這會破壞「貼網址自動預覽」的使用體驗）
- TFD 必須讀取訊息文字以執行 regex URL 偵測
- 沒有 message content，bot 無法知道訊息裡到底有沒有需要預覽的連結

---

## 3. 資料處理 / 隱私（Data Handling）

> TFD reads message content **transiently** to detect supported URLs. Message content itself is **never persisted**. Only the following derived data is stored:
>
> - Normalized URL keys + counters for the "this URL appeared N times in this server" footer (rolling 7-day window, max 5,000 entries with TTL eviction)
> - Per-guild settings (log channel, exclusion lists) — controlled entirely by guild admins via `/tfd` slash commands
> - User-provided AI API keys (encrypted with AES-256-GCM) for the optional translation feature
>
> No message text, no usernames, no message history is ever stored. Full privacy policy: [link to PRIVACY_POLICY.md]

---

## 4. 安全與防濫用設計

向 Discord 強調以下幾點：

- **Per-user / per-guild rate limiting**（每使用者/伺服器/每分鐘）— 已實作
- **Spam/burst detection**（同 URL 5 次/分鐘 = 軟靜音 5 分鐘）— 已實作
- **Auto-exclusion**（24 小時內累積 60 次 abuse → 自動加入該伺服器排除清單）— 已實作
- **Per-guild admin controls**（`/tfd nouser`、`/tfd noch`）— 伺服器管理員可即時排除使用者或頻道
- **Encrypted credential storage**（AES-256-GCM）— 使用者 AI Key 加密儲存

---

## 5. 預期規模（Expected Server Count）

- **目前狀態**：[依實際填寫，例如 "10-20 servers"]
- **6 個月內預期**：[填寫真實預估，例如 "under 200 servers"]
- **長期目標**：[依實際規劃]

---

## 6. 連結與證明文件

- **GitHub Repository**：[TBD - 必須提供]
- **隱私政策**：[線上發布的 URL，建議用 GitHub Pages 或 Vercel 託管]
- **服務條款**：[線上發布的 URL]
- **支援伺服器 ID**：`143689490156879872`

---

## 7. 提交前確認清單

- [ ] Bot 使用者顯示名稱與描述清楚說明用途
- [ ] Bot 頭像為原創或合法授權
- [ ] 已將 Privacy Policy URL 填入 Application → General Information → Privacy Policy URL
- [ ] 已將 Terms of Service URL 填入 Application → General Information → Terms of Service URL
- [ ] Bot description 清楚提及「reads message content for URL detection」
- [ ] 上方第 1-6 點已準備好對應內容
- [ ] 至少 5 位真實使用者使用過機器人，可作為審核時提供的證明

---

## 8. 常見被退件原因（避坑）

| 原因 | 對策 |
|------|------|
| Privacy Policy URL 失效 / 內容過於空泛 | 用真實 GitHub 公開連結，內容須涵蓋資料種類、保留期限、刪除機制 |
| 描述不清楚為何「必須」用 Message Content（而非 slash command） | 強調 UX 必要性 + 使用情境 |
| 規模誇大（聲稱百萬使用者但實際數 10 人） | 誠實填寫，若規模仍小可註明「early-stage」 |
| 沒有 anti-abuse 機制 | 第 4 點要明確列出（你的版本已有完整實作可寫進去） |
| Bot 在違反 Discord ToS 的行為（如自動爬訊息、自動加好友） | TFD 完全沒有，但確保 description 沒有用字讓人誤會 |

---

## 9. 提交位置

1. 前往 https://discord.com/developers/applications
2. 選擇 TFD application
3. 左欄 → **Bot** → 找到 **Privileged Gateway Intents** 區塊
4. **Message Content Intent** → 點擊 `Apply for verification`（在 bot 加入到 75+ 伺服器後會出現）

---

## 10. 審核時間預估

- 一般 7-14 天，部分案例可能 30 天以上
- 期間 bot 仍可使用 intent，但達 100 伺服器後會被強制關閉直到審核通過
- 申請通過後 bot 圖示旁會出現 ✅ Verified Bot 標誌
