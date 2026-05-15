/**
 * 混合媒體 HTML 建構器
 * 處理影片+圖片的複雜組合並生成完整的 HTML 回應頁面
 */

const HTMLVideoRenderer = require('./html-video-renderer');
const tfd = require('../../utils/tfd-logger');

class MixedMediaHTMLBuilder {
    constructor() {
        this.videoRenderer = new HTMLVideoRenderer();
        this.baseTemplate = this.getBaseHTMLTemplate();
    }

    /**
     * 建構混合媒體的 HTML 回應
     * @param {Object} options - 建構選項
     * @returns {string} 完整的 HTML 內容
     */
    buildHTML(options) {
        const {
            tweetData,
            videos = [],
            images = [],
            originalURL,
            siteName = 'Enhanced TFD'
        } = options;

        tfd.sys('MixedMediaHTMLBuilder', `建構 HTML: ${videos.length} 影片, ${images.length} 圖片`);

        // 生成 Open Graph 和 Twitter Card 標籤
        const metaTags = this.videoRenderer.renderMixedMediaTags({
            videos,
            images,
            tweetData: {
                title: this.buildTitle(tweetData, videos, images),
                description: this.buildDescription(tweetData),
                url: originalURL
            }
        });

        // 生成額外的標籤
        const additionalTags = this.buildAdditionalTags(siteName, originalURL);

        // 組合所有標籤
        const allTags = [...metaTags, ...additionalTags];

        // 生成重定向資訊
        const redirectInfo = this.buildRedirectInfo(originalURL);

        // 組合完整 HTML
        const html = this.baseTemplate
            .replace('{{META_TAGS}}', allTags.join('\n    '))
            .replace('{{REDIRECT_INFO}}', redirectInfo)
            .replace('{{SITE_NAME}}', siteName);

        tfd.sys('MixedMediaHTMLBuilder', `HTML 已生成，包含 ${allTags.length} 個 meta 標籤`);

        return html;
    }

    /**
     * 建構標題
     * @param {Object} tweetData - 推文資料
     * @param {Array} videos - 影片陣列
     * @param {Array} images - 圖片陣列
     * @returns {string} 標題
     */
    buildTitle(tweetData, videos, images) {
        const author = tweetData.author || {};
        const authorText = author.name ? `${author.name} (@${author.screen_name})` : '推文';

        // 媒體描述
        let mediaDesc = '';
        if (videos.length > 0 && images.length > 0) {
            mediaDesc = ` - ${videos.length} 影片 + ${images.length} 圖片`;
        } else if (videos.length > 1) {
            mediaDesc = ` - ${videos.length} 影片`;
        } else if (videos.length === 1 && images.length > 0) {
            mediaDesc = ` - 影片 + ${images.length} 圖片`;
        }

        return `${authorText}${mediaDesc}`;
    }

    /**
     * 建構描述
     * @param {Object} tweetData - 推文資料
     * @returns {string} 描述
     */
    buildDescription(tweetData) {
        if (tweetData.text) {
            // 限制描述長度
            const maxLength = 200;
            const text = tweetData.text.trim();

            if (text.length > maxLength) {
                return text.substring(0, maxLength) + '...';
            }

            return text;
        }

        return '混合媒體推文 - 包含影片和圖片';
    }

    /**
     * 建構額外的標籤
     * @param {string} siteName - 網站名稱
     * @param {string} originalURL - 原始URL
     * @returns {Array} 額外標籤陣列
     */
    buildAdditionalTags(siteName, originalURL) {
        return [
            `<meta property="og:site_name" content="${siteName}"/>`,
            `<meta property="twitter:site" content="@pekoembed_bot"/>`,
            `<meta name="theme-color" content="#1DA1F2"/>`,
            `<meta name="robots" content="noindex, nofollow"/>`,
            `<link rel="canonical" href="${originalURL}"/>`,

            // 防止 Discord 快取
            `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>`,
            `<meta http-equiv="Pragma" content="no-cache"/>`,
            `<meta http-equiv="Expires" content="0"/>`
        ];
    }

    /**
     * 建構重定向資訊
     * @param {string} originalURL - 原始URL
     * @returns {string} 重定向 HTML
     */
    buildRedirectInfo(originalURL) {
        if (!originalURL) {
            return '';
        }

        return `
        <script>
            // 如果是真人用戶，3秒後重定向到原始推文
            setTimeout(function() {
                if (window.location.href.indexOf('Bot') === -1) {
                    window.location.href = '${originalURL}';
                }
            }, 3000);
        </script>
        <noscript>
            <meta http-equiv="refresh" content="3;url=${originalURL}">
        </noscript>`;
    }

    /**
     * 取得基礎 HTML 模板
     * @returns {string} HTML 模板
     */
    getBaseHTMLTemplate() {
        return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {{META_TAGS}}
    <title>{{SITE_NAME}} - 混合媒體預覽</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #15202b;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            text-align: center;
            max-width: 600px;
        }
        .logo {
            width: 64px;
            height: 64px;
            margin: 0 auto 20px;
            background: #1DA1F2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        h1 {
            font-size: 24px;
            margin-bottom: 10px;
        }
        p {
            font-size: 16px;
            opacity: 0.8;
            line-height: 1.5;
        }
        .redirect-notice {
            margin-top: 30px;
            padding: 15px;
            background: rgba(29, 161, 242, 0.1);
            border-radius: 8px;
            border: 1px solid rgba(29, 161, 242, 0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎬</div>
        <h1>混合媒體預覽</h1>
        <p>這個推文包含影片和圖片。如果您在 Discord 中看到這個頁面，混合媒體應該會在上方的嵌入式訊息中正常顯示。</p>
        <div class="redirect-notice">
            <p>💡 非機器人用戶將在 3 秒後自動重定向到原始推文</p>
        </div>
    </div>
    {{REDIRECT_INFO}}
</body>
</html>`;
    }

    /**
     * 檢查是否需要使用混合媒體 HTML 模式
     * @param {string} contentType - 內容類型
     * @returns {boolean} 是否需要使用
     */
    static shouldUseMixedMediaHTML(contentType) {
        const mixedMediaTypes = [
            'multi-video',
            'video-with-images',
            'multi-video-with-images'
        ];

        return mixedMediaTypes.includes(contentType);
    }

    /**
     * 從推文資料中提取影片陣列
     * @param {Object} tweet - 推文物件
     * @returns {Array} 影片陣列
     */
    static extractVideos(tweet) {
        const videos = [];

        if (tweet.media && tweet.media.all) {
            tweet.media.all.forEach(media => {
                if (media && media.type === 'video' && media.url) {
                    videos.push({
                        url: media.url,
                        width: media.width || 720,
                        height: media.height || 480,
                        thumbnail_url: media.thumbnail_url
                    });
                }
            });
        }

        return videos;
    }

    /**
     * 從推文資料中提取圖片陣列
     * @param {Object} tweet - 推文物件
     * @returns {Array} 圖片陣列
     */
    static extractImages(tweet) {
        const images = [];

        if (tweet.media && tweet.media.all) {
            tweet.media.all.forEach(media => {
                if (media && media.type !== 'video' && media.url) {
                    images.push({
                        url: media.url,
                        width: media.width || 1200,
                        height: media.height || 675
                    });
                }
            });
        }

        return images;
    }
}

module.exports = MixedMediaHTMLBuilder;