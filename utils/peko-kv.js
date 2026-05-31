/**
 * Cloudflare Worker KV 寫入工具
 * 將推文資料／翻譯結果寫入 Worker 的 KV 儲存庫
 */

const PEKO_API = 'https://peko-embed.pekopekopekopekomura.workers.dev/api/store';
const API_SECRET = process.env.PEKO_API_SECRET || '';

async function storeKV(key, value) {
    try {
        const resp = await fetch(PEKO_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-secret': API_SECRET
            },
            body: JSON.stringify({ key, value })
        });
        if (!resp.ok) {
            console.error(`[PekoKV] 寫入失敗: HTTP ${resp.status} for key ${key}`);
        }
    } catch (e) {
        console.error(`[PekoKV] 寫入異常: ${e.message}`);
    }
}

/**
 * 儲存推文原始資料
 */
async function storeTweetData(tweetId, tweet, quoteData, replyData) {
    const data = {
        text: tweet.text || '',
        quoteText: quoteData?.tweet?.text || '',
        replyText: replyData?.tweet?.text || '',
        author: {
            name: tweet.author?.name || '',
            screen_name: tweet.author?.screen_name || '',
            avatar: tweet.author?.avatar_url || ''
        },
        stats: {
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies
        },
        timestamp: Date.now()
    };

    // 影片資料
    if (tweet.media?.all) {
        const vid = tweet.media.all.find(m => m.type === 'video' || m.type === 'gif');
        if (vid?.url) {
            data.videoUrl = vid.url;
            data.thumbnailUrl = vid.thumbnail_url || '';
        }
    }

    await storeKV(`tweet:${tweetId}`, data);
}

/**
 * 儲存翻譯結果
 */
async function storeTranslationData(tweetId, translated) {
    await storeKV(`tweet:${tweetId}:zh-tw`, {
        text: translated.main || '',
        quoteText: translated.quote || '',
        replyText: translated.reply || '',
        timestamp: Date.now()
    });
}

/**
 * 建構 peko-embed URL
 */
function buildPekoUrl(tweetId, username, params = {}) {
    const config = require('../tfd-system/config/tfd-config.json');
    const base = config.features?.pekoEmbedBaseUrl || '';
    if (!base) return '';

    let url = `${base}/${username || 'i'}/status/${tweetId}`;
    const qs = [];
    if (params.lang) qs.push(`lang=${params.lang}`);
    if (params.expand) qs.push(`expand=${params.expand}`);
    if (params.v) qs.push(`v=${params.v || Date.now()}`);
    if (qs.length > 0) url += '?' + qs.join('&');
    return url;
}

module.exports = { storeTweetData, storeTranslationData, buildPekoUrl };
