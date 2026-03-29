/*jshint esversion: 9 */
/**
 * facebook-smart.js
 * 智能 Facebook 提取器
 *
 * 2026-02-23 重構：優先使用 MBasic 版本
 * 提取順序：MBasic → WithLogin → 標準版
 */

const FacebookMBasicExtractor = require('./facebook-mbasic');  // 新版：基於 mbasic.facebook.com
const FacebookExtractor = require('./facebook');               // 標準版本（備用）
const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class FacebookSmartExtractor {
    constructor() {
        this.name = 'facebook_smart';
        this.mbasicExtractor = null;      // MBasic 版本（優先）
        this.fallbackExtractor = new FacebookExtractor();
        this.hasLoginState = null;
    }

    /**
     * 檢查是否有保存的登入狀態
     */
    async checkLoginState() {
        if (this.hasLoginState !== null) {
            return this.hasLoginState;
        }

        try {
            const sessionDir = path.join(__dirname, '..', '..', 'data', 'facebook_session');
            await fs.access(sessionDir);
            this.hasLoginState = true;
            console.log('[FB Smart] ✅ 檢測到 Facebook 登入狀態');
            return true;
        } catch {
            this.hasLoginState = false;
            console.log('[FB Smart] ⚠️  未檢測到 Facebook 登入狀態');
            return false;
        }
    }

    /**
     * 提取 Facebook 內容
     * 2026-02-24: 停用圖片抓取，只保留轉址功能
     */
    async extract(matchResult, message = null) {
        const { originalURL } = matchResult;

        // ==================== 只做轉址，不抓取圖片 ====================
        // 2026-02-24: 停用圖片抓取功能，直接返回轉址結果
        console.log('[FB Smart] 僅轉址模式（圖片抓取已停用）');

        return {
            success: true,
            siteName: 'facebook',
            data: {
                url: originalURL,
                facebedURL: originalURL,
                extractMethod: 'redirect_only'
            },
            // 不返回 embed 和 multipleImages，讓系統只顯示連結
            skipEmbed: true
        };

        /* ==================== 舊版圖片抓取邏輯（已停用）====================
        try {
            const hasLogin = await this.checkLoginState();

            if (hasLogin) {
                // ==================== 優先使用 MBasic 版本 ====================
                console.log('[FB Smart] 使用 MBasic 版本提取器（推薦）');

                if (!this.mbasicExtractor) {
                    this.mbasicExtractor = new FacebookMBasicExtractor();
                }

                try {
                    const result = await this.mbasicExtractor.extract(originalURL, {}, message);

                    if (result.success) {
                        result.data.extractMethod = 'mbasic';

                        // 轉換格式供 message-handler 使用
                        if (result.data.images && result.data.images.length > 0) {
                            result.multipleImages = result.data.images.map(img => img.src || img);
                        }

                        // 創建 Embed
                        if (!result.embed) {
                            result.embed = this._createEmbed(result.data);
                        }

                        if (!result.data.facebedURL) {
                            result.data.facebedURL = originalURL;
                        }

                        console.log(`[FB Smart] ✅ MBasic 版本成功 (${result.data.images?.length || 0} 張圖片)`);
                        return result;
                    }

                    console.log('[FB Smart] ⚠️  MBasic 版本失敗，嘗試 fallback');

                } catch (error) {
                    console.error('[FB Smart] MBasic 版本錯誤:', error.message);
                }
            }

            // ==================== Fallback: 標準版本 ====================
            console.log('[FB Smart] 使用標準版本提取器');
            const result = await this.fallbackExtractor.extract(matchResult, message);

            if (result.success) {
                result.data = result.data || {};
                result.data.extractMethod = 'standard';
                console.log('[FB Smart] ✅ 標準版本成功');
            }

            return result;

        } catch (error) {
            console.error('[FB Smart] 提取失敗:', error.message);

            return {
                success: false,
                siteName: 'facebook',
                error: error.message,
                data: { url: originalURL }
            };
        }
        ==================== 舊版圖片抓取邏輯結束 ==================== */
    }

    /**
     * 清理資源
     */
    async close() {
        if (this.mbasicExtractor) {
            await this.mbasicExtractor.close();
        }
    }

    /**
     * 重新檢查登入狀態
     */
    async refreshLoginState() {
        this.hasLoginState = null;
        return await this.checkLoginState();
    }

    /**
     * 創建 Facebook Embed
     */
    _createEmbed(data) {
        const embed = new EmbedBuilder()
            .setColor(0x1877F2);

        // 標題：作者名稱
        if (data.author) {
            const title = data.author.length > 256
                ? data.author.substring(0, 253) + '...'
                : data.author;
            embed.setTitle(title);
        }

        // 描述：貼文內容
        if (data.content) {
            const description = data.content.length > 4000
                ? data.content.substring(0, 3997) + '...'
                : data.content;
            embed.setDescription(description);
        }

        // URL
        if (data.url) {
            embed.setURL(data.url);
        }

        // 第一張圖片作為縮圖
        if (data.images && data.images.length > 0) {
            const firstImage = data.images[0].src || data.images[0];
            embed.setImage(firstImage);
        }

        // Footer：統計資訊
        const stats = [];
        if (data.interactions) {
            if (data.interactions.likes) stats.push(`❤️ ${data.interactions.likes}`);
            if (data.interactions.comments) stats.push(`💬 ${data.interactions.comments}`);
            if (data.interactions.shares) stats.push(`📤 ${data.interactions.shares}`);
        }
        if (data.timestamp) {
            stats.push(`🕐 ${data.timestamp}`);
        }

        const footerText = stats.length > 0 ? stats.join(' · ') : 'Facebook';
        embed.setFooter({ text: footerText });

        return embed;
    }
}

module.exports = FacebookSmartExtractor;
