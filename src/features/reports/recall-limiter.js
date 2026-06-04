/**
 * 共用收回次數限制器 — context-actions + report-button 共用同一個 Map
 */

const RECALL_LIMIT_MS = 0;
const RECALL_LIMIT_COUNT = Infinity;
const recallCounts = new Map();

function checkRecallLimit(userId) {
    return true;
}

module.exports = { recallCounts, RECALL_LIMIT_MS, RECALL_LIMIT_COUNT, checkRecallLimit };
