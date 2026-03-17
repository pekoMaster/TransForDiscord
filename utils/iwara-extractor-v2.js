/**
 * IWARA 高效提取器 V2 - 基於官方 API + 認證系統
 * 支援登入認證、高品質影片、快取機制
 */

require('dotenv').config();
const axios = require('axios');

class IwaraExtractorV2 {
    constructor() {
        this.baseURL = 'https://api.iwara.tv';
        this.username = process.env.IWARA_USERNAME;
        this.password = process.env.IWARA_PASSWORD;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.timeout = 15000;

        // 認證狀態
        this.userToken = null;
        this.tokenExpiry = null;

        // 品質優先順序 (根據你的需求：540P 優先)
        this.qualityPriority = ['540', 'Source', '720', '480', '360', 'preview'];

        // URL 快取 (6分鐘有效期)
        this.urlCache = new Map();
        this.cacheTimeout = 6 * 60 * 1000; // 6分鐘
    }

    /**
     * 檢查是否為 IWARA URL
     */
    isIwaraURL(url) {
        const patterns = [
            /https?:\/\/(?:www\.)?iwara\.tv\/video\/[a-zA-Z0-9]+(?:\/[^\/]*)?/i,
            /https?:\/\/(?:www\.)?iwara\.tv\/videos\/[a-zA-Z0-9]+/i
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    /**
     * 提取影片 ID
     */
    extractVideoId(url) {
        const patterns = [
            /iwara\.tv\/video\/([a-zA-Z0-9]+)/i,
            /iwara\.tv\/videos\/([a-zA-Z0-9]+)/i
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    /**
     * 用戶登入和獲取 token
     */
    async authenticate() {
        if (this.userToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            console.log('[IWARA V2] 使用現有有效 token');
            return true;
        }

        if (!this.username || !this.password) {
            console.log('[IWARA V2] 未提供登入資訊，使用匿名模式');
            return false;
        }

        console.log('[IWARA V2] 開始用戶認證...');

        try {
            const response = await axios.post(`${this.baseURL}/user/login`, {
                email: this.username,
                password: this.password
            }, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Content-Type': 'application/json'
                },
                timeout: this.timeout
            });

            if (response.data && response.data.token) {
                this.userToken = response.data.token;
                // JWT token 通常有效期 3 週，設定保守一點：7天
                this.tokenExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000);

                console.log('[IWARA V2] ✅ 認證成功');
                return true;
            } else {
                console.log('[IWARA V2] ❌ 認證失敗：無效回應');
                return false;
            }

        } catch (error) {
            console.error('[IWARA V2] ❌ 認證失敗:', error.message);
            if (error.response?.status === 401) {
                console.error('[IWARA V2] 帳號或密碼錯誤');
            }
            return false;
        }
    }

    /**
     * 獲取影片基本資訊
     */
    async getVideoInfo(videoId) {
        console.log(`[IWARA V2] 獲取影片資訊: ${videoId}`);

        try {
            const headers = {
                'User-Agent': this.userAgent,
                'Accept': 'application/json'
            };

            // 如果有 token，加入認證標頭
            if (this.userToken) {
                headers['Authorization'] = `Bearer ${this.userToken}`;
            }

            const response = await axios.get(`${this.baseURL}/video/${videoId}`, {
                headers: headers,
                timeout: this.timeout
            });

            const data = response.data;

            // 提取核心資訊
            const videoInfo = {
                id: data.id,
                title: data.title || '未知標題',
                description: data.body || '',
                author: {
                    name: data.user?.name || '未知作者',
                    username: data.user?.username || '',
                    avatar: data.user?.avatar?.id ? `https://i.iwara.tv/image/avatar/${data.user.avatar.id}/${data.user.avatar.id}.jpg` : null,
                    profileUrl: data.user?.username ? `https://iwara.tv/profile/${data.user.username}` : null
                },
                stats: {
                    views: data.numViews || 0,
                    likes: data.numLikes || 0,
                    comments: data.numComments || 0
                },
                media: {
                    duration: data.file?.duration || 0,
                    size: data.file?.size || 0,
                    thumbnail: data.thumbnail ? `https://i.iwara.tv/image/thumbnail/${data.id}/${data.thumbnail}.jpg` : null,
                    preview: data.preview?.id ? `https://i.iwara.tv/image/thumbnail/${data.preview.id}/${data.preview.id}.jpg` : null
                },
                metadata: {
                    createdAt: data.createdAt,
                    rating: data.rating || 'general',
                    private: data.private || false,
                    unlisted: data.unlisted || false,
                    tags: data.tags || []
                },
                fileUrl: data.fileUrl
            };

            console.log(`[IWARA V2] ✅ 成功獲取影片資訊: ${videoInfo.title}`);
            return videoInfo;

        } catch (error) {
            console.error(`[IWARA V2] ❌ 獲取影片資訊失敗: ${error.message}`);

            if (error.response?.status === 404) {
                throw new Error('影片不存在或已被刪除');
            } else if (error.response?.status === 403) {
                throw new Error('影片需要登入才能存取');
            } else {
                throw new Error(`API 請求失敗: ${error.message}`);
            }
        }
    }

    /**
     * 獲取影片檔案資訊
     */
    async getVideoFiles(fileUrl) {
        if (!fileUrl) {
            throw new Error('沒有提供檔案 URL');
        }

        console.log('[IWARA V2] 獲取影片檔案資訊...');

        try {
            const headers = {
                'User-Agent': this.userAgent,
                'Accept': 'application/json'
            };

            // 如果有 token，加入認證標頭
            if (this.userToken) {
                headers['Authorization'] = `Bearer ${this.userToken}`;
            }

            const response = await axios.get(fileUrl, {
                headers: headers,
                timeout: this.timeout
            });

            if (!Array.isArray(response.data)) {
                throw new Error('檔案 API 回應格式錯誤');
            }

            const files = response.data.map(file => ({
                id: file.id,
                quality: file.name,
                type: file.type,
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
                urls: {
                    view: file.src?.view ? (file.src.view.startsWith('//') ? 'https:' + file.src.view : file.src.view) : null,
                    download: file.src?.download ? (file.src.download.startsWith('//') ? 'https:' + file.src.download : file.src.download) : null
                }
            }));

            console.log(`[IWARA V2] ✅ 找到 ${files.length} 個品質選項: ${files.map(f => f.quality).join(', ')}`);
            return files;

        } catch (error) {
            console.error(`[IWARA V2] ❌ 獲取檔案資訊失敗: ${error.message}`);
            throw new Error(`檔案 API 請求失敗: ${error.message}`);
        }
    }

    /**
     * 選擇最佳品質
     */
    selectBestQuality(files) {
        if (!files || files.length === 0) {
            return null;
        }

        console.log('[IWARA V2] 選擇最佳品質...');
        console.log(`可用品質: ${files.map(f => f.quality).join(', ')}`);
        console.log(`優先順序: ${this.qualityPriority.join(' > ')}`);

        for (const quality of this.qualityPriority) {
            const file = files.find(f => f.quality === quality && f.urls.view);
            if (file) {
                console.log(`[IWARA V2] ✅ 選擇品質: ${quality}`);
                return file;
            }
        }

        // 如果沒有符合優先順序的，選擇第一個可用的
        const fallback = files.find(f => f.urls.view);
        if (fallback) {
            console.log(`[IWARA V2] ⚠️ 使用 fallback 品質: ${fallback.quality}`);
            return fallback;
        }

        console.log('[IWARA V2] ❌ 沒有可用的影片檔案');
        return null;
    }

    /**
     * 檢查快取
     */
    getCachedURL(videoId) {
        const cached = this.urlCache.get(videoId);
        if (cached && Date.now() < cached.expiry) {
            console.log(`[IWARA V2] 使用快取的 URL: ${cached.data.quality}`);
            return cached.data;
        }

        if (cached) {
            this.urlCache.delete(videoId);
        }
        return null;
    }

    /**
     * 儲存到快取
     */
    setCachedURL(videoId, data) {
        this.urlCache.set(videoId, {
            data: data,
            expiry: Date.now() + this.cacheTimeout
        });
        console.log(`[IWARA V2] URL 已快取，有效期 ${this.cacheTimeout / 1000} 秒`);
    }

    /**
     * 完整提取流程
     */
    async extractVideoInfo(url) {
        const startTime = Date.now();
        console.log(`[IWARA V2] 開始提取: ${url}`);

        try {
            // 檢查 URL 格式
            if (!this.isIwaraURL(url)) {
                throw new Error('不是有效的 IWARA 影片 URL');
            }

            // 提取影片 ID
            const videoId = this.extractVideoId(url);
            if (!videoId) {
                throw new Error('無法提取影片 ID');
            }

            // 檢查快取
            const cachedResult = this.getCachedURL(videoId);
            if (cachedResult) {
                return {
                    success: true,
                    fromCache: true,
                    ...cachedResult,
                    extractionTime: Date.now() - startTime
                };
            }

            // 嘗試認證
            await this.authenticate();

            // 獲取影片資訊
            const videoInfo = await this.getVideoInfo(videoId);

            // 獲取檔案資訊
            const files = await this.getVideoFiles(videoInfo.fileUrl);

            // 選擇最佳品質
            const bestFile = this.selectBestQuality(files);

            if (!bestFile) {
                throw new Error('沒有可用的影片檔案');
            }

            const result = {
                success: true,
                fromCache: false,
                videoId: videoId,
                originalURL: url,
                ...videoInfo,
                selectedFile: bestFile,
                allFiles: files,
                extractionTime: Date.now() - startTime
            };

            // 儲存到快取
            this.setCachedURL(videoId, result);

            console.log(`[IWARA V2] ✅ 提取完成，耗時: ${result.extractionTime}ms`);
            return result;

        } catch (error) {
            console.error(`[IWARA V2] ❌ 提取失敗: ${error.message}`);
            return {
                success: false,
                error: error.message,
                videoId: this.extractVideoId(url),
                originalURL: url,
                extractionTime: Date.now() - startTime
            };
        }
    }

    /**
     * 生成 Discord Embed 和預覽訊息
     */
    generateDiscordContent(extractedData) {
        if (!extractedData.success) {
            return {
                embed: {
                    color: 0xff0000,
                    title: '❌ IWARA 影片提取失敗',
                    description: `錯誤: ${extractedData.error}`,
                    url: extractedData.originalURL,
                    timestamp: new Date().toISOString()
                },
                previewMessage: null
            };
        }

        const embed = {
            color: 0x1f4e95,
            title: extractedData.title,
            url: extractedData.originalURL,
            description: extractedData.description ?
                (extractedData.description.length > 300 ?
                 extractedData.description.substring(0, 300) + '...' :
                 extractedData.description) : null,
            fields: [],
            timestamp: new Date().toISOString()
        };

        // 作者資訊
        if (extractedData.author.name) {
            embed.author = {
                name: extractedData.author.name,
                url: extractedData.author.profileUrl,
                icon_url: extractedData.author.avatar
            };
        }

        // 縮圖
        if (extractedData.media.preview || extractedData.media.thumbnail) {
            embed.image = {
                url: extractedData.media.preview || extractedData.media.thumbnail
            };
        }

        // 統計資訊
        const stats = [];
        if (extractedData.stats.views > 0) stats.push(`👁️ ${extractedData.stats.views.toLocaleString()}`);
        if (extractedData.stats.likes > 0) stats.push(`❤️ ${extractedData.stats.likes.toLocaleString()}`);
        if (extractedData.stats.comments > 0) stats.push(`💬 ${extractedData.stats.comments.toLocaleString()}`);

        if (stats.length > 0) {
            embed.fields.push({
                name: '📊 統計',
                value: stats.join(' • '),
                inline: true
            });
        }

        // 影片資訊
        const mediaInfo = [];
        if (extractedData.media.duration > 0) {
            const minutes = Math.floor(extractedData.media.duration / 60);
            const seconds = extractedData.media.duration % 60;
            mediaInfo.push(`⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
        if (extractedData.media.size > 0) {
            const sizeMB = Math.round(extractedData.media.size / 1024 / 1024);
            mediaInfo.push(`📁 ${sizeMB}MB`);
        }

        if (mediaInfo.length > 0) {
            embed.fields.push({
                name: '📹 影片',
                value: mediaInfo.join(' • '),
                inline: true
            });
        }

        // 生成分級影片連結
        const qualityLinks = this.generateQualityLinks(extractedData.allFiles);
        if (qualityLinks.length > 0) {
            embed.fields.push({
                name: '🎬 影片連結',
                value: qualityLinks.join('\n'),
                inline: false
            });
        }

        // Footer
        const footerParts = [];
        if (extractedData.fromCache) footerParts.push('⚡ 快取');
        if (extractedData.metadata && extractedData.metadata.private) footerParts.push('🔒 私人');
        if (extractedData.metadata && extractedData.metadata.unlisted) footerParts.push('🔇 未列出');
        footerParts.push(`⏱️ ${extractedData.extractionTime}ms`);

        embed.footer = {
            text: `IWARA • ${footerParts.join(' • ')}`
        };

        // 生成預覽訊息
        const previewMessage = this.generatePreviewMessage(extractedData.allFiles);

        return {
            embed: embed,
            previewMessage: previewMessage
        };
    }

    /**
     * 生成品質連結 (Source, 540P, 360P)
     */
    generateQualityLinks(allFiles) {
        const links = [];
        const priorityQualities = [
            { quality: 'Source', label: '🎯 Source', emoji: '🎯' },
            { quality: '540', label: '📺 540P', emoji: '📺' },
            { quality: '360', label: '📱 360P', emoji: '📱' }
        ];

        priorityQualities.forEach(({ quality, label, emoji }) => {
            const file = allFiles.find(f => f.quality === quality && f.urls.view);
            if (file) {
                links.push(`${emoji} [${quality === 'Source' ? 'Source' : quality + 'P'}](${file.urls.view})`);
            } else {
                links.push(`${emoji} ~~${quality === 'Source' ? 'Source' : quality + 'P'}~~ 不可用`);
            }
        });

        return links;
    }

    /**
     * 生成預覽訊息 (使用 preview 品質)
     */
    generatePreviewMessage(allFiles) {
        const previewFile = allFiles.find(f => f.quality === 'preview' && f.urls.view);

        if (previewFile) {
            return `[簡易預覽](${previewFile.urls.view})`;
        }

        return null;
    }

    /**
     * 生成 Discord Embed (向後相容)
     */
    generateEmbed(extractedData) {
        const content = this.generateDiscordContent(extractedData);
        return content.embed;
    }

    /**
     * 清理快取
     */
    clearExpiredCache() {
        const now = Date.now();
        let cleared = 0;

        for (const [key, value] of this.urlCache.entries()) {
            if (now >= value.expiry) {
                this.urlCache.delete(key);
                cleared++;
            }
        }

        if (cleared > 0) {
            console.log(`[IWARA V2] 清理了 ${cleared} 個過期快取項目`);
        }
    }
}

module.exports = IwaraExtractorV2;