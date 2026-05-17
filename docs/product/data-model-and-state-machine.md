# TFD 資料模型與狀態機規格 v1

## 1. 文件目的

本文件是從 `../archive/TFD_UNIFIED_SPEC.md` 延伸出的實作級規格，目標是把以下內容定清楚：

- 正式版本需要哪些主要資料表
- 每張表大致應保存哪些欄位
- 翻譯、扣點、付款三種核心流程的狀態機
- 冪等、重試、審計要如何設計

本文件的設計原則是：

- 第一版先求穩，不求功能最全
- 先避免帳務錯誤，再追求功能豐富
- 先支撐 MVP，再保留後續擴展空間

---

## 2. 設計原則

### 2.1 核心分層

資料層至少拆成以下四類：

- **身份資料**
  - 使用者、群組、角色授權
- **帳務資料**
  - 錢包、交易、訂單、贈點
- **翻譯資料**
  - 翻譯任務、翻譯結果、快取索引
- **設定資料**
  - 使用模式、自帶 API、群組額度規則

### 2.2 為何要分開

不要把「翻譯是否成功」和「有沒有扣到錢」寫在同一個欄位或同一張表裡。

原因：

- 翻譯可能失敗，但已做過預扣
- webhook 可能延遲，但訂單已付款
- 快取命中時可能沒有供應商請求，但仍要留下使用紀錄

所以至少要分開：

- `translation_jobs`
- `wallet_transactions`
- `payment_orders`

---

## 3. 建議資料表總覽

第一版建議至少有以下資料表：

- `users`
- `guilds`
- `wallets`
- `wallet_transactions`
- `translation_jobs`
- `translation_cache`
- `payment_orders`
- `user_api_keys`
- `guild_quota_policies`
- `admin_grants`

如果想更保守，也可以先把 `admin_grants` 併入 `wallet_transactions`，但概念上仍要能區分。

---

## 4. 各資料表建議

### 4.1 `users`

用途：

- 保存 Discord 使用者主檔
- 保存產品層級設定

建議欄位：

- `id`
- `discord_user_id`
- `default_translation_mode`
- `is_active`
- `created_at`
- `updated_at`

建議補充：

- `default_translation_mode` 建議只允許 `platform` 或 `user_api`
- `discord_user_id` 應為唯一鍵

### 4.2 `guilds`

用途：

- 保存 Discord Guild 主檔
- 作為群組錢包與權限規則的依附對象

建議欄位：

- `id`
- `discord_guild_id`
- `owner_discord_user_id`
- `is_active`
- `created_at`
- `updated_at`

### 4.3 `wallets`

用途：

- 表示一個可被扣點或加值的錢包

第一版建議不要拆成 `user_wallets` / `guild_wallets` 兩張表，而是用單一 `wallets` 表加 `owner_type`。

建議欄位：

- `id`
- `owner_type`
- `owner_id`
- `wallet_type`
- `status`
- `currency_type`
- `balance_available`
- `balance_reserved`
- `created_at`
- `updated_at`

欄位說明：

- `owner_type`: `user` 或 `guild`
- `owner_id`: 對應 `users.id` 或 `guilds.id`
- `wallet_type`: `primary`、`grant_pool`
- `status`: `active`、`suspended`、`closed`
- `currency_type`: 第一版可固定為 `quota_points`

建議：

- `(owner_type, owner_id, wallet_type)` 設唯一鍵
- 不要只靠交易表動態加總餘額，第一版保留 `balance_available` 與 `balance_reserved` 會比較容易查詢與顯示

### 4.4 `wallet_transactions`

用途：

- 記錄每一次預扣、正式扣點、回滾、補點、到期失效

這張表是整個商業化系統最重要的帳務表之一。

建議欄位：

- `id`
- `wallet_id`
- `transaction_type`
- `status`
- `amount`
- `balance_before_available`
- `balance_after_available`
- `balance_before_reserved`
- `balance_after_reserved`
- `related_translation_job_id`
- `related_payment_order_id`
- `reason_code`
- `idempotency_key`
- `operator_type`
- `operator_id`
- `metadata_json`
- `created_at`
- `updated_at`

欄位說明：

- `transaction_type`: `reserve`、`commit`、`revert`、`grant`、`expire`、`refund`
- `status`: `reserved`、`committed`、`reverted`、`granted`、`expired`
- `amount`: 建議統一使用正數，方向由 `transaction_type` 決定
- `operator_type`: `system`、`admin`、`webhook`

建議：

- `idempotency_key` 必須存在，避免重複寫帳
- 預扣與正式扣點最好是兩筆交易，或至少可清楚分辨兩段動作

### 4.5 `translation_jobs`

用途：

- 記錄每一次翻譯請求與結果

這張表不只記結果，也要記過程。

建議欄位：

- `id`
- `request_id`
- `platform`
- `source_type`
- `source_id`
- `source_text_hash`
- `source_text_length`
- `source_lang`
- `target_lang`
- `translation_mode`
- `provider`
- `model`
- `status`
- `cache_hit`
- `cache_key`
- `user_id`
- `guild_id`
- `charged_wallet_id`
- `reserve_transaction_id`
- `commit_transaction_id`
- `revert_transaction_id`
- `provider_request_id`
- `provider_error_code`
- `provider_error_message`
- `result_text`
- `started_at`
- `finished_at`
- `created_at`
- `updated_at`

欄位說明：

- `request_id`: 對外流程唯一識別碼，可作為追查依據
- `source_type`: 例如 `discord_message`、`manual_text`
- `translation_mode`: `platform`、`user_api`
- `status`: 見後面的狀態機
- `cache_hit`: 布林值

建議：

- `request_id` 設唯一鍵
- 若供應商有自己的 trace id，也應保存 `provider_request_id`

### 4.6 `translation_cache`

用途：

- 儲存可重用的翻譯結果與快取索引

建議欄位：

- `id`
- `cache_key`
- `platform`
- `source_id`
- `source_text_hash`
- `target_lang`
- `translation_mode`
- `provider`
- `model`
- `result_text`
- `hit_count`
- `last_hit_at`
- `created_at`
- `updated_at`

建議：

- `cache_key` 設唯一鍵
- 第一版先不要讓 `platform` 與 `user_api` 共用快取

### 4.7 `payment_orders`

用途：

- 記錄每一筆付款訂單與加值結果

建議欄位：

- `id`
- `order_no`
- `buyer_user_id`
- `target_wallet_id`
- `product_type`
- `product_snapshot_json`
- `status`
- `payment_provider`
- `payment_provider_order_id`
- `payment_provider_txn_id`
- `amount_paid`
- `currency`
- `credited_points`
- `credit_transaction_id`
- `webhook_idempotency_key`
- `paid_at`
- `credited_at`
- `created_at`
- `updated_at`

建議：

- `order_no` 設唯一鍵
- `payment_provider_txn_id` 應有唯一約束或至少唯一邏輯檢查
- `webhook_idempotency_key` 必須存在

### 4.8 `user_api_keys`

用途：

- 記錄使用者自帶 API 的設定

建議欄位：

- `id`
- `user_id`
- `provider`
- `api_key_encrypted`
- `status`
- `last_verified_at`
- `last_error_code`
- `last_error_message`
- `created_at`
- `updated_at`

建議：

- API Key 一定要加密儲存
- 不建議保存明文

### 4.9 `guild_quota_policies`

用途：

- 記錄群組額度授權規則

建議欄位：

- `id`
- `guild_id`
- `policy_mode`
- `allowed_role_ids_json`
- `denied_role_ids_json`
- `updated_by_user_id`
- `created_at`
- `updated_at`

第一版建議支援：

- `all_members`
- `allowed_roles_only`
- `admins_only`

建議：

- 第一版先保守，不要做太複雜的黑白名單混搭

### 4.10 `admin_grants`

用途：

- 記錄平台管理員手動贈點、補償、測試配額

建議欄位：

- `id`
- `target_wallet_id`
- `wallet_transaction_id`
- `grant_type`
- `reason`
- `operator_user_id`
- `created_at`

---

## 5. 第一版最重要的唯一鍵與索引

至少應有以下唯一鍵：

- `users.discord_user_id`
- `guilds.discord_guild_id`
- `wallets(owner_type, owner_id, wallet_type)`
- `translation_jobs.request_id`
- `translation_cache.cache_key`
- `payment_orders.order_no`

至少應有以下查詢索引：

- `wallet_transactions.wallet_id`
- `wallet_transactions.related_translation_job_id`
- `payment_orders.target_wallet_id`
- `translation_jobs.user_id`
- `translation_jobs.guild_id`
- `translation_jobs.source_text_hash`

---

## 6. 翻譯任務狀態機

### 6.1 建議狀態

`translation_jobs.status` 建議採用：

- `created`
- `cache_hit`
- `reserving_quota`
- `processing`
- `succeeded`
- `failed`
- `cancelled`

### 6.2 建議流程

平台模式：

1. 建立 `created`
2. 若命中快取，直接轉 `cache_hit`
3. 若未命中，進入 `reserving_quota`
4. 預扣成功後進入 `processing`
5. 成功則轉 `succeeded`
6. 失敗則轉 `failed`

自帶 API 模式：

1. 建立 `created`
2. 若命中自帶 API 專屬快取，轉 `cache_hit`
3. 若未命中，直接進入 `processing`
4. 成功則轉 `succeeded`
5. 失敗則轉 `failed`

### 6.3 為什麼不只用 success / fail

如果只用成功或失敗，後續很難判斷：

- 是不是在快取就結束
- 是不是卡在預扣
- 是不是已送供應商但未回應

所以第一版雖然保守，仍建議保留最少但足夠的中間狀態。

---

## 7. 錢包交易狀態機

### 7.1 建議狀態

`wallet_transactions.status` 建議採用：

- `reserved`
- `committed`
- `reverted`
- `granted`
- `expired`

### 7.2 交易類型與狀態的關係

建議這樣理解：

- `reserve` 交易建立後，狀態為 `reserved`
- `commit` 交易建立後，狀態為 `committed`
- `revert` 交易建立後，狀態為 `reverted`
- `grant` 交易建立後，狀態為 `granted`
- `expire` 交易建立後，狀態為 `expired`

也就是說，第一版不需要把單筆交易做成非常複雜的多段生命週期，而是把每一次帳務動作直接記成一筆最終狀態明確的交易。

### 7.3 建議帳務流程

平台翻譯成功：

1. 建立 `reserve` 交易
2. 翻譯成功後建立 `commit` 交易
3. 同步更新 `wallets.balance_available` 與 `wallets.balance_reserved`

平台翻譯失敗：

1. 建立 `reserve` 交易
2. 失敗後建立 `revert` 交易
3. 釋放保留額度

管理員補點：

1. 建立 `grant` 交易
2. 增加可用餘額

### 7.4 為什麼建議 reserve / commit / revert 分開記

這樣的優點是：

- 查帳時看得出每一步
- webhook 或重試失敗時較容易補救
- 不會把「預扣」和「正式扣點」混成同一件事

---

## 8. 訂單狀態機

### 8.1 建議狀態

`payment_orders.status` 建議採用：

- `created`
- `pending_payment`
- `paid`
- `credited`
- `failed`
- `refunded`

### 8.2 建議流程

1. 使用者建立訂單，狀態為 `created`
2. 導向支付頁後，狀態可轉 `pending_payment`
3. 金流完成，webhook 驗證成功後轉 `paid`
4. 系統完成加值後轉 `credited`
5. 若付款失敗則 `failed`
6. 若後續發生退款則 `refunded`

### 8.3 第一版最重要規則

最重要的不是狀態名稱，而是：

- `credited` 只能成功一次
- 同一個 webhook 不可重複入帳
- 同一個第三方交易流水號不可對應多次加值

---

## 9. 冪等設計建議

### 9.1 翻譯請求冪等

第一版建議每次翻譯請求建立 `request_id`。

用途：

- 避免前端重送造成重複請求
- 方便查詢單次翻譯全流程

### 9.2 錢包交易冪等

每次扣點、回滾、補點都應有 `idempotency_key`。

建議格式：

- `reserve:{translation_job_id}`
- `commit:{translation_job_id}`
- `revert:{translation_job_id}`
- `grant:{payment_order_id}`

### 9.3 webhook 冪等

每次 webhook 處理都必須保存唯一識別。

來源可用：

- 第三方 webhook event id
- 第三方付款流水號
- 自行組合的簽章摘要

---

## 10. 重試策略建議

### 10.1 可以重試的情況

- 翻譯供應商 timeout
- 供應商 5xx
- webhook 短暫失敗

### 10.2 不建議自動重試的情況

- 使用者 API Key 無效
- 使用者 API 額度不足
- 請求格式錯誤
- 群組授權不符

### 10.3 重試原則

重試時必須保證：

- 不重複扣點
- 不重複加值
- 不覆蓋原始錯誤紀錄

---

## 11. 審計與追查建議

當發生「有翻譯、沒翻譯、扣錯點、沒收到點數」這類問題時，系統至少要能查出：

- 這次請求的 `request_id`
- 對應哪個 `translation_job`
- 有沒有命中快取
- 用的是平台模式還是自帶 API
- 扣的是哪個 `wallet`
- 對應哪些 `wallet_transactions`
- 若涉及付款，對應哪個 `payment_order`

所以第一版就要把關聯欄位留好，不要等出事再補。

---

## 12. 第一版最佳保守方案

如果以「最不容易返工」為目標，第一版建議固定如下：

- 單一 `wallets` 表承接個人與群組錢包
- 單一 `wallet_transactions` 表承接所有帳務事件
- `translation_jobs` 與帳務分開存
- `payment_orders` 與翻譯分開存
- 平台模式與自帶 API 模式先分開快取
- 預扣、正式扣點、回滾分開記錄
- webhook 一律冪等
- 正式帳務一定進 DB，不進 JSON

---

## 13. 下一步建議

在本文件完成後，最適合接著補的兩份規格是：

1. `TFD_CACHE_AND_QUOTA_POLICY_SPEC.md`
2. `TFD_PAYMENT_AND_WEBHOOK_SPEC.md`

理由：

- 本文件解決的是資料結構與狀態流
- 下一步應該把快取邊界、點數政策、付款流程再補成可實作規格
