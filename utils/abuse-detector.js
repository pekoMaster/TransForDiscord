/**
 * abuse-detector.js — TFD 濫用行為偵測
 *
 * 設計：基於 abuse_records 表的事件累積觸發處置
 *
 * 偵測類型：
 *   1. rate_exceeded — 由 rate-limiter 寫入；累積 N 次 24h 內 → 警告
 *   2. spam_url — 同一使用者短時間貼相同/相似 URL 過多次（由 message handler 呼叫）
 *   3. duplicate_burst — 短時間貼大量不同 URL（轟炸）
 *
 * 處置（軟性）：
 *   - severity 1: 記錄，不阻擋
 *   - severity 2: 該使用者短期靜音 TFD（5 分鐘）
 *   - severity 3: 自動加入該伺服器的 excludedUsers（但允許伺服器管理員手動恢復）
 */

const db = require('../db');
const crypto = require('crypto');
const tfd = require('./tfd-logger');

// 短期記憶體快取（單一進程內）：URL → [timestamps]，用於 burst 偵測
const userUrlHistory = new Map(); // userId → Map<urlHash, [timestamps]>
const HISTORY_WINDOW_MS = 60 * 1000;       // 1 分鐘窗口
const SAME_URL_THRESHOLD = 5;              // 1 分鐘內貼同 URL ≥ 5 次 = spam
const DIFFERENT_URLS_THRESHOLD = 15;       // 1 分鐘內貼不同 URL ≥ 15 次 = burst

// 軟性靜音（短期）
const userMutes = new Map(); // userId → expireAtMs

const RATE_EXCEEDED_24H_THRESHOLD = parseInt(process.env.TFD_ABUSE_RATE_24H_THRESHOLD, 10) || 30;
const RATE_EXCEEDED_AUTO_EXCLUDE = parseInt(process.env.TFD_ABUSE_RATE_AUTOEXCLUDE, 10) || 60;

let gcInterval = null;

function _hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function _now() {
    return Date.now();
}

/**
 * 在 message-handler 呼叫：記錄使用者剛發送了一個 URL
 * 並回傳是否需阻擋（靜音中或瞬時 spam）
 */
function recordUrl({ userId, guildId, channelId, url }) {
    if (!userId || !url) return { blocked: false };

    // 軟性靜音檢查
    const muteExpireAt = userMutes.get(userId);
    if (muteExpireAt && muteExpireAt > _now()) {
        return { blocked: true, reason: 'muted', remainSec: Math.ceil((muteExpireAt - _now()) / 1000) };
    } else if (muteExpireAt) {
        userMutes.delete(userId);
    }

    const urlHash = _hash(url);
    const now = _now();

    if (!userUrlHistory.has(userId)) userUrlHistory.set(userId, new Map());
    const userMap = userUrlHistory.get(userId);

    // 寫入該 URL 的時間戳
    if (!userMap.has(urlHash)) userMap.set(urlHash, []);
    const stamps = userMap.get(urlHash);
    stamps.push(now);

    // 清掉超過窗口的舊紀錄
    const cutoff = now - HISTORY_WINDOW_MS;
    while (stamps.length > 0 && stamps[0] < cutoff) stamps.shift();
    if (stamps.length === 0) userMap.delete(urlHash);

    // 也清掉所有 URL 的舊紀錄（針對 burst）
    let totalRecent = 0;
    for (const [h, ts] of userMap.entries()) {
        while (ts.length > 0 && ts[0] < cutoff) ts.shift();
        if (ts.length === 0) userMap.delete(h);
        else totalRecent += ts.length;
    }

    // 偵測 spam（同 URL 重複）
    if (stamps.length >= SAME_URL_THRESHOLD) {
        _recordAbuse(userId, guildId, channelId, 'spam_url', 2, { urlHash, count: stamps.length });
        userMutes.set(userId, now + 5 * 60 * 1000); // 軟靜音 5 分鐘
        return { blocked: true, reason: 'spam_url', count: stamps.length };
    }

    // 偵測 burst（總量過多）
    if (totalRecent >= DIFFERENT_URLS_THRESHOLD) {
        _recordAbuse(userId, guildId, channelId, 'duplicate_burst', 2, { count: totalRecent });
        userMutes.set(userId, now + 5 * 60 * 1000);
        return { blocked: true, reason: 'burst', count: totalRecent };
    }

    return { blocked: false };
}

/**
 * 評估該使用者長期累積的濫用記錄（24 小時內）
 * 達到門檻則回傳處置建議
 */
function evaluateLongTerm(userId, guildId = null) {
    const recent = db.abuse.countRecentByUser(userId, 86400);
    if (recent >= RATE_EXCEEDED_AUTO_EXCLUDE && guildId) {
        // 自動加入該伺服器排除清單
        if (!db.excludedUsers.has(guildId, userId)) {
            db.excludedUsers.add(guildId, userId, null, `auto-excluded: ${recent} abuse events in 24h`);
            return { action: 'auto_excluded', count: recent };
        }
    }
    if (recent >= RATE_EXCEEDED_24H_THRESHOLD) {
        return { action: 'warning', count: recent };
    }
    return { action: 'none', count: recent };
}

function _recordAbuse(userId, guildId, channelId, type, severity, details) {
    db.abuse.record({ userId, guildId, channelId, abuseType: type, severity, details });
}

/**
 * 啟動 GC：每 10 分鐘清理記憶體中的舊紀錄；每 24 小時清 SQLite
 */
function startGC() {
    if (gcInterval) return;
    gcInterval = setInterval(() => {
        try {
            const now = _now();
            for (const [userId, map] of userUrlHistory.entries()) {
                for (const [hash, stamps] of map.entries()) {
                    while (stamps.length > 0 && stamps[0] < now - HISTORY_WINDOW_MS) stamps.shift();
                    if (stamps.length === 0) map.delete(hash);
                }
                if (map.size === 0) userUrlHistory.delete(userId);
            }
            for (const [userId, exp] of userMutes.entries()) {
                if (exp <= now) userMutes.delete(userId);
            }

            // 每小時清一次 DB（保留 30 天）
            if (Math.floor(now / 1000) % 3600 < 600) {
                const removed = db.abuse.cleanupOlderThan(30);
                if (removed > 0) tfd.sys('abuse-detector', `GC cleaned ${removed} old abuse records`);
            }
        } catch (e) {
            tfd.sysError('abuse-detector', `GC error: ${e.message}`);
        }
    }, 10 * 60 * 1000);
    gcInterval.unref?.();
}

function stopGC() {
    if (gcInterval) { clearInterval(gcInterval); gcInterval = null; }
}

module.exports = { recordUrl, evaluateLongTerm, startGC, stopGC };
