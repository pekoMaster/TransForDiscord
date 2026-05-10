/**
 * 翻譯詞庫預處理器
 * 在送 DeepL 前先處理固定術語，避免機翻錯譯
 *
 * 兩種處理方式：
 * 1. replace — 日文術語直接替換為繁中（如 配信→直播）
 * 2. protect — 不該翻的詞用占位符包住，翻完再還原（如 野うさぎ）
 */

const fs = require('fs');
const path = require('path');

const GLOSSARY_PATH = path.join(__dirname, '../data/translation-glossary.json');

// 占位符格式：《TFD_0》《TFD_1》...（用全形書名號，DeepL 不會動它）
const PLACEHOLDER_PREFIX = '《TFD_';
const PLACEHOLDER_SUFFIX = '》';

let glossary = null;
let replaceRules = []; // [{ pattern: RegExp, replacement: string }]
let protectRules = []; // [{ pattern: RegExp, original: string }]

/**
 * 載入並編譯詞庫
 */
function loadGlossary() {
    try {
        const raw = fs.readFileSync(GLOSSARY_PATH, 'utf8');
        glossary = JSON.parse(raw);
    } catch (e) {
        console.error('[Glossary] 載入詞庫失敗:', e.message);
        glossary = { replace: {}, protect: {} };
    }

    // 編譯替換規則（長詞優先，避免短詞先匹配到）
    replaceRules = [];
    if (glossary.replace) {
        for (const [category, terms] of Object.entries(glossary.replace)) {
            if (category.startsWith('_')) continue; // 跳過說明欄位
            if (typeof terms !== 'object') continue;
            for (const [jp, zh] of Object.entries(terms)) {
                replaceRules.push({ pattern: jp, replacement: zh });
            }
        }
    }
    // 長詞優先排序
    replaceRules.sort((a, b) => b.pattern.length - a.pattern.length);

    // 編譯保護規則（長詞優先）
    protectRules = [];
    if (glossary.protect) {
        for (const [category, terms] of Object.entries(glossary.protect)) {
            if (category.startsWith('_')) continue;
            if (!Array.isArray(terms)) continue;
            for (const term of terms) {
                protectRules.push({ original: term });
            }
        }
    }
    protectRules.sort((a, b) => b.original.length - a.original.length);

    console.log(`[Glossary] 載入完成: ${replaceRules.length} 個替換規則, ${protectRules.length} 個保護規則`);
}

// 啟動時載入
loadGlossary();

// 監聽檔案變更，熱更新（改詞庫不用重啟）
try {
    fs.watchFile(GLOSSARY_PATH, { interval: 10000 }, () => {
        console.log('[Glossary] 偵測到詞庫變更，重新載入...');
        loadGlossary();
    });
} catch (_) {}

/**
 * 預處理：在送 DeepL 前處理文字
 * @param {string} text - 原始文字
 * @returns {{ processed: string, restoreMap: Map<string, string> }}
 */
function preProcess(text) {
    if (!text) return { processed: text, restoreMap: new Map() };

    let result = text;
    const restoreMap = new Map();
    let placeholderIdx = 0;

    // Step 1: 保護不該翻的詞（用占位符替代）
    for (const rule of protectRules) {
        if (!result.includes(rule.original)) continue;

        const placeholder = `${PLACEHOLDER_PREFIX}${placeholderIdx}${PLACEHOLDER_SUFFIX}`;
        // 全部替換該詞的出現
        while (result.includes(rule.original)) {
            result = result.replace(rule.original, placeholder);
            restoreMap.set(placeholder, rule.original);
        }
        placeholderIdx++;
    }

    // Step 2: 替換固定術語
    for (const rule of replaceRules) {
        if (!result.includes(rule.pattern)) continue;

        // 全部替換
        while (result.includes(rule.pattern)) {
            result = result.replace(rule.pattern, rule.replacement);
        }
    }

    return { processed: result, restoreMap };
}

/**
 * 後處理：把占位符還原為原文
 * @param {string} text - DeepL 翻譯後的文字
 * @param {Map<string, string>} restoreMap - 占位符對應表
 * @returns {string}
 */
function postProcess(text, restoreMap) {
    if (!text || !restoreMap || restoreMap.size === 0) return text;

    let result = text;
    for (const [placeholder, original] of restoreMap) {
        while (result.includes(placeholder)) {
            result = result.replace(placeholder, original);
        }
    }
    return result;
}

/**
 * 完整翻譯流程包裝：預處理 → 翻譯函數 → 後處理
 * @param {string} text - 原始文字
 * @param {Function} translateFn - 翻譯函數 async (text) => translatedText
 * @returns {Promise<string>} 翻譯後的文字
 */
async function translateWithGlossary(text, translateFn) {
    const { processed, restoreMap } = preProcess(text);
    const translated = await translateFn(processed);
    return postProcess(translated, restoreMap);
}

/**
 * 手動重新載入詞庫
 */
function reload() {
    loadGlossary();
}

module.exports = {
    preProcess,
    postProcess,
    translateWithGlossary,
    reload
};
