/**
 * HTML 影片渲染器
 * 基於 FxEmbed 的技術實現 Discord 嵌入式影片播放
 */

const tfd = require('../../utils/tfd-logger');
class HTMLVideoRenderer {
    constructor() {
        this.defaultThumbnail = 'https://pekoembed.canaria.cc/pic/twitter.png';
    }

    /**
     * 渲染影片的 Open Graph 標籤
     * @param {Object} video - 影片物件
     * @returns {Array} HTML meta 標籤陣列
     */
    renderVideoTags(video) {
        if (!video || !video.url) {
            return [];
        }

        // 智慧尺寸調整（基於 FxEmbed 邏輯）
        let sizeMultiplier = 1;

        if (video.width > 1920 || video.height > 1920) {
            sizeMultiplier = 0.5; // 大影片縮小
        }
        if (video.width < 400 && video.height < 400) {
            sizeMultiplier = 2;   // 小影片放大
        }

        const adjustedWidth = Math.round(video.width * sizeMultiplier);
        const adjustedHeight = Math.round(video.height * sizeMultiplier);

        // 確保影片格式
        const videoFormat = this.getVideoFormat(video.url);
        const thumbnailUrl = video.thumbnail_url || this.defaultThumbnail;

        tfd.sys('HTMLVideoRenderer', `渲染影片: ${video.url}, 原始尺寸: ${video.width}x${video.height}, 調整後: ${adjustedWidth}x${adjustedHeight}`);

        return [
            // Open Graph 影片標籤
            `<meta property="og:video" content="${video.url}"/>`,
            `<meta property="og:video:secure_url" content="${video.url}"/>`,
            `<meta property="og:video:type" content="${videoFormat}"/>`,
            `<meta property="og:video:width" content="${adjustedWidth}"/>`,
            `<meta property="og:video:height" content="${adjustedHeight}"/>`,

            // Twitter Player 標籤
            `<meta property="twitter:player:stream" content="${video.url}"/>`,
            `<meta property="twitter:player:stream:content_type" content="${videoFormat}"/>`,
            `<meta property="twitter:player:width" content="${adjustedWidth}"/>`,
            `<meta property="twitter:player:height" content="${adjustedHeight}"/>`,

            // 縮圖
            `<meta property="og:image" content="${thumbnailUrl}"/>`,
            `<meta property="twitter:image" content="${thumbnailUrl}"/>`
        ];
    }

    /**
     * 渲染多個影片的標籤
     * @param {Array} videos - 影片陣列
     * @returns {Array} HTML meta 標籤陣列
     */
    renderMultipleVideos(videos) {
        const tags = [];

        if (!videos || videos.length === 0) {
            return tags;
        }

        tfd.sys('HTMLVideoRenderer', `渲染 ${videos.length} 個影片`);

        // 為每個影片生成標籤
        videos.forEach((video, index) => {
            if (index === 0) {
                // 第一個影片使用主要標籤
                tags.push(...this.renderVideoTags(video));
            } else {
                // 額外影片使用額外的 og:video 標籤
                tags.push(`<meta property="og:video" content="${video.url}"/>`);
                tags.push(`<meta property="og:video:secure_url" content="${video.url}"/>`);

                if (video.thumbnail_url) {
                    tags.push(`<meta property="og:image" content="${video.thumbnail_url}"/>`);
                }
            }
        });

        return tags;
    }

    /**
     * 渲染圖片標籤（用於混合媒體）
     * @param {Array} images - 圖片陣列
     * @returns {Array} HTML meta 標籤陣列
     */
    renderImageTags(images) {
        const tags = [];

        if (!images || images.length === 0) {
            return tags;
        }

        tfd.sys('HTMLVideoRenderer', `渲染 ${images.length} 張圖片`);

        images.forEach((image) => {
            if (image && image.url) {
                tags.push(`<meta property="og:image" content="${image.url}"/>`);

                if (image.width && image.height) {
                    tags.push(`<meta property="og:image:width" content="${image.width}"/>`);
                    tags.push(`<meta property="og:image:height" content="${image.height}"/>`);
                }
            }
        });

        return tags;
    }

    /**
     * 獲取影片格式
     * @param {string} url - 影片URL
     * @returns {string} MIME 類型
     */
    getVideoFormat(url) {
        if (url.includes('.mp4')) return 'video/mp4';
        if (url.includes('.webm')) return 'video/webm';
        if (url.includes('.mov')) return 'video/quicktime';
        if (url.includes('.avi')) return 'video/x-msvideo';

        // 預設為 mp4
        return 'video/mp4';
    }

    /**
     * 決定 Twitter Card 類型
     * @param {Array} videos - 影片陣列
     * @param {Array} images - 圖片陣列
     * @returns {string} Twitter Card 類型
     */
    getTwitterCardType(videos, images) {
        if (videos && videos.length > 0) {
            return 'player'; // 有影片時使用 player 卡片
        } else if (images && images.length > 0) {
            return 'summary_large_image'; // 只有圖片時使用大圖卡片
        }

        return 'summary'; // 預設
    }

    /**
     * 渲染混合媒體標籤
     * @param {Object} options - 選項
     * @returns {Array} HTML meta 標籤陣列
     */
    renderMixedMediaTags(options) {
        const { videos = [], images = [], tweetData = {} } = options;
        const tags = [];

        tfd.sys('HTMLVideoRenderer', `渲染混合媒體: ${videos.length} 個影片, ${images.length} 張圖片`);

        // Twitter Card 類型
        const cardType = this.getTwitterCardType(videos, images);
        tags.push(`<meta property="twitter:card" content="${cardType}"/>`);

        // 基本 Open Graph 類型
        if (videos.length > 0) {
            tags.push(`<meta property="og:type" content="video.other"/>`);
        }

        // 渲染影片標籤
        if (videos.length > 0) {
            tags.push(...this.renderMultipleVideos(videos));
        }

        // 渲染圖片標籤
        if (images.length > 0) {
            tags.push(...this.renderImageTags(images));
        }

        // 基本資訊標籤
        if (tweetData.title) {
            tags.push(`<meta property="og:title" content="${this.escapeHtml(tweetData.title)}"/>`);
        }

        if (tweetData.description) {
            tags.push(`<meta property="og:description" content="${this.escapeHtml(tweetData.description)}"/>`);
        }

        if (tweetData.url) {
            tags.push(`<meta property="og:url" content="${tweetData.url}"/>`);
        }

        return tags;
    }

    /**
     * HTML 跳脫處理
     * @param {string} text - 原始文字
     * @returns {string} 跳脫後的文字
     */
    escapeHtml(text) {
        if (!text) return '';

        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

module.exports = HTMLVideoRenderer;