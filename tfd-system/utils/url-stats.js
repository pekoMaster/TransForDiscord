/**
 * URL 統計模組
 * 追蹤每個 URL 在 7 天窗口內被貼出的次數（per channel / per guild / 全 guild）
 * 窗口從第一篇貼出時算起，7天後 00:00 清零
 */
'use strict';

const fs = require('fs');
const path = require('path');
const tfd = require('../../utils/tfd-logger');

const STATS_FILE = path.join(__dirname, '../../data/url-stats.json');
const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

// 條目級 GC 設定（per-URL TTL，避免單一窗口內膨脹）
const URL_TTL_MS = (parseInt(process.env.TFD_URL_STATS_URL_TTL_DAYS, 10) || 3) * 24 * 60 * 60 * 1000;
const MAX_URL_ENTRIES = parseInt(process.env.TFD_URL_STATS_MAX_ENTRIES, 10) || 5000;
const TARGET_URL_ENTRIES = Math.floor(MAX_URL_ENTRIES * 0.6);

// ─── 檔案 I/O ────────────────────────────────────────────────

function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
    } catch (_) { /* 檔案損壞時重建 */ }
    return null;
}

function saveStats(stats) {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
    } catch (e) {
        tfd.sysError('url-stats', `儲存失敗: ${e.message}`);
    }
}

// ─── 窗口管理 ─────────────────────────────────────────────────

function getActiveStats() {
    let stats = loadStats();
    const now = Date.now();

    if (!stats) {
        stats = { windowStart: now, urls: {} };
        saveStats(stats);
        return stats;
    }

    // 7 天後清零（以 windowStart 為基準）
    if (now - stats.windowStart >= WINDOW_MS) {
        stats = { windowStart: now, urls: {} };
        saveStats(stats);
    }

    return stats;
}

// ─── URL 正規化 ───────────────────────────────────────────────
// 目標：同一則推文的 twitter.com / x.com 都視為同一筆

function normalizeUrl(url) {
    try {
        const u = new URL(url);
        // 統一 x.com → twitter.com
        const host = u.hostname.replace(/^x\.com$/, 'twitter.com').toLowerCase();
        // 移除 trailing slash 和常見 tracking params
        const pathname = u.pathname.replace(/\/$/, '');
        return `${host}${pathname}`.toLowerCase();
    } catch (_) {
        return url.toLowerCase().replace(/\/$/, '');
    }
}

// ─── 公開 API ─────────────────────────────────────────────────

/**
 * 記錄一次 URL 使用並返回當前窗口內的統計數字
 * @param {string} url           原始 URL
 * @param {string} guildId       Discord Guild ID
 * @param {string} channelId     Discord Channel ID
 * @returns {{ channel: number, guild: number, total: number }}
 */
function recordUrl(url, guildId, channelId) {
    if (!url || !guildId || !channelId) {
        return { channel: 0, guild: 0, total: 0 };
    }

    const stats = getActiveStats();
    const key = normalizeUrl(url);
    const now = Date.now();

    if (!stats.urls[key]) {
        stats.urls[key] = { total: 0, guilds: {}, lastSeen: now };
    }
    const urlData = stats.urls[key];
    urlData.total++;
    urlData.lastSeen = now;

    if (!urlData.guilds[guildId]) {
        urlData.guilds[guildId] = { count: 0, channels: {} };
    }
    const guildData = urlData.guilds[guildId];
    guildData.count++;

    if (!guildData.channels[channelId]) {
        guildData.channels[channelId] = 0;
    }
    guildData.channels[channelId]++;

    // 條目級 GC：移除超過 TTL 的條目，或縮減超量條目
    pruneStats(stats, now);

    saveStats(stats);

    return {
        channel: guildData.channels[channelId],
        guild: guildData.count,
        total: urlData.total,
    };
}

/**
 * 條目級清理：
 *   1. 移除 lastSeen 超過 URL_TTL_MS 的條目
 *   2. 若仍超過 MAX_URL_ENTRIES，依 lastSeen 排序保留最新 TARGET_URL_ENTRIES 個
 */
function pruneStats(stats, now) {
    const keys = Object.keys(stats.urls);
    if (keys.length === 0) return;

    // 步驟 1: TTL 清理
    const ttlCutoff = now - URL_TTL_MS;
    let removedTTL = 0;
    for (const key of keys) {
        const entry = stats.urls[key];
        if (!entry.lastSeen || entry.lastSeen < ttlCutoff) {
            delete stats.urls[key];
            removedTTL++;
        }
    }

    // 步驟 2: 超量縮減
    const remaining = Object.keys(stats.urls);
    if (remaining.length > MAX_URL_ENTRIES) {
        const sorted = remaining
            .map(k => [k, stats.urls[k].lastSeen || 0])
            .sort((a, b) => b[1] - a[1])  // 新的在前
            .slice(TARGET_URL_ENTRIES);    // 從 TARGET 之後全砍
        let removedOverflow = 0;
        for (const [key] of sorted) {
            delete stats.urls[key];
            removedOverflow++;
        }
        if (removedOverflow > 0) {
            tfd.sys('url-stats', `GC: 移除 ${removedTTL} 個過期、${removedOverflow} 個超量條目（剩 ${TARGET_URL_ENTRIES}）`);
        }
    } else if (removedTTL > 0) {
        tfd.sys('url-stats', `GC: 移除 ${removedTTL} 個過期條目`);
    }
}

/**
 * 查詢 URL 統計（唯讀，不記錄新使用）
 * @param {string} url
 * @param {string} guildId
 * @param {string} channelId
 * @returns {{ channel: number, guild: number, total: number }}
 */
function lookupUrl(url, guildId, channelId) {
    if (!url || !guildId || !channelId) {
        return { channel: 0, guild: 0, total: 0 };
    }

    const stats = getActiveStats();
    const key = normalizeUrl(url);
    const urlData = stats.urls[key];
    if (!urlData) return { channel: 0, guild: 0, total: 0 };

    const guildData = urlData.guilds?.[guildId];
    if (!guildData) return { channel: 0, guild: 0, total: urlData.total || 0 };

    return {
        channel: guildData.channels?.[channelId] || 0,
        guild: guildData.count || 0,
        total: urlData.total || 0,
    };
}

module.exports = { recordUrl, lookupUrl };
