# 2026-06-11 Free Provider Gemini 設定修正

## 變更摘要
- 將免費翻譯 provider 固定為正規 Gemini API。
- 將免費翻譯模型鎖定為 `gemini-3.1-flash-lite`。
- 移除 Freemodel fallback 相關程式碼與 `.env` 設定。
- Gemini key 輪調只讀取 `GOOGLE_GEMINI_API_KEY_2`、`_3`、`_4`、`_6`。
- 一般 Gemini provider fallback 第一順位也改成 `gemini-3.1-flash-lite`，並移除 preview fallback。

## 修改檔案
- `.env`
- `src/features/translation/providers/free-provider.js`
- `src/features/translation/providers/gemini-provider.js`
- `test_files/test_free_provider_gemini_config.cjs`
- `test_files/test_manager.json`
- `BACKUP/backup_manager.json`

## 備份
- `BACKUP/env_20260611_121955.bak`
- `BACKUP/free-provider_20260611_121955.js`
- `BACKUP/gemini-provider_20260611_121955.js`
- `BACKUP/test_manager_20260611_121955.json`

## 驗證
- `node -c src\features\translation\providers\free-provider.js`
- `node -c src\features\translation\providers\gemini-provider.js`
- `node -c test_files\test_free_provider_gemini_config.cjs`
- `node test_files\test_free_provider_gemini_config.cjs`
- `git diff --check -- .env src/features/translation/providers/free-provider.js src/features/translation/providers/gemini-provider.js test_files/test_manager.json test_files/test_free_provider_gemini_config.cjs BACKUP/backup_manager.json`

## 注意事項
- 未啟動 `index.js`，未執行 PM2 restart/reload/start。
- `.env` 仍保留有效 Gemini key 值，但工作紀錄不記錄任何 key 內容。
