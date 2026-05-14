/**
 * TFD 系統 - Threads 提取器
 * 使用 fixthreads.seria.moe HTTP fetch 抓取 OG meta 並建立 Discord Embed
 * 舊版 proxy 轉址邏輯保留為 _extractPostLegacy fallback
 *
 * 支援域名：threads.com
 */

const TFDEmbedBuilder = require('../utils/embed-builder');
const { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');

const THREADS_COLOR = 0x000000;
const THREADS_ICON = 'https://static.cdninstagram.com/rsrc.php/ye/r/lEu8iVizmNW.ico';
const fs = require('fs');
const path = require('path');

let LightpandaClient = null;
try {
    LightpandaClient = require('../../utils/lightpanda-client');
} catch (e) {
    LightpandaClient = null;
}

const https = require('https');
const http = require('http');

// -- fixthreads HTTP helper functions -----------------------------------

function _fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
        }).on('error', reject).setTimeout(15000, function () { this.destroy(); reject(new Error('timeout')); });
    });
}

function _extractMeta(html, propName) {
    const propIdx = html.indexOf('"' + propName + '"');
    if (propIdx < 0) return null;
    const segment = html.slice(propIdx, propIdx + 2000);
    const cm = segment.match(/content\s*=\s*"([\s\S]*?)"\s*\/?>/i);
    if (!cm) return null;
    return cm[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

function _extractAllMeta(html, propName) {
    const results = [];
    let searchFrom = 0;
    while (true) {
        const propIdx = html.indexOf('"' + propName + '"', searchFrom);
        if (propIdx < 0) break;
        const segment = html.slice(propIdx, propIdx + 2000);
        const cm = segment.match(/content\s*=\s*"([\s\S]*?)"\s*\/?>/i);
        if (cm) results.push(cm[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim());
        searchFrom = propIdx + propName.length + 2;
    }
    return results;
}

function _parseQuote(desc) {
    const match = desc.match(/^([\s\S]*?)\u21aa Quoting @([\w.]+)\n([\s\S]*)$/);
    if (!match) return null;
    return { reposterText: match[1].trim(), originalUsername: match[2].trim(), quotedText: match[3].trim() };
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
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    /**
     * 提取貼文資訊（新版：fixthreads HTTP fetch）
     * 失敗時自動 fallback 到舊版 proxy 轉址
     */
    async extractPost(username, postId, originalURL) {
        try {
            tfd.sys('TFD-Threads', `抓取貼文: @${username}/post/${postId}`);

            const [postHtml, profHtml] = await Promise.all([
                _fetchHtml(`https://fixthreads.seria.moe/@${username}/post/${postId}`),
                _fetchHtml(`https://fixthreads.seria.moe/@${username}`)
            ]);

            const videoUrl   = _extractMeta(postHtml, 'og:video');
            const rawText    = _extractMeta(postHtml, 'og:description') || '';
            const images     = _extractAllMeta(postHtml, 'og:image');
            const avatar     = _extractMeta(profHtml, 'og:image');
            const titleProf  = _extractMeta(profHtml, 'og:title');
            const twitterCard = _extractMeta(postHtml, 'twitter:card');

            const realName   = titleProf ? titleProf.replace(/ \(@[^)]+\).*/, '').trim() : username;
            const isVideo    = twitterCard === 'player' && !!videoUrl;
            const hasRealImg = twitterCard === 'summary_large_image';
            const quoteInfo  = _parseQuote(rawText);

            if (quoteInfo) {
                try {
                    const origProfHtml = await _fetchHtml(`https://fixthreads.seria.moe/@${quoteInfo.originalUsername}`);
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
                    originalURL
                };
            }

            if (hasRealImg && images.length > 1) {
                return {
                    success: true,
                    siteName: 'threads',
                    embed: this._buildV1Embed(r),
                    multipleImages: images,
                    originalURL
                };
            }

            return {
                success: true,
                siteName: 'threads',
                embed: this._buildV1Embed(r),
                originalURL
            };

        } catch (error) {
            tfd.sysError('TFD-Threads', `fixthreads 失敗 (${error.message})，切換舊版 proxy`);
            return this._extractPostLegacy(username, postId, originalURL);
        }
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
const tfd = require('../../utils/tfd-logger');
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
        try {
            tfd.sys('TFD-Threads', `抓取個人資料: @${username}`);

            const profileData = await this.fetchPageMeta(originalURL, {
                extraWaitMs: 1000,
                timeout: 30000
            });

            if (profileData.ogTitle || profileData.ogDescription) {
                const embed = this.embedBuilder.createBasicEmbed({
                    title: profileData.ogTitle || `@${username}`,
                    description: profileData.ogDescription || null,
                    url: originalURL,
                    thumbnail: profileData.ogImage || null,
                    color: THREADS_COLOR,
                    footer: { text: '🧵 Threads | Peko Embed' }
                });

                return { success: true, siteName: 'threads', embed };
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

        return { success: true, siteName: 'threads', embed };
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
