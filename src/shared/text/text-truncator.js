/**
 * Text Truncator — 共用文字截斷工具
 *
 * 2026-06-05 新增：
 *   - 原本 PTT 有自己的 truncateContent()（只算中文字）
 *   - 用戶要求 PTT + Threads 都加上「100 英數字元」閾值
 *   - 抽出共用邏輯，雙 extractor 共用同一條規則
 *
 * 規則（預設）：
 *   - 計算 CJK 中文字數（不含 URL、不含空白）
 *   - 計算 ASCII 英數字元數（a-z, A-Z, 0-9；不含 URL、不含空白）
 *   - **任一**超過閾值（預設 100）就觸發截斷
 *   - 截斷時以觸發的字元類型為計數依據
 *   - URL 完整保留（不算字數也不被切斷）
 *
 * 輸出：
 *   {
 *     text: '<截斷後文字>' + placeholder,
 *     isTruncated: boolean,
 *     chineseCount: number,
 *     asciiAlnumCount: number,
 *     truncatedAt: number  // 在原文字中的字元位置
 *   }
 */

const URL_PATTERN = /https?:\/\/[^\s]+/g;
const CJK_RANGE = [0x4e00, 0x9fff]; // CJK Unified Ideographs 基本範圍

const DEFAULT_OPTIONS = {
    maxChineseChars: 100,
    maxAsciiAlnum: 100,
    placeholder: '\n\n-# ⬇️ 點擊「展開」查看完整內文'
};

/**
 * 計算 CJK 中文字數
 * @param {string} text
 * @returns {number}
 * @private
 */
function countChineseChars(text) {
    if (!text) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code >= CJK_RANGE[0] && code <= CJK_RANGE[1]) count++;
    }
    return count;
}

/**
 * 計算 ASCII 英數字元數（a-z, A-Z, 0-9）
 * @param {string} text
 * @returns {number}
 * @private
 */
function countAsciiAlnum(text) {
    if (!text) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if ((code >= 0x30 && code <= 0x39) ||  // 0-9
            (code >= 0x41 && code <= 0x5a) ||  // A-Z
            (code >= 0x61 && code <= 0x7a)) {  // a-z
            count++;
        }
    }
    return count;
}

/**
 * 移除 URL（用於字數計算；URL 仍會保留在截斷後文字中）
 * @param {string} text
 * @returns {string}
 * @private
 */
function stripUrls(text) {
    return text ? text.replace(URL_PATTERN, '') : '';
}

/**
 * 截斷文字
 *
 * @param {string} text 原始文字
 * @param {Object} [options]
 * @param {number} [options.maxChineseChars=100] 中文字數閾值
 * @param {number} [options.maxAsciiAlnum=100] 英數字元數閾值
 * @param {string} [options.placeholder='\n\n-# ⬇️ 點擊「展開」查看完整內文'] 截斷後附加的提示
 * @returns {{
 *   text: string,        // 純截斷後文字（不含 placeholder）
 *   placeholder: string, // 純 placeholder
 *   displayText: string, // text + placeholder（embed 顯示用）
 *   isTruncated: boolean,
 *   chineseCount: number,
 *   asciiAlnumCount: number,
 *   truncatedAt: number
 * }}
 */
function truncateText(text, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!text) {
        return {
            text: '',
            placeholder: opts.placeholder || '',
            displayText: opts.placeholder || '',
            isTruncated: false,
            chineseCount: 0,
            asciiAlnumCount: 0,
            truncatedAt: 0
        };
    }

    // 計算字數（排除 URL）
    const textWithoutUrls = stripUrls(text);
    const chineseCount = countChineseChars(textWithoutUrls);
    const asciiAlnumCount = countAsciiAlnum(textWithoutUrls);

    const chineseOver = chineseCount > opts.maxChineseChars;
    const asciiOver = asciiAlnumCount > opts.maxAsciiAlnum;

    if (!chineseOver && !asciiOver) {
        return {
            text,
            placeholder: '',
            displayText: text,
            isTruncated: false,
            chineseCount,
            asciiAlnumCount,
            truncatedAt: text.length
        };
    }

    // 決定用哪個字元類型計數
    const useChinese = chineseOver;
    const limit = useChinese ? opts.maxChineseChars : opts.maxAsciiAlnum;

    let charCount = 0;
    let truncated = '';
    let i = 0;

    while (i < text.length && charCount < limit) {
        // URL 跳過不計數但完整保留
        if (text.charAt(i) === 'h' && text.substr(i, 8).match(/^https?:\/\//)) {
            const urlMatch = text.substr(i).match(/^https?:\/\/[^\s]+/);
            if (urlMatch) {
                truncated += urlMatch[0];
                i += urlMatch[0].length;
                continue;
            }
        }

        const code = text.charCodeAt(i);
        if (useChinese) {
            if (code >= CJK_RANGE[0] && code <= CJK_RANGE[1]) charCount++;
        } else {
            if ((code >= 0x30 && code <= 0x39) ||
                (code >= 0x41 && code <= 0x5a) ||
                (code >= 0x61 && code <= 0x7a)) {
                charCount++;
            }
        }
        truncated += text[i];
        i++;
    }

    const placeholder = opts.placeholder || '';
    return {
        text: truncated,
        placeholder,
        displayText: truncated + placeholder,
        isTruncated: true,
        chineseCount,
        asciiAlnumCount,
        truncatedAt: i
    };
}

module.exports = {
    truncateText,
    countChineseChars,
    countAsciiAlnum,
    stripUrls,
    DEFAULT_OPTIONS
};
