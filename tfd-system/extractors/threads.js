/**
 * Ermiana 系統 - Threads 提取器
 * 使用 Lightpanda headless browser（透過 CDP）抓取頁面 OG meta 並建立 Discord Embed
 *
 * 行為：
 * - 個人資料頁：Lightpanda 抓取完整 OG meta（含標題、描述、頭像）
 * - 貼文頁：Lightpanda 抓取（若被重定向到登入頁則建立基本 embed）
 * - Lightpanda 不可用時：建立基本 embed（僅顯示用戶名與連結）
 *
 * 支援域名：threads.com（現行）、threads.net（舊域名）
 */

const ErmianaEmbedBuilder = require('../utils/embed-builder');

// Threads 品牌色（黑色）
const THREADS_COLOR = 0x000000;
const THREADS_ICON = 'https://static.cdninstagram.com/rsrc.php/ye/r/lEu8iVizmNW.ico';

class ThreadsExtractor {
    constructor() {
        this.embedBuilder = new ErmianaEmbedBuilder();
        this.name = 'Threads';
    }

    /**
     * 處理 Threads URL
     * @param {Object} matchResult
     * @returns {Promise<Object>}
     */
    async extract(matchResult) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'post': {
                    const username = extractedData[0];
                    const postId = extractedData[1];
                    return await this.extractPost(username, postId, originalURL);
                }
                case 'profile': {
                    const username = extractedData[0];
                    return await this.extractProfile(username, originalURL);
                }
                default:
                    throw new Error(`不支援的 Threads 模式: ${patternName}`);
            }
        } catch (error) {
            console.error(`[Ermiana-Threads] 提取失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取貼文資訊
     * 優先使用 Lightpanda 抓取完整 OG metadata，失敗時 fallback 至 URL 轉換
     */
    async extractPost(username, postId, originalURL) {
        // === 嘗試用 Lightpanda 抓取 ===
        try {
            const lightpanda = require('../../utils/lightpanda-client');
            const meta = await lightpanda.fetchPageMeta(originalURL, {
                waitSelector: 'article',
                extraWaitMs: 1000,
                timeout: 15000
            });

            // 偵測登入重定向（Threads 對 bot 保護）
            const isLoginRedirect = meta.canonicalUrl === 'https://www.threads.com/' ||
                (meta.title && meta.title.includes('Log in'));

            if (meta.success && !isLoginRedirect && (meta.title || meta.description)) {
                console.log(`[Ermiana-Threads] Lightpanda 抓取成功: @${username}/post/${postId}`);

                const embed = this.embedBuilder.createBasicEmbed({
                    title: meta.title || `@${username} 的 Threads 貼文`,
                    description: meta.description || null,
                    url: originalURL,
                    image: meta.image || null,
                    color: THREADS_COLOR,
                    author: {
                        name: `@${username}`,
                        iconURL: THREADS_ICON,
                        url: `https://www.threads.com/@${username}`
                    },
                    footer: { text: '🧵 Threads' }
                });

                return { success: true, siteName: 'threads', embed };
            }

            if (isLoginRedirect) {
                console.log(`[Ermiana-Threads] 偵測到登入重定向，切換 URL 轉換`);
            } else {
                console.log(`[Ermiana-Threads] Lightpanda 回傳空內容，切換 URL 轉換`);
            }
        } catch (lpError) {
            console.log(`[Ermiana-Threads] Lightpanda 不可用，切換 URL 轉換: ${lpError.message}`);
        }

        // === Fallback：基本 embed（Threads 貼文頁面需要登入，無法取得內容）===
        return this.buildBasicPostEmbed(username, postId, originalURL);
    }

    /**
     * 提取個人資料
     */
    async extractProfile(username, originalURL) {
        try {
            const lightpanda = require('../../utils/lightpanda-client');
            const meta = await lightpanda.fetchPageMeta(originalURL, {
                extraWaitMs: 1000,
                timeout: 15000
            });

            if (meta.success && (meta.title || meta.description)) {
                const embed = this.embedBuilder.createBasicEmbed({
                    title: meta.title || `@${username}`,
                    description: meta.description || null,
                    url: originalURL,
                    thumbnail: meta.image || null,
                    color: THREADS_COLOR,
                    footer: { text: '🧵 Threads' }
                });

                return { success: true, siteName: 'threads', embed };
            }
        } catch (lpError) {
            console.log(`[Ermiana-Threads] Lightpanda 不可用 (profile): ${lpError.message}`);
        }

        // Fallback：基本 embed（Lightpanda 無法取得個人資料）
        return this.buildBasicProfileEmbed(username, originalURL);
    }

    /**
     * 建立基本貼文 embed（無法取得貼文內容時使用）
     * Threads 貼文頁面需要登入，Lightpanda 會被重定向
     */
    buildBasicPostEmbed(username, postId, originalURL) {
        console.log(`[Ermiana-Threads] 建立基本貼文 embed: @${username}`);

        const embed = this.embedBuilder.createBasicEmbed({
            title: `@${username} 的 Threads 貼文`,
            url: originalURL,
            color: THREADS_COLOR,
            author: {
                name: `@${username}`,
                iconURL: THREADS_ICON,
                url: `https://www.threads.com/@${username}`
            },
            footer: { text: '🧵 Threads' }
        });

        return { success: true, siteName: 'threads', embed };
    }

    /**
     * 建立基本個人資料 embed（Lightpanda 無法取得時使用）
     */
    buildBasicProfileEmbed(username, originalURL) {
        console.log(`[Ermiana-Threads] 建立基本個人資料 embed: @${username}`);

        const embed = this.embedBuilder.createBasicEmbed({
            title: `@${username} • Threads`,
            url: originalURL,
            color: THREADS_COLOR,
            footer: { text: '🧵 Threads' }
        });

        return { success: true, siteName: 'threads', embed };
    }

    /**
     * 建立錯誤回應
     */
    createErrorResponse(message, url) {
        return {
            success: false,
            error: message,
            embed: this.embedBuilder.createErrorEmbed(`Threads 取得失敗: ${message}`, url),
            siteName: 'threads'
        };
    }
}

module.exports = ThreadsExtractor;
