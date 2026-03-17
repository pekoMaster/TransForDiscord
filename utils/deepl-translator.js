/**
 * DeepL 翻譯工具模組
 * 提供使用 DeepL API 進行翻譯的功能
 */

const axios = require('axios');
require('dotenv').config();

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_ENDPOINT = 'https://api-free.deepl.com/v2/translate';

/**
 * DeepL 翻譯器類別
 */
class DeepLTranslator {
    constructor() {
        if (!DEEPL_API_KEY) {
            console.error('❌ DeepL API Key 未設定！');
            this.isAvailable = false;
        } else {
            this.isAvailable = true;
            // 初始化日誌已移除（減少啟動時輸出）
        }
    }

    /**
     * 翻譯文字到指定語言
     * @param {string} text - 要翻譯的文字
     * @param {string} targetLang - 目標語言代碼 (ZH: 中文, EN-US: 英文, JA: 日文等)
     * @returns {Promise<Object>} 翻譯結果 { success, translatedText, detectedSourceLang, error }
     */
    async translate(text, targetLang = 'ZH') {
        if (!this.isAvailable) {
            return {
                success: false,
                error: 'DeepL API Key 未設定'
            };
        }

        if (!text || text.trim() === '') {
            return {
                success: false,
                error: '翻譯文字不能為空'
            };
        }

        try {
            const response = await axios.post(
                DEEPL_API_ENDPOINT,
                {
                    text: [text],
                    target_lang: targetLang
                },
                {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10 秒超時
                }
            );

            if (response.data && response.data.translations && response.data.translations.length > 0) {
                const translation = response.data.translations[0];
                return {
                    success: true,
                    translatedText: translation.text,
                    detectedSourceLang: translation.detected_source_language
                };
            } else {
                return {
                    success: false,
                    error: 'DeepL API 返回格式異常'
                };
            }

        } catch (error) {
            console.error('❌ DeepL 翻譯錯誤:', error.message);

            // 錯誤類型判斷
            if (error.response) {
                const status = error.response.status;
                if (status === 403) {
                    return {
                        success: false,
                        error: 'DeepL API Key 無效或無權限'
                    };
                } else if (status === 456) {
                    return {
                        success: false,
                        error: 'DeepL API 配額已用盡'
                    };
                } else {
                    return {
                        success: false,
                        error: `DeepL API 錯誤 (${status})`
                    };
                }
            } else if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    error: '翻譯請求超時，請稍後再試'
                };
            } else {
                return {
                    success: false,
                    error: '網路連線失敗'
                };
            }
        }
    }

    /**
     * 翻譯為繁體中文
     * @param {string} text - 要翻譯的文字
     * @returns {Promise<Object>} 翻譯結果
     */
    async toTraditionalChinese(text) {
        return await this.translate(text, 'ZH');
    }

    /**
     * 翻譯為英文
     * @param {string} text - 要翻譯的文字
     * @returns {Promise<Object>} 翻譯結果
     */
    async toEnglish(text) {
        return await this.translate(text, 'EN-US');
    }

    /**
     * 翻譯為日文
     * @param {string} text - 要翻譯的文字
     * @returns {Promise<Object>} 翻譯結果
     */
    async toJapanese(text) {
        return await this.translate(text, 'JA');
    }

    /**
     * 檢查 API 是否可用
     * @returns {boolean}
     */
    checkAvailability() {
        return this.isAvailable;
    }
}

// 單例模式
let instance = null;

/**
 * 獲取 DeepL 翻譯器實例
 * @returns {DeepLTranslator}
 */
function getInstance() {
    if (!instance) {
        instance = new DeepLTranslator();
    }
    return instance;
}

module.exports = {
    getInstance,
    DeepLTranslator
};
