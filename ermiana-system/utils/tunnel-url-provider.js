/**
 * Tunnel URL Provider
 *
 * 提供 ermiana-system 存取 Cloudflare Tunnel URL 的功能
 * 用於將 Twitter URL 轉換為自建的 Embed Proxy URL
 */

const fs = require('fs');
const path = require('path');

// 設定檔路徑
const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'cloudflare_tunnel.json');

// 快取
let cachedConfig = null;
let cacheTime = 0;
const CACHE_DURATION = 30000; // 30 秒快取

/**
 * 讀取隧道設定（帶快取）
 * @returns {Object|null} 設定物件
 */
function readTunnelConfig() {
    const now = Date.now();

    // 使用快取
    if (cachedConfig && (now - cacheTime < CACHE_DURATION)) {
        return cachedConfig;
    }

    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
            cachedConfig = JSON.parse(data);
            cacheTime = now;
            return cachedConfig;
        }
    } catch (error) {
        console.error('[Tunnel URL Provider] 讀取設定失敗:', error.message);
    }

    return null;
}

/**
 * 檢查隧道是否可用
 * @returns {boolean}
 */
function isTunnelAvailable() {
    const config = readTunnelConfig();
    return config && config.status === 'active' && config.current_url;
}

/**
 * 獲取當前隧道基礎 URL
 * @returns {string|null}
 */
function getTunnelBaseUrl() {
    const config = readTunnelConfig();
    if (config && config.status === 'active') {
        return config.current_url;
    }
    return null;
}

/**
 * 獲取 Twitter Embed Proxy URL
 * @param {string} tweetId 推文 ID
 * @returns {string|null} 完整的 embed URL，或 null 如果隧道不可用
 */
function getTwitterEmbedUrl(tweetId) {
    const baseUrl = getTunnelBaseUrl();
    if (!baseUrl) {
        return null;
    }
    return `${baseUrl}/embed/twitter/${tweetId}`;
}

/**
 * 將 Twitter/X URL 轉換為 Embed Proxy URL
 * @param {string} originalUrl 原始 Twitter/X URL
 * @returns {string|null} 轉換後的 URL，或 null 如果無法轉換
 */
function convertTwitterUrl(originalUrl) {
    // 提取推文 ID
    const tweetIdMatch = originalUrl.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i);
    if (!tweetIdMatch) {
        return null;
    }

    const tweetId = tweetIdMatch[1];
    return getTwitterEmbedUrl(tweetId);
}

/**
 * 獲取隧道狀態資訊
 * @returns {Object}
 */
function getTunnelStatus() {
    const config = readTunnelConfig();
    if (!config) {
        return {
            available: false,
            url: null,
            lastUpdated: null
        };
    }

    return {
        available: config.status === 'active',
        url: config.current_url,
        lastUpdated: config.last_updated
    };
}

/**
 * 清除快取（強制下次讀取時重新載入）
 */
function clearCache() {
    cachedConfig = null;
    cacheTime = 0;
}

module.exports = {
    isTunnelAvailable,
    getTunnelBaseUrl,
    getTwitterEmbedUrl,
    convertTwitterUrl,
    getTunnelStatus,
    clearCache
};
