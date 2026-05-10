-- TFD SQLite Schema v1
-- 設計原則：欄位細分、per-guild 隔離、加密欄位獨立、索引齊全

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ────────────────────────────────────────────────────────────
-- 1. 每個伺服器的核心設定
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id          TEXT PRIMARY KEY,
  guild_name        TEXT,                      -- 快照（用於管理面板顯示）
  enabled           INTEGER NOT NULL DEFAULT 1, -- TFD 是否在此伺服器啟用（0/1）
  log_channel_id    TEXT,                      -- 日誌頻道；NULL = 不發 log
  owner_user_id     TEXT,                      -- 活動用「自定 owner」（管理員按鈕用）
  language          TEXT DEFAULT 'zh-TW',      -- 介面語言
  joined_at         INTEGER NOT NULL,          -- 加入伺服器時間
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- ────────────────────────────────────────────────────────────
-- 2. 每個伺服器的排除頻道（在這些頻道內 TFD 不觸發）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_blocked_channels (
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  added_by    TEXT,                            -- 設定者 user_id
  reason      TEXT,                            -- 備註
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, channel_id),
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocked_channels_guild ON guild_blocked_channels(guild_id);

-- ────────────────────────────────────────────────────────────
-- 3. 每個伺服器的排除使用者（這些使用者貼 URL 不會觸發 TFD）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_excluded_users (
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  added_by    TEXT,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id),
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_excluded_users_guild ON guild_excluded_users(guild_id);

-- ────────────────────────────────────────────────────────────
-- 4. 使用者 API Keys（AES-256-GCM 加密）
--    格式：base64(iv(12) || authTag(16) || ciphertext)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id        TEXT NOT NULL,
  provider       TEXT NOT NULL,                -- openai / claude / gemini
  encrypted_key  TEXT NOT NULL,                -- 加密後的 key
  key_version    INTEGER NOT NULL DEFAULT 1,   -- 加密金鑰版本（用於將來輪替）
  last_used_at   INTEGER,                      -- 最後使用時間
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON user_api_keys(provider);

-- ────────────────────────────────────────────────────────────
-- 5. URL 統計（per-guild per-platform，含 N/M/O footer 計算）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS url_stats (
  guild_id       TEXT NOT NULL,
  platform       TEXT NOT NULL,                -- twitter/pixiv/ptt/threads/...
  url_hash       TEXT NOT NULL,                -- sha256(normalized_url)
  hit_count      INTEGER NOT NULL DEFAULT 1,
  unique_users   INTEGER NOT NULL DEFAULT 1,
  first_seen_at  INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_id, platform, url_hash)
);

CREATE INDEX IF NOT EXISTS idx_url_stats_last_seen ON url_stats(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_url_stats_platform ON url_stats(guild_id, platform);

-- ────────────────────────────────────────────────────────────
-- 6. Rate limit（滑動視窗，每分鐘 bucket）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_log (
  scope          TEXT NOT NULL,                -- 'user' / 'guild' / 'user_guild'
  scope_id       TEXT NOT NULL,                -- userId / guildId / userId:guildId
  bucket_minute  INTEGER NOT NULL,             -- floor(unix_seconds / 60)
  request_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, scope_id, bucket_minute)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket ON rate_limit_log(bucket_minute);

-- ────────────────────────────────────────────────────────────
-- 7. 濫用記錄
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abuse_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  guild_id     TEXT,
  channel_id   TEXT,
  abuse_type   TEXT NOT NULL,                  -- spam_url / rate_exceeded / blocked_pattern
  severity     INTEGER NOT NULL DEFAULT 1,     -- 1=低 2=中 3=高
  details      TEXT,                            -- JSON 字串（額外資訊）
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_abuse_user ON abuse_records(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_abuse_guild ON abuse_records(guild_id, created_at);
CREATE INDEX IF NOT EXISTS idx_abuse_type ON abuse_records(abuse_type, created_at);

-- ────────────────────────────────────────────────────────────
-- 8. Schema 版本紀錄（用於將來資料庫遷移）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  note       TEXT
);

INSERT OR IGNORE INTO schema_version (version, applied_at, note)
VALUES (1, strftime('%s', 'now'), 'initial schema');
