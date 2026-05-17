/**
 * PCHome 24h購物提取器
 * 從 PCHome 24h 購物網站提取產品資訊
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');
const tfd = require('../../../shared/logging/tfd-logger');

class PChomeExtractor {
    constructor() {
        this.name = 'PCHome 24h購物';
        this.icon = '🛒';
        this.color = 0xEA1717; // PCHome 紅色
    }

    /**
     * 提取 PCHome 產品資訊
     * @param {Object} matchResult - URL 匹配結果（來自 matcher.js）
     * @param {Object} message - Discord 訊息物件（可選）
     * @returns {Promise<Object>} 產品資訊
     */
    async extract(matchResult, message = null) {
        tfd.sys('PChome', `${this.icon} 開始提取 PCHome 產品資訊...`);

        try {
            // 從 matchResult 提取產品 ID
            const productId = matchResult.extractedData?.productId;
            const url = matchResult.originalURL;

            if (!productId) {
                throw new Error('無效的 PCHome URL 格式：無法提取產品 ID');
            }

            tfd.sys('PChome', `📦 產品 ID: ${productId}`);

            // 獲取產品基本資訊
            const basicInfo = await this.fetchBasicInfo(productId);

            // 獲取產品詳細資訊
            const detailInfo = await this.fetchDetailInfo(productId);

            // 組合完整資訊
            const productData = {
                url: url,
                productId: productId,
                title: basicInfo.title,
                price: basicInfo.price,
                image: basicInfo.image,
                brand: detailInfo.brand,
                description: detailInfo.slogan
            };

            // 創建 Discord Embed
            const embed = this.createProductEmbed(productData);

            tfd.sys('PChome', `✅ ${this.icon} PCHome 產品資訊提取成功`);

            return {
                success: true,
                embed: embed,
                siteName: 'pchome',
                contentType: 'product',
                data: productData
            };

        } catch (error) {
            tfd.sysError('PChome', `❌ ${this.icon} PCHome 提取失敗: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 獲取產品基本資訊（名稱、價格、圖片）
     * @param {string} productId - 產品 ID
     * @returns {Promise<Object>}
     */
    async fetchBasicInfo(productId) {
        const apiUrl = `https://ecapi-cdn.pchome.com.tw/ecshop/prodapi/v2/prod/${productId}&fields=Name,Nick,Price,Pic&_callback=jsonp_prod&2837602?_callback=jsonp_prod`;

        tfd.sys('PChome', `📡 獲取基本資訊: ${apiUrl.substring(0, 80)}...`);

        const response = await axios.get(apiUrl, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.status !== 200) {
            throw new Error(`API 請求失敗: ${response.status}`);
        }

        // 解析 JSONP 回應
        const data = response.data;

        // 提取產品標題（Nick 欄位）
        const nickMatch = data.match(/"Nick":"(.*?)",/);
        if (!nickMatch) {
            throw new Error('無法提取產品標題');
        }
        const rawNick = unescape(nickMatch[1].replace(/\\u/g, '%u').replace(/\\/g, ''));
        const $ = cheerio.load(rawNick);
        const title = $.text();

        // 提取價格
        const priceMatch = data.match(/"P":(\d+)/);
        if (!priceMatch) {
            throw new Error('無法提取產品價格');
        }
        const price = `NT$ ${parseInt(priceMatch[1]).toLocaleString()}`;

        // 提取圖片 URL
        const picMatch = data.match(/"B":"(.*?)",/);
        if (!picMatch) {
            throw new Error('無法提取產品圖片');
        }
        const picPath = unescape(picMatch[1].replace(/\\u/g, '%u').replace(/\\/g, ''));
        const image = `https://img.pchome.com.tw/cs${picPath}`;

        tfd.sys('PChome', `✅ 基本資訊提取成功`);
        tfd.sys('PChome', `   標題: ${title.substring(0, 50)}...`);
        tfd.sys('PChome', `   價格: ${price}`);
        tfd.sys('PChome', `   圖片: ${image.substring(0, 60)}...`);

        return {
            title,
            price,
            image
        };
    }

    /**
     * 獲取產品詳細資訊（品牌、標語）
     * @param {string} productId - 產品 ID
     * @returns {Promise<Object>}
     */
    async fetchDetailInfo(productId) {
        const apiUrl = `https://ecapi-cdn.pchome.com.tw/cdn/ecshop/prodapi/v2/prod/${productId}/desc&fields=Meta,SloganInfo&_callback=jsonp_desc?_callback=jsonp_desc`;

        tfd.sys('PChome', `📡 獲取詳細資訊...`);

        try {
            const response = await axios.get(apiUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.status !== 200) {
                tfd.sysWarn('PChome', '⚠️ 詳細資訊 API 請求失敗，使用預設值');
                return {
                    brand: '未提供',
                    slogan: ''
                };
            }

            const data = response.data;

            // 提取品牌
            let brand = '未提供';
            const brandMatch = data.match(/BrandNames":\[(.*?)\]/);
            if (brandMatch) {
                brand = unescape(brandMatch[1].replace(/\\u/g, '%u'))
                    .replace(/","/g, '_')
                    .replace(/^"|"$/g, '');
            }

            // 提取標語
            let slogan = '';
            const sloganMatch = data.match(/SloganInfo":\[(.*?)\]/);
            if (sloganMatch) {
                slogan = unescape(sloganMatch[1].replace(/\\u/g, '%u'))
                    .replace(/","/g, '\n')
                    .replace(/^"|"$/g, '');
            }

            tfd.sys('PChome', `✅ 詳細資訊提取成功`);
            tfd.sys('PChome', `   品牌: ${brand}`);
            tfd.sys('PChome', `   標語: ${slogan ? slogan.substring(0, 50) + '...' : '無'}`);

            return {
                brand,
                slogan
            };

        } catch (error) {
            tfd.sysWarn('PChome', `⚠️ 詳細資訊提取失敗: ${error.message}，使用預設值`);
            return {
                brand: '未提供',
                slogan: ''
            };
        }
    }

    /**
     * 驗證 URL 是否為 PCHome 產品頁
     * @param {string} url - 要驗證的 URL
     * @returns {boolean}
     */
    static isValidUrl(url) {
        return /https:\/\/24h\.pchome\.com\.tw\/prod\/[A-Z0-9]{6}-[A-Z0-9]{9}/.test(url);
    }

    /**
     * 從 URL 提取產品 ID
     * @param {string} url - PCHome URL
     * @returns {string|null} 產品 ID
     */
    static extractProductId(url) {
        const match = url.match(/https:\/\/24h\.pchome\.com\.tw\/prod\/([A-Z0-9]{6}-[A-Z0-9]{9})/);
        return match ? match[1] : null;
    }

    /**
     * 創建產品 Discord Embed
     * @param {Object} productData - 產品資料
     * @returns {EmbedBuilder}
     */
    createProductEmbed(productData) {
        const embed = new EmbedBuilder()
            .setColor(this.color) // PCHome 紅色 #EA1717
            .setTitle(productData.title)
            .setURL(productData.url);

        // 添加產品標語描述（如果有）
        if (productData.description) {
            embed.setDescription(productData.description);
        }

        // 添加品牌和價格欄位
        const fields = [];

        if (productData.brand) {
            fields.push({
                name: '🏷️ 品牌',
                value: productData.brand,
                inline: true
            });
        }

        if (productData.price) {
            fields.push({
                name: '💰 價格',
                value: productData.price,
                inline: true
            });
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // 設定產品圖片
        if (productData.image) {
            embed.setImage(productData.image);
        }

        // Footer
        embed.setFooter({
            text: `${this.icon} PCHome 24h購物 | Peko Embed`
        });

        embed.setTimestamp();

        return embed;
    }
}

module.exports = PChomeExtractor;
