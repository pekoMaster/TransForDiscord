/**
 * 翻譯工具模組
 * 使用 Google Translate API 進行多語言翻譯
 * 使用 OpenCC 進行繁簡中文轉換
 */

const translate = require('@iamtraction/google-translate');
const OpenCC = require('opencc-js');

class Translator {
    constructor() {
        // 初始化 OpenCC 轉換器
        this.converterToSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
        this.converterToTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
    }

    /**
     * 翻譯文字到繁體中文
     * @param {string} text - 要翻譯的文字
     * @returns {Promise<Object>} 翻譯結果 { text, from }
     */
    async toTraditionalChinese(text) {
        try {
            if (!text || text.trim() === '') {
                throw new Error('沒有可翻譯的內容');
            }

            console.log(`[Translator] 翻譯到繁體中文: "${text.substring(0, 50)}..."`);

            // 使用 Google Translate 翻譯到繁體中文
            const result = await translate(text, { to: 'zh-TW' });

            console.log(`[Translator] 翻譯成功 (來源語言: ${result.from.language.iso})`);

            return {
                text: result.text,
                from: result.from.language.iso,
                original: text
            };

        } catch (error) {
            console.error('[Translator] 翻譯失敗:', error.message);
            throw new Error(`翻譯失敗：${error.message}`);
        }
    }

    /**
     * 繁體中文轉簡體中文
     * @param {string} text - 繁體中文文字
     * @returns {string} 簡體中文文字
     */
    traditionalToSimplified(text) {
        try {
            if (!text || text.trim() === '') {
                throw new Error('沒有可轉換的內容');
            }

            console.log(`[Translator] 繁→簡轉換: "${text.substring(0, 50)}..."`);

            const result = this.converterToSimplified(text);

            console.log('[Translator] 繁→簡轉換成功');

            return result;

        } catch (error) {
            console.error('[Translator] 繁→簡轉換失敗:', error.message);
            throw new Error(`繁→簡轉換失敗：${error.message}`);
        }
    }

    /**
     * 簡體中文轉繁體中文
     * @param {string} text - 簡體中文文字
     * @returns {string} 繁體中文文字
     */
    simplifiedToTraditional(text) {
        try {
            if (!text || text.trim() === '') {
                throw new Error('沒有可轉換的內容');
            }

            console.log(`[Translator] 簡→繁轉換: "${text.substring(0, 50)}..."`);

            const result = this.converterToTraditional(text);

            console.log('[Translator] 簡→繁轉換成功');

            return result;

        } catch (error) {
            console.error('[Translator] 簡→繁轉換失敗:', error.message);
            throw new Error(`簡→繁轉換失敗：${error.message}`);
        }
    }

    /**
     * 檢測文字語言
     * @param {string} text - 要檢測的文字
     * @returns {Promise<string>} 語言代碼 (ISO 639-1)
     */
    async detectLanguage(text) {
        try {
            if (!text || text.trim() === '') {
                throw new Error('沒有可檢測的內容');
            }

            const result = await translate(text, { to: 'zh-TW' });
            return result.from.language.iso;

        } catch (error) {
            console.error('[Translator] 語言檢測失敗:', error.message);
            return 'unknown';
        }
    }
}

// 導出單例
module.exports = new Translator();
