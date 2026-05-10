/**
 * rate-limiter.js — TFD 多租戶速率限制器
 *
 * 三個維度同時檢查：
 *   1. per-user：單一使用者每分鐘最多 N 次（防個人刷屏）
 *   2. per-guild：單一伺服器每分鐘最多 N 次（防伺服器爆量）
 *   3. per-user-per-guild：單一使用者在單一伺服器每分鐘最多 N 次（精細）
 *
 * 預設限額（可由 .env 覆蓋）：
 *   TFD_RATE_USER_PER_MIN       (default: 10)  單一使用者每分鐘
 *   TFD_RATE_GUILD_PER_MIN      (default: 60)  單一伺服器每分鐘
 *   TFD_RATE_USER_GUILD_PER_MIN (default: 8)   特定使用者在特定伺服器每分鐘
 *
 * 紀錄寫入 SQLite rate_limit_log，每分鐘 bucket，自動 GC（超過 5 分鐘自動清理）
 */

const db = require('../db');

const LIMITS = {
    user: parseInt(process.env.TFD_RATE_USER_PER_MIN, 10) || 10,
    guild: parseInt(process.env.TFD_RATE_GUILD_PER_MIN, 10) || 60,
    userGuild: parseInt(process.env.TFD_RATE_USER_GUILD_PER_MIN, 10) || 8
};

const WINDOW_MIN = 1; // 一分鐘滑動視窗

let gcInterval = null;

/**
 * 檢查並計入一次嘗試
 * @returns {Object} { allowed: bool, reason?: string, retryAfterSec?: number }
 */
function check(userId, guildId = null) {
    if (!userId) return { allowed: true };

    // 先檢查（不增加 counter，避免被擋的人也算 quota）
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

    // 未超出 → 計入
    db.rateLimit.increment('user', userId);
    if (guildId) {
        db.rateLimit.increment('guild', guildId);
        db.rateLimit.increment('user_guild', `${userId}:${guildId}`);
    }

    return { allowed: true };
}

/**
 * 取得目前限額設定（顯示用）
 */
function getLimits() {
    return { ...LIMITS, windowMinutes: WINDOW_MIN };
}

/**
 * 啟動定期清理（清理超過 5 分鐘前的 bucket，避免表無限長大）
 */
function startGC(intervalMs = 5 * 60 * 1000) {
    if (gcInterval) return;
    gcInterval = setInterval(() => {
        try {
            const removed = db.rateLimit.cleanupOlderThan(5);
            if (removed > 0) console.log(`[rate-limiter] GC removed ${removed} old bucket rows`);
        } catch (e) {
            console.error('[rate-limiter] GC failed:', e.message);
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
