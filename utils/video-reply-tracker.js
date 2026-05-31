/**
 * Video Reply Tracker
 * 用於追蹤「影片推文 reply 模式」發出的 bot reply 訊息，
 * 當原文被刪除時連帶刪除 bot reply。
 *
 * 持久化：data/video_reply_tracker.json
 * 保留期：7 天（超過自動 GC）
 */
const fs = require('fs');
const path = require('path');
const tfd = require('./tfd-logger');

const FILE = path.join(__dirname, '..', 'data', 'video_reply_tracker.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

let cache = new Map(); // originalMsgId -> { botMsgId, channelId, ts }
let dirty = false;
let saveTimer = null;

function loadFromDisk() {
    try {
        if (!fs.existsSync(FILE)) {
            cache = new Map();
            return;
        }
        const raw = fs.readFileSync(FILE, 'utf-8');
        const obj = JSON.parse(raw);
        cache = new Map(Object.entries(obj));
        const before = cache.size;
        gcExpired();
        if (cache.size !== before) scheduleSave();
        tfd.sys('VideoReplyTracker', `載入 ${cache.size} 條追蹤記錄（GC 移除 ${before - cache.size} 條過期）`);
    } catch (e) {
        tfd.sysError('VideoReplyTracker', `載入失敗，重置為空: ${e.message}`);
        cache = new Map();
    }
}

function gcExpired() {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
        if (!v.ts || now - v.ts > TTL_MS) cache.delete(k);
    }
}

function scheduleSave() {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        if (!dirty) return;
        dirty = false;
        try {
            const obj = Object.fromEntries(cache);
            fs.writeFileSync(FILE, JSON.stringify(obj), 'utf-8');
        } catch (e) {
            tfd.sysError('VideoReplyTracker', `寫入失敗: ${e.message}`);
        }
    }, 2000);
}

function register(originalMsgId, botMsgId, channelId) {
    cache.set(String(originalMsgId), {
        botMsgId: String(botMsgId),
        channelId: String(channelId),
        ts: Date.now(),
    });
    scheduleSave();
}

function lookup(originalMsgId) {
    const v = cache.get(String(originalMsgId));
    if (!v) return null;
    if (Date.now() - v.ts > TTL_MS) {
        cache.delete(String(originalMsgId));
        scheduleSave();
        return null;
    }
    return v;
}

function remove(originalMsgId) {
    if (cache.delete(String(originalMsgId))) scheduleSave();
}

function periodicGc() {
    const before = cache.size;
    gcExpired();
    if (cache.size !== before) {
        scheduleSave();
        tfd.sys('VideoReplyTracker', `定期 GC 移除 ${before - cache.size} 條過期`);
    }
}

loadFromDisk();
setInterval(periodicGc, 60 * 60 * 1000); // 每小時 GC

module.exports = { register, lookup, remove };
