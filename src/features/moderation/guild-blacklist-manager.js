/**
 * Per-server SQLite blacklist manager
 *
 * Replaces the old JSON-file BlacklistManager.  All blacklist entries are
 * stored per-guild in SQLite with an in-memory cache for fast enforcement.
 *
 *    checkCache: Map<guildId_platform_author, {entry, ts}>  (TTL 60s)
 */

const db = require('../../../db');

class GuildBlacklistManager {
    constructor() {
        this.checkCache = new Map();
        this.CACHE_TTL = 60_000;
        // Periodic GC every 5 min
        this._gcInterval = setInterval(() => this._gcCache(), 300_000);
        if (this._gcInterval.unref) this._gcInterval.unref();
    }

    // ── Cache ──────────────────────────────────────────────

    _cacheKey(guildId, platform, author) {
        return guildId + '|' + platform + '|' + (author || '').toLowerCase();
    }

    _cacheGet(guildId, platform, author) {
        const key = this._cacheKey(guildId, platform, author);
        const entry = this.checkCache.get(key);
        if (entry && Date.now() - entry.ts < this.CACHE_TTL) {
            return entry.value;
        }
        if (entry) this.checkCache.delete(key);
        return undefined;
    }

    _cacheSet(guildId, platform, author, value) {
        const key = this._cacheKey(guildId, platform, author);
        this.checkCache.set(key, { value, ts: Date.now() });
    }

    _gcCache() {
        const now = Date.now();
        for (const [key, entry] of this.checkCache) {
            if (now - entry.ts > this.CACHE_TTL * 2) {
                this.checkCache.delete(key);
            }
        }
    }

    // ── Blacklist CRUD ────────────────────────────────────

    /**
     * Add or update a blacklist entry (UPSERT).
     * @returns {Object} info from db run
     */
    add(guildId, platform, author, { uid = null, level, label = null, addedBy, reason = null } = {}) {
        const result = db.blacklist.add(guildId, platform, author, { uid, level, label, addedBy, reason });
        this._cacheSet(guildId, platform, author, { level, label, uid });
        return result;
    }

    /**
     * Remove a blacklist entry.
     * @returns {number} rows deleted
     */
    remove(guildId, platform, author) {
        const count = db.blacklist.remove(guildId, platform, author);
        if (count > 0) {
            this._cacheSet(guildId, platform, author, null);
        }
        return count;
    }

    /**
     * List entries for a guild (optionally filtered by platform).
     * @returns {Array}
     */
    list(guildId, platform = null) {
        return db.blacklist.list(guildId, platform);
    }

    /**
     * Check if an author is blacklisted.  Uses cache.
     * @returns {Object|null} entry or null
     */
    check(guildId, platform, author, uid = null) {
        if (!author && !uid) return null;
        const cached = this._cacheGet(guildId, platform, author);
        if (cached !== undefined) return cached;

        const entry = db.blacklist.check(guildId, platform, author, uid);
        this._cacheSet(guildId, platform, author, entry);
        return entry;
    }

    // ── Reports ───────────────────────────────────────────

    createReport({ guildId, channelId, messageId = null, originalUrl = null,
                   targetAuthor = null, platform = 'unknown', reporterId,
                   suggestedLevel, reason = null } = {}) {
        return db.blacklistReports.create({
            guildId, channelId, messageId, originalUrl, targetAuthor,
            platform, reporterId, suggestedLevel, reason
        });
    }

    getReport(reportId) {
        return db.blacklistReports.get(reportId);
    }

    isPending(reportId) {
        return db.blacklistReports.isPending(reportId);
    }

    approveReport(reportId, adminId, finalLevel, adminReason = null) {
        const report = db.blacklistReports.get(reportId);
        if (!report) return null;

        db.blacklistReports.approve(reportId, adminId, finalLevel, adminReason);

        // UPSERT into guild_blacklist
        const entry = this.add(report.guild_id, report.platform || 'unknown',
            report.target_author || 'unknown',
            {
                level: finalLevel,
                addedBy: adminId,
                reason: adminReason || '來自回報審核',
                uid: null
            });
        return entry;
    }

    rejectReport(reportId, adminId) {
        return db.blacklistReports.reject(reportId, adminId);
    }

    // Resolves to report once admin selects level via StringSelectMenu
    setLevel(reportId, level) {
        return db.blacklistReports.setLevel(reportId, level);
    }

    /**
     * Stop the GC interval.  Call when shutting down.
     */
    destroy() {
        if (this._gcInterval) {
            clearInterval(this._gcInterval);
            this._gcInterval = null;
        }
        this.checkCache.clear();
    }
}

// Singleton
let instance = null;

function getInstance() {
    if (!instance) instance = new GuildBlacklistManager();
    return instance;
}

module.exports = { GuildBlacklistManager, getInstance };
