/*jshint esversion: 9 */
/**
 * facebook-smart.js
 * Facebook 智能預覽提取器（文字優先版）
 *
 * 策略：
 * 1. 優先用 HTTP 抓取 HTML metadata
 * 2. 可選擇用瀏覽器 fallback 取得渲染後 metadata
 * 3. 成功時輸出 full_text 或 simple_preview
 * 4. 失敗時回退為 facebed 轉址
 * 5. 不抓圖片
 */

const { EmbedBuilder } = require('discord.js');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const HTTPClient = require('../utils/http-client');
const config = require('../config/tfd-config.json');
const FacebookExtractor = require('./facebook');
const FacebookMBasicExtractor = require('./facebook-mbasic');
const FacebookWithLoginExtractor = require('./facebook-with-login');
const tfd = require('../../utils/tfd-logger');

class FacebookSmartExtractor {
    constructor() {
        this.name = 'facebook_smart';
        this.httpClient = new HTTPClient();
        this.facebookExtractor = new FacebookExtractor();
        this.facebookMBasicExtractor = new FacebookMBasicExtractor();
        this.facebookWithLoginExtractor = new FacebookWithLoginExtractor();
        this.facebookSessionDir = path.join(__dirname, '..', '..', 'data', 'facebook_session');
        this.facebookStorageStatePath = path.join(__dirname, '..', '..', 'data', 'facebook_auth.json');
        this.previewConfig = {
            enabled: config.facebookPreview?.enabled !== false,
            preferFullText: config.facebookPreview?.preferFullText !== false,
            allowBrowserFallback: config.facebookPreview?.allowBrowserFallback === true,
            enableLegacyFallbacks: config.facebookPreview?.enableLegacyFallbacks !== false,
            enableGoogleScriptFallback: config.facebookPreview?.enableGoogleScriptFallback !== false,
            requestTimeoutMs: config.facebookPreview?.requestTimeoutMs || 8000,
            maxContentLength: config.facebookPreview?.maxContentLength || 280,
            debugLog: config.facebookPreview?.debugLog === true
        };
    }

    async extract(matchResult, message = null) {
        const { originalURL } = matchResult;
        const facebedURL = this.convertToFacebed(originalURL);

        if (!this.previewConfig.enabled) {
            return this.createRedirectResult(originalURL, facebedURL, 'PREVIEW_DISABLED');
        }

        const attempts = [];
        const strategies = await this.buildStrategies(originalURL, matchResult, message);

        for (const strategy of strategies) {
            try {
                const strategyResult = await strategy.run();
                const attempt = {
                    source: strategy.source,
                    method: strategy.method,
                    ...strategyResult
                };

                attempts.push(attempt);

                if (!attempt.meta && !attempt.result) {
                    continue;
                }

                const candidate = attempt.meta
                    ? this.evaluateContent(attempt.meta)
                    : this.normalizeCandidate(attempt.result);

                if (!candidate || candidate.mode === 'redirect_only') {
                    continue;
                }

                this.logMode(candidate.mode, originalURL, attempt.source);
                return this.createPreviewResult(
                    candidate.mode,
                    originalURL,
                    facebedURL,
                    candidate,
                    attempt.source
                );
            } catch (error) {
                attempts.push({
                    source: strategy.source,
                    method: strategy.method,
                    errorCode: this.classifyError(error),
                    errorMessage: error.message
                });
            }
        }

        const failureReason = this.resolveFailureReason(attempts);
        return this.createRedirectResult(originalURL, facebedURL, failureReason, { attempts });
    }

    async buildStrategies(originalURL, matchResult, message) {
        const prefersLoginFirst = this.shouldPreferLoginFirst(originalURL);
        const prefersBrowserFirst = this.shouldPreferBrowserFirst(originalURL);
        const hasSession = await this.hasFacebookSession();
        const strategies = [];

        if (prefersLoginFirst && hasSession && this.previewConfig.enableLegacyFallbacks) {
            strategies.push(this.createResultStrategy('with_login', 'playwright_logged_in', () => this.fetchContentViaLogin(originalURL, matchResult, message)));
            strategies.push(this.createResultStrategy('mbasic', 'mbasic_logged_in', () => this.fetchContentViaMBasic(originalURL, matchResult, message)));
        }

        if (prefersBrowserFirst && this.previewConfig.allowBrowserFallback) {
            strategies.push(this.createMetaStrategy('browser', 'playwright_meta', () => this.fetchMetadataViaBrowser(originalURL)));
        }

        // 註：FB 恆對非瀏覽器請求回 400，因此不再嘗試 http_meta 策略 (2026-04-17 移除)
        // 其他 FB 策略 (with_login/mbasic/browser/legacy_og/google_script) 皆走 Playwright 或後端代理，仍可用

        if (!prefersBrowserFirst && this.previewConfig.allowBrowserFallback) {
            strategies.push(this.createMetaStrategy('browser', 'playwright_meta', () => this.fetchMetadataViaBrowser(originalURL)));
        }

        if (this.previewConfig.enableLegacyFallbacks) {
            strategies.push(this.createMetaStrategy('legacy_og', 'legacy_open_graph', () => this.fetchMetadataViaLegacyOpenGraph(originalURL)));
        }

        if (!prefersLoginFirst && hasSession && this.previewConfig.enableLegacyFallbacks) {
            strategies.push(this.createResultStrategy('with_login', 'playwright_logged_in', () => this.fetchContentViaLogin(originalURL, matchResult, message)));
            strategies.push(this.createResultStrategy('mbasic', 'mbasic_logged_in', () => this.fetchContentViaMBasic(originalURL, matchResult, message)));
        }

        if (this.previewConfig.enableGoogleScriptFallback) {
            strategies.push(this.createMetaStrategy('google_script', 'gas_browser_simulation', () => this.fetchMetadataViaGoogleScript(originalURL)));
        }

        return strategies;
    }

    createMetaStrategy(source, method, run) {
        return {
            source,
            method,
            run: async () => ({ meta: await run() })
        };
    }

    createResultStrategy(source, method, run) {
        return {
            source,
            method,
            run: async () => ({ result: await run() })
        };
    }

    shouldPreferBrowserFirst(url) {
        return /facebook\.com\/(?:share\/|story\.php|reel\/|watch\/|groups\/|permalink\.php)/i.test(url);
    }

    shouldPreferLoginFirst(url) {
        return /facebook\.com\/groups\/.*(?:\/posts\/|\bmulti_permalinks=)/i.test(url);
    }

    async hasFacebookSession() {
        try {
            await fs.access(this.facebookSessionDir);
            return true;
        } catch {
            try {
                await fs.access(this.facebookStorageStatePath);
                return true;
            } catch {
                return false;
            }
        }
    }

    async fetchMetadataViaBrowser(originalURL) {
        let browser = null;
        let page = null;

        try {
            const { chromium } = require('playwright');

            browser = await chromium.launch({
                headless: true
            });

            page = await browser.newPage({
                userAgent: config.settings?.userAgent,
                locale: 'zh-TW'
            });

            await page.goto(originalURL, {
                waitUntil: 'domcontentloaded',
                timeout: this.previewConfig.requestTimeoutMs
            });

            const html = await page.content();
            return this.parseHTMLMetadata(html);
        } catch (error) {
            if (error.name === 'TimeoutError') {
                error.code = 'TIMEOUT';
            }
            throw error;
        } finally {
            if (page) {
                await page.close().catch(() => null);
            }
            if (browser) {
                await browser.close().catch(() => null);
            }
        }
    }

    async fetchMetadataViaLegacyOpenGraph(originalURL) {
        const ogData = await this.facebookExtractor.extractOpenGraphData(originalURL);

        if (!ogData || (!ogData.title && !ogData.description)) {
            const error = new Error('Legacy Open Graph extraction returned empty content');
            error.code = 'CONTENT_EMPTY';
            throw error;
        }

        return {
            title: this.normalizeText(ogData.title),
            ogTitle: this.normalizeText(ogData.title),
            ogDescription: this.normalizeText(ogData.description),
            metaDescription: this.normalizeText(ogData.description)
        };
    }

    async fetchContentViaLogin(originalURL, matchResult, message) {
        const result = await this.facebookWithLoginExtractor.extract(originalURL, matchResult?.extractedData || {}, message);
        return this.extractStructuredCandidate(result);
    }

    async fetchContentViaMBasic(originalURL, matchResult, message) {
        const result = await this.facebookMBasicExtractor.extract(originalURL, matchResult?.extractedData || {}, message);
        return this.extractStructuredCandidate(result);
    }

    async fetchMetadataViaGoogleScript(originalURL) {
        const gasURL = process.env.GOOGLE_APP_SCRIPT_URL;
        if (!gasURL) {
            const error = new Error('GOOGLE_APP_SCRIPT_URL is not configured');
            error.code = 'HTTP_FAIL';
            throw error;
        }

        const queryURL = `${gasURL}?mode=facebook_preview&url=${encodeURIComponent(originalURL)}`;
        const gasResult = await this.httpClient.get(queryURL, {
            timeout: Math.max(this.previewConfig.requestTimeoutMs, 15000),
            maxRedirects: 3,
            validateStatus: status => status >= 200 && status < 400
        });

        if (!gasResult.success || !gasResult.data) {
            const error = new Error(gasResult.error || 'Google Script request failed');
            error.code = gasResult.status === 408 ? 'TIMEOUT' : 'HTTP_FAIL';
            throw error;
        }

        if (typeof gasResult.data === 'object') {
            const metadata = {
                title: this.normalizeText(gasResult.data.title),
                ogTitle: this.normalizeText(gasResult.data.ogTitle || gasResult.data.author || gasResult.data.title),
                ogDescription: this.normalizeText(gasResult.data.ogDescription || gasResult.data.description || gasResult.data.content),
                metaDescription: this.normalizeText(gasResult.data.metaDescription || gasResult.data.description || gasResult.data.content)
            };

            this.assertUsefulMetadata(metadata, 'Google Script returned empty structured metadata');
            return metadata;
        }

        const rawText = String(gasResult.data).trim();

        try {
            const parsed = JSON.parse(rawText);
            const metadata = {
                title: this.normalizeText(parsed.title),
                ogTitle: this.normalizeText(parsed.ogTitle || parsed.author || parsed.title),
                ogDescription: this.normalizeText(parsed.ogDescription || parsed.description || parsed.content),
                metaDescription: this.normalizeText(parsed.metaDescription || parsed.description || parsed.content)
            };

            this.assertUsefulMetadata(metadata, 'Google Script returned empty JSON metadata');
            return metadata;
        } catch {
            const metadata = this.parseHTMLMetadata(rawText);
            this.assertUsefulMetadata(metadata, 'Google Script returned an error page');
            return metadata;
        }
    }

    parseHTMLMetadata(html) {
        try {
            const $ = cheerio.load(html);

            const title = this.normalizeText($('title').first().text());
            const ogTitle = this.normalizeText($('meta[property="og:title"]').attr('content'));
            const ogDescription = this.normalizeText($('meta[property="og:description"]').attr('content'));
            const metaDescription = this.normalizeText($('meta[name="description"]').attr('content'));

            return { title, ogTitle, ogDescription, metaDescription };
        } catch (error) {
            error.code = 'HTML_PARSE_FAIL';
            throw error;
        }
    }

    extractStructuredCandidate(result) {
        if (!result || !result.success) {
            const error = new Error(result?.error || 'Structured extractor failed');
            error.code = 'CONTENT_EMPTY';
            throw error;
        }

        let author = this.normalizeText(result.data?.author);
        const headline = this.normalizeText(result.data?.headline);
        let groupName = this.normalizeText(result.data?.groupName);
        let content = this.normalizeText(
            result.data?.content ||
            result.data?.metadata?.content ||
            result.data?.ogData?.description
        );

        if (this.isNoisyText(author)) {
            author = null;
        }

        if (groupName && this.isNoisyText(groupName)) {
            groupName = null;
        }

        if (this.isVideoUiNoise(content)) {
            content = this.removeVideoUiNoise(content);
        }

        if (!author && !content) {
            const error = new Error('Structured extractor returned empty author and content');
            error.code = 'CONTENT_EMPTY';
            throw error;
        }

        return {
            mode: author && content ? 'full_text' : 'simple_preview',
            author: author || null,
            content: content || headline || null,
            groupName: groupName || null
        };
    }

    normalizeCandidate(candidate) {
        if (!candidate) return null;

        const author = this.normalizeText(candidate.author);
        const content = this.normalizeText(candidate.content);

        if (!author && !content) {
            return { mode: 'redirect_only', author: null, content: null };
        }

        return {
            mode: author && content ? 'full_text' : 'simple_preview',
            author: author || null,
            content: content || null,
            groupName: this.normalizeText(candidate.groupName)
        };
    }

    assertUsefulMetadata(metadata, fallbackMessage) {
        const title = this.normalizeText(metadata?.title);
        const ogTitle = this.normalizeText(metadata?.ogTitle);
        const ogDescription = this.normalizeText(metadata?.ogDescription);
        const metaDescription = this.normalizeText(metadata?.metaDescription);
        const combined = [title, ogTitle, ogDescription, metaDescription].filter(Boolean).join(' ').toLowerCase();

        const looksLikeErrorPage = combined.includes('錯誤') ||
            combined.includes('error') ||
            combined.includes('exception') ||
            combined.includes('google apps script');

        const hasUsefulContent = Boolean(ogDescription || metaDescription || ogTitle);

        if (!hasUsefulContent || looksLikeErrorPage) {
            const error = new Error(fallbackMessage);
            error.code = 'CONTENT_EMPTY';
            throw error;
        }
    }

    evaluateContent(meta) {
        const titleCandidate = this.normalizeText(meta.title);
        const ogTitleCandidate = this.normalizeText(meta.ogTitle);
        const descCandidate = this.normalizeText(meta.ogDescription || meta.metaDescription);

        const trailingTitleAuthor = this.extractTrailingAuthor(titleCandidate);
        const trailingOgAuthor = this.extractTrailingAuthor(ogTitleCandidate);
        const titleSplitAuthor = this.extractAuthorFromTitle(titleCandidate);
        const titleSplitContent = this.extractContentFromTitle(titleCandidate);

        const authorCandidates = [
            trailingTitleAuthor,
            trailingOgAuthor,
            titleSplitAuthor,
            this.extractStandaloneAuthor(titleCandidate, descCandidate),
            ogTitleCandidate
        ].filter(Boolean);

        let author = this.pickAuthor(authorCandidates, descCandidate);
        let content = descCandidate || titleSplitContent;

        if (this.isNoisyText(content) || this.isNearDuplicate(author, content)) {
            content = null;
        }

        if (this.isNoisyText(author)) {
            author = null;
        }

        const hasAuthor = Boolean(author);
        const hasContent = Boolean(content);
        const hasDescriptionContent = Boolean(descCandidate) && !this.isNoisyText(descCandidate);
        const fullTextReady = this.previewConfig.preferFullText && hasAuthor && hasContent && hasDescriptionContent;

        if (fullTextReady) {
            return { mode: 'full_text', author, content };
        }

        if (hasAuthor || hasContent) {
            return {
                mode: 'simple_preview',
                author: author || null,
                content: content || null
            };
        }

        return { mode: 'redirect_only', author: null, content: null };
    }

    createPreviewResult(mode, originalURL, facebedURL, evaluated, source) {
        const extractMethodMap = {
            browser: 'browser_meta_compare',
            http: 'http_meta_compare',
            legacy_og: 'legacy_open_graph',
            with_login: 'playwright_logged_in',
            mbasic: 'mbasic_logged_in',
            google_script: 'gas_browser_simulation'
        };
        const normalizedContent = this.normalizeText(evaluated?.content);

        if (!normalizedContent) {
            return this.createRedirectResult(originalURL, facebedURL, 'CONTENT_EMPTY', {
                extractMethod: extractMethodMap[source] || source,
                mode: 'redirect_only',
                author: this.normalizeText(evaluated?.author),
                content: null,
                groupName: this.normalizeText(evaluated?.groupName),
                mediaPolicy: 'ignore_images_and_video'
            });
        }

        return {
            success: true,
            siteName: 'facebook',
            contentType: mode,
            embed: this.createPreviewEmbed(facebedURL, evaluated, mode === 'full_text'),
            deleteOriginal: false,
            data: {
                originalURL,
                facebedURL,
                extractMethod: extractMethodMap[source] || source,
                mode,
                author: evaluated.author,
                content: normalizedContent,
                groupName: evaluated.groupName || null,
                mediaPolicy: 'ignore_images_and_video'
            }
        };
    }

    createPreviewEmbed(facebedURL, evaluated, isFullText) {
        return new EmbedBuilder()
            .setColor(0x1877F2)
            .setTitle(evaluated.author || 'Facebook 貼文')
            .setURL(facebedURL)
            .setDescription(this.truncate(evaluated.content))
            .setFooter({ text: isFullText ? 'Facebook 文字預覽' : 'Facebook 簡潔預覽' });
    }

    createRedirectResult(originalURL, facebedURL, reason, extraData = {}) {
        this.logMode('redirect_only', originalURL, reason);

        return {
            success: true,
            siteName: 'facebook',
            contentType: 'url_conversion',
            convertedURL: facebedURL,
            deleteOriginal: false,
            data: {
                originalURL,
                convertedURL: facebedURL,
                extractMethod: 'redirect_only',
                reason,
                ...extraData
            }
        };
    }

    resolveFailureReason(attempts) {
        const errorCodes = attempts
            .map(attempt => attempt.errorCode)
            .filter(Boolean);

        if (errorCodes.includes('TIMEOUT')) return 'TIMEOUT';
        if (errorCodes.includes('HTML_PARSE_FAIL')) return 'HTML_PARSE_FAIL';
        if (errorCodes.includes('HTTP_FAIL')) return 'HTTP_FAIL';
        return 'CONTENT_EMPTY';
    }

    classifyError(error) {
        if (!error) return 'HTTP_FAIL';
        if (error.code === 'TIMEOUT' || error.name === 'TimeoutError') return 'TIMEOUT';
        if (error.code === 'HTML_PARSE_FAIL') return 'HTML_PARSE_FAIL';
        if (error.code === 'CONTENT_EMPTY') return 'CONTENT_EMPTY';
        return 'HTTP_FAIL';
    }

    logMode(mode, url, detail = '') {
        const suffix = detail ? ` (${detail})` : '';
        tfd.sys('FB', `${mode}: ${url}${suffix}`);
    }

    extractAuthorFromTitle(rawTitle) {
        if (!rawTitle) return null;

        const separators = ['|', ' - ', ' – ', ' — ', '：', ':', '｜'];

        for (const sep of separators) {
            if (!rawTitle.includes(sep)) continue;

            const [left] = rawTitle.split(sep);
            const normalized = this.normalizeText(left);

            if (normalized && normalized.length >= 2 && !this.isNoisyText(normalized)) {
                return normalized;
            }
        }

        return null;
    }

    extractContentFromTitle(rawTitle) {
        if (!rawTitle) return null;

        const separators = ['|', ' - ', ' – ', ' — ', '：', ':', '｜'];

        for (const sep of separators) {
            if (!rawTitle.includes(sep)) continue;

            const parts = rawTitle
                .split(sep)
                .map(part => this.normalizeText(part))
                .filter(Boolean);

            if (parts.length >= 2) {
                return parts.slice(1).join(' ').trim();
            }
        }

        return null;
    }

    extractStandaloneAuthor(title, content) {
        if (!title || !content) return null;

        const normalizedTitle = this.normalizeText(title);
        const normalizedContent = this.normalizeText(content);

        if (!normalizedTitle || !normalizedContent) {
            return null;
        }

        const separators = [' - ', ' – ', ' — ', ':', '：', '|', '｜'];

        for (const sep of separators) {
            if (!normalizedTitle.includes(sep)) continue;

            const [left] = normalizedTitle.split(sep);
            const candidate = this.normalizeText(left);

            if (candidate && !this.isNoisyText(candidate) && !this.isLikelyContentSnippet(candidate, normalizedContent)) {
                return candidate;
            }
        }

        if (!this.isNoisyText(normalizedTitle) && !this.isLikelyContentSnippet(normalizedTitle, normalizedContent)) {
            return normalizedTitle;
        }

        return null;
    }

    extractTrailingAuthor(rawTitle) {
        if (!rawTitle) return null;

        const parts = rawTitle
            .split(/[\|｜]/)
            .map(part => this.normalizeText(part))
            .filter(Boolean);

        if (parts.length < 2) {
            return null;
        }

        const filtered = parts.filter(part => !/^facebook$/i.test(part));
        const candidate = filtered[filtered.length - 1];

        if (!candidate) return null;
        if (this.isNoisyText(candidate)) return null;
        if (this.isLikelyMetricText(candidate)) return null;

        return candidate;
    }

    pickAuthor(candidates, content) {
        for (const candidate of candidates) {
            const normalized = this.normalizeText(candidate);

            if (!normalized) continue;
            if (this.isNoisyText(normalized)) continue;
            if (this.isLikelyContentSnippet(normalized, content)) continue;

            return normalized;
        }

        return null;
    }

    isLikelyContentSnippet(candidate, content) {
        if (!candidate || !content) return false;

        const normalizedCandidate = this.normalizeText(candidate).toLowerCase();
        const normalizedContent = this.normalizeText(content).toLowerCase();

        if (!normalizedCandidate || !normalizedContent) return false;
        if (normalizedCandidate.length >= 24) return true;

        return normalizedContent.includes(normalizedCandidate);
    }

    isLikelyMetricText(text) {
        if (!text) return false;

        const normalized = this.normalizeText(text).toLowerCase();
        return /次觀看|個心情|comments?|views?/.test(normalized) ||
            /^\d+[.,]?\d*\s*(次觀看|個心情|views?)$/.test(normalized);
    }

    isNoisyText(text) {
        if (!text) return true;

        const normalized = this.normalizeText(text).toLowerCase();
        const noisyWords = [
            'facebook',
            'log in',
            'login',
            'sign up',
            '登入',
            '註冊',
            '查看更多',
            'facebook watch',
            'reels',
            '首頁',
            '留言',
            '心情',
            '次觀看'
        ];

        return noisyWords.some(word => normalized.includes(word));
    }

    isVideoUiNoise(text) {
        if (!text) return false;
        return /\b\d+:\d{2}\b/.test(text) || /次觀看/.test(text);
    }

    removeVideoUiNoise(text) {
        if (!text) return null;

        const cleaned = text
            .split(/\n+/)
            .map(line => this.normalizeText(line))
            .filter(line => line &&
                !/^\d+:\d{2}$/.test(line) &&
                !/^\d+[.,]?\d*\s*次觀看$/.test(line) &&
                !this.isNoisyText(line)
            )
            .join('\n\n');

        return this.normalizeText(cleaned);
    }

    isNearDuplicate(a, b) {
        if (!a || !b) return false;

        const x = this.normalizeText(a).toLowerCase();
        const y = this.normalizeText(b).toLowerCase();

        if (!x || !y) return false;
        return x === y || x.includes(y) || y.includes(x);
    }

    normalizeText(value) {
        if (!value) return null;

        const normalized = String(value)
            .replace(/\s+/g, ' ')
            .replace(/\u00a0/g, ' ')
            .trim();

        return normalized || null;
    }

    truncate(text) {
        if (!text) return '';
        if (text.length <= this.previewConfig.maxContentLength) return text;
        return `${text.slice(0, this.previewConfig.maxContentLength - 1)}…`;
    }

    convertToFacebed(url) {
        try {
            return url
                .replace(/www\.facebook\.com/gi, 'facebed.com')
                .replace(/m\.facebook\.com/gi, 'facebed.com')
                .replace(/facebook\.com/gi, 'facebed.com');
        } catch {
            return url;
        }
    }
}

module.exports = FacebookSmartExtractor;

