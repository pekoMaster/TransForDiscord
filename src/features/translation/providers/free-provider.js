const axios = require('axios');

// ── Gemini 設定（免費翻譯引擎）──
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_KEY_SLOTS = [2, 3, 4, 6];

let _geminiKeys = null;
let _geminiIdx = 0;

function _loadGeminiKeys() {
    if (_geminiKeys !== null) return _geminiKeys;
    _geminiKeys = [];
    for (const i of GEMINI_KEY_SLOTS) {
        const key = process.env[`GOOGLE_GEMINI_API_KEY_${i}`];
        if (key && key.trim()) _geminiKeys.push(key.trim());
    }
    return _geminiKeys;
}

async function _tryGemini(apiKey, { text, prompt }) {
    const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const systemPrompt = `${prompt}\n\n請將以下文字翻譯成繁體中文，只回傳翻譯結果：`;

    const response = await axios.post(url, {
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${text}` }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.3 }
    }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });

    const translatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!translatedText) throw new Error('Gemini returned empty translation');
    return { success: true, text: translatedText, model: GEMINI_MODEL };
}

// ── 主翻譯函式 ──

async function translate({ text, prompt }) {
    const geminiKeys = _loadGeminiKeys();

    if (geminiKeys.length === 0) {
        return {
            success: false,
            errorType: 'NO_API_KEY',
            error: 'FREE provider Gemini keys are not configured',
            rawError: null
        };
    }

    // 1) Gemini 主要引擎：從目前輪調位置開始，一個一個試
    if (geminiKeys.length > 0) {
        const startIdx = _geminiIdx % geminiKeys.length;
        for (let attempt = 0; attempt < geminiKeys.length; attempt++) {
            const idx = (startIdx + attempt) % geminiKeys.length;
            // 取 Key 但不推進輪調計數器（失敗才算消耗）
            const apiKey = geminiKeys[idx];
            try {
                const result = await _tryGemini(apiKey, { text, prompt });
                // 成功後推進計數器到這個 Key 的下一個位置
                _geminiIdx = (idx + 1) % geminiKeys.length;
                return result;
            } catch (e) {
                continue;
            }
        }
        // 所有 Gemini Key 都失敗，推進到下一個（表示當前這輪沒成功）
        _geminiIdx = (_geminiIdx + 1) % geminiKeys.length;
    }

    return {
        success: false,
        errorType: 'ALL_FAILED',
        error: 'All Gemini translation keys failed',
        rawError: null
    };
}

module.exports = {
    translate,
    DEFAULT_MODEL: GEMINI_MODEL
};
