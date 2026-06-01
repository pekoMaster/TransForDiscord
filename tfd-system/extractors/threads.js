/**
 * TFD 系統 - Threads 提取器
 * 使用 fixthreads.seria.moe HTTP fetch 抓取 OG meta 並建立 Discord Embed
 * 舊版 proxy 轉址邏輯保留為 _extractPostLegacy fallback
 *
 * 支援域名：threads.com
 *
 * v2.1 變更 (2026-05-29):
 * - _fetchHtml 加入 HTTP 狀態碼檢查，4xx/5xx 拋出錯誤
 * - fixthreads URL 加入 ?embed=1 參數 (與 4.0 同步)
 * - 所有貼文加入重整按鈕
 */

const TFDEmbedBuilder = require('../../src/shared/discord/embed-builder');
const { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const tfd = require('../../utils/tfd-logger');

const THREADS_COLOR = 0x000000;
const THREADS_ICON = 'https://static.cdninstagram.com/rsrc.php/ye/r/lEu8iVizmNW.ico';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let LightpandaClient = null;
try {
    LightpandaClient = require('../../src/shared/browser/lightpanda-client');
} catch (e) {
    LightpandaClient = null;
}

const https = require('https');
const http = require('http');

// -- fixthreads HTTP helper functions -----------------------------------

function _fetchHtml(url, redirectsLeft = 3) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const client = u.protocol === 'http:' ? http : https;
        client.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
            }
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
                res.resume();
                const nextUrl = new URL(res.headers.location, url).toString();
                return resolve(_fetchHtml(nextUrl, redirectsLeft - 1));
            }
            if (res.statusCode >= 400) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
        }).on('error', reject).setTimeout(15000, function () { this.destroy(); reject(new Error('timeout')); });
    });
}

function _decodeHtmlEntities(value) {
    if (!value || typeof value !== 'string') return value || null;
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .trim();
}

function _extractMeta(html, propName) {
    const propIdx = html.indexOf('"' + propName + '"');
    if (propIdx < 0) return null;
    const segment = html.slice(propIdx, propIdx + 2000);
    const cm = segment.match(/content\s*=\s*"([\s\S]*?)"\s*\/?>/i);
    if (!cm) return null;
    return _decodeHtmlEntities(cm[1]);
}

function _extractAllMeta(html, propName) {
    const results = [];
    let searchFrom = 0;
    while (true) {
        const propIdx = html.indexOf('"' + propName + '"', searchFrom);
        if (propIdx < 0) break;
        const segment = html.slice(propIdx, propIdx + 2000);
        const cm = segment.match(/content\s*=\s*"([\s\S]*?)"\s*\/?>/i);
        if (cm) results.push(_decodeHtmlEntities(cm[1]));
        searchFrom = propIdx + propName.length + 2;
    }
    return results;
}

function _parseQuote(desc) {
    const match = desc.match(/^([\s\S]*?)\u21aa Quoting @([\w.]+)\n([\s\S]*)$/);
    if (!match) return null;
    return { reposterText: match[1].trim(), originalUsername: match[2].trim(), quotedText: match[3].trim() };
}

function _generateThreadHash(url) {
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

function _isThreadsLoginMeta(title, description, canonicalUrl) {
    const titleText = (title || '').toLowerCase();
    const descText = (description || '').toLowerCase();
    const urlText = (canonicalUrl || '').replace(/\/+$/, '').toLowerCase();
    return titleText.includes('threads • log in')
        || titleText.includes('threads - log in')
        || descText.includes('join threads to share ideas')
        || urlText === 'https://www.threads.com'
        || urlText === 'https://threads.com';
}

function _extractThreadsRealName(title, username) {
    const decoded = _decodeHtmlEntities(title || '') || '';
    const match = decoded.match(/^(.+?)\s+\(@[^)]+\)\s+on Threads$/i);
    if (match) return match[1].trim();
    const name = decoded.replace(/\s+on Threads$/i, '').replace(/ \(@[^)]+\).*/, '').trim();
    if (!name || name === username || name === '@' + username) return username;
    return name;
}

// -----------------------------------------------------------------------

class ThreadsExtractor {
    static VIDEO_PROXY_PRIMARY = 'fixthreads.seria.moe';
    static VIDEO_PROXY_FALLBACK = 'www.viewthreads.com';

    constructor() {
        this.embedBuilder = new TFDEmbedBuilder();
        this.name = 'Threads';
    }

    /**
     * 處理 Threads URL
     * 失敗時只記 log，不顯示錯誤給用戶（保留原訊息）
     */
    async extract(matchResult) {
        const { patternName, extractedData, originalURL } = matchResult;

        try {
            switch (patternName) {
                case 'post': {
                    const username = (extractedData && (extractedData.username || extractedData[0])) || null;
                    const postId = (extractedData && (extractedData.postId || extractedData[1])) || null;
                    return await this.extractPost(username, postId, originalURL);
                }
                case 'profile': {
                    const username = (extractedData && (extractedData.username || extractedData[0])) || null;
                    return await this.extractProfile(username, originalURL);
                }
                default:
                    throw new Error(`不支援的 Threads 模式: ${patternName}`);
            }
        } catch (error) {
            tfd.sysError('TFD-Threads', `提取失敗: ${error.message}`);
            // 回傳失敗但不顯示錯誤 embed，讓呼叫端決定是否保留原訊息
            return { success: false, siteName: 'threads', error: error.message };
        }
    }

    /**
     * 提取貼文資訊（新版：fixthreads HTTP fetch）
     * 失敗時自動 fallback 到舊版 proxy 轉址
     */
    async extractPost(username, postId, originalURL) {
        try {
            tfd.sys('TFD-Threads', `抓取貼文: @${username}/post/${postId}`);

            const cleanUsername = String(username || '').replace(/^@+/, '');
            const [postFetch, profFetch] = await Promise.allSettled([
                _fetchHtml(`https://fixthreads.seria.moe/${encodeURIComponent(cleanUsername)}/post/${encodeURIComponent(postId)}?embed=1`),
                _fetchHtml(`https://fixthreads.seria.moe/${encodeURIComponent(cleanUsername)}`)
            ]);
            if (postFetch.status !== 'fulfilled') {
                throw postFetch.reason;
            }

            const postHtml = postFetch.value;
            const profHtml = profFetch.status === 'fulfilled' ? profFetch.value : '';

            // 檢查 fixthreads 是否返回有效內容（包含 OG 標籤）
            if (!postHtml.includes('og:title') && !postHtml.includes('og:description') && !postHtml.includes('og:video')) {
                throw new Error('fixthreads 返回無效內容（無 OG 標籤）');
            }

            const titlePost  = _extractMeta(postHtml, 'og:title') || _extractMeta(postHtml, 'twitter:title');
            const videoUrl   = _extractMeta(postHtml, 'og:video') || _extractMeta(postHtml, 'twitter:player:stream') || _extractMeta(postHtml, 'twitter:player');
            const rawText    = _extractMeta(postHtml, 'og:description') || _extractMeta(postHtml, 'description') || '';
            const images     = _extractAllMeta(postHtml, 'og:image');
            const avatar     = _extractMeta(profHtml, 'og:image');
            const titleProf  = _extractMeta(profHtml, 'og:title');
            const twitterCard = _extractMeta(postHtml, 'twitter:card');
            const canonicalUrl = _extractMeta(postHtml, 'og:url');

            if (_isThreadsLoginMeta(titlePost, rawText, canonicalUrl)) {
                throw new Error('Threads 返回登入頁或不可嵌入內容');
            }
            if (!rawText && !videoUrl && images.length === 0) {
                throw new Error('Threads 官方頁面無可用貼文資料');
            }

            const realName   = _extractThreadsRealName(titlePost || titleProf, username);
            const isVideo    = (!!videoUrl) || (twitterCard === 'player');
            const hasRealImg = twitterCard === 'summary_large_image' || images.length > 0;
            const quoteInfo  = _parseQuote(rawText);

            if (quoteInfo) {
                try {
                    const origProfHtml = await _fetchHtml(`https://fixthreads.seria.moe/${encodeURIComponent(quoteInfo.originalUsername)}`);
                    quoteInfo.originalAvatar = _extractMeta(origProfHtml, 'og:image');
                } catch (e) { quoteInfo.originalAvatar = null; }
            }

            tfd.sys('TFD-Threads', `card:${twitterCard} isVideo:${isVideo} images:${images.length} isQuote:${!!quoteInfo}`);

            const r = { username, postId, realName, rawText, videoUrl, images, avatar, twitterCard, isVideo, hasRealImg, isQuote: !!quoteInfo, quoteInfo, url: originalURL };

            if (isVideo) {
                return {
                    success: true,
                    siteName: 'threads',
                    isV2: true,
                    v2Container: this._buildV2Container(r),
                    components: this._buildComponents(originalURL),
                    originalURL
                };
            }

            if (hasRealImg && images.length > 1) {
                return {
                    success: true,
                    siteName: 'threads',
                    embed: this._buildV1Embed(r),
                    components: this._buildComponents(originalURL),
                    multipleImages: images,
                    originalURL
                };
            }

            return {
                success: true,
                siteName: 'threads',
                embed: this._buildV1Embed(r),
                components: this._buildComponents(originalURL),
                originalURL
            };

        } catch (error) {
            tfd.sysError('TFD-Threads', `貼文抓取失敗 (${error.message})，改用基本 embed`);
            return this.buildBasicPostEmbed(username, postId, originalURL);
        }
    }

    /**
     * 建立按鈕元件（重整 + 回報）
     */
    _buildComponents(originalURL) {
        const threadHash = _generateThreadHash(originalURL);
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`threads_reload_${threadHash}`)
                .setLabel('重整')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`report_btn_${Date.now()}`)
                .setLabel('回報')
                .setStyle(ButtonStyle.Secondary)
        );
        return [actionRow];
    }

    /**
     * 建立 V1 embed（圖片/文字/引用貼文）
     */
    _buildV1Embed(r) {
        const authorName = (r.realName && r.realName !== r.username)
            ? r.realName + ' (@' + r.username + ')'
            : '@' + r.username;

        let description = '';
        if (r.isQuote && r.quoteInfo) {
            const q = r.quoteInfo;
            if (q.reposterText) description += q.reposterText + '\n\n';
            const origUrl = 'https://www.threads.com/@' + q.originalUsername;
            description += '> **[@' + q.originalUsername + '](' + origUrl + ')**\n';
            description += q.quotedText.split('\n').map(l => '> ' + l).join('\n');
        } else {
            description = r.rawText;
        }

        const embedData = {
            color: THREADS_COLOR,
            author: {
                name: authorName,
                iconURL: r.avatar || THREADS_ICON,
                url: 'https://www.threads.com/@' + r.username
            },
            description: description || null,
            url: r.url,
            footer: { text: '🧵 Threads | Peko Embed' }
        };

        if (r.hasRealImg && r.images.length > 0) {
            embedData.image = r.images[0];
        }
        if (r.isQuote && r.quoteInfo && r.quoteInfo.originalAvatar) {
            embedData.thumbnail = r.quoteInfo.originalAvatar;
        }

        return this.embedBuilder.createBasicEmbed(embedData);
    }

    /**
     * 建立 V2 container（影片貼文，含圖片混合媒體）
     */
    _buildV2Container(r) {
        const authorLine = (r.realName && r.realName !== r.username)
            ? '[@' + r.username + '](https://www.threads.com/@' + r.username + ')  **' + r.realName + '**'
            : '[@' + r.username + '](https://www.threads.com/@' + r.username + ')';

        const container = new ContainerBuilder().setAccentColor(THREADS_COLOR);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(authorLine + (r.rawText ? '\n' + r.rawText : ''))
        );

        const galleryItems = [];
        if (r.videoUrl) {
            galleryItems.push(new MediaGalleryItemBuilder().setURL(r.videoUrl).setDescription('🎬 影片'));
        }
        if (r.images && r.images.length > 0) {
            for (let i = 0; i < r.images.length; i++) {
                galleryItems.push(new MediaGalleryItemBuilder().setURL(r.images[i]).setDescription(`🖼️ 圖片 ${i + 1}`));
            }
        }
        if (galleryItems.length > 0) {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(...galleryItems)
            );
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# 🧵 Threads | Peko Embed')
        );
        return container;
    }

    /**
     * 建立 Threads 個人資料 embed
     */
    buildProfileEmbed(profileData, originalURL) {
        const username = profileData.username;
        const rawTitle = profileData.title || '@' + username;
        const title = rawTitle.replace(/\s+on Threads$/i, '').trim();
        const description = profileData.description || null;
        const avatar = profileData.image || null;

        return this.embedBuilder.createBasicEmbed({
            title,
            description,
            url: originalURL,
            thumbnail: avatar,
            color: THREADS_COLOR,
            footer: { text: '🧵 Threads | Peko Embed' }
        });
    }
    /**
     * 舊版 fallback：proxy 轉址
     */
    async _extractPostLegacy(username, postId, originalURL) {
        try {
            tfd.sys('TFD-Threads', `舊版轉址: @${username}/post/${postId}`);
            const proxyHost = await this.pickVideoProxy();
            const fixUrl = this.buildProxyUrl(originalURL, proxyHost);
            tfd.sys('TFD-Threads', `轉址 (${proxyHost}): ${fixUrl}`);
            return {
                success: true,
                siteName: 'threads',
                contentType: 'url_conversion',
                convertedURL: fixUrl,
                originalURL,
                redirect: true,
                redirectURL: fixUrl,
                embed: null
            };
        } catch (error) {
            tfd.sysError('TFD-Threads', `轉址失敗: ${error.message}`);
            return this.buildBasicPostEmbed(username, postId, originalURL);
        }
    }

    /**
     * 使用 Lightpanda / Playwright / Puppeteer 抓取頁面 OG meta
     */
    async fetchPageMeta(url, options = {}) {
        const timeout = options.timeout || 30000;

        // 1) Lightpanda（若有運行且可用）
        try {
            if (LightpandaClient && typeof LightpandaClient.isAvailable === 'function') {
                const avail = await LightpandaClient.isAvailable();
                if (avail) {
                    const meta = await LightpandaClient.fetchPageMeta(url, {
                        timeout,
                        extraWaitMs: options.extraWaitMs || 800,
                        waitSelector: options.waitSelector || null
                    });

                    if (meta && meta.success) {
                        tfd.sys('TFD-Threads', `fetchPageMeta: used Lightpanda for ${url}`);
                        return {
                            ogTitle: meta.title || null,
                            ogDescription: meta.description || null,
                            ogImage: meta.image || null,
                            ogUrl: meta.canonicalUrl || url,
                            ogType: null,
                            twitterImage: null,
                            currentUrl: meta.canonicalUrl || url
                        };
                    }
                }
            }
        } catch (e) {
            // ignore and fallback
        }

        // 2) Playwright local render fallback
        try {
            const { chromium } = require('playwright');
            let browser = null;
            let context = null;
            let page = null;
            try {
                browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    viewport: { width: 1280, height: 800 }
                });

                page = await context.newPage();
                page.setDefaultNavigationTimeout(timeout);
                page.setDefaultTimeout(timeout);

                await page.goto(url, { waitUntil: 'networkidle', timeout }).catch(() => {});

                if (options.extraWaitMs) {
                    await new Promise(r => setTimeout(r, options.extraWaitMs));
                }

                const data = await page.evaluate(() => {
                    const getMeta = (name) => {
                        const el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
                        return el ? el.getAttribute('content') : null;
                    };

                    const videoEl = document.querySelector('video');
                    let videoSrc = null;
                    if (videoEl) {
                        videoSrc = videoEl.src || videoEl.querySelector('source')?.src || null;
                    }

                    return {
                        ogTitle: getMeta('og:title'),
                        ogDescription: getMeta('og:description'),
                        ogImage: getMeta('og:image'),
                        ogUrl: getMeta('og:url'),
                        ogType: getMeta('og:type'),
                        twitterImage: getMeta('twitter:image'),
                        currentUrl: window.location.href,
                        hasVideo: !!videoEl,
                        videoSrc
                    };
                });

                try {
                    const outDir = path.join(__dirname, '../../tools/playwright-screenshots');
                    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                    const screenshotPath = path.join(outDir, `threads_${Date.now()}.png`);
                    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
                    data.screenshot = screenshotPath;
                } catch (sErr) {
                    // ignore
                }

                tfd.sys('TFD-Threads', `fetchPageMeta: used Playwright for ${url}`);
                return data;
            } finally {
                try { if (page) await page.close(); } catch (e) {}
                try { if (context) await context.close(); } catch (e) {}
                try { if (browser) await browser.close(); } catch (e) {}
            }
        } catch (pwErr) {
            // 3) 最後 fallback：Puppeteer minimal
            try {
                const puppeteer = require('puppeteer');
                const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
                try {
                    const page = await browser.newPage();
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout }).catch(() => {});

                    if (options.extraWaitMs) {
                        await new Promise(resolve => setTimeout(resolve, options.extraWaitMs));
                    }

                    const data = await page.evaluate(() => {
                        const getMeta = (name) => {
                            const el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
                            return el ? el.getAttribute('content') : null;
                        };

                        const videoEl = document.querySelector('video');
                        let videoSrc = null;
                        if (videoEl) {
                            videoSrc = videoEl.src || videoEl.querySelector('source')?.src || null;
                        }

                        return {
                            ogTitle: getMeta('og:title'),
                            ogDescription: getMeta('og:description'),
                            ogImage: getMeta('og:image'),
                            ogUrl: getMeta('og:url'),
                            ogType: getMeta('og:type'),
                            twitterImage: getMeta('twitter:image'),
                            currentUrl: window.location.href,
                            hasVideo: !!videoEl,
                            videoSrc
                        };
                    });

                    tfd.sys('TFD-Threads', `fetchPageMeta: used Puppeteer fallback for ${url}`);
                    return data;
                } finally {
                    await browser.close().catch(() => {});
                }
            } catch (finalErr) {
                throw finalErr;
            }
        }
    }

    /**
     * 提取個人資料
     */
    async extractProfile(username, originalURL) {
        tfd.sys('TFD-Threads', `抓取個人資料: @${username}`);

        try {
            const profileHtml = await _fetchHtml(`https://fixthreads.seria.moe/${encodeURIComponent(String(username || '').replace(/^@+/, ''))}`);
            const title = _extractMeta(profileHtml, 'og:title');
            const description = _extractMeta(profileHtml, 'og:description');
            const image = _extractMeta(profileHtml, 'og:image');

            if (title || description || image) {
                return {
                    success: true,
                    siteName: 'threads',
                    embed: this.buildProfileEmbed({ username, title, description, image }, originalURL),
                    originalURL
                };
            }
        } catch (error) {
            tfd.sys('TFD-Threads', `fixthreads 個人資料抓取失敗: ${error.message}`);
        }

        try {
            const profileData = await this.fetchPageMeta(originalURL, {
                extraWaitMs: 1000,
                timeout: 30000
            });

            if (profileData.ogTitle || profileData.ogDescription || profileData.ogImage) {
                return {
                    success: true,
                    siteName: 'threads',
                    embed: this.buildProfileEmbed({
                        username,
                        title: profileData.ogTitle,
                        description: profileData.ogDescription,
                        image: profileData.ogImage
                    }, originalURL),
                    originalURL
                };
            }
        } catch (error) {
            tfd.sys('TFD-Threads', `抓取失敗: ${error.message}`);
        }

        return this.buildBasicProfileEmbed(username, originalURL);
    }
    /**
     * 建立基本貼文 embed（轉址失敗時的最後備援）
     */
    buildBasicPostEmbed(username, postId, originalURL) {
        tfd.sys('TFD-Threads', `建立基本貼文 embed: @${username}`);

        const embed = this.embedBuilder.createBasicEmbed({
            title: `@${username} 的 Threads 貼文`,
            url: originalURL,
            color: THREADS_COLOR,
            author: {
                name: `@${username}`,
                iconURL: THREADS_ICON,
                url: `https://www.threads.com/@${username}`
            },
            footer: { text: '🧵 Threads | Peko Embed' }
        });

        return { success: true, siteName: 'threads', embed, components: this._buildComponents(originalURL) };
    }

    /**
     * 建立基本個人資料 embed
     */
    buildBasicProfileEmbed(username, originalURL) {
        tfd.sys('TFD-Threads', `建立基本個人資料 embed: @${username}`);

        const embed = this.embedBuilder.createBasicEmbed({
            title: `@${username} • Threads`,
            url: originalURL,
            color: THREADS_COLOR,
            footer: { text: '🧵 Threads | Peko Embed' }
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

    /**
     * 將原始 Threads URL 替換為指定 proxy host
     */
    buildProxyUrl(originalURL, proxyHost) {
        return originalURL.replace(/(?:www\.)?threads\.(?:com|net)/, proxyHost);
    }

    /**
     * 選擇可用的影片轉址服務：primary 優先，失敗用 fallback
     */
    async pickVideoProxy() {
        const ok = await this.probeHost(ThreadsExtractor.VIDEO_PROXY_PRIMARY);
        if (ok) return ThreadsExtractor.VIDEO_PROXY_PRIMARY;
        tfd.sys('TFD-Threads', `${ThreadsExtractor.VIDEO_PROXY_PRIMARY} 不可用，切換備援 ${ThreadsExtractor.VIDEO_PROXY_FALLBACK}`);
        return ThreadsExtractor.VIDEO_PROXY_FALLBACK;
    }

    /**
     * HEAD 請求探測 host 是否存活（5 秒超時）
     */
    probeHost(host) {
        return new Promise(resolve => {
            const req = https.request({ host, path: '/', method: 'HEAD', timeout: 5000 }, res => {
                resolve(res.statusCode < 500);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }
}

module.exports = ThreadsExtractor;
