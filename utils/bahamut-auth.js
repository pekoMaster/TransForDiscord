/**
 * 巴哈姆特認證模組
 * 處理巴哈姆特帳號登入和 Cookie 管理，用於繞過年齡限制
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const tfd = require('./tfd-logger');

class BahamutAuth {
    constructor() {
        this.cookiePath = path.join(__dirname, '..', 'data', 'bahamut_cookies.json');
        this.loginURL = 'https://api.gamer.com.tw/mobile_app/user/v3/do_login.php';

        // 認證資訊
        this.credentials = {
            uid: 'lmmlmm',
            passwd: '011404'
        };

        // Cookie 快取
        this.cookies = {
            BAHAENUR: null,
            BAHARUNE: null,
            lastUpdate: null
        };

        // 載入已存儲的 Cookie
        this.loadStoredCookies();
    }

    /**
     * 載入已儲存的 Cookie
     */
    loadStoredCookies() {
        try {
            if (fs.existsSync(this.cookiePath)) {
                const storedData = JSON.parse(fs.readFileSync(this.cookiePath, 'utf8'));

                // 檢查 Cookie 是否還有效（24小時內）
                const now = Date.now();
                const lastUpdate = storedData.lastUpdate || 0;
                const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

                if (hoursSinceUpdate < 24 && storedData.BAHAENUR && storedData.BAHARUNE) {
                    this.cookies = storedData;
                    tfd.sys('BahamutAuth', `載入已儲存的有效 Cookie`);
                    return true;
                } else {
                    tfd.sys('BahamutAuth', `儲存的 Cookie 已過期，需要重新登入`);
                }
            }
        } catch (error) {
            tfd.sys('BahamutAuth', `載入 Cookie 失敗: ${error.message}`);
        }
        return false;
    }

    /**
     * 儲存 Cookie 到檔案
     */
    saveCookies() {
        try {
            const dataDir = path.dirname(this.cookiePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            fs.writeFileSync(this.cookiePath, JSON.stringify(this.cookies, null, 2));
            tfd.sys('BahamutAuth', `Cookie 已儲存到檔案`);
        } catch (error) {
            tfd.sysError('BahamutAuth', `儲存 Cookie 失敗: ${error.message}`);
        }
    }

    /**
     * 執行巴哈姆特登入，獲取認證 Cookie
     */
    async login() {
        tfd.sys('BahamutAuth', `開始執行巴哈姆特登入...`);

        try {
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': 'ckAPP_VCODE=9487',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };

            const data = `uid=${this.credentials.uid}&passwd=${this.credentials.passwd}&vcode=9487`;

            const response = await axios.post(this.loginURL, data, {
                headers: headers,
                timeout: 10000
            });

            // 解析 Set-Cookie 標頭
            const setCookieHeaders = response.headers['set-cookie'] || [];
            let foundCookies = false;

            setCookieHeaders.forEach(cookieString => {
                if (cookieString.startsWith('BAHAENUR=')) {
                    this.cookies.BAHAENUR = cookieString.split('BAHAENUR=')[1].split(';')[0];
                    foundCookies = true;
                }
                if (cookieString.startsWith('BAHARUNE=')) {
                    this.cookies.BAHARUNE = cookieString.split('BAHARUNE=')[1].split(';')[0];
                    foundCookies = true;
                }
            });

            if (foundCookies && this.cookies.BAHAENUR && this.cookies.BAHARUNE) {
                this.cookies.lastUpdate = Date.now();
                this.saveCookies();

                tfd.sys('BahamutAuth', `登入成功，已獲取認證 Cookie`);
                return {
                    success: true,
                    BAHAENUR: this.cookies.BAHAENUR,
                    BAHARUNE: this.cookies.BAHARUNE
                };
            } else {
                throw new Error('未能從回應中找到必要的 Cookie');
            }

        } catch (error) {
            tfd.sysError('BahamutAuth', `登入失敗: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 獲取有效的認證 Cookie（自動處理重新登入）
     */
    async getValidCookies() {
        // 檢查現有 Cookie 是否有效
        if (this.cookies.BAHAENUR && this.cookies.BAHARUNE) {
            const now = Date.now();
            const lastUpdate = this.cookies.lastUpdate || 0;
            const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

            // Cookie 在 12 小時內都視為有效
            if (hoursSinceUpdate < 12) {
                tfd.sys('BahamutAuth', `使用現有的有效 Cookie`);
                return {
                    success: true,
                    BAHAENUR: this.cookies.BAHAENUR,
                    BAHARUNE: this.cookies.BAHARUNE
                };
            }
        }

        // Cookie 無效或過期，重新登入
        tfd.sys('BahamutAuth', `Cookie 無效或過期，執行重新登入...`);
        return await this.login();
    }

    /**
     * 生成完整的 Cookie 字符串供 HTTP 請求使用
     */
    async getCookieString() {
        const result = await this.getValidCookies();

        if (result.success) {
            return `BAHAENUR=${result.BAHAENUR}; BAHARUNE=${result.BAHARUNE}; ckAPP_VCODE=9487`;
        } else {
            // 如果認證失敗，返回基本 Cookie
            return 'ckAPP_VCODE=9487';
        }
    }

    /**
     * 檢查認證狀態
     */
    getAuthStatus() {
        const now = Date.now();
        const lastUpdate = this.cookies.lastUpdate || 0;
        const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

        return {
            isAuthenticated: !!(this.cookies.BAHAENUR && this.cookies.BAHARUNE),
            lastUpdate: new Date(lastUpdate).toLocaleString('zh-TW'),
            hoursSinceUpdate: Math.round(hoursSinceUpdate * 100) / 100,
            isValid: hoursSinceUpdate < 12
        };
    }
}

module.exports = BahamutAuth;