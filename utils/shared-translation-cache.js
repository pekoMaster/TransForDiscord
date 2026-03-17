/**
 * 共享持久翻譯快取
 * - 以 tweetId 為 key，所有用戶共享同一則翻譯
 * - 儲存到磁碟，重啟後不遺失
 * - 7 天後自動清理
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../data/translation_cache');
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

// 記憶體索引（啟動時從磁碟載入，之後同步維護）
const memoryIndex = new Map();

/**
 * 初始化：建立目錄並從磁碟載入所有快取
 */
function init() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log('[SharedCache] 建立快取目錄:', CACHE_DIR);
    }

    let loaded = 0;
    let cleaned = 0;
    const cutoff = Date.now() - TTL_MS;

    try {
        const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(CACHE_DIR, file), 'utf8');
                const entry = JSON.parse(raw);

                if (entry.timestamp < cutoff) {
                    // 過期，直接清理
                    fs.unlinkSync(path.join(CACHE_DIR, file));
                    cleaned++;
                } else {
                    memoryIndex.set(entry.tweetId, entry);
                    loaded++;
                }
            } catch (_) {
                // 損壞的檔案，跳過
            }
        }
    } catch (_) {}

    console.log(`[SharedCache] 載入 ${loaded} 筆翻譯快取，清理 ${cleaned} 筆過期快取`);
}

/**
 * 取得快取翻譯
 * @param {string} tweetId
 * @returns {{ translatedText, originalText, model, timestamp } | null}
 */
function get(tweetId) {
    const entry = memoryIndex.get(tweetId);
    if (!entry) return null;

    // 二次確認是否過期
    if (Date.now() - entry.timestamp > TTL_MS) {
        memoryIndex.delete(tweetId);
        try { fs.unlinkSync(path.join(CACHE_DIR, `${tweetId}.json`)); } catch (_) {}
        return null;
    }

    return entry;
}

/**
 * 儲存翻譯到快取
 * @param {string} tweetId
 * @param {{ translatedText: string, originalText: string, model: string }} data
 */
function set(tweetId, data) {
    const entry = {
        tweetId,
        translatedText: data.translatedText,
        originalText: data.originalText,
        model: data.model || 'unknown',
        timestamp: Date.now()
    };

    memoryIndex.set(tweetId, entry);

    // 非同步寫入磁碟（不阻塞回應）
    try {
        fs.writeFileSync(
            path.join(CACHE_DIR, `${tweetId}.json`),
            JSON.stringify(entry),
            'utf8'
        );
    } catch (err) {
        console.error('[SharedCache] 寫入失敗:', err.message);
    }
}

/**
 * 清理過期快取（7 天以上）
 * 每 24 小時由 index.js 呼叫一次
 */
function cleanup() {
    const cutoff = Date.now() - TTL_MS;
    let count = 0;

    for (const [id, entry] of memoryIndex) {
        if (entry.timestamp < cutoff) {
            memoryIndex.delete(id);
            try { fs.unlinkSync(path.join(CACHE_DIR, `${id}.json`)); } catch (_) {}
            count++;
        }
    }

    if (count > 0) {
        console.log(`[SharedCache] 清理 ${count} 筆過期翻譯快取`);
    }
}

/**
 * 取得快取統計資訊
 */
function stats() {
    return {
        count: memoryIndex.size,
        cacheDir: CACHE_DIR
    };
}

module.exports = { init, get, set, cleanup, stats };
