# 2026-06-11 URL 文字保留修復

## 變更摘要
- 修正 URL matcher 使用 `indexOf()` 導致同一 URL 在 wrapped/bare 混合時誤判的問題。
- 新增位置感知 URL token，讓 `<URL>`、`` `URL` ``、fenced code URL 不參與觸發，也不會從使用者文字中被扣掉。
- 新增 `stripProcessedURLs()`，只移除實際被預覽流程處理的 URL，保留一般訊息與未觸發 URL shell。
- 限制 spoiler Twitter/Pixiv/PTT/Bahamut 的短路特例只套用在單一可處理 URL 訊息，避免混合訊息中的其他可預覽 URL 被跳過。
- 修正 Twitter V2 Components 輸出不帶 `_userText` 的問題，第一則 V2 marker 會附上一般訊息。

## 修改檔案
- `src/core/routing/url-matcher.js`
- `tfd-system/core/message-handler-v2.js`
- `test_files/test_url_text_preservation.cjs`
- `test_files/test_manager.json`

## 備份
- `BACKUP/url-matcher_20260611_120210.js`
- `BACKUP/message-handler-v2_20260611_120210.js`
- `BACKUP/test_manager_20260611_120027.json`

## 驗證
- `node -c src\core\routing\url-matcher.js`
- `node -c tfd-system\core\message-handler-v2.js`
- `node -c test_files\test_url_text_preservation.cjs`
- `node test_files\test_url_text_preservation.cjs`
- `git diff --check -- src/core/routing/url-matcher.js tfd-system/core/message-handler-v2.js test_files/test_manager.json test_files/test_url_text_preservation.cjs`

## 注意事項
- 未啟動 `index.js`，未執行 PM2 restart/reload/start。
- 工作樹中已有其他既存變更，本次未處理、未回退。
