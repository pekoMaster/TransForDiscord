/**
 * rate-limiter.js
 *
 * Tracks recent usage in three dimensions:
 * 1. per-user
 * 2. per-guild
 * 3. per-user-per-guild
 *
 * Limits are configurable through .env:
 * - TFD_RATE_USER_PER_MIN
 * - TFD_RATE_GUILD_PER_MIN
 * - TFD_RATE_USER_GUILD_PER_MIN
 */

const db = require('../../../db');
const tlog = require('../logging/tfd-logger');

const LIMITS = {
    user: parseInt(process.env.TFD_RATE_USER_PER_MIN, 10) || 10,
    guild: parseInt(process.env.TFD_RATE_GUILD_PER_MIN, 10) || 60,
    userGuild: parseInt(process.env.TFD_RATE_USER_GUILD_PER_MIN, 10) || 8
};

const WINDOW_MIN = 1;

let gcInterval = null;

/**
 * Check whether a request is allowed before incrementing counters.
 * @returns {{ allowed: boolean, reason?: string, limit?: number, current?: number, retryAfterSec?: number }}
 */
function check(userId, guildId = null) {
    if (!userId) return { allowed: true };

    const userCount = db.rateLimit.countRecent('user', userId, WINDOW_MIN);
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

    db.rateLimit.increment('user', userId);
    if (guildId) {
        db.rateLimit.increment('guild', guildId);
        db.rateLimit.increment('user_guild', `${userId}:${guildId}`);
    }

    return { allowed: true };
}

function getLimits() {
    return { ...LIMITS, windowMinutes: WINDOW_MIN };
}

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
