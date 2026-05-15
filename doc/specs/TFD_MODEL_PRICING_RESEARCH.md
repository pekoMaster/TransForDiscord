# TFD 模型價格研究 v1

## 1. 文件目的

本文件整理 `TransForDiscord` 可能接入的主要 LLM 供應商與模型價格，作為以下用途：

- 平台翻譯模型的成本估算
- 備援供應商研究
- 多供應商路由的前期評估
- 後續點數定價與方案包裝的依據

本文件聚焦於 **文字輸入 / 文字輸出 API 成本**。

不包含：

- 圖片生成
- 語音模型
- 微調成本
- 自架 GPU 成本

---

## 2. 重要前提

### 2.1 時間點

本文件價格整理時間為 **2026-04-09**。

模型價格與名稱是高度時效性的，後續正式上線前應再次檢查官方價格頁。

### 2.2 比價原則

本文件優先使用官方來源：

- 官方 pricing page
- 官方 docs
- 官方模型頁

### 2.3 TFD 適合的模型類型

對 TFD 這類 Discord 即時翻譯服務來說，最優先的是：

- 低成本
- 低延遲
- 穩定文字輸出
- 文字翻譯品質足夠
- API 生態成熟

所以真正值得比較的，不是「最強模型」，而是「便宜、快、能穩定翻譯」的模型。

### 2.4 範圍說明

本文件整理的是 **目前較值得研究的主流 API 模型**，不是宇宙中所有可接模型的完整清單。

選入原則：

- 有官方價格頁可查
- 有正式 API 路徑
- 以文字輸入 / 文字輸出為主
- 對 TFD 這種翻譯產品有實際比較價值

---

## 3. 目前 TFD 預設模型

### 3.1 目前預設

目前規劃中的平台預設模型為：

- **Google Gemini 3.1 Flash-Lite Preview**

### 3.2 價格狀態說明

這裡有一個需要特別說明的點：

- 你目前實際使用與規劃的是 **Gemini 3.1 Flash-Lite**
- 但我在 **2026-04-09** 直接可驗證的 Gemini 官方價格頁，主要顯示的是 **Gemini 2.5 Flash-Lite**
- 同時，我從同一官方 pricing 文件的搜尋結果摘要中看到了 **Gemini 3.1 Flash-Lite Preview** 的價格資訊

因此目前較穩妥的結論是：

- **Gemini 3.1 Flash-Lite Preview 確實存在過官方價格資訊**
- 但 **Google 的公開 pricing 呈現方式可能會變動**
- 所以正式商業化前，Gemini 3.1 的價格一定要再做一次人工確認

### 3.3 Gemini 3.1 Flash-Lite Preview

我從 Google 官方 Gemini pricing 文件的官方搜尋摘要讀到的價格為：

- 輸入：`$0.25 / 1M tokens`
- 輸出：`$1.50 / 1M tokens`
- Batch 輸入：`$0.125 / 1M tokens`
- Batch 輸出：`$0.75 / 1M tokens`

來源：

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

說明：

- 以上價格來自官方文件搜尋摘要
- 因為目前頁面展示內容可能隨時間與 preview 狀態調整，所以應視為 **需要再次驗證的 preview 價格**

---

## 4. 官方價格整理

以下價格均為 **每 1M tokens**，除非特別標註。

### 4.1 Google

**Gemini 3.1 Flash-Lite Preview**

- Input: `$0.25`
- Output: `$1.50`
- Batch Input: `$0.125`
- Batch Output: `$0.75`

來源：

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**Gemini 2.5 Flash-Lite**

- Input: `$0.10`
- Output: `$0.40`
- Batch Input: `$0.05`
- Batch Output: `$0.20`

來源：

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

### 4.2 OpenAI

**gpt-5-mini**

- Input: `$0.25`
- Cached input: `$0.025`
- Output: `$2.00`

來源：

- [OpenAI pricing](https://platform.openai.com/docs/pricing/)

**gpt-4.1-mini**

- Input: `$0.40`
- Cached input: `$0.10`
- Output: `$1.60`

來源：

- [OpenAI pricing](https://platform.openai.com/docs/pricing/)

**gpt-4o-mini**

- Input: `$0.15`
- Cached input: `$0.075`
- Output: `$0.60`

來源：

- [OpenAI pricing](https://platform.openai.com/docs/pricing/)

### 4.3 Anthropic

**Claude Haiku 3.5**

- Input: `$0.80`
- Output: `$4.00`
- Batch Input: `$0.40`
- Batch Output: `$2.00`

來源：

- [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)

**Claude Haiku 3**

- Input: `$0.25`
- Output: `$1.25`
- Batch Input: `$0.125`
- Batch Output: `$0.625`

來源：

- [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)

### 4.4 xAI

**grok-4-fast-non-reasoning**

- Input: `$0.20`
- Output: `$0.50`

來源：

- [xAI models and pricing](https://docs.x.ai/developers/models)

**grok-4-fast-reasoning**

- Input: `$0.20`
- Output: `$0.50`

來源：

- [xAI models and pricing](https://docs.x.ai/developers/models)

說明：

- xAI docs 另有 Batch API 50% 折扣說明
- 但 TFD 這種即時互動翻譯，通常不適合走 batch

### 4.5 Mistral

**Mistral Small 3.2**

- Input: `$0.10`
- Output: `$0.30`

來源：

- [Mistral Small 3.2 model page](https://docs.mistral.ai/models/mistral-small-3-2-25-06)

**Mistral Large 3**

- Input: `$0.50`
- Output: `$1.50`

來源：

- [Mistral Large 3 model page](https://docs.mistral.ai/models/mistral-large-3-25-12)

### 4.6 DeepSeek

**deepseek-chat**

- Input cache hit: `$0.028`
- Input cache miss: `$0.28`
- Output: `$0.42`

來源：

- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

說明：

- DeepSeek 的 pricing 特別把 cache hit / miss 分開算
- 如果要拿來和其他供應商比，應優先看 **cache miss input + output**

---

## 5. 針對 TFD 的成本比較

### 5.1 低成本候選

如果只看文字輸入輸出成本，目前相對便宜、且理論上可接入的候選大致有：

- `Mistral Small 3.2`
- `Gemini 2.5 Flash-Lite`
- `grok-4-fast`
- `gpt-4o-mini`
- `deepseek-chat`

### 5.2 高於低成本帶的候選

這些可以接，但若只是做一般翻譯，成本壓力會比較高：

- `gpt-4.1-mini`
- `Claude Haiku 3.5`
- `Mistral Large 3`
- `Gemini 3.1 Flash-Lite Preview`

### 5.3 不要只看 input price

翻譯場景不能只看輸入價格，還要看：

- 輸出價格
- 平均輸出長度
- prompt 長度
- 是否常需要 system instruction
- 重試機率
- 快取命中率

有些模型 input 很便宜，但 output 偏貴；如果翻譯風格偏長，實際成本會被拉高。

---

## 6. 對 TFD 最有價值的候選組合

### 6.1 主模型

若以你目前方向為準：

- **主模型：Gemini 3.1 Flash-Lite Preview**

理由：

- 你已經在使用與測試這條線
- 與現有 bot 流程較接近
- 產品與規格文件已經圍繞 Gemini 建立

### 6.2 第一備援

若要找一個偏低成本的第一備援，我目前比較推薦先研究：

- **Mistral Small 3.2**
- **gpt-4o-mini**
- **deepseek-chat**
- **gpt-5-mini**

原因：

- 這三個在成本上都比中高階模型更適合翻譯型產品
- 都有成熟的 API 路徑
- 都適合做後續 A/B 比較

### 6.3 暫時不建議當第一備援

以下模型不是不能接，而是我不建議當第一個備援研究重點：

- `Claude Haiku 3.5`
- `gpt-4.1-mini`
- `Mistral Large 3`

理由：

- 成本不算最低
- 對 TFD 第一版翻譯 MVP 來說，不一定划算

---

## 7. 目前建議結論

截至 **2026-04-09**，若站在 TFD 這種 Discord 翻譯產品的角度，建議如下：

- 預設模型維持 **Gemini 3.1 Flash-Lite Preview**
- 成本研究基準同時保留 **Gemini 2.5 Flash-Lite** 作為官方穩定參考價
- 備援候選優先研究：
  - `Mistral Small 3.2`
  - `gpt-4o-mini`
  - `deepseek-chat`
  - `gpt-5-mini`
  - `grok-4-fast-non-reasoning`

這個組合的優點是：

- 有你目前正在使用的主模型
- 有更便宜的替代方案
- 有不同供應商分散風險

---

## 8. 下一步建議

本文件完成後，最適合接著做的是：

1. 建立 `TFD_COST_MODEL_AND_PRICING_SPEC.md`
2. 用同一段固定測試文本，實測各模型輸入輸出 token 消耗
3. 再決定點數定價與方案包裝

真正會影響你賺不賺錢的，不只是官方每 1M token 價格，而是：

- 真實 prompt 結構
- 實際平均輸出長度
- 快取命中率
- 失敗重試率
