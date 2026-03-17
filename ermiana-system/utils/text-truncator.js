/**
 * 推文文字截斷工具
 * 支援中日文雙字元計算的智能截斷功能
 */

class TextTruncator {
    constructor() {
        this.maxCharacters = 300; // 最大字元限制
        this.truncateMessage = '...(其餘請進入原推文觀看)';
    }

    /**
     * 計算文字的字元數（中日文 = 2，英數字 = 1）
     * @param {string} text 要計算的文字
     * @returns {number} 字元數
     */
    calculateCharacterCount(text) {
        if (!text) return 0;

        let count = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const code = char.charCodeAt(0);

            // 判斷是否為中日文字符
            if (this.isCJKCharacter(code)) {
                count += 2; // 中日文字符計為 2 個字元
            } else {
                count += 1; // 英數字符計為 1 個字元
            }
        }

        return count;
    }

    /**
     * 判斷是否為中日韓文字符
     * @param {number} charCode 字符編碼
     * @returns {boolean} 是否為 CJK 字符
     */
    isCJKCharacter(charCode) {
        return (
            // 中文字符範圍
            (charCode >= 0x4E00 && charCode <= 0x9FFF) ||     // CJK 統一漢字
            (charCode >= 0x3400 && charCode <= 0x4DBF) ||     // CJK 擴展 A
            (charCode >= 0x20000 && charCode <= 0x2A6DF) ||   // CJK 擴展 B
            (charCode >= 0x2A700 && charCode <= 0x2B73F) ||   // CJK 擴展 C
            (charCode >= 0x2B740 && charCode <= 0x2B81F) ||   // CJK 擴展 D
            (charCode >= 0x2B820 && charCode <= 0x2CEAF) ||   // CJK 擴展 E
            (charCode >= 0xF900 && charCode <= 0xFAFF) ||     // CJK 兼容漢字
            (charCode >= 0x2F800 && charCode <= 0x2FA1F) ||   // CJK 兼容補充

            // 日文字符範圍
            (charCode >= 0x3040 && charCode <= 0x309F) ||     // 平假名
            (charCode >= 0x30A0 && charCode <= 0x30FF) ||     // 片假名
            (charCode >= 0x31F0 && charCode <= 0x31FF) ||     // 片假名語音擴展
            (charCode >= 0xFF65 && charCode <= 0xFF9F) ||     // 半角片假名

            // 韓文字符範圍
            (charCode >= 0xAC00 && charCode <= 0xD7AF) ||     // 韓文音節
            (charCode >= 0x1100 && charCode <= 0x11FF) ||     // 韓文字母
            (charCode >= 0x3130 && charCode <= 0x318F) ||     // 韓文兼容字母
            (charCode >= 0xA960 && charCode <= 0xA97F) ||     // 韓文字母擴展 A
            (charCode >= 0xD7B0 && charCode <= 0xD7FF)        // 韓文字母擴展 B
        );
    }

    /**
     * 智能截斷文字（帶 URL 保護）
     * @param {string} text 原始文字
     * @returns {Object} { originalText, truncatedText, characterCount, isTruncated }
     */
    truncateText(text) {
        if (!text) {
            return {
                originalText: '',
                truncatedText: '',
                characterCount: 0,
                isTruncated: false
            };
        }

        const originalCount = this.calculateCharacterCount(text);

        // 如果未超過限制，直接返回原文
        if (originalCount <= this.maxCharacters) {
            return {
                originalText: text,
                truncatedText: text,
                characterCount: originalCount,
                isTruncated: false
            };
        }

        // 🔧 提取所有 URL（優先保護 URL 完整性）
        const urls = this.extractURLs(text);

        // 需要截斷
        const truncateMessageCount = this.calculateCharacterCount(this.truncateMessage);
        const availableCount = this.maxCharacters - truncateMessageCount;

        let truncatedText = '';
        let currentCount = 0;

        // 逐字符添加，直到達到可用字元數
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const charCount = this.isCJKCharacter(char.charCodeAt(0)) ? 2 : 1;

            if (currentCount + charCount > availableCount) {
                break;
            }

            truncatedText += char;
            currentCount += charCount;
        }

        // 嘗試在適當的地方截斷（避免截斷在單詞中間）
        truncatedText = this.smartTruncate(truncatedText, text);

        // 🔧 檢查是否破壞了 URL，如果是則進行保護
        const protectedResult = this.protectURLs(truncatedText, text, urls);
        truncatedText = protectedResult.text;
        const appendedURLs = protectedResult.appendedURLs;

        // 組合最終結果
        let finalText = truncatedText + this.truncateMessage;
        if (appendedURLs.length > 0) {
            finalText += '\n\n' + appendedURLs.join('\n');
        }

        return {
            originalText: text,
            truncatedText: finalText,
            characterCount: originalCount,
            isTruncated: true
        };
    }

    /**
     * 提取文字中的所有 URL
     * @param {string} text 文字
     * @returns {Array} URL 陣列
     */
    extractURLs(text) {
        const urlPattern = /https?:\/\/[^\s]+/gi;
        return text.match(urlPattern) || [];
    }

    /**
     * 保護 URL 完整性（防止截斷破壞 URL）
     * @param {string} truncatedText 截斷後的文字
     * @param {string} originalText 原始文字
     * @param {Array} urls 原始文字中的所有 URL
     * @returns {Object} { text: 處理後的文字, appendedURLs: 需要附加的 URL }
     */
    protectURLs(truncatedText, originalText, urls) {
        const appendedURLs = [];
        let processedText = truncatedText;

        // 檢查每個 URL
        for (const url of urls) {
            // 檢查 URL 是否在截斷後的文字中
            if (!processedText.includes(url)) {
                // URL 不完整或被截斷

                // 檢查是否有部分 URL 在截斷文字中
                const urlStart = originalText.indexOf(url);
                const truncatedLength = processedText.length;

                // 如果截斷點在這個 URL 中間
                if (urlStart < truncatedLength && urlStart + url.length > truncatedLength) {
                    // 找出被截斷的部分 URL
                    const partialURL = originalText.substring(urlStart, truncatedLength);

                    // 從截斷文字中移除被破壞的部分 URL
                    if (processedText.endsWith(partialURL)) {
                        processedText = processedText.substring(0, processedText.length - partialURL.length);

                        // 移除末尾的空白和換行
                        processedText = processedText.trimEnd();
                    }

                    // 將完整 URL 加入附加列表
                    appendedURLs.push(`🔗 ${url}`);
                }
            }
        }

        return {
            text: processedText,
            appendedURLs: appendedURLs
        };
    }

    /**
     * 智能截斷（避免在單詞中間截斷）
     * @param {string} truncatedText 已截斷的文字
     * @param {string} originalText 原始文字
     * @returns {string} 智能調整後的截斷文字
     */
    smartTruncate(truncatedText, originalText) {
        if (!truncatedText) return truncatedText;

        const lastChar = truncatedText[truncatedText.length - 1];
        const nextCharIndex = truncatedText.length;

        // 如果截斷點是英文字母，並且下一個字符也是英文字母，
        // 則向前尋找合適的截斷點（空格、標點符號等）
        if (this.isEnglishLetter(lastChar) &&
            nextCharIndex < originalText.length &&
            this.isEnglishLetter(originalText[nextCharIndex])) {

            // 向前尋找最近的空格或標點符號
            for (let i = truncatedText.length - 1; i >= 0; i--) {
                const char = truncatedText[i];
                if (this.isWordBoundary(char)) {
                    return truncatedText.substring(0, i + 1);
                }
            }
        }

        return truncatedText;
    }

    /**
     * 判斷是否為英文字母
     * @param {string} char 字符
     * @returns {boolean}
     */
    isEnglishLetter(char) {
        const code = char.charCodeAt(0);
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    }

    /**
     * 判斷是否為單詞邊界
     * @param {string} char 字符
     * @returns {boolean}
     */
    isWordBoundary(char) {
        return /[\s\.,!?;:]/.test(char);
    }

    /**
     * 為推文內容添加截斷處理
     * @param {string} tweetText 推文文字
     * @param {string} context 上下文（用於日誌）
     * @returns {Object} { text: 處理後的文字, isTruncated: 是否被截斷, fullText: 完整文字 }
     */
    processTweetContent(tweetText, context = 'Tweet') {
        const result = this.truncateText(tweetText);

        const getTimeStamp = () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        if (result.isTruncated) {
            // console.log(`[${getTimeStamp()}] [TextTruncator] ${context} 內容已截斷: ${result.characterCount} 字元 -> ${this.calculateCharacterCount(result.truncatedText)} 字元`);
        } else {
            // console.log(`[${getTimeStamp()}] [TextTruncator] ${context} 內容未超過限制: ${result.characterCount} 字元`);
        }

        // 返回物件格式，包含更多資訊供按鈕使用
        return {
            text: result.truncatedText,
            isTruncated: result.isTruncated,
            fullText: result.originalText
        };
    }
}

module.exports = TextTruncator;