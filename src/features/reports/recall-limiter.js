/**
 * 共用收回次數限制器 — context-actions + report-button 共用同一個 Map
 */

const RECALL_LIMIT_MS = 600_000;
const RECALL_LIMIT_COUNT = 3;
const recallCounts = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of recallCounts) {
        const filtered = arr.filter(e => now - e.ts < RECALL_LIMIT_MS);
        if (filtered.length === 0) recallCounts.delete(k);
        else recallCounts.set(k, filtered);
    }
}, 60_000).unref();

function checkRecallLimit(userId) {
    let arr = recallCounts.get(userId) || [];
    const now = Date.now();
    arr = arr.filter(e => now - e.ts < RECALL_LIMIT_MS);
    if (arr.length >= RECALL_LIMIT_COUNT) return false;
    arr.push({ ts: now });
    recallCounts.set(userId, arr);
    return true;
}

module.exports = { recallCounts, RECALL_LIMIT_MS, RECALL_LIMIT_COUNT, checkRecallLimit };
