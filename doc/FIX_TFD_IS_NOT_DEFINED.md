# 修復報告：TFD 黑名單未生效 + `tfd is not defined`

## 狀態：已修復（VPS 已上線驗證通過）
- 發現日期：2026-05-16
- 修復日期：2026-05-16
- 影響：黑名單功能完全失效、部分提取器的錯誤處理 crash、V2 Container 模式 crash

---

## 一、問題描述

將 4.0 Bot 的黑名單資料（54 筆）匯入 TFD 的 `guild_blacklist` 表後，
在寶鐘海賊團（`756195780242440337`）貼黑名單作者的推文，黑名單標記未出現。

同時 PM2 日誌有大量 `tfd is not defined` 錯誤。

**根因有五個（Bug #1 ~ #5），另有一項功能改進：**

---

## 二、Bug #1 — `tfd is not defined` ReferenceError

### 原因

多個檔案的 `const tfd = require('tfd-logger')` 被寫在**函式/method 內部的 block scope**，
不是 module 頂層。`const` 的作用域僅限於宣告所在的 block，其他函式/method 引用 `tfd` 時
拋出 `ReferenceError`。

### 影響

提取器碰到錯誤路徑（API 404、影片處理失敗等）時，原本應該 log 後繼續，
但 `tfd` 未定義導致錯誤處理本身又 throw → 整個訊息處理 crash。
Happy path（正常提取）不受影響，因為不走 `tfd.` 的 log 路徑。

### 修復檔案清單（7 個）

全部做同一件事：把 `const tfd = require(...)` 移到檔案頂部 require 區，刪除原本函式內的那行。

| # | 檔案 | 原本位置 | require 路徑 |
|---|------|----------|-------------|
| 1 | `tfd-system/extractors/twitter-v2.js` | L40 constructor try block | `../../utils/tfd-logger` |
| 2 | `tfd-system/core/link-processor.js` | L146 isChannelAllowed() | `../../utils/tfd-logger` |
| 3 | `tfd-system/extractors/facebook.js` | L1139 autoLogin() | `../../utils/tfd-logger` |
| 4 | `tfd-system/index.js` | L55 _getMessageHandler() | `../utils/tfd-logger` |
| 5 | `tfd-system/extractors/index.js` | L231 reloadExtractor() | `../../utils/tfd-logger` |
| 6 | `tfd-system/extractors/dynamic.js` | L69 async method 內 | `../../utils/tfd-logger` |
| 7 | `utils/playwright-semantic-browser.js` | L302 loadSession() | `./tfd-logger` |

#### 修復範例（twitter-v2.js）

```diff
  const URLConverterLogger = require('../utils/url-converter-logger');
+ const tfd = require('../../utils/tfd-logger');

  // ... (中間省略) ...

  // constructor 內，刪除這行：
          try {
              const config = require('../config/tfd-config.json');
- const tfd = require('../../utils/tfd-logger');
              this.vercelEmbedBaseUrl = ...
```

---

## 三、Bug #2 — `normalize-author.js` 讀取 `embed.author` 路徑錯誤（黑名單失效的直接原因）

### 原因

`utils/normalize-author.js` 的所有 normalizer 都用 `result.embed.author.name` 讀取作者，
但 discord.js 的 `EmbedBuilder` 把資料存在 `.data` 屬性下，實際路徑是 `result.embed.data.author.name`。

Debug 驗證：
```
[BL-DBG] embedAuthor=undefined                          ← embed.author 不存在
[BL-DBG] embedData={"name":"@seri_musha","url":"..."}   ← embed.data.author 才有值
[BL-DBG] guild=756195780242440337 platform=twitter author=null uid=null  ← 因此 author=null，查詢跳過
```

### 影響

**所有平台的黑名單在走 embed 路徑時完全失效**（author 永遠 null → 查詢被跳過）。
只有 `result.tweet` 路徑（V2 Container 模式）才能正確提取 author，但大部分結果走 embed 路徑。

### 修復

加入 helper 函式兼容兩種結構（`embed.data.author` 和 `embed.author`）：

```js
// EmbedBuilder stores fields under .data; plain objects don't.
function getEmbedAuthor(embed) {
    if (!embed) return null;
    const a = (embed.data && embed.data.author) || embed.author;
    return a && a.name ? a : null;
}

function getEmbedFooter(embed) {
    if (!embed) return null;
    const f = (embed.data && embed.data.footer) || embed.footer;
    return f && f.text ? f : null;
}
```

所有 normalizer 改用 `getEmbedAuthor(result.embed)` 取代 `result.embed.author`。
完整修改後的檔案見 VPS 上的 `/root/TransForDiscord/utils/normalize-author.js`。

---

## 四、Bug #3 — PTT 黑名單完全無效（normalizer 讀不到作者）

### 原因

PTT 提取器 `createArticleResponse()` 的回傳物件結構：

- `result.data.author` = `"l00011799z (暱稱)"` ✅ 有值
- `result.author` = `undefined` ❌ 不存在
- embed 沒有 `.setAuthor()`，作者寫在 description 的 `作者 xxx` 文字裡

但 `normalize-author.js` 的 PTT normalizer 只讀 `result.author` 和 `getEmbedAuthor(result.embed)`，
兩者都是 `undefined`/`null` → author 永遠 `null` → 查詢跳過。

### 影響

PTT 平台的黑名單在所有等級（1/2/3）完全失效。

### 修復

在 PTT normalizer 加入 `result.data.author` fallback：

```diff
    ptt(result) {
-       if (result.author) {
-           const m = result.author.match(/^([^\s(]+)/);
-           return { author: m ? m[1] : result.author, uid: null };
+       const raw = result.author || (result.data && result.data.author);
+       if (raw) {
+           const m = raw.match(/^([^\s(]+)/);
+           return { author: m ? m[1] : raw, uid: null };
        }
```

---

## 五、Bug #4 — Level 1 黑名單顯示文字冗長（已修正）

### 原因

`message-handler-v2.js` 的 level 1 footer 文字過長：
```
⚠️ 此作者有 [提示] 標記：AI 咒術師
⚠️ 此作者在本伺服器有 [提示] 等級標記：AI 咒術師
```

### 修復

簡化為直接顯示標籤：

```diff
  const warningText = existingFooter
-     ? `⚠️ 此作者有 [提示] 標記：${label} | ${existingFooter}`
-     : `⚠️ 此作者在本伺服器有 [提示] 等級標記：${label}`;
+     ? `⚠️ ${label} | ${existingFooter}`
+     : `⚠️ ${label}`;
```

---

## 六、Bug #5 — V2 Container 模式下黑名單 crash

### 原因

`message-handler-v2.js` 的黑名單處理區，debug log 直接存取 `result.embed.data`，
但 V2 Container 模式的結果只有 `result.v2Container`，`result.embed` 是 `undefined`。

同時 Level 1 黑名單處理只支援傳統 embed 模式（`result.embed.setFooter()`），
V2 Container 模式下的 Level 1 標記完全跳過。

### 錯誤訊息

```
[TFD] 處理訊息失敗: Cannot read properties of undefined (reading 'data')
```

Debug 驗證（crash 前的 log）：
```
[BL-DBG] guild=756195780242440337 platform=twitter author=bubu2kufo uid=null
[BL-DBG] MATCH level=1 label=AI 咒術師
```

### 影響

- 所有 V2 Container 格式（影片推文等）的黑名單作者，**貼文直接導致訊息處理 crash**
- Level 1 警告在 V2 模式下完全不顯示

### 修復

1. **移除 3 行 `[BL-DBG]` debug log**（`console.log` 含 `result.embed.data` 存取）
2. **Level 1 加入 V2 Container 支援**：用 `TextDisplayBuilder` 在 container 尾部加入警告文字

```diff
                        if (entry.level === 1) {
                            // Level 1: Warning footer
-                            if (result.embed && typeof result.embed.setFooter === 'function') {
-                                const label = entry.label || '未指定';
+                            const label = entry.label || '未指定';
+
+                            // V2 Container: append warning TextDisplay
+                            if (result.isV2 && result.v2Container) {
+                                try {
+                                    result.v2Container.addTextDisplayComponents(
+                                        new TextDisplayBuilder().setContent(`⚠️ ${label}`)
+                                    );
+                                } catch (e) {
+                                    this.log(`V2 Level 1 警告失敗: ${e.message}`, 'error');
+                                }
+                            }
+
+                            // Traditional embed
+                            if (result.embed && typeof result.embed.setFooter === 'function') {
                                const existingFooter = result.embed.data?.footer?.text || '';
```

---

## 七、功能改進 — `/pe blacklist list` 改為 Embed 分頁顯示

### 原因

原本 `/pe blacklist list` 使用純文字回覆，最多只顯示 10 條，無法查看完整列表。

### 修改

改為 Embed 格式 + 按鈕翻頁，每頁 10 筆：

- 每筆顯示：等級 emoji + 序號 + 平台 + 作者 + 等級名稱 + 標籤
- 等級 emoji：💬 僅提示、🕶️ 防爆雷、🚫 封鎖
- 超過 1 頁時顯示「◀ 上一頁 / 下一頁 ▶」按鈕
- 120 秒後按鈕自動消失
- 只有指令使用者可以翻頁

### 新增 import

```diff
  const {
      SlashCommandBuilder,
      PermissionFlagsBits,
      ChannelType,
-     MessageFlags
+     MessageFlags,
+     EmbedBuilder,
+     ActionRowBuilder,
+     ButtonBuilder,
+     ButtonStyle
  } = require('discord.js');
```

### Embed 範例格式

```
📋 黑名單 (twitter)
────────────────
💬 **1.** [twitter] @author1 ⌈僅提示⌉ — AI 咒術師
🕶️ **2.** [twitter] @author2 ⌈防爆雷⌉
🚫 **3.** [twitter] @author3 ⌈封鎖⌉ — 惡意轉載

第 1/6 頁 • 共 54 條
         [◀ 上一頁] [下一頁 ▶]
```

---

## 八、修復的檔案總覽

| 檔案 | 修改內容 |
|------|----------|
| `tfd-system/extractors/twitter-v2.js` | tfd require 移到頂部 |
| `tfd-system/core/link-processor.js` | tfd require 移到頂部 |
| `tfd-system/extractors/facebook.js` | tfd require 移到頂部 |
| `tfd-system/index.js` | tfd require 移到頂部 |
| `tfd-system/extractors/index.js` | tfd require 移到頂部 |
| `tfd-system/extractors/dynamic.js` | tfd require 移到頂部 |
| `utils/playwright-semantic-browser.js` | tfd require 移到頂部 |
| `utils/normalize-author.js` | 修正 embed.author → embed.data.author 兼容 + PTT normalizer 加 result.data.author fallback |
| `tfd-system/core/message-handler-v2.js` | Level 1 footer 簡化 + V2 Container Level 1 支援 + 移除 debug log |
| `commands/pe.js` | `/pe blacklist list` 改為 Embed 分頁顯示 |

---

## 九、驗證結果

```
貼文：https://x.com/seri_musha/status/2048205575344017438
伺服器：寶鐘海賊團 (756195780242440337)

結果：footer 顯示 ⚠️ AI 咒術師 ✅（傳統 embed 模式）
```

V2 Container 模式（影片推文等）待用戶驗證。
`/pe blacklist list` Embed 分頁待用戶驗證。

---

## 十、VPS 清理完成

- [x] 移除 `[BL-DBG]` debug log（3 行）
- [x] 移除本次修復產生的 `.bak` 備份檔案（9 個）
- [x] 移除 `/tmp/` 下的修復腳本
- [x] PM2 已重啟

---

## 十一、待辦

- [ ] 本機同步修改上述 10 個檔案（參照本報告的 diff）
- [ ] Git commit + push + deploy
