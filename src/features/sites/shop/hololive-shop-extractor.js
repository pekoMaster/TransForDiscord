/**
 * Hololive Shop 提取器
 * 從 shop.hololivepro.com 提取商品資訊
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');
const tfd = require('../../../shared/logging/tfd-logger');

class HololiveShopExtractor {
    constructor() {
        this.name = 'Hololive Shop';
        this.icon = '🛍️';
        this.color = 0x39C5BB;
        this.timeout = 10000;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    async extract(matchResult, message = null) {
        const url = matchResult.originalURL;
        tfd.sys('HololiveShop', `${this.icon} 開始提取: ${url}`);

        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': this.userAgent },
                timeout: this.timeout,
                maxRedirects: 5
            });

            const $ = cheerio.load(response.data);
            const productData = this.extractProductData($, url);
            const embed = this.createProductEmbed(productData);

            tfd.sys('HololiveShop', `✅ 提取成功: ${productData.title}`);

            return {
                success: true,
                embed: embed,
                siteName: 'hololiveshop',
                contentType: 'product',
                data: productData
            };
        } catch (error) {
            tfd.sysError('HololiveShop', `❌ 提取失敗: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    extractProductData($, url) {
        return {
            title: this.extractTitle($),
            price: this.extractPrice($),
            image: this.extractMainImage($),
            delivery: this.extractDeliveryInfo($),
            status: this.extractStatus($),
            description: this.extractDescription($),
            url
        };
    }

    extractTitle($) {
        const selectors = [
            'h1.Pdt_title',
            'h1.product-meta__title',
            '.product-form__title h1',
            'h1'
        ];
        for (const sel of selectors) {
            const text = $(sel).first().text().trim();
            if (text) return text;
        }
        const pageTitle = $('title').first().text().trim()
            .replace(/\s*[–\-|].*hololive.*$/i, '');
        return pageTitle || '未知商品';
    }

    extractPrice($) {
        const selectors = [
            '.Option_price .money',
            '.Option_price',
            '.price .money',
            '.product-form__price .money',
            '.price-item--regular',
            '.price__regular .money'
        ];
        for (const sel of selectors) {
            const text = $(sel).first().text().trim();
            if (text && text.includes('¥')) return text;
        }
        const metaPrice = $('meta[property="product:price:amount"]').attr('content');
        const metaCurrency = $('meta[property="product:price:currency"]').attr('content');
        if (metaPrice) return `¥${metaPrice}${metaCurrency ? ' ' + metaCurrency : ''}`;
        return null;
    }

    extractMainImage($) {
        const excludePatterns = [
            'logo_officialshop', 'hololive.png', 'hololive_id.png',
            'hololive_en.png', 'dev_is.png', 'holostars.png',
            'holostars_en.png', 'amazon_merch', 'kokuchi', 'loading_small.png'
        ];
        const fourDigitPattern = /\/(\d{4})_[a-f0-9]{8}-[a-f0-9]{4}-/;

        const selectors = [
            'img[src*="hololivepro.com"]',
            'img[src*="/cdn/shop/files/"]',
            'img[src*="holo"]'
        ];

        for (const sel of selectors) {
            const found = $(sel);
            for (let i = 0; i < found.length; i++) {
                let src = $(found[i]).attr('src') || $(found[i]).attr('data-src');
                if (!src) continue;
                if (src.startsWith('//')) src = 'https:' + src;

                const lower = src.toLowerCase();
                if (excludePatterns.some(p => lower.includes(p.toLowerCase()))) continue;
                if (fourDigitPattern.test(src)) continue;
                if (lower.includes('_banner') && !lower.includes('product')) continue;

                return src.replace(/\?v=\d+/g, '');
            }
        }

        const ogImage = $('meta[property="og:image"]').attr('content');
        return ogImage || null;
    }

    extractDeliveryInfo($) {
        const shippingSection = $('.Pdt_shipping');
        if (shippingSection.length === 0) return null;

        const parts = [];

        for (const keyword of ['販売期間', '受注受付期間']) {
            const el = shippingSection.find(`p:contains("${keyword}")`);
            if (el.length > 0) {
                parts.push(el.text().trim());
                break;
            }
        }

        const deliverySpan = shippingSection.find('span.shipping_ttl:contains("お届け予定日")');
        if (deliverySpan.length > 0) {
            const parentText = deliverySpan.parent().text().trim();
            const match = parentText.match(/お届け予定日[：:]\s*([^。\n]+)/);
            if (match) parts.push(`お届け予定日：${match[1].trim()}`);
        }

        return parts.length > 0 ? parts.join('\n') : null;
    }

    extractStatus($) {
        const selectors = [
            '.product-form__cart .btn',
            '.product-form__buttons button',
            '.add-to-cart-btn'
        ];
        for (const sel of selectors) {
            const text = $(sel).first().text().trim();
            if (!text) continue;
            if (text.includes('売り切れ') || text.includes('sold out')) return '❌ 已售完';
            if (text.includes('カートに追加') || text.includes('add to cart')) return '✅ 可購買';
            if (text.includes('予約') || text.includes('pre-order')) return '📅 預購中';
            return text;
        }
        return null;
    }

    extractDescription($) {
        const selectors = ['.Pdt_description', 'meta[name="description"]', 'meta[property="og:description"]'];
        for (const sel of selectors) {
            let text;
            if (sel.startsWith('meta')) {
                text = $(sel).attr('content');
            } else {
                text = $(sel).first().text().trim();
            }
            if (text) return text.replace(/\s+/g, ' ').trim();
        }
        return '';
    }

    createProductEmbed(data) {
        const embed = new EmbedBuilder()
            .setColor(this.color)
            .setTitle(data.title)
            .setURL(data.url);

        if (data.description) {
            const desc = data.description.length > 200
                ? data.description.substring(0, 200) + '...'
                : data.description;
            embed.setDescription(desc);
        }

        const fields = [];
        if (data.price) fields.push({ name: '💰 價格', value: data.price, inline: true });
        if (data.status) fields.push({ name: '📋 狀態', value: data.status, inline: true });
        if (data.delivery) {
            const deliveryText = data.delivery.length > 300
                ? data.delivery.substring(0, 300) + '...'
                : data.delivery;
            fields.push({ name: '🚚 銷售與配送', value: deliveryText, inline: false });
        }
        if (fields.length > 0) embed.addFields(fields);

        if (data.image) embed.setImage(data.image);

        embed.setFooter({ text: `${this.icon} Hololive Shop | Peko Embed` });
        embed.setTimestamp();

        return embed;
    }
}

module.exports = HololiveShopExtractor;
