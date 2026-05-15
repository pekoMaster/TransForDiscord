/**
 * rate-limiter.js ??TFD 多�??�速�??�制?? *
 * 三個維度�??�檢?��?
 *   1. per-user：單一使用?��??��??��?N 次�??�個人?��?�? *   2. per-guild：單一伺�??��??��??��?N 次�??�伺?�器?��?�? *   3. per-user-per-guild：單一使用?�在?��?伺�??��??��??��?N 次�?精細�? *
 * ?�設?��?（可??.env 覆�?）�?
 *   TFD_RATE_USER_PER_MIN       (default: 10)  ?��?使用?��??��?
 *   TFD_RATE_GUILD_PER_MIN      (default: 60)  ?��?伺�??��??��?
 *   TFD_RATE_USER_GUILD_PER_MIN (default: 8)   ?��?使用?�在?��?伺�??��??��?
 *
 * 紀?�寫??SQLite rate_limit_log，�??��? bucket，自??GC（�???5 ?��??��?清�?�? */

const db = require('../db');
const tlog = require('./tfd-logger');

const LIMITS = {
    user: parseInt(process.env.TFD_RATE_USER_PER_MIN, 10) || 10,
    guild: parseInt(process.env.TFD_RATE_GUILD_PER_MIN, 10) || 60,
    userGuild: parseInt(process.env.TFD_RATE_USER_GUILD_PER_MIN, 10) || 8
};

const WINDOW_MIN = 1; // 一?��?滑�?視�?

let gcInterval = null;

/**
 * 檢查並�??��?次�?�? * @returns {Object} { allowed: bool, reason?: string, retryAfterSec?: number }
 */
function check(userId, guildId = null) {
    if (!userId) return { allowed: true };

    // ?�檢?��?不�???counter，避?�被?��?人�?�?quota�?    const userCount = db.rateLimit.countRecent('user', userId, WINDOW_MIN);
    if (userCount >= LIMITS.user) {
        return {
            allowed: false,
            reason: 'user',
            limit: LIMITS.user,
            current: userCount,
            retryAfterSec: 60
        };
    }

    if (guildId) {
        const guildCount = db.rateLimit.countRecent('guild', guildId, WINDOW_MIN);
        if (guildCount >= LIMITS.guild) {
            return {
                allowed: false,
                reason: 'guild',
                limit: LIMITS.guild,
                current: guildCount,
                retryAfterSec: 60
            };
        }

        const userGuildKey = `${userId}:${guildId}`;
        const ugCount = db.rateLimit.countRecent('user_guild', userGuildKey, WINDOW_MIN);
        if (ugCount >= LIMITS.userGuild) {
            return {
                allowed: false,
                reason: 'user_guild',
                limit: LIMITS.userGuild,
                current: ugCount,
                retryAfterSec: 60
            };
        }
    }

    // ?��?????計入
    db.rateLimit.increment('user', userId);
    if (guildId) {
        db.rateLimit.increment('guild', guildId);
        db.rateLimit.increment('user_guild', `${userId}:${guildId}`);
    }

    return { allowed: true };
}

/**
 * ?��??��??��?設�?（顯示用�? */
function getLimits() {
    return { ...LIMITS, windowMinutes: WINDOW_MIN };
}

/**
 * ?��?定�?清�?（�??��???5 ?��??��? bucket，避?�表?��??�大�? */
function startGC(intervalMs = 5 * 60 * 1000) {
    if (gcInterval) return;
    gcInterval = setInterval(() => {
        try {
            const removed = db.rateLimit.cleanupOlderThan(5);
            if (removed > 100) tlog.sys('rate-limiter', `GC removed ${removed} old bucket rows`);
        } catch (e) {
            tlog.sysError('rate-limiter', `GC failed: ${e.message}`);
        }
    }, intervalMs);
    gcInterval.unref?.();
}

function stopGC() {
    if (gcInterval) {
        clearInterval(gcInterval);
        gcInterval = null;
    }
}

module.exports = { check, getLimits, startGC, stopGC, LIMITS };
