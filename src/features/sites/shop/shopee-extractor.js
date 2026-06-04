/**
 * Shopee 蝦皮購物 提取器
 * 從 Shopee 商品頁面提取基本資訊（名稱、描述、圖片）
 *
 * 重要限制（2026-06-04 探勘結果）：
 * - Shopee API（v4 item/get、v2 item/get、pdp、recommend、shop items、search_items）
 *   全部回 403 + error 90309999（antifraud），server-side 抓不到
 * - 一般 browser UA 拿到的 HTML 是純 CSR，資料在 JS state
 * - Bot UA（如 facebookexternalhit/1.1）可拿到 SSR 版 HTML，內含 OG meta
 *   可用欄位：og:title（去 " | 蝦皮購物"）、og:description、og:image（promo 圖，非真實商品圖）
 * - 不可用：售價、原價、折扣、評價、已售出、variants、完整圖組
 *   這些都只在 client-side JS state 裡，bot UA 拿不到
 *
 * 設計：仿 pchome 介面（extract / fetchOGMeta / createProductEmbed），
 * 但只取 OG meta，不打 API；單張圖、無價格，視為「最小可接受預覽」。
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');
const tfd = require('../../../shared/logging/tfd-logger');

class ShopeeExtractor {
    constructor() {
        this.name = 'Shopee 蝦皮購物';
        this.icon = '🧡';
        this.color = 0xEE4D2D; // Shopee 橘
    }

    /**
     * 提取 Shopee 商品資訊
     * @param {Object} matchResult - URL 匹配結果（來自 matcher.js）
     * @param {Object} message - Discord 訊息物件（可選）
     * @returns {Promise<Object>}
     */
    async extract(matchResult, message = null) {
        tfd.sys('Shopee', `${this.icon} 開始提取 Shopee 商品資訊...`);

        try {
            const url = matchResult.originalURL;
            const { shopId, itemId } = matchResult.extractedData || {};

            if (!shopId || !itemId) {
                throw new Error('無效的 Shopee URL 格式：無法提取 shopId / itemId');
            }

            tfd.sys('Shopee', `🧡 shopId=${shopId}, itemId=${itemId}`);

            const og = await this.fetchOGMeta(url);
            const cleaned = this.cleanOGMeta(og);

            // 偵測 SSR fallback：商品不存在 / 已下架 / 被擋時，Shopee 會回
            // "蝦皮購物" 或 "蝦皮購物 | ..." 當標題，且 og:image 為空
            const isGenericTitle = !cleaned.title
                || cleaned.title === '蝦皮購物'
                || /^蝦皮購物\s*\|/.test(cleaned.title);
            const isMissingImage = !cleaned.image;

            if (isGenericTitle || isMissingImage) {
                throw new Error('Shopee SSR 頁面缺真實商品內容（標題或圖片缺失，可能商品已下架 / ID 錯誤 / 被擋）');
            }

            const productData = {
                url: cleaned.url || url,
                shopId,
                itemId,
                title: cleaned.title,
                description: cleaned.description,
                image: cleaned.image
            };

            const embed = this.createProductEmbed(productData);

            tfd.sys('Shopee', `✅ ${this.icon} Shopee 商品資訊提取成功`);
            tfd.sys('Shopee', `   標題: ${productData.title.slice(0, 60)}${productData.title.length > 60 ? '...' : ''}`);
            tfd.sys('Shopee', `   描述長度: ${productData.description.length}`);
            tfd.sys('Shopee', `   圖片: ${productData.image ? productData.image.slice(0, 80) + '...' : '無'}`);

            return {
                success: true,
                embed: embed,
                siteName: 'shopee',
                contentType: 'product',
                data: productData
            };

        } catch (error) {
            tfd.sysError('Shopee', `❌ ${this.icon} Shopee 提取失敗: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 以 bot UA 抓 SSR HTML 並取出 OG meta
     * @param {string} url - Shopee 商品 URL
     * @returns {Promise<Object>} { title, description, image, url }
     */
    async fetchOGMeta(url) {
        const resp = await axios.get(url, {
            // 用 arraybuffer 再手動 utf-8 解碼，避免 axios 預設把 UTF-8 當 latin1 解
            responseType: 'arraybuffer',
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: (s) => s === 200,
            headers: {
                // facebookexternalhit UA 會拿到 Shopee 的 SSR 版（含 OG meta）
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const html = Buffer.from(resp.data).toString('utf-8');
        const $ = cheerio.load(html);
        const meta = {};
        $('meta').each((_, el) => {
            const k = $(el).attr('property') || $(el).attr('name');
            const v = $(el).attr('content');
            if (k && v) meta[k] = v;
        });
        return {
            title: meta['og:title'] || '',
            description: meta['og:description'] || '',
            image: meta['og:image'] || '',
            url: meta['og:url'] || ''
        };
    }

    /**
     * 清理 OG meta：去標題的「 | 蝦皮購物」後綴、截斷過長描述
     * @param {Object} og
     * @returns {Object}
     */
    cleanOGMeta(og) {
        const title = (og.title || '').replace(/\s*\|\s*蝦皮購物\s*$/, '').trim();
        // Discord embed description 限制 4096，這裡保守 1024（保留閱讀空間）
        const description = (og.description || '').length > 1024
            ? og.description.slice(0, 1021) + '...'
            : (og.description || '');
        return {
            title,
            description,
            image: og.image,
            url: og.url
        };
    }

    /**
     * 驗證 URL 是否為 Shopee 商品頁
     * @param {string} url
     * @returns {boolean}
     */
    static isValidUrl(url) {
        return /https?:\/\/(?:www\.)?shopee\.tw\/(?:product\/\d+\/\d+|[^\/\s]*-i\.\d+\.\d+)/i.test(url);
    }

    /**
     * 從 URL 提取 shopId / itemId
     * @param {string} url
     * @returns {{shopId: string|null, itemId: string|null}}
     */
    static extractIds(url) {
        // 新格式：shopee.tw/product/{shopId}/{itemId}
        const m1 = url.match(/https?:\/\/(?:www\.)?shopee\.tw\/product\/(\d+)\/(\d+)/i);
        if (m1) return { shopId: m1[1], itemId: m1[2] };
        // 舊格式：shopee.tw/{slug}-i.{shopId}.{itemId}
        const m2 = url.match(/https?:\/\/(?:www\.)?shopee\.tw\/[^\/\s]*-i\.(\d+)\.(\d+)/i);
        if (m2) return { shopId: m2[1], itemId: m2[2] };
        return { shopId: null, itemId: null };
    }

    /**
     * 創建商品 Discord Embed
     * @param {Object} productData
     * @returns {EmbedBuilder}
     */
    createProductEmbed(productData) {
        const embed = new EmbedBuilder()
            .setColor(this.color) // Shopee 橘
            .setTitle(productData.title)
            .setURL(productData.url);

        if (productData.description) {
            embed.setDescription(productData.description);
        }

        if (productData.image) {
            embed.setImage(productData.image);
        }

        embed.setFooter({
            text: `${this.icon} ${this.name} | Peko Embed`
        });

        embed.setTimestamp();

        return embed;
    }
}

module.exports = ShopeeExtractor;
