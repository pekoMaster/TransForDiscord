/**
 * TFD 資料層 — SQLite 統一介面
 *
 * 設計原則：
 *   1. 所有 DB 操作集中於此，外部不直接存取 better-sqlite3
 *   2. 每個資料表提供 CRUD 函數，名稱對應 schema 表名
 *   3. 所有 timestamp 統一存 unix epoch (seconds)
 *   4. 預先準備（prepared statements）並快取，避免重複編譯
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const tlog = require('../utils/tfd-logger');

const DB_PATH = path.join(__dirname, '..', 'data', 'tfd.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'src', 'shared', 'db', 'schema.sql');

let db = null;
const stmts = {};

// ────────────────────────────────────────────────────────────
// 初始化
// ────────────────────────────────────────────────────────────

function init() {
    if (db) return db;

    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    _runMigrations();

    _prepareStatements();
    tlog.sys('DB', `SQLite 初始化完成: ${DB_PATH}`);
    return db;
}

function close() {
    if (db) {
        db.close();
        db = null;
        for (const k of Object.keys(stmts)) delete stmts[k];
    }
}

function getDB() {
    if (!db) init();
    return db;
}

function _stmt(name) {
    if (!db) init();
    return stmts[name];
}

function now() {
    return Math.floor(Date.now() / 1000);
}

function _runMigrations() {
    const columns = db.prepare('PRAGMA table_info(guild_settings)').all().map(row => row.name);
    if (!columns.includes('channel_list_mode')) {
        db.exec("ALTER TABLE guild_settings ADD COLUMN channel_list_mode TEXT NOT NULL DEFAULT 'blacklist'");
    }
    if (!columns.includes('user_list_mode')) {
        db.exec("ALTER TABLE guild_settings ADD COLUMN user_list_mode TEXT NOT NULL DEFAULT 'blacklist'");
    }
}

// ────────────────────────────────────────────────────────────
// Prepared Statements
// ────────────────────────────────────────────────────────────

function _prepareStatements() {
    // guild_settings
    stmts.guildGet = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
    stmts.guildUpsert = db.prepare(`
        INSERT INTO guild_settings
            (guild_id, guild_name, enabled, log_channel_id, owner_user_id, language, joined_at, created_at, updated_at)
        VALUES
            (@guild_id, @guild_name, @enabled, @log_channel_id, @owner_user_id, @language, @joined_at, @created_at, @updated_at)
        ON CONFLICT(guild_id) DO UPDATE SET
            guild_name = excluded.guild_name,
            enabled = excluded.enabled,
            log_channel_id = excluded.log_channel_id,
            owner_user_id = excluded.owner_user_id,
            language = excluded.language,
            updated_at = excluded.updated_at
    `);
    stmts.guildAll = db.prepare('SELECT * FROM guild_settings');
    stmts.guildDelete = db.prepare('DELETE FROM guild_settings WHERE guild_id = ?');

    // guild_blocked_channels
    stmts.blockedChannelAdd = db.prepare(`
        INSERT OR IGNORE INTO guild_blocked_channels (guild_id, channel_id, added_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmts.blockedChannelRemove = db.prepare('DELETE FROM guild_blocked_channels WHERE guild_id = ? AND channel_id = ?');
    stmts.blockedChannelList = db.prepare('SELECT * FROM guild_blocked_channels WHERE guild_id = ? ORDER BY created_at DESC');
    stmts.blockedChannelHas = db.prepare('SELECT 1 FROM guild_blocked_channels WHERE guild_id = ? AND channel_id = ?');

    // guild_allowed_channels
    stmts.allowedChannelAdd = db.prepare(`
        INSERT OR IGNORE INTO guild_allowed_channels (guild_id, channel_id, added_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmts.allowedChannelRemove = db.prepare('DELETE FROM guild_allowed_channels WHERE guild_id = ? AND channel_id = ?');
    stmts.allowedChannelList = db.prepare('SELECT * FROM guild_allowed_channels WHERE guild_id = ? ORDER BY created_at DESC');
    stmts.allowedChannelHas = db.prepare('SELECT 1 FROM guild_allowed_channels WHERE guild_id = ? AND channel_id = ?');

    // guild_excluded_users
    stmts.excludedUserAdd = db.prepare(`
        INSERT OR IGNORE INTO guild_excluded_users (guild_id, user_id, added_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmts.excludedUserRemove = db.prepare('DELETE FROM guild_excluded_users WHERE guild_id = ? AND user_id = ?');
    stmts.excludedUserList = db.prepare('SELECT * FROM guild_excluded_users WHERE guild_id = ? ORDER BY created_at DESC');
    stmts.excludedUserHas = db.prepare('SELECT 1 FROM guild_excluded_users WHERE guild_id = ? AND user_id = ?');

    // guild_allowed_users
    stmts.allowedUserAdd = db.prepare(`
        INSERT OR IGNORE INTO guild_allowed_users (guild_id, user_id, added_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmts.allowedUserRemove = db.prepare('DELETE FROM guild_allowed_users WHERE guild_id = ? AND user_id = ?');
    stmts.allowedUserList = db.prepare('SELECT * FROM guild_allowed_users WHERE guild_id = ? ORDER BY created_at DESC');
    stmts.allowedUserHas = db.prepare('SELECT 1 FROM guild_allowed_users WHERE guild_id = ? AND user_id = ?');

    // user_api_keys
    stmts.apiKeyUpsert = db.prepare(`
        INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET
            encrypted_key = excluded.encrypted_key,
            key_version = excluded.key_version,
            updated_at = excluded.updated_at
    `);
    stmts.apiKeyGet = db.prepare('SELECT * FROM user_api_keys WHERE user_id = ? AND provider = ?');
    stmts.apiKeyDelete = db.prepare('DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?');
    stmts.apiKeyListProviders = db.prepare('SELECT provider FROM user_api_keys WHERE user_id = ?');
    stmts.apiKeyTouchUsed = db.prepare('UPDATE user_api_keys SET last_used_at = ? WHERE user_id = ? AND provider = ?');

    // url_stats
    stmts.urlStatsUpsert = db.prepare(`
        INSERT INTO url_stats (guild_id, platform, url_hash, hit_count, unique_users, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, 1, 1, ?, ?)
        ON CONFLICT(guild_id, platform, url_hash) DO UPDATE SET
            hit_count = hit_count + 1,
            last_seen_at = excluded.last_seen_at
    `);
    stmts.urlStatsCleanupOld = db.prepare('DELETE FROM url_stats WHERE last_seen_at < ?');

    // rate_limit_log
    stmts.rateLimitInc = db.prepare(`
        INSERT INTO rate_limit_log (scope, scope_id, bucket_minute, request_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(scope, scope_id, bucket_minute) DO UPDATE SET
            request_count = request_count + 1
    `);
    stmts.rateLimitSum = db.prepare(`
        SELECT COALESCE(SUM(request_count), 0) AS total
        FROM rate_limit_log
        WHERE scope = ? AND scope_id = ? AND bucket_minute >= ?
    `);
    stmts.rateLimitCleanup = db.prepare('DELETE FROM rate_limit_log WHERE bucket_minute < ?');

    // abuse_records
    stmts.abuseInsert = db.prepare(`
        INSERT INTO abuse_records (user_id, guild_id, channel_id, abuse_type, severity, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmts.abuseRecentByUser = db.prepare(`
        SELECT COUNT(*) AS cnt FROM abuse_records
        WHERE user_id = ? AND created_at >= ?
    `);
    stmts.abuseCleanup = db.prepare('DELETE FROM abuse_records WHERE created_at < ?');

    // tfd_stats
    stmts.tfdStatsInsert = db.prepare(
        'INSERT INTO tfd_stats (stat_type, guild_id, user_id, created_at) VALUES (?, ?, ?, ?)'
    );
    stmts.tfdStatsTotal = db.prepare(
        'SELECT COUNT(*) AS cnt FROM tfd_stats WHERE stat_type = ?'
    );
    stmts.tfdStatsDaily = db.prepare(`
        SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS cnt
        FROM tfd_stats WHERE stat_type = ? AND created_at >= ?
        GROUP BY day ORDER BY day
    `);
    stmts.tfdStatsApiUserCount = db.prepare(
        'SELECT COUNT(DISTINCT user_id) AS cnt FROM user_api_keys'
    );

    // user_preferences
    stmts.userPrefGet = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?');
    stmts.userPrefUpsert = db.prepare(`
        INSERT INTO user_preferences (user_id, preferred_provider, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            preferred_provider = excluded.preferred_provider,
            updated_at = excluded.updated_at
    `);
    stmts.userPrefDelete = db.prepare('DELETE FROM user_preferences WHERE user_id = ?');
    // guild_blacklist
    stmts.blacklistAdd = db.prepare(`
        INSERT INTO guild_blacklist (guild_id, platform, author, uid, level, label, added_by, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, platform, author) DO UPDATE SET
            uid = excluded.uid, level = excluded.level, label = excluded.label,
            added_by = excluded.added_by, reason = excluded.reason, updated_at = excluded.updated_at
    `);
    stmts.blacklistRemove = db.prepare('DELETE FROM guild_blacklist WHERE guild_id = ? AND platform = ? AND author = ?');
    stmts.blacklistListByGuild = db.prepare('SELECT * FROM guild_blacklist WHERE guild_id = ? ORDER BY platform, author');
    stmts.blacklistListByGuildPlatform = db.prepare('SELECT * FROM guild_blacklist WHERE guild_id = ? AND platform = ? ORDER BY author');
    stmts.blacklistCheck = db.prepare('SELECT * FROM guild_blacklist WHERE guild_id = ? AND platform = ? AND author = ?');
    stmts.blacklistCheckWithUid = db.prepare('SELECT * FROM guild_blacklist WHERE guild_id = ? AND platform = ? AND (author = ? OR uid = ?) LIMIT 1');

    // blacklist_reports
    stmts.reportInsert = db.prepare(`
        INSERT INTO blacklist_reports (guild_id, channel_id, message_id, original_url, target_author, platform, reporter_id, suggested_level, reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmts.reportGet = db.prepare('SELECT * FROM blacklist_reports WHERE id = ?');
    stmts.reportSetLevel = db.prepare('UPDATE blacklist_reports SET final_level = ?, updated_at = ? WHERE id = ?');
    stmts.reportApprove = db.prepare('UPDATE blacklist_reports SET status = \x27approved\x27, admin_id = ?, final_level = ?, admin_reason = ?, updated_at = ? WHERE id = ?');
    stmts.reportReject = db.prepare('UPDATE blacklist_reports SET status = \x27rejected\x27, admin_id = ?, updated_at = ? WHERE id = ?');
    stmts.reportSetLogMsgId = db.prepare('UPDATE blacklist_reports SET log_message_id = ? WHERE id = ?');

    // guild_link_domains
    stmts.linkDomainUpsert = db.prepare(`
        INSERT INTO guild_link_domains (guild_id, site_name, domain, enabled, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, domain) DO UPDATE SET
            site_name = excluded.site_name,
            enabled = excluded.enabled,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
    `);
    stmts.linkDomainGet = db.prepare('SELECT * FROM guild_link_domains WHERE guild_id = ? AND domain = ?');
    stmts.linkDomainRemove = db.prepare('DELETE FROM guild_link_domains WHERE guild_id = ? AND domain = ?');
    stmts.linkDomainList = db.prepare('SELECT * FROM guild_link_domains WHERE guild_id = ? ORDER BY site_name, domain');
    stmts.linkDomainListDisabled = db.prepare('SELECT * FROM guild_link_domains WHERE guild_id = ? AND enabled = 0 ORDER BY site_name, domain');
}

// ────────────────────────────────────────────────────────────
// guild_settings API
// ────────────────────────────────────────────────────────────

const guilds = {
    get(guildId) {
        return _stmt('guildGet').get(guildId) || null;
    },

    upsert({ guildId, guildName = null, enabled = 1, logChannelId = null, ownerUserId = null, language = 'zh-TW', joinedAt = null }) {
        const ts = now();
        const existing = _stmt('guildGet').get(guildId);
        return _stmt('guildUpsert').run({
            guild_id: guildId,
            guild_name: guildName,
            enabled,
            log_channel_id: logChannelId,
            owner_user_id: ownerUserId,
            language,
            joined_at: joinedAt || (existing ? existing.joined_at : ts),
            created_at: existing ? existing.created_at : ts,
            updated_at: ts
        });
    },

    setLogChannel(guildId, channelId) {
        guilds._ensure(guildId);
        return getDB().prepare('UPDATE guild_settings SET log_channel_id = ?, updated_at = ? WHERE guild_id = ?')
            .run(channelId, now(), guildId);
    },

    setOwner(guildId, userId) {
        guilds._ensure(guildId);
        return getDB().prepare('UPDATE guild_settings SET owner_user_id = ?, updated_at = ? WHERE guild_id = ?')
            .run(userId, now(), guildId);
    },

    setEnabled(guildId, enabled) {
        guilds._ensure(guildId);
        return getDB().prepare('UPDATE guild_settings SET enabled = ?, updated_at = ? WHERE guild_id = ?')
            .run(enabled ? 1 : 0, now(), guildId);
    },

    isBlacklistEnabled(guildId) {
        const g = _stmt('guildGet').get(guildId);
        return g ? !!g.blacklist_enabled : false;
    },

    setBlacklistEnabled(guildId, enabled) {
        guilds._ensure(guildId);
        return getDB().prepare('UPDATE guild_settings SET blacklist_enabled = ?, updated_at = ? WHERE guild_id = ?')
            .run(enabled ? 1 : 0, now(), guildId);
    },

    getChannelListMode(guildId) {
        const g = _stmt('guildGet').get(guildId);
        return g?.channel_list_mode || 'blacklist';
    },

    setChannelListMode(guildId, mode) {
        if (!['blacklist', 'whitelist'].includes(mode)) throw new Error(`Invalid channel list mode: ${mode}`);
        guilds._ensure(guildId);
        return getDB().prepare('UPDATE guild_settings SET channel_list_mode = ?, updated_at = ? WHERE guild_id = ?')
            .run(mode, now(), guildId);
    },

    getUserListMode(guildId) {
        const g = _stmt('guildGet').get(guildId);
        return g?.user_list_mode || 'blacklist';
    },

    setUserListMode(guildId, mode) {
        if (!['blacklist', 'whitelist'].includes(mode)) throw new Error(`Invalid user list mode: ${mode}`);
        guilds._ensure(guildId);
        return getDB().prepare('UPDATE guild_settings SET user_list_mode = ?, updated_at = ? WHERE guild_id = ?')
            .run(mode, now(), guildId);
    },

    all() {
        return _stmt('guildAll').all();
    },

    delete(guildId) {
        return _stmt('guildDelete').run(guildId);
    },

    _ensure(guildId) {
        if (!_stmt('guildGet').get(guildId)) {
            guilds.upsert({ guildId });
        }
    }
};

const blockedChannels = {
    add(guildId, channelId, addedBy = null, reason = null) {
        guilds._ensure(guildId);
        return _stmt('blockedChannelAdd').run(guildId, channelId, addedBy, reason, now());
    },

    remove(guildId, channelId) {
        return _stmt('blockedChannelRemove').run(guildId, channelId);
    },

    list(guildId) {
        return _stmt('blockedChannelList').all(guildId);
    },

    has(guildId, channelId) {
        return !!_stmt('blockedChannelHas').get(guildId, channelId);
    }
};

const allowedChannels = {
    add(guildId, channelId, addedBy = null, reason = null) {
        guilds._ensure(guildId);
        return _stmt('allowedChannelAdd').run(guildId, channelId, addedBy, reason, now());
    },

    remove(guildId, channelId) {
        return _stmt('allowedChannelRemove').run(guildId, channelId);
    },

    list(guildId) {
        return _stmt('allowedChannelList').all(guildId);
    },

    has(guildId, channelId) {
        return !!_stmt('allowedChannelHas').get(guildId, channelId);
    }
};

// ────────────────────────────────────────────────────────────
// excluded users API
// ────────────────────────────────────────────────────────────

const excludedUsers = {
    add(guildId, userId, addedBy = null, reason = null) {
        guilds._ensure(guildId);
        return _stmt('excludedUserAdd').run(guildId, userId, addedBy, reason, now());
    },

    remove(guildId, userId) {
        return _stmt('excludedUserRemove').run(guildId, userId);
    },

    list(guildId) {
        return _stmt('excludedUserList').all(guildId);
    },

    has(guildId, userId) {
        return !!_stmt('excludedUserHas').get(guildId, userId);
    }
};

const allowedUsers = {
    add(guildId, userId, addedBy = null, reason = null) {
        guilds._ensure(guildId);
        return _stmt('allowedUserAdd').run(guildId, userId, addedBy, reason, now());
    },

    remove(guildId, userId) {
        return _stmt('allowedUserRemove').run(guildId, userId);
    },

    list(guildId) {
        return _stmt('allowedUserList').all(guildId);
    },

    has(guildId, userId) {
        return !!_stmt('allowedUserHas').get(guildId, userId);
    }
};

// ────────────────────────────────────────────────────────────
// guild_link_domains API
// ────────────────────────────────────────────────────────────

const linkDomains = {
    set(guildId, siteName, domain, enabled, updatedBy = null) {
        guilds._ensure(guildId);
        const ts = now();
        const existing = _stmt('linkDomainGet').get(guildId, domain);
        return _stmt('linkDomainUpsert').run(
            guildId,
            siteName,
            domain,
            enabled ? 1 : 0,
            updatedBy,
            existing ? existing.created_at : ts,
            ts
        );
    },

    get(guildId, domain) {
        return _stmt('linkDomainGet').get(guildId, domain) || null;
    },

    remove(guildId, domain) {
        return _stmt('linkDomainRemove').run(guildId, domain);
    },

    list(guildId) {
        return _stmt('linkDomainList').all(guildId);
    },

    listDisabled(guildId) {
        return _stmt('linkDomainListDisabled').all(guildId);
    },

    isEnabled(guildId, domain) {
        const row = linkDomains.get(guildId, domain);
        return row ? !!row.enabled : true;
    }
};

// ────────────────────────────────────────────────────────────
// user API keys API（純儲存，加密由呼叫方處理）
// ────────────────────────────────────────────────────────────

const apiKeys = {
    upsert(userId, provider, encryptedKey, keyVersion = 1) {
        const ts = now();
        return _stmt('apiKeyUpsert').run(userId, provider, encryptedKey, keyVersion, ts, ts);
    },

    get(userId, provider) {
        return _stmt('apiKeyGet').get(userId, provider) || null;
    },

    delete(userId, provider) {
        const result = _stmt('apiKeyDelete').run(userId, provider);
        return result.changes > 0;
    },

    listProviders(userId) {
        return _stmt('apiKeyListProviders').all(userId).map(r => r.provider);
    },

    touchUsed(userId, provider) {
        return _stmt('apiKeyTouchUsed').run(now(), userId, provider);
    }
};

// ────────────────────────────────────────────────────────────
// url_stats API
// ────────────────────────────────────────────────────────────

const urlStats = {
    record(guildId, platform, urlHash) {
        const ts = now();
        return _stmt('urlStatsUpsert').run(guildId, platform, urlHash, ts, ts);
    },

    cleanupOlderThan(seconds) {
        const cutoff = now() - seconds;
        const result = _stmt('urlStatsCleanupOld').run(cutoff);
        return result.changes;
    }
};

// ────────────────────────────────────────────────────────────
// rate_limit API
// ────────────────────────────────────────────────────────────

const rateLimit = {
    increment(scope, scopeId) {
        const bucket = Math.floor(now() / 60);
        return _stmt('rateLimitInc').run(scope, scopeId, bucket);
    },

    countRecent(scope, scopeId, windowMinutes = 1) {
        const sinceBucket = Math.floor(now() / 60) - (windowMinutes - 1);
        const row = _stmt('rateLimitSum').get(scope, scopeId, sinceBucket);
        return row ? row.total : 0;
    },

    cleanupOlderThan(minutes) {
        const cutoff = Math.floor(now() / 60) - minutes;
        const result = _stmt('rateLimitCleanup').run(cutoff);
        return result.changes;
    }
};

// ────────────────────────────────────────────────────────────
// abuse_records API
// ────────────────────────────────────────────────────────────

const abuse = {
    record({ userId, guildId = null, channelId = null, abuseType, severity = 1, details = null }) {
        return _stmt('abuseInsert').run(
            userId, guildId, channelId, abuseType, severity,
            details ? JSON.stringify(details) : null,
            now()
        );
    },

    countRecentByUser(userId, withinSeconds = 86400) {
        const since = now() - withinSeconds;
        const row = _stmt('abuseRecentByUser').get(userId, since);
        return row ? row.cnt : 0;
    },

    cleanupOlderThan(days) {
        const cutoff = now() - (days * 86400);
        const result = _stmt('abuseCleanup').run(cutoff);
        return result.changes;
    }
};

// ────────────────────────────────────────────────────────────
// user_preferences API
// ────────────────────────────────────────────────────────────

const userPrefs = {
    getProvider(userId) {
        const row = _stmt('userPrefGet').get(userId);
        return row?.preferred_provider || null;
    },

    setProvider(userId, provider) {
        const ts = now();
        const existing = _stmt('userPrefGet').get(userId);
        return _stmt('userPrefUpsert').run(userId, provider, existing ? existing.created_at : ts, ts);
    },

    clear(userId) {
        return _stmt('userPrefDelete').run(userId);
    }
};


// ============================================================
// guild_blacklist API
// ============================================================

const blacklist = {
    add(guildId, platform, author, { uid = null, level, label = null, addedBy, reason = null } = {}) {
        const ts = now();
        const normalizedAuthor = author.trim();
        return _stmt('blacklistAdd').run(guildId, platform, normalizedAuthor, uid, level, label, addedBy, reason, ts, ts);
    },

    remove(guildId, platform, author) {
        const normalizedAuthor = author.trim();
        const result = _stmt('blacklistRemove').run(guildId, platform, normalizedAuthor);
        return result.changes;
    },

    list(guildId, platform = null) {
        if (platform) {
            return _stmt('blacklistListByGuildPlatform').all(guildId, platform);
        }
        return _stmt('blacklistListByGuild').all(guildId);
    },

    check(guildId, platform, author, uid = null) {
        const normalizedAuthor = author ? author.trim() : author;
        if (!normalizedAuthor && !uid) return null;
        if (uid) {
            return _stmt('blacklistCheckWithUid').get(guildId, platform, normalizedAuthor, uid) || null;
        }
        return _stmt('blacklistCheck').get(guildId, platform, normalizedAuthor) || null;
    }
};

// ============================================================
// blacklist_reports API
// ============================================================

const blacklistReports = {
    create({ guildId, channelId, messageId = null, originalUrl = null, targetAuthor = null, platform = 'unknown', reporterId, suggestedLevel, reason = null } = {}) {
        const ts = now();
        const info = _stmt('reportInsert').run(guildId, channelId, messageId, originalUrl, targetAuthor, platform, reporterId, suggestedLevel, reason, ts, ts);
        return info.lastInsertRowid;
    },

    get(reportId) {
        return _stmt('reportGet').get(reportId) || null;
    },

    setLevel(reportId, level) {
        return _stmt('reportSetLevel').run(level, now(), reportId);
    },

    approve(reportId, adminId, finalLevel, adminReason = null) {
        return _stmt('reportApprove').run(adminId, finalLevel, adminReason, now(), reportId);
    },

    reject(reportId, adminId) {
        return _stmt('reportReject').run(adminId, now(), reportId);
    },

    isPending(reportId) {
        const r = _stmt('reportGet').get(reportId);
        return r ? r.status === 'pending' : false;
    },

    setLogMessageId(reportId, messageId) {
        return _stmt('reportSetLogMsgId').run(messageId, reportId);
    }
};

// ============================================================
// tfd_stats API（功能統計計數器）
// ============================================================

const tfdStats = {
    record(statType, guildId = null, userId = null) {
        return _stmt('tfdStatsInsert').run(statType, guildId, userId, now());
    },

    getTotal(statType) {
        const row = _stmt('tfdStatsTotal').get(statType);
        return row ? row.cnt : 0;
    },

    getDaily(statType, days = 30) {
        const since = now() - days * 86400;
        return _stmt('tfdStatsDaily').all(statType, since);
    },

    getApiUserCount() {
        const row = _stmt('tfdStatsApiUserCount').get();
        return row ? row.cnt : 0;
    },

    getAllStats() {
        const types = ['translation', 'anti_spoiler', 'recall', 'reload'];
        const totals = {};
        const daily = {};
        for (const t of types) {
            totals[t] = tfdStats.getTotal(t);
            daily[t] = tfdStats.getDaily(t);
        }
        return {
            totals,
            daily,
            apiUserCount: tfdStats.getApiUserCount()
        };
    }
};

module.exports = {
    init,
    close,
    getDB,
    guilds,
    blockedChannels,
    allowedChannels,
    excludedUsers,
    allowedUsers,
    linkDomains,
    apiKeys,
    urlStats,
    rateLimit,
    blacklist,
    blacklistReports,
    abuse,
    userPrefs,
    tfdStats
};
