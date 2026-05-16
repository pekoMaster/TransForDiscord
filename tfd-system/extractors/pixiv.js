/**
 * TFD 系統 - Pixiv 提取器
 * 提取 Pixiv 藝術作品和用戶資訊
 */

const HTTPClient = require('../utils/http-client');
const DOMParser = require('../../src/shared/html/dom-parser');
const TFDEmbedBuilder = require('../utils/embed-builder');
const URLConverterLogger = require('../utils/url-converter-logger');
const axios = require('axios');
const tfd = require('../../utils/tfd-logger');

// 可用的 Pixiv 圖片代理服務（按優先順序排列）
// 參考來源: https://pixivfe-docs.pages.dev/public-image-proxies/
// 🔄 供 pixiv_reload 按鈕輪替使用（同一陣列必須全域共用）
const PIXIV_PROXY_SERVICES = [
    'i.pixiv.cat',
    'i.pixiv.re',
    'i.suimoe.com',
    'pixiv.darkness.services',
    'i.yuki.sh',
    'pixiv.ducks.party',
    'pi.169889.xyz'
];

class PixivExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.domParser = new DOMParser();
        this.embedBuilder = new TFDEmbedBuilder();
        this.name = 'Pixiv';
        this.proxyServices = PIXIV_PROXY_SERVICES;
    }

    /**
     * 將單一 URL 的代理主機換成指定索引的代理（支援所有已知代理 + 原始 i.pximg.net）
     * 非圖片 URL（如 phixiv.net 備援）會原樣返回。
     */
    applyProxy(url, proxyIndex = 0) {
        if (!url || typeof url !== 'string') return url;
        const target = this.proxyServices[proxyIndex] || this.proxyServices[0];
        for (const proxy of this.proxyServices) {
            if (url.includes(proxy)) {
                return url.split(proxy).join(target);
            }
        }
        if (url.includes('i.pximg.net')) {
            return url.replace('i.pximg.net', target);
        }
        return url;
    }

    /**
     * 將 artworkData.images 裡面的所有圖片 URL 換成指定代理
     */
    applyProxyToArtwork(artworkData, proxyIndex = 0) {
        if (!artworkData || !artworkData.images) return artworkData;
        const imgs = artworkData.images;
        if (Array.isArray(imgs.allImages)) {
            imgs.allImages = imgs.allImages.map(u => this.applyProxy(u, proxyIndex));
        }
        for (const key of ['original', 'large', 'medium', 'small']) {
            if (imgs[key]) imgs[key] = this.applyProxy(imgs[key], proxyIndex);
        }
        return artworkData;
    }

    /**
     * 處理 Pixiv URL
     * @param {Object} matchResult
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'artwork':
                    return await this.extractArtwork(extractedData.artworkId, originalURL, message);
                case 'user':
                    return await this.extractUser(extractedData.userId, originalURL, message);
                case 'novel':
                    return await this.extractNovel(extractedData.novelId, originalURL, message);
                default:
                    throw new Error(`不支援的 Pixiv 模式: ${patternName}`);
            }
        } catch (error) {
            URLConverterLogger.logError('pixiv', originalURL, error.message);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取藝術作品資訊
     * @param {string} artworkId
     * @param {string} originalURL
     * @param {Object} message - Discord 訊息物件 (可選)
     * @returns {Promise<Object>}
     */
    async extractArtwork(artworkId, originalURL, message = null, proxyIndex = 0) {
        let artworkData = null;

        // 方法1: 使用 Pixiv API
        try {
            artworkData = await this.fetchArtworkFromAPI(artworkId, message);
            if (artworkData && artworkData.success && artworkData.contentType === 'url_conversion') {
                return artworkData;
            }
        } catch (error) {
            tfd.sys('TFD-Pixiv', `API 失敗: ${error.message}`);
        }

        // 方法2: 解析 HTML 頁面
        if (!artworkData) {
            try {
                artworkData = await this.fetchArtworkFromHTML(originalURL);
                if (artworkData && artworkData.success && artworkData.contentType === 'url_conversion') {
                    return artworkData;
                }
            } catch (error) {
                tfd.sys('TFD-Pixiv', `HTML 解析失敗: ${error.message}`);
            }
        }

        if (!artworkData) {
            throw new Error('無法取得作品資料');
        }

        if (proxyIndex !== 0) {
            this.applyProxyToArtwork(artworkData, proxyIndex);
        }

        return await this.createArtworkResponse(artworkData, originalURL, message, 0, proxyIndex);
    }

    /**
     * 提取用戶資訊
     * @param {string} userId
     * @param {string} originalURL
     * @returns {Promise<Object>}
     */
    async extractUser(userId, originalURL) {
        const html = await this.httpClient.fetchHTML(originalURL);
        if (!html) {
            throw new Error('無法取得用戶頁面');
        }

        const userData = this.parseUserHTML(html, userId);
        return this.createUserResponse(userData, originalURL);
    }

    /**
     * 提取小說資訊
     * @param {string} novelId
     * @param {string} originalURL
     * @returns {Promise<Object>}
     */
    async extractNovel(novelId, originalURL) {
        const html = await this.httpClient.fetchHTML(originalURL);
        if (!html) {
            throw new Error('無法取得小說頁面');
        }

        const novelData = this.parseNovelHTML(html, novelId);
        return this.createNovelResponse(novelData, originalURL);
    }

    // 完全複製測試成功的 RequestHibiApiIllust 函數邏輯
    async RequestHibiApiIllust(id) {
        // 嘗試多個 HibiAPI 端點
        const apiEndpoints = [
            `https://api.obfs.dev/api/pixiv/illust?id=${id}`,
            `https://hibiapi.getloli.com/api/pixiv/illust?id=${id}`,
            `https://hibiapi.cocomi.eu.org/api/pixiv/illust?id=${id}`,
            `https://api.lolicon.app/pixiv/illust?id=${id}`
        ];

        for (const url of apiEndpoints) {
            try {
                tfd.sys('Pixiv', `嘗試 API 端點: ${url}`);
                const response = await this.httpClient.client.get(url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Referer': 'https://www.pixiv.net/'
                    }
                });

                if (response.data && response.data.illust) {
                    tfd.sys('Pixiv', `✅ API 端點成功: ${url}`);
                    return response.data;
                }
            } catch (error) {
                tfd.sys('Pixiv', `❌ API 端點失敗: ${url} - ${error.message}`);
                continue;
            }
        }

        // 如果 HibiAPI 都失敗，嘗試直接從 Pixiv 抓取
        tfd.sys('Pixiv', '🔄 嘗試直接從 Pixiv 獲取資料...');
        return await this.RequestPixivDirect(id);
    }

    // 備用方案：直接從 Pixiv 抓取資料
    async RequestPixivDirect(id) {
        try {
            const url = `https://www.pixiv.net/ajax/illust/${id}`;
            const response = await this.httpClient.client.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': `https://www.pixiv.net/artworks/${id}`
                }
            });

            if (response.data && response.data.body) {
                // 轉換為 HibiAPI 格式
                const pixivData = response.data.body;
                const hibiFormat = {
                    illust: {
                        id: parseInt(id),
                        title: pixivData.title,
                        type: pixivData.illustType === 2 ? 'ugoira' : 'illust',
                        caption: pixivData.description,
                        sanity_level: pixivData.sl || 2,
                        page_count: pixivData.pageCount,
                        total_view: pixivData.viewCount,
                        total_bookmarks: pixivData.bookmarkCount,
                        user: {
                            name: pixivData.userName,
                            account: pixivData.userId.toString()
                        },
                        meta_single_page: {},
                        meta_pages: []
                    }
                };

                // 處理圖片 URL
                if (pixivData.pageCount === 1) {
                    // 單圖
                    const originalUrl = pixivData.urls?.original ||
                                      pixivData.urls?.regular?.replace('_webp', '').replace('c/600x600/', '') ||
                                      `https://i.pximg.net/img-original/img/${pixivData.createDate.split('T')[0].replace(/-/g, '/')}/${pixivData.createDate.split('T')[1].split(':').slice(0,2).join('/')}/${id}_p0.jpg`;

                    hibiFormat.illust.meta_single_page.original_image_url = originalUrl;
                } else {
                    // 多圖 - 建構圖片 URL
                    for (let i = 0; i < pixivData.pageCount; i++) {
                        const originalUrl = `https://i.pximg.net/img-original/img/${pixivData.createDate.split('T')[0].replace(/-/g, '/')}/${pixivData.createDate.split('T')[1].split(':').slice(0,2).join('/')}/${id}_p${i}.jpg`;

                        hibiFormat.illust.meta_pages.push({
                            image_urls: {
                                original: originalUrl
                            }
                        });
                    }
                }

                tfd.sys('Pixiv', '✅ 直接從 Pixiv 獲取資料成功');
                return hibiFormat;
            } else {
                throw new Error('無效的 Pixiv 回應格式');
            }
        } catch (error) {
            tfd.sysError('Pixiv', `❌ 直接從 Pixiv 獲取失敗: ${error.message}`);
            throw error;
        }
    }

    // 完全複製測試成功的 ParseHibiApiIllust 函數邏輯
    ParseHibiApiIllust(illustResp) {
        if (!illustResp || illustResp.error) {
            return { success: false, error: '無效的回應資料' };
        }

        const illust = illustResp.illust;
        if (!illust) {
            return { success: false, error: '找不到作品資料' };
        }

        const ugoira = illust.type === "ugoira";
        const nsfw = illust.sanity_level >= 5;
        const urls = [];

        tfd.sys('Pixiv', `作品類型: ${illust.type}`);
        tfd.sys('Pixiv', `Sanity Level: ${illust.sanity_level} (NSFW: ${nsfw})`);
        tfd.sys('Pixiv', `頁數: ${illust.page_count}`);

        // 按照 picsiv-master 的邏輯處理圖片 URL
        // 可用的 Pixiv 圖片代理服務（按優先順序排列）
        // 經測試確認可用: 2026-02-09
        const r18ProxyServices = [
            'i.pixiv.cat',
            'i.pixiv.re',
            'i.suimoe.com',
            'pixiv.darkness.services',
            'i.yuki.sh',
            'pixiv.ducks.party',
            'pi.169889.xyz'
        ];
        const selectedProxy = r18ProxyServices[0]; // 使用第一個代理

        if (illust.meta_single_page && illust.meta_single_page.original_image_url && illust.meta_single_page.original_image_url !== "") {
            // 單圖處理
            const rawImageUrl = illust.meta_single_page.original_image_url;
            tfd.sys('Pixiv', `單圖原始 URL: ${rawImageUrl}`);

            const path = rawImageUrl.split("https://i.pximg.net/")[1];
            const mirrorUrl = `https://${selectedProxy}/${path}`;
            urls.push(mirrorUrl);

            tfd.sys('Pixiv', `轉換後 URL: ${mirrorUrl}`);
        } else if (illust.meta_pages && illust.meta_pages.length > 0) {
            // 多圖處理
            tfd.sys('Pixiv', `多圖作品，共 ${illust.meta_pages.length} 張圖片`);

            illust.meta_pages.forEach((page, index) => {
                const rawImageUrl = page.image_urls.original;
                tfd.sys('Pixiv', `圖片 ${index + 1} 原始 URL: ${rawImageUrl}`);

                const path = rawImageUrl.split("https://i.pximg.net/")[1];
                const mirrorUrl = `https://${selectedProxy}/${path}`;
                urls.push(mirrorUrl);

                tfd.sys('Pixiv', `圖片 ${index + 1} 轉換後 URL: ${mirrorUrl}`);
            });
        } else {
            return { success: false, error: '找不到圖片資料' };
        }

        return {
            success: true,
            nsfw: nsfw,
            urls: urls,
            ugoira: ugoira,
            title: illust.title,
            caption: illust.caption || illust.description || '',
            author: {
                name: illust.user.name,
                account: illust.user.account
            },
            // 支援不同的欄位名稱格式 (HibiAPI vs Pixiv API)
            totalView: illust.total_view || illust.totalView || illust.viewCount || 0,
            totalBookmarks: illust.total_bookmarks || illust.totalBookmarks || illust.bookmarkCount || 0,
            totalLikes: illust.total_likes || illust.likeCount || 0,
            pageCount: illust.page_count || illust.pageCount || 1,
            tags: illust.tags || []
        };
    }

    /**
     * 從 API 取得作品資料
     * @param {string} artworkId
     * @param {Object} message - Discord 訊息物件 (可選，用於 R18 日誌)
     * @returns {Promise<Object>}
     */
    async fetchArtworkFromAPI(artworkId, message = null) {
        // 嘗試多種 API 端點
        const apiURLs = [
            `https://www.pixiv.net/ajax/illust/${artworkId}`,
            `https://pixiv.net/ajax/illust/${artworkId}`
        ];

        let data = null;
        for (const apiURL of apiURLs) {
            try {
                data = await this.httpClient.fetchJSON(apiURL);
                if (data && !data.error && data.body) {
                    break;
                }
            } catch (error) {
                tfd.sys('TFD-Pixiv', `API 端點失敗: ${apiURL}`);
                continue;
            }
        }

        if (!data || data.error || !data.body) {
            throw new Error('API 回應無效或所有端點都無法訪問');
        }

        const illust = data.body;

        // R18 內容處理
        if (illust.xRestrict > 0) {
            // 公開版預設停用 R18 預覽（避免將敏感內容上傳到陌生伺服器/cache 頻道）
            // 啟用方式：設定環境變數 PIXIV_R18_ENABLED=1
            const r18Enabled = process.env.PIXIV_R18_ENABLED === '1' || process.env.PIXIV_R18_ENABLED === 'true';
            if (!r18Enabled) {
                tfd.sys('Pixiv', `偵測到 R18 內容（artwork ${artworkId}），公開版預設略過`);
                return null;
            }

            tfd.sys('Pixiv', `🚀 開始測試 picsiv-master 方法...`);
            tfd.sys('Pixiv', `📎 目標作品: https://www.pixiv.net/artworks/${artworkId}`);
            tfd.sys('Pixiv', '📡 調用 HibiAPI...');

            // 步驟 1: 調用 HibiAPI
            const illustResp = await this.RequestHibiApiIllust(artworkId);

            tfd.sys('Pixiv', '✅ API 回應成功');
            tfd.sys('Pixiv', '📋 原始資料預覽:');
            tfd.sys('Pixiv', `  - 作品標題: ${illustResp.illust?.title || 'N/A'}`);
            tfd.sys('Pixiv', `  - 作者: ${illustResp.illust?.user?.name || 'N/A'}`);
            tfd.sys('Pixiv', `  - 頁數: ${illustResp.illust?.page_count || 'N/A'}`);

            // 步驟 2: 解析資料
            tfd.sys('Pixiv', '\n🔍 解析作品資料...');
            const parsedResult = this.ParseHibiApiIllust(illustResp);

            if (!parsedResult.success) {
                throw new Error(parsedResult.error);
            }

            tfd.sys('Pixiv', '✅ 解析成功');
            tfd.sys('Pixiv', `📊 作品資訊:`);
            tfd.sys('Pixiv', `  - 標題: ${parsedResult.title}`);
            tfd.sys('Pixiv', `  - 作者: ${parsedResult.author.name} (@${parsedResult.author.account})`);
            tfd.sys('Pixiv', `  - R18: ${parsedResult.nsfw ? 'Yes' : 'No'}`);
            tfd.sys('Pixiv', `  - 動圖: ${parsedResult.ugoira ? 'Yes' : 'No'}`);
            tfd.sys('Pixiv', `  - 圖片數量: ${parsedResult.urls.length}`);
            tfd.sys('Pixiv', `  - 觀看數: ${parsedResult.totalView}`);
            tfd.sys('Pixiv', `  - 收藏數: ${parsedResult.totalBookmarks}`);

            // R18 日誌已移除，統一使用 embed 顯示

            tfd.sys('Pixiv', '\n🎉 測試完成！');
            tfd.sys('Pixiv', `📋 總結:`);
            tfd.sys('Pixiv', `  - 成功提取 ${parsedResult.urls.length} 張圖片`);
            tfd.sys('Pixiv', `  - R18 狀態: ${parsedResult.nsfw ? '是' : '否'}`);
            tfd.sys('Pixiv', `  - 所有 URL 已轉換為 Pixiv 代理`);

            // 構建標準作品資料格式
            const r18ArtworkData = {
                id: artworkId,
                title: parsedResult.title || illustResp.illust?.title || `Pixiv ${artworkId}`,
                description: parsedResult.caption || illustResp.illust?.caption || illustResp.illust?.description || '',
                artist: {
                    name: parsedResult.author?.name || illustResp.illust?.user?.name || 'Unknown Artist',
                    id: parsedResult.author?.account || illustResp.illust?.user?.id || artworkId
                },
                // 優先使用 parsedResult.tags（已處理多種格式），否則從 illustResp 解析
                tags: this.safeParseTags(parsedResult.tags) || this.safeParseTags(illustResp.illust?.tags) || [],
                images: {
                    original: parsedResult.urls[0] || '',
                    large: parsedResult.urls[0] || '',
                    medium: parsedResult.urls[0] || '',
                    small: parsedResult.urls[0] || '',
                    allImages: parsedResult.urls || []
                },
                pageCount: parsedResult.pageCount || parsedResult.urls.length || illustResp.illust?.page_count || 1,
                width: illustResp.illust?.width || 0,
                height: illustResp.illust?.height || 0,
                // 使用 parsedResult 中已處理多種欄位名稱格式的資料
                viewCount: parsedResult.totalView || illustResp.illust?.total_view || illustResp.illust?.viewCount || 0,
                bookmarkCount: parsedResult.totalBookmarks || illustResp.illust?.total_bookmarks || illustResp.illust?.bookmarkCount || 0,
                likeCount: parsedResult.totalLikes || illustResp.illust?.total_likes || illustResp.illust?.likeCount || 0,
                createDate: illustResp.illust?.create_date || illustResp.illust?.createDate || '',
                isR18: true,
                type: parsedResult.ugoira ? 2 : (illustResp.illust?.type === 'ugoira' ? 2 : 0)
            };

            // 返回原始資料，讓 extractArtwork 統一處理快取和回應格式
            return r18ArtworkData;
        }

        // 安全處理 tags 陣列
        const tags = this.safeParseTags(illust.tags);

        // 處理圖片 URL - 優先使用 Pages API 對於多頁作品
        let imageURL = null;
        const allImages = [];
        // 可用的 Pixiv 圖片代理服務（按優先順序排列）
        // 參考來源: https://pixivfe-docs.pages.dev/public-image-proxies/
        // 經測試確認可用: 2026-02-09
        const proxyServices = [
            'i.pixiv.cat',
            'i.pixiv.re',
            'i.suimoe.com',
            'pixiv.darkness.services',
            'i.yuki.sh',
            'pixiv.ducks.party',
            'pi.169889.xyz'
        ];

        // 方法1: 對於多頁作品，使用 Pages API 獲取所有頁面
        if (illust.pageCount > 1) {
            try {
                // LOG removed for simplicity
                const pagesData = await this.fetchPagesFromAPI(artworkId);

                if (pagesData && pagesData.length > 0) {
                    // 使用 Pages API 的結果，優先使用 regular (master1200) 格式
                    pagesData.forEach((page, index) => {
                        const selectedURL = page.urls.regular || page.urls.small || page.urls.original;
                        if (selectedURL) {
                            const proxyURL = selectedURL.replace('i.pximg.net', proxyServices[0]);
                            allImages.push(proxyURL);
                        }
                    });

                    imageURL = allImages[0]; // 第一張作為主圖
                    // LOG removed for simplicity
                } else {
                    throw new Error('Pages API 回應為空');
                }
            } catch (error) {
                // LOG removed for simplicity
            }
        }

        // 方法2: 使用基本 API 的 URLs（主要用於單張圖片）
        if (!imageURL && illust.urls) {
            // 優先使用 regular 或 original 尺寸
            const baseURL = illust.urls.regular || illust.urls.original || illust.urls.small;

            if (baseURL) {
                // 選擇第一個代理服務
                imageURL = baseURL.replace('i.pximg.net', proxyServices[0]);

                // 如果是多張圖片但 Pages API 失敗，嘗試生成 URL
                if (illust.pageCount > 1 && allImages.length === 0) {
                    for (let i = 0; i < illust.pageCount; i++) {
                        // 生成每一頁的正確 URL
                        const pageURL = baseURL.replace('_p0_', `_p${i}_`).replace('i.pximg.net', proxyServices[0]);
                        allImages.push(pageURL);
                    }
                } else if (allImages.length === 0) {
                    allImages.push(imageURL);
                }

                // LOG removed for simplicity
                // LOG removed for simplicity
                // LOG removed for simplicity
            }
        }

        // 方法2.5: 如果基本 API 沒有 URLs，強制使用 Pages API（Pixiv API 規格變更）
        if (!imageURL) {
            try {
                tfd.sys('Pixiv', `基本 API 無 URLs，嘗試 Pages API (單張圖片)`);
                const pagesData = await this.fetchPagesFromAPI(artworkId);

                if (pagesData && pagesData.length > 0) {
                    // 使用 Pages API 的結果
                    pagesData.forEach((page, index) => {
                        const selectedURL = page.urls.regular || page.urls.small || page.urls.original;
                        if (selectedURL) {
                            const proxyURL = selectedURL.replace('i.pximg.net', proxyServices[0]);
                            allImages.push(proxyURL);
                        }
                    });

                    imageURL = allImages[0]; // 第一張作為主圖
                    tfd.sys('Pixiv', `✅ Pages API 成功獲取 ${allImages.length} 張圖片`);
                }
            } catch (error) {
                tfd.sys('Pixiv', `Pages API 也失敗: ${error.message}`);
            }
        }

        // 方法3: 直接使用 phixiv.net 備援 - 如果所有方法都失敗
        if (!imageURL && illust.id) {
            tfd.sys('Pixiv', `所有 API 都無法獲取圖片 URLs，使用 phixiv.net 代理服務`);

            // phixiv.net 會自動處理圖片載入和預覽，最可靠的方案
            imageURL = `https://phixiv.net/artworks/${illust.id}`;
            allImages.push(imageURL);

            tfd.sys('Pixiv', `phixiv URL: ${imageURL}`);
        }

        // LOG removed for simplicity

        return {
            id: illust.id,
            title: illust.title,
            description: illust.description,
            artist: {
                name: illust.userName,
                id: illust.userId
            },
            tags: tags,
            images: {
                original: imageURL,
                large: imageURL,
                medium: imageURL,
                small: imageURL,
                allImages: allImages // 所有圖片的陣列
            },
            pageCount: illust.pageCount || 1,
            width: illust.width,
            height: illust.height,
            viewCount: illust.viewCount || 0,
            bookmarkCount: illust.bookmarkCount || 0,
            likeCount: illust.likeCount || 0,
            createDate: illust.createDate,
            isR18: illust.xRestrict > 0,
            type: illust.illustType // 0: 插畫, 2: 動圖
        };
    }

    /**
     * 從 Pages API 獲取多頁作品的所有頁面
     * @param {string} artworkId
     * @returns {Promise<Array>}
     */
    async fetchPagesFromAPI(artworkId) {
        const pagesAPIURLs = [
            `https://www.pixiv.net/ajax/illust/${artworkId}/pages`,
            `https://pixiv.net/ajax/illust/${artworkId}/pages`
        ];

        for (const apiURL of pagesAPIURLs) {
            try {
                const data = await this.httpClient.fetchJSON(apiURL);
                if (data && !data.error && data.body && Array.isArray(data.body)) {
                    // LOG removed for simplicity
                    return data.body;
                }
            } catch (error) {
                // LOG removed for simplicity
                continue;
            }
        }

        throw new Error('所有 Pages API 端點都無法訪問');
    }

    /**
     * 從 HTML 解析作品資料
     * @param {string} url
     * @returns {Promise<Object>}
     */
    async fetchArtworkFromHTML(url) {
        const html = await this.httpClient.fetchHTML(url);
        if (!html) {
            throw new Error('無法取得 HTML 內容');
        }

        const metadata = this.domParser.extractMetadata(html);

        // 嘗試從 preload 資料中提取
        const preloadData = this.extractPreloadData(html);

        const artworkId = this.extractIdFromURL(url);

        // 檢查是否為 R18 內容（從 preloadData）
        if (preloadData.xRestrict > 0) {
            const phixivUrl = `https://www.phixiv.net/artworks/${artworkId}`;

            // 記錄網址轉換 (需要從上級函式傳遞 message)
            URLConverterLogger.logConversion('pixiv', message, phixivUrl);

            return {
                success: true,
                contentType: 'url_conversion', // 標記為 URL 轉換類型
                siteName: 'pixiv',
                convertedURL: phixivUrl,
                isR18: true,
                data: preloadData // 保留基本資料
            };
        }

        // 改進圖片 URL 處理
        let imageURL = metadata.image || '';
        if (!imageURL && artworkId) {
            // 使用代理服務
            imageURL = `https://i.pixiv.re/${artworkId}.jpg`;
        }

        // 處理多張圖片的情況 (HTML 解析)
        const allImages = [];
        const pageCount = preloadData.pageCount || 1;
        if (pageCount > 1) {
            for (let i = 0; i < pageCount; i++) {
                allImages.push(`https://i.pixiv.re/${artworkId}-${i + 1}.jpg`);
            }
        } else {
            allImages.push(imageURL);
        }

        return {
            id: artworkId,
            title: metadata.title || preloadData.title || '',
            description: metadata.description || preloadData.description || '',
            artist: {
                name: metadata.author || preloadData.userName || '',
                id: preloadData.userId || ''
            },
            tags: this.safeParseTags(preloadData.tags),
            images: {
                original: imageURL,
                large: imageURL,
                medium: imageURL,
                small: imageURL,
                allImages: allImages
            },
            pageCount: preloadData.pageCount || 1,
            width: preloadData.width || 0,
            height: preloadData.height || 0,
            viewCount: preloadData.viewCount || 0,
            bookmarkCount: preloadData.bookmarkCount || 0,
            likeCount: preloadData.likeCount || 0,
            createDate: metadata.publishedTime || preloadData.createDate || '',
            isR18: preloadData.xRestrict > 0 || false,
            type: preloadData.illustType || 0
        };
    }

    /**
     * 從 HTML 中提取 preload 資料
     * @param {string} html
     * @returns {Object}
     */
    extractPreloadData(html) {
        try {
            // Pixiv 會在頁面中包含 JSON 資料
            const preloadRegex = /window\.globalInitData\s*=\s*({.+?});/;
            const match = html.match(preloadRegex);

            if (match) {
                const data = JSON.parse(match[1]);
                const illust = Object.values(data.preload?.illust || {})[0];

                if (illust) {
                    return {
                        title: illust.title || '',
                        description: illust.description || '',
                        userName: illust.userName || '',
                        userId: illust.userId || '',
                        tags: this.safeParseTags(illust.tags),
                        pageCount: illust.pageCount || 1,
                        width: illust.width || 0,
                        height: illust.height || 0,
                        viewCount: illust.viewCount || 0,
                        bookmarkCount: illust.bookmarkCount || 0,
                        likeCount: illust.likeCount || 0,
                        createDate: illust.createDate || '',
                        xRestrict: illust.xRestrict || 0,
                        illustType: illust.illustType || 0
                    };
                }
            }
        } catch (error) {
            // 解析失敗不影響主要流程
        }

        return {};
    }

    /**
     * 解析用戶 HTML
     * @param {string} html
     * @param {string} userId
     * @returns {Object}
     */
    parseUserHTML(html, userId) {
        const metadata = this.domParser.extractMetadata(html);

        return {
            id: userId,
            name: metadata.title?.replace(' - pixiv', '') || '',
            description: metadata.description || '',
            avatar: metadata.image || '',
            followersCount: 0,
            worksCount: 0
        };
    }

    /**
     * 解析小說 HTML
     * @param {string} html
     * @param {string} novelId
     * @returns {Object}
     */
    parseNovelHTML(html, novelId) {
        const metadata = this.domParser.extractMetadata(html);

        return {
            id: novelId,
            title: metadata.title || '',
            description: metadata.description || '',
            author: metadata.author || '',
            tags: [],
            createDate: metadata.publishedTime || ''
        };
    }

    /**
     * 建立藝術作品回應
     * @param {Object} artworkData
     * @param {string} originalURL
     * @param {Object} message Discord 訊息物件 (可選，用於 MP4 處理)
     * @param {number} currentPage 當前頁面（從 0 開始）
     * @returns {Promise<Object>}
     */
    async createArtworkResponse(artworkData, originalURL, message = null, currentPage = 0, proxyIndex = 0) {
        const typeEmoji = artworkData.type === 2 ? '🎬' : '🎨';
        const typeText = artworkData.type === 2 ? '動圖' : '插畫';

        // 處理多圖片情況 - 每頁 1 張圖（Pixiv 使用按鈕翻頁，圖片在 embed 內）
        const allImages = artworkData.images?.allImages || [artworkData.images?.medium || artworkData.images?.large].filter(Boolean);
        const imagesPerPage = 1; // Pixiv：一頁一張圖
        const totalImages = allImages.length;
        const totalPages = totalImages; // 總頁數 = 總圖片數

        // 取得當前頁面的圖片
        const currentImage = allImages[currentPage] || allImages[0];

        // 設定標題 - 顯示頁面資訊（如果超過 1 張）
        const safeTitle = artworkData.title || artworkData.id || 'Pixiv 作品';
        let title = `${typeEmoji} ${safeTitle}`;
        if (totalImages > 1) {
            title += ` (${currentPage + 1}/${totalImages})`;
        }

        // 決定要顯示的圖片：當前頁面的圖片（圖片顯示在 embed 內）
        let displayImage = currentImage;
        let attachmentFile = null;

        // 對於 R18 內容，使用 phixiv.net URL
        const embedURL = artworkData.isR18 ?
            `https://phixiv.net/artworks/${artworkData.id}` :
            originalURL;

        const embed = this.embedBuilder.createArtworkEmbed({
            title: title,
            description: this.formatDescription(artworkData.description),
            url: embedURL,
            color: this.embedBuilder.getSiteColor('pixiv'),
            author: {
                name: artworkData.artist?.name || 'Unknown Artist',
                iconURL: null,
                url: `https://www.pixiv.net/users/${artworkData.artist?.id || ''}`
            },
            image: displayImage,
            timestamp: artworkData.createDate,
            artist: artworkData.artist?.name || 'Unknown Artist', // 字串格式，供 createArtworkEmbed 使用
            tags: artworkData.tags || [], // 添加標籤
            viewCount: artworkData.viewCount || 0,
            bookmarkCount: artworkData.bookmarkCount || 0,
            dimensions: artworkData.width && artworkData.height ? `${artworkData.width}×${artworkData.height}` : '未知尺寸',
            footer: {
                text: `Pixiv ${typeText}${artworkData.isR18 ? ' (R-18)' : ''}`,
                iconURL: 'https://www.pixiv.net/favicon.ico'
            }
        });

        // 添加統計資訊
        const fields = [];

        if (artworkData.viewCount > 0) {
            fields.push({
                name: '👁️ 瀏覽',
                value: this.embedBuilder.formatNumber(artworkData.viewCount),
                inline: true
            });
        }

        if (artworkData.likeCount > 0) {
            fields.push({
                name: '😊 讚',
                value: this.embedBuilder.formatNumber(artworkData.likeCount),
                inline: true
            });
        }

        if (artworkData.bookmarkCount > 0) {
            fields.push({
                name: '❤️ 收藏',
                value: this.embedBuilder.formatNumber(artworkData.bookmarkCount),
                inline: true
            });
        }

        if (artworkData.pageCount > 1) {
            fields.push({
                name: '📄 頁數',
                value: artworkData.pageCount.toString(),
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // Pixiv 圖片顯示邏輯（統一使用分頁按鈕）：
        // - 1張：圖片嵌在 embed 中，無分頁按鈕
        // - 2張以上：圖片嵌在 embed 中，使用分頁按鈕切換
        // 圖片始終顯示在 embed 內（與 Twitter 多 embed 方式不同）

        // 設定 embed 圖片為當前頁的圖片
        if (displayImage) {
            embed.setImage(displayImage);
        }

        return {
            success: true,
            embed: embed,
            siteName: 'pixiv',
            contentType: artworkData.isR18 ? 'r18_artwork' : 'artwork',
            data: artworkData,
            multipleImages: null, // Pixiv 不使用多 Embeds 顯示
            // 移除 GIF 附件資訊（改用 MP4 系統）
            attachments: null,
            // 翻頁功能相關資訊 - 2張以上就使用分頁按鈕
            pagination: {
                currentPage: currentPage,
                totalPages: totalPages,
                hasMultiplePages: totalImages >= 2, // 2張以上就顯示翻頁按鈕
                artworkId: artworkData.id,
                originalURL: originalURL,
                totalImages: totalImages,
                imagesPerPage: 1, // 每頁1張
                allImages: allImages // 傳遞所有圖片陣列供翻頁使用
            },
            // 🔄 重新整理按鈕元資料（由 sender 建立按鈕）
            reloadMeta: {
                artworkId: artworkData.id,
                proxyIndex: proxyIndex,
                nextProxyIndex: (proxyIndex + 1) % this.proxyServices.length
            }
        };
    }

    /**
     * 建立用戶回應
     * @param {Object} userData
     * @param {string} originalURL
     * @returns {Object}
     */
    createUserResponse(userData, originalURL) {
        const embed = this.embedBuilder.createBasicEmbed({
            title: `👤 ${userData.name}`,
            description: userData.description,
            url: originalURL,
            color: this.embedBuilder.getSiteColor('pixiv'),
            thumbnail: userData.avatar,
            footer: {
                text: 'Pixiv 用戶',
                iconURL: 'https://www.pixiv.net/favicon.ico'
            }
        });

        return {
            success: true,
            embed: embed,
            siteName: 'pixiv',
            contentType: 'user',
            data: userData
        };
    }

    /**
     * 建立小說回應
     * @param {Object} novelData
     * @param {string} originalURL
     * @returns {Object}
     */
    createNovelResponse(novelData, originalURL) {
        const embed = this.embedBuilder.createBasicEmbed({
            title: `📚 ${novelData.title}`,
            description: this.formatDescription(novelData.description),
            url: originalURL,
            color: this.embedBuilder.getSiteColor('pixiv'),
            author: {
                name: novelData.author,
                iconURL: null
            },
            timestamp: novelData.createDate,
            footer: {
                text: 'Pixiv 小說',
                iconURL: 'https://www.pixiv.net/favicon.ico'
            }
        });

        return {
            success: true,
            embed: embed,
            siteName: 'pixiv',
            contentType: 'novel',
            data: novelData
        };
    }

    /**
     * 建立錯誤回應
     * @param {string} message
     * @param {string} url
     * @returns {Object}
     */
    createErrorResponse(message, url) {
        return {
            success: false,
            error: message,
            embed: this.embedBuilder.createErrorEmbed(`Pixiv 取得失敗: ${message}`, url),
            siteName: 'pixiv'
        };
    }

    /**
     * 格式化描述文字
     * @param {string} description
     * @returns {string}
     */
    formatDescription(description) {
        if (!description) return '';

        return description
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
            .substring(0, 500);
    }

    /**
     * 安全解析 tags 陣列
     * 支援多種格式：
     * - 字串陣列: ["tag1", "tag2"]
     * - Pixiv API 格式: { tags: [{ tag: "tagName" }, ...] }
     * - HibiAPI 格式: [{ name: "tagName" }, ...]
     * - 混合格式: [{ tag: "tagName", translated_name: "..." }, ...]
     * @param {any} tags
     * @returns {string[]}
     */
    safeParseTags(tags) {
        if (!tags) {
            return [];
        }

        // 如果 tags 是物件且有 tags 屬性（Pixiv API 格式）
        if (tags && typeof tags === 'object' && !Array.isArray(tags) && tags.tags) {
            tags = tags.tags;
        }

        if (!Array.isArray(tags)) {
            return [];
        }

        return tags.map(tag => {
            // 已經是字串
            if (typeof tag === 'string') {
                return tag;
            }
            // 物件格式
            if (tag && typeof tag === 'object') {
                // 優先順序：tag > name > translated_name
                if (tag.tag && typeof tag.tag === 'string') {
                    return tag.tag;
                }
                if (tag.name && typeof tag.name === 'string') {
                    return tag.name;
                }
                if (tag.translated_name && typeof tag.translated_name === 'string') {
                    return tag.translated_name;
                }
            }
            // 無法解析的格式，跳過（不要使用 String(tag) 避免 [object Object]）
            return null;
        }).filter(tag => tag && tag.length > 0);
    }

    /**
     * 從快取資料創建作品回應
     * @param {Object} cachedData - 快取的資料
     * @param {string} originalURL - 原始網址
     * @param {number} currentPage - 當前頁面 (預設第一頁)
     * @returns {Object}
     */
    createArtworkResponseFromCache(cachedData, originalURL, currentPage = 0, proxyIndex = null) {
        const artworkData = cachedData.artworkData;
        const totalImages = cachedData.totalImages || cachedData.allImages?.length || 1;

        // 取得當前頁面的圖片（每頁1張）
        const currentImage = cachedData.allImages?.[currentPage] || cachedData.allImages?.[0];

        if (!currentImage) {
            throw new Error(`快取中沒有第 ${currentPage + 1} 張圖片`);
        }

        const typeEmoji = artworkData.type === 2 ? '🎬' : '🎨';
        const typeText = artworkData.type === 2 ? '動圖' : '插畫';

        // 設定標題 - 顯示頁面資訊（如果超過 1 張）
        const safeTitle = artworkData.title || artworkData.id || 'Pixiv 作品';
        let title = `${typeEmoji} ${safeTitle}`;
        if (totalImages > 1) {
            title += ` (${currentPage + 1}/${totalImages})`;
        }

        // 對於 R18 內容，使用 phixiv.net URL
        const embedURL = artworkData.isR18 ?
            `https://phixiv.net/artworks/${artworkData.id}` :
            originalURL;

        const embed = this.embedBuilder.createArtworkEmbed({
            title: title,
            description: this.formatDescription(artworkData.description), // 使用格式化後的描述
            url: embedURL,
            color: this.embedBuilder.getSiteColor('pixiv'),
            author: {
                name: artworkData.artist?.name || 'Unknown Artist',
                iconURL: artworkData.artist?.avatar || null,
                url: `https://www.pixiv.net/users/${artworkData.artist?.id || ''}`
            },
            image: currentImage, // 當前圖片（每頁1張）
            timestamp: artworkData.createDate || new Date().toISOString(),
            artist: artworkData.artist?.name || 'Unknown Artist',
            tags: artworkData.tags || [], // 添加標籤
            viewCount: artworkData.viewCount || 0,
            bookmarkCount: artworkData.bookmarkCount || 0,
            dimensions: artworkData.dimensions || null, // 使用快取中的尺寸
            footer: {
                text: `Pixiv ${typeText}${artworkData.isR18 ? ' (R-18)' : ''}`,
                iconURL: 'https://www.pixiv.net/favicon.ico'
            }
        });

        // 添加統計資訊（與主函式相同）
        const fields = [];

        if (artworkData.viewCount > 0) {
            fields.push({
                name: '👁️ 瀏覽',
                value: this.embedBuilder.formatNumber(artworkData.viewCount),
                inline: true
            });
        }

        if (artworkData.likeCount > 0) {
            fields.push({
                name: '😊 讚',
                value: this.embedBuilder.formatNumber(artworkData.likeCount),
                inline: true
            });
        }

        if (artworkData.bookmarkCount > 0) {
            fields.push({
                name: '❤️ 收藏',
                value: this.embedBuilder.formatNumber(artworkData.bookmarkCount),
                inline: true
            });
        }

        if (cachedData.totalImages > 1) {
            fields.push({
                name: '📄 圖片',
                value: `${cachedData.totalImages} 張`,
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // 解析 proxyIndex：顯式傳入的值優先，否則用快取紀錄
        const effectiveProxyIndex = typeof proxyIndex === 'number'
            ? proxyIndex
            : (typeof cachedData.proxyIndex === 'number' ? cachedData.proxyIndex : 0);

        return {
            success: true,
            embed: embed,
            siteName: 'pixiv',
            contentType: artworkData.isR18 ? 'r18_artwork' : 'artwork',
            data: artworkData,
            multipleImages: null, // Pixiv 不使用多 Embeds 顯示
            attachments: null,
            fromCache: true, // 標記來自快取
            pagination: {
                currentPage: currentPage,
                totalPages: cachedData.totalImages, // 總頁數 = 總圖片數
                hasMultiplePages: cachedData.totalImages >= 2, // 2張以上就顯示翻頁按鈕
                artworkId: artworkData.id,
                originalURL: originalURL,
                totalImages: cachedData.totalImages,
                imagesPerPage: 1, // 每頁1張
                allImages: cachedData.allImages // 傳遞所有圖片陣列供翻頁使用
            },
            // 🔄 重新整理按鈕元資料
            reloadMeta: {
                artworkId: artworkData.id,
                proxyIndex: effectiveProxyIndex,
                nextProxyIndex: (effectiveProxyIndex + 1) % this.proxyServices.length
            }
        };
    }

    /**
     * 從 URL 提取作品 ID
     * @param {string} url
     * @returns {string}
     */
    extractIdFromURL(url) {
        const match = url.match(/artworks\/(\d+)/);
        return match ? match[1] : '';
    }

    /**
     * 驗證圖片 URL 是否可訪問
     * @param {string} url - 圖片 URL
     * @returns {Promise<boolean>} - 是否可訪問
     */
    async verifyImageURL(url) {
        try {
            tfd.sys('Pixiv', `驗證圖片 URL: ${url}`);

            const response = await axios.head(url, {
                timeout: 10000,
                headers: {
                    'Referer': 'https://www.pixiv.net/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const isValid = response.status === 200;
            tfd.sys('Pixiv', `驗證結果: ${isValid ? '✅ 可訪問' : '❌ 無法訪問'}`);

            return isValid;

        } catch (error) {
            tfd.sys('Pixiv', `驗證失敗 (${error.response?.status || error.message})`);
            return false;
        }
    }
}

PixivExtractor.PROXY_SERVICES = PIXIV_PROXY_SERVICES;

module.exports = PixivExtractor;
