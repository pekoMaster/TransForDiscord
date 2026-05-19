/**
 * TFD 系統 - 提取器索引
 * 管理所有網站提取器
 */

const TwitterExtractor = require('./twitter-v2');
const InstagramExtractor = require('./instagram');
const PTTExtractor = require('./ptt');
const BahamutExtractor = require('./bahamut');
const PixivExtractor = require('./pixiv');
// iwara: 已移除 (2026-04-12) - Cloudflare 擋住所有 API/fxiwara 請求
const BilibiliExtractor = require('./bilibili');
const PChomeExtractor = require('./pchome');
const LineTodayExtractor = require('./line-today');
const UDNExtractor = require('./udn');
const StormExtractor = require('./storm');
const MSNExtractor = require('./msn');
const CTSExtractor = require('./cts');
const XFastestExtractor = require('./xfastest');
const Mobile01Extractor = require('./mobile01');
const PornhubExtractor = require('./pornhub');
const NikkeExtractor = require('./nikke');
const PokeWikiExtractor = require('./52poke');
const FourGamersExtractor = require('./4gamers');
const ThreadsExtractor = require('./threads');
const YouTubeExtractor = require('./youtube');
const HololiveShopExtractor = require('./hololive-shop');
const tfd = require('../../utils/tfd-logger');

class ExtractorManager {
    constructor() {
        this.extractors = new Map();
        this.initializeExtractors();
    }

    /**
     * 初始化所有提取器
     */
    initializeExtractors() {
        // 社交媒體
        this.extractors.set('twitter', new TwitterExtractor());
        this.extractors.set('instagram', new InstagramExtractor());

        // 社群論壇
        this.extractors.set('ptt', new PTTExtractor());
        this.extractors.set('pttweb', new PTTExtractor()); // pttweb 使用相同的 PTT 提取器
        this.extractors.set('bahamut', new BahamutExtractor());

        // 藝術平台
        this.extractors.set('pixiv', new PixivExtractor());

        // 影片平台
        // iwara: 已移除 (2026-04-12)
        this.extractors.set('bilibili', new BilibiliExtractor());
        this.extractors.set('pornhub', new PornhubExtractor());

        // 購物平台
        this.extractors.set('pchome', new PChomeExtractor());

        // 新聞平台
        this.extractors.set('linetoday', new LineTodayExtractor());
        this.extractors.set('msn', new MSNExtractor());
        this.extractors.set('udn', new UDNExtractor());
        this.extractors.set('storm', new StormExtractor());
        this.extractors.set('cts', new CTSExtractor());
        this.extractors.set('xfastest', new XFastestExtractor());

        // 論壇
        this.extractors.set('mobile01', new Mobile01Extractor());

        // 遊戲官網
        this.extractors.set('nikke', new NikkeExtractor());

        // 遊戲百科
        this.extractors.set('pokewiki', new PokeWikiExtractor());

        // 遊戲新聞
        this.extractors.set('4gamers', new FourGamersExtractor());

        // 社群平台
        this.extractors.set('threads', new ThreadsExtractor());

        // 電商平台 - Hololive Shop
        this.extractors.set('hololiveshop', new HololiveShopExtractor());

        // 影片平台 - YouTube /live/ 連結轉換
        this.extractors.set('youtube', new YouTubeExtractor());

        // 提取器載入日誌已移除（減少啟動時輸出）
    }

    /**
     * 取得指定網站的提取器
     * @param {string} siteName
     * @returns {Object|null}
     */
    getExtractor(siteName) {
        return this.extractors.get(siteName) || null;
    }

    /**
     * 檢查是否支援指定網站
     * @param {string} siteName
     * @returns {boolean}
     */
    isSupported(siteName) {
        return this.extractors.has(siteName);
    }

    /**
     * 取得所有支援的網站清單
     * @returns {string[]}
     */
    getSupportedSites() {
        return Array.from(this.extractors.keys());
    }

    /**
     * 處理 URL 提取
     * @param {Object} matchResult
     * @param {Object} message Discord 訊息物件
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        const { siteName } = matchResult;

        const extractor = this.getExtractor(siteName);
        if (!extractor) {
            throw new Error(`不支援的網站: ${siteName}`);
        }

        try {
            const result = await extractor.extract(matchResult, message);


            // 添加提取器資訊
            result.extractorName = extractor.name;
            result.extractorSite = siteName;
            result.extractedAt = new Date().toISOString();

            return result;
        } catch (error) {
            tfd.sysError('TFD-ExtractorManager', `${siteName} 提取失敗: ${error.message}`);
            throw error;
        }
    }

    /**
     * 批次處理多個 URL
     * @param {Object[]} matchResults
     * @returns {Promise<Object[]>}
     */
    async extractMultiple(matchResults) {
        const results = [];

        for (const matchResult of matchResults) {
            try {
                const result = await this.extract(matchResult);
                results.push(result);
            } catch (error) {
                // 記錄錯誤但繼續處理其他 URL
                tfd.sysError('TFD-ExtractorManager', `批次提取失敗: ${error.message}`);
                results.push({
                    success: false,
                    error: error.message,
                    siteName: matchResult.siteName,
                    url: matchResult.originalURL
                });
            }
        }

        return results;
    }

    /**
     * 取得提取器統計資訊
     * @returns {Object}
     */
    getStats() {
        const stats = {
            totalExtractors: this.extractors.size,
            extractors: {}
        };

        for (const [siteName, extractor] of this.extractors) {
            stats.extractors[siteName] = {
                name: extractor.name,
                loaded: true
            };
        }

        return stats;
    }

    /**
     * 重新載入指定提取器
     * @param {string} siteName
     * @returns {boolean}
     */
    reloadExtractor(siteName) {
        try {
            // 清除 require 快取
            const extractorPaths = {
                twitter: './twitter-v2',
                instagram: './instagram',
                ptt: './ptt',
                bahamut: './bahamut',
                pixiv: './pixiv',
                bilibili: './bilibili',
                pchome: './pchome',
                linetoday: './line-today',
                msn: './msn',
                udn: './udn',
                storm: './storm',
                cts: './cts',
                xfastest: './xfastest',
                mobile01: './mobile01',
                pornhub: './pornhub',
                nikke: './nikke',
                pokewiki: './52poke',
                '4gamers': './4gamers',
                threads: './threads',
                hololiveshop: './hololive-shop'
            };

            if (extractorPaths[siteName]) {
                delete require.cache[require.resolve(extractorPaths[siteName])];

                // 重新載入提取器
                const ExtractorClass = require(extractorPaths[siteName]);
                this.extractors.set(siteName, new ExtractorClass());

                tfd.sys('TFD-ExtractorManager', `${siteName} 提取器重新載入成功`);
                return true;
            }

            return false;
        } catch (error) {
            tfd.sysError('TFD-ExtractorManager', `重新載入 ${siteName} 失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 添加新的提取器
     * @param {string} siteName
     * @param {Object} extractor
     */
    addExtractor(siteName, extractor) {
        this.extractors.set(siteName, extractor);
        tfd.sys('TFD-ExtractorManager', `已添加 ${siteName} 提取器`);
    }

    /**
     * 移除提取器
     * @param {string} siteName
     * @returns {boolean}
     */
    removeExtractor(siteName) {
        if (this.extractors.has(siteName)) {
            this.extractors.delete(siteName);
            tfd.sys('TFD-ExtractorManager', `已移除 ${siteName} 提取器`);
            return true;
        }
        return false;
    }
}

module.exports = ExtractorManager;
