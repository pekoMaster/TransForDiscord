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
  enabled           INTEGER NOT NULL DEFAULT 1,
  blacklist_enabled INTEGER NOT NULL DEFAULT 1, -- TFD 是否在此伺服器啟用（0/1）
  channel_list_mode TEXT NOT NULL DEFAULT 'blacklist' CHECK(channel_list_mode IN ('blacklist', 'whitelist')),
  user_list_mode    TEXT NOT NULL DEFAULT 'blacklist' CHECK(user_list_mode IN ('blacklist', 'whitelist')),
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
-- 3. 每個伺服器的允許頻道（白名單模式時，只有這些頻道會觸發 TFD）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_allowed_channels (
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  added_by    TEXT,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, channel_id),
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_allowed_channels_guild ON guild_allowed_channels(guild_id);

-- ────────────────────────────────────────────────────────────
-- 4. 每個伺服器的排除使用者（這些使用者貼 URL 不會觸發 TFD）
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
-- 5. 每個伺服器的允許使用者（白名單模式時，只有這些使用者會觸發 TFD）
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_allowed_users (
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  added_by    TEXT,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id),
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_allowed_users_guild ON guild_allowed_users(guild_id);

-- ────────────────────────────────────────────────────────────
-- 6. 使用者 API Keys（AES-256-GCM 加密）
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
-- 5. URL 統計（per-guild per-platform，保留 total；footer 顯示 channel/guild）
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

-- ============================================================
-- 9. Per-server author blacklist
-- ============================================================
CREATE TABLE IF NOT EXISTS guild_blacklist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  platform    TEXT NOT NULL,
  author      TEXT NOT NULL COLLATE NOCASE,
  uid         TEXT,
  level       INTEGER NOT NULL CHECK(level IN (1, 2, 3)),
  label       TEXT,
  added_by    TEXT NOT NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(guild_id, platform, author)
);

CREATE INDEX IF NOT EXISTS idx_guild_blacklist_lookup ON guild_blacklist(guild_id, platform, author);

-- ============================================================
-- 10. Blacklist reports (pending/admin review)
-- ============================================================
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
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  admin_id        TEXT,
  final_level     INTEGER CHECK(final_level IN (1, 2, 3)),
  admin_reason    TEXT,
  log_message_id  TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blacklist_reports_pending ON blacklist_reports(guild_id, status);

-- 11. Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  note       TEXT
);

INSERT OR IGNORE INTO schema_version (version, applied_at, note)
VALUES (1, strftime('%s', 'now'), 'initial schema');

-- ============================================================
-- 12. Per-user translation preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id            TEXT PRIMARY KEY,
  preferred_provider TEXT,                        -- openai / claude / gemini / openrouter
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- ============================================================
-- 13. TFD 功能統計（翻譯/防爆雷/收回/重整）
-- ============================================================
CREATE TABLE IF NOT EXISTS tfd_stats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_type  TEXT NOT NULL,
  guild_id   TEXT,
  user_id    TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tfd_stats_type_date ON tfd_stats(stat_type, created_at);

-- ============================================================
-- 14. Per-guild link domain support overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS guild_link_domains (
  guild_id    TEXT NOT NULL,
  site_name   TEXT NOT NULL,
  domain      TEXT NOT NULL COLLATE NOCASE,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  updated_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (guild_id, domain),
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guild_link_domains_disabled ON guild_link_domains(guild_id, enabled);
