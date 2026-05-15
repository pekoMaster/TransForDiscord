/**
 * AI 翻譯引擎 — 支援 OpenAI / Claude / Gemini 三廠商輪調
 * 使用用戶自備的 API Key，若用戶設定多組 Key 則自動輪調
 */

const axios = require('axios');
const { getAllKeys, PROVIDERS } = require('./user-api-key-storage.js');
const { EmbedBuilder } = require('discord.js');
const tfd = require('./tfd-logger');

// VTuber 優化翻譯提示詞（基礎版）
const BASE_SYSTEM_PROMPT = `你是一位專業的 VTuber 文化翻譯專家。請將以下文字翻譯成繁體中文（台灣用語）。

翻譯規則：
1. VTuber 名稱處理：
   - Hololive（ホロライブ）成員名稱保留原文或使用常見譯名
   - Nijisanji（にじさんじ）成員名稱保留原文或使用常見譯名
   - 其他 VTuber 名稱保留原文
   - 粉絲稱呼保留原文（如：野うさぎ、35P、こよりすと 等）

2. 專有名詞處理：
   - 直播術語：配信→直播、枠→時段、アーカイブ→存檔、スパチャ→SC/超級留言、メン限→會限
   - 遊戲/活動名稱保留原文
   - 公司/團體名稱保留原文

3. 語氣保持：
   - 保持原文的情緒和語氣
   - 保留顏文字和表情符號
   - 草/w/wwww 可翻譯為「笑」或保留

4. 格式要求：
   - 只輸出翻譯結果，不要加任何說明
   - 保持原文的換行格式`;

/**
 * 建構完整的系統提示詞（根據選項動態附加規則）
 * @param {Object} options
 * @param {string} options.authorName - 發文者帳號名稱（用於自稱判定）
 * @returns {string}
 */
function buildSystemPrompt(options = {}) {
    let prompt = BASE_SYSTEM_PROMPT;

    if (options.authorName) {
        prompt += `

5. 帳號自稱判定：
   - 發文者的帳號名稱為「${options.authorName}」
   - 如果推文內容中出現與帳號名稱相同或部分相同的詞彙，這很可能是發文者用自己的名字自稱（日本文化中常見以自己的名字代替「我」）
   - 翻譯時應將這類自稱翻譯為第一人稱「我」，而非直接保留或翻譯名字
   - 例如：帳號名「博衣こより」，推文寫「こよりは〜」→ 翻譯為「我〜」`;
    }

    return prompt;
}

// 用戶輪調狀態：Map<userId, nextProviderIndex>
const userRotation = new Map();

/**
 * 取得用戶可用的廠商列表（已設定 Key 的）
 */
function getAvailableProviders(userId) {
    const keys = getAllKeys(userId);
    const providers = Object.entries(keys)
        .filter(([, key]) => key && key.trim())
        .map(([provider]) => provider);
    if (!providers.includes('free')) providers.push('free');
    return providers;
}

/**
 * 取得用戶下一個輪調的廠商
 */
function getNextProvider(userId, availableProviders) {
    if (availableProviders.length === 0) return null;
    if (availableProviders.length === 1) return availableProviders[0];

    const idx = userRotation.get(userId) || 0;
    const provider = availableProviders[idx % availableProviders.length];
    userRotation.set(userId, (idx + 1) % availableProviders.length);
    return provider;
}

/**
 * 使用 OpenAI API 翻譯
 */
async function translateWithOpenAI(text, apiKey, systemPrompt) {
    const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4.1-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            max_tokens: 2048,
            temperature: 0.3
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI 回傳空內容');
    return content.trim();
}

/**
 * 使用 Claude API 翻譯
 */
async function translateWithClaude(text, apiKey, systemPrompt) {
    const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
            model: 'claude-sonnet-4-6-20250227',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [
                { role: 'user', content: text }
            ]
        },
        {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );

    const content = response.data?.content?.[0]?.text;
    if (!content) throw new Error('Claude 回傳空內容');
    return content.trim();
}

const GEMINI_MODEL_FALLBACKS = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.1-pro-preview'
];

/**
 * 使用 Gemini API 翻譯（多模型 fallback）
 */
async function translateWithGemini(text, apiKey, systemPrompt) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `${systemPrompt}\n\n原文：\n${text}\n\n譯文：`;

    let lastError = null;
    for (let i = 0; i < GEMINI_MODEL_FALLBACKS.length; i++) {
        const modelName = GEMINI_MODEL_FALLBACKS[i];
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt
            });

            const content = response.text;
            if (!content) throw new Error('Gemini 回傳空內容');
            tfd.sys('AI-Translate', `Gemini 翻譯成功 (${modelName})`);
            return content.trim();
        } catch (err) {
            lastError = err;
            const msg = err.message || '';

            // 地區限制：不重試，直接拋出
            if (msg.includes('FAILED_PRECONDITION') || msg.includes('location is not supported')) {
                throw err;
            }

            const retryable = ['503', 'UNAVAILABLE', '429', '404', 'quota', 'RESOURCE_EXHAUSTED',
                'rate limit', 'not found', 'INVALID_ARGUMENT', 'timeout', 'ETIMEDOUT']
                .some(k => msg.includes(k));

            if (!retryable || i === GEMINI_MODEL_FALLBACKS.length - 1) break;
            tfd.sysWarn('AI-Translate', `Gemini ${modelName} 失敗 (${msg})，切換下一個模型`);
        }
    }
    throw lastError || new Error('所有 Gemini 模型都無法使用');
}

/**
 * 使用 OpenRouter API 翻譯（用戶自備 key，模型：openrouter/free）
 */
async function translateWithOpenRouter(text, apiKey, systemPrompt) {
    const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            model: 'openrouter/free',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            max_tokens: 2048,
            temperature: 0.3
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/TransForDiscord',
                'X-Title': 'TransForDiscord'
            },
            timeout: 30000
        }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter 回傳空內容');
    return content.trim();
}

// 廠商對應翻譯函數
const TRANSLATE_FN = {
    openai:     translateWithOpenAI,
    claude:     translateWithClaude,
    gemini:     translateWithGemini,
    openrouter: translateWithOpenRouter
};

/**
 * 主翻譯函數：使用用戶自備的 API Key，多廠商輪調
 * @param {string} text - 要翻譯的文字
 * @param {string} userId - Discord 用戶 ID
 * @param {Object} options - 翻譯選項
 * @param {string} options.authorName - 發文者帳號名稱（用於自稱判定）
 * @returns {{ success: boolean, text?: string, model?: string, error?: string, errorType?: string }}
 */
async function translate(text, userId, options = {}) {
    if (!text || text.trim().length === 0) {
        return { success: true, text: '', model: 'none' };
    }

    const allAvailable = getAvailableProviders(userId);

    // 免費翻譯
    if (options.provider === 'free' || (!options.provider && allAvailable.length === 1 && allAvailable[0] === 'free')) {
        return await translateFree(text, options);
    }

    // 若指定了 provider，只使用該廠商
    const availableProviders = options.provider
        ? (allAvailable.includes(options.provider) ? [options.provider] : [])
        : allAvailable;

    if (availableProviders.length === 0) {
        return { success: false, error: '未設定任何 AI API Key', errorType: 'NO_API_KEY' };
    }

    const keys = getAllKeys(userId);
    const startProvider = getNextProvider(userId, availableProviders);
    const startIdx = availableProviders.indexOf(startProvider);

    // 建構動態提示詞（含自稱判定等）
    const systemPrompt = buildSystemPrompt(options);

    // 輪調嘗試：從 startProvider 開始，失敗則換下一個
    for (let i = 0; i < availableProviders.length; i++) {
        const providerIdx = (startIdx + i) % availableProviders.length;
        const provider = availableProviders[providerIdx];
        const apiKey = keys[provider];
        const translateFn = TRANSLATE_FN[provider];

        if (!translateFn) continue;

        try {
            tfd.sys('AI-Translate', `使用 ${PROVIDERS[provider].name} 翻譯 (${text.length} 字)`);
            const result = await translateFn(text, apiKey, systemPrompt);
            tfd.sys('AI-Translate', `${PROVIDERS[provider].name} 翻譯成功`);
            return { success: true, text: result, model: provider };
        } catch (err) {
            const status = err.response?.status;
            tfd.sysWarn('AI-Translate', `${PROVIDERS[provider].name} 失敗 (${status || err.message})`);

            // 判斷錯誤類型
            if (status === 401 || status === 403) {
                tfd.sysError('AI-Translate', `${PROVIDERS[provider].name} API Key 無效`);
            } else if (status === 429) {
                tfd.sysWarn('AI-Translate', `${PROVIDERS[provider].name} 配額用盡`);
            }
            // 繼續嘗試下一個廠商
        }
    }

    return {
        success: false,
        error: '所有 AI 翻譯引擎均失敗，請確認你的 API Key 是否有效',
        errorType: 'ALL_FAILED'
    };
}

/**
 * 建立 API Key 教學 Embed（當用戶沒有設定 Key 時顯示）
 * @returns {EmbedBuilder}
 */
function buildApiKeyTutorialEmbed() {
    return new EmbedBuilder()
        .setTitle('🔑 設定 AI 翻譯 API Key')
        .setDescription('要使用 AI 翻譯功能，你需要先設定至少一組 API Key。\n支援以下四種 AI 服務，設定多組可自動輪調：')
        .addFields(
            {
                name: '🟢 OpenAI (GPT-4o-mini)',
                value: '1. 前往 [platform.openai.com](https://platform.openai.com/api-keys)\n2. 建立新的 API Key\n3. 使用 `/pe api add` 指令設定\n\n金鑰格式：`sk-proj-...`',
                inline: false
            },
            {
                name: '🟣 Claude (Anthropic)',
                value: '1. 前往 [console.anthropic.com](https://console.anthropic.com/settings/keys)\n2. 建立新的 API Key\n3. 使用 `/pe api add` 指令設定\n\n金鑰格式：`sk-ant-...`',
                inline: false
            },
            {
                name: '🔵 Gemini (Google)',
                value: '1. 前往 [aistudio.google.com](https://aistudio.google.com/app/apikey)\n2. 建立新的 API Key\n3. 使用 `/pe api add` 指令設定\n\n金鑰格式：`AIzaSy...`',
                inline: false
            },
            {
                name: '🔶 OpenRouter',
                value: '1. 前往 [openrouter.ai](https://openrouter.ai/settings/keys)\n2. 建立新的 API Key\n3. 使用 `/pe api add` 指令設定\n\n金鑰格式：`sk-or-v1-...`',
                inline: false
            },
            {
                name: '📝 設定指令',
                value: '```\n/pe api add provider:OpenAI apikey:你的金鑰\n/pe api add provider:Claude apikey:你的金鑰\n/pe api add provider:Gemini apikey:你的金鑰\n/pe api add provider:OpenRouter apikey:你的金鑰\n```\n設定多組 Key 時，翻譯會自動在可用的服務間輪調。',
                inline: false
            }
        )
        .setColor(0x5865F2)
        .setFooter({ text: 'API Key 僅存儲於伺服器本地，不會外洩。使用 /pe api status 查看設定狀態。' });
}

/**
 * 免費翻譯（使用共用額度，額度不穩定屬正常現象）
 */
async function translateFree(text, options = {}) {
    // TODO: 接入 NotebookLM 或其他免費翻譯後端
    return {
        success: false,
        error: '免費翻譯後端尚未接入，請先選擇其他翻譯引擎',
        errorType: 'FREE_NOT_READY'
    };
}


module.exports = {
    translate,
    translateFree,
    buildApiKeyTutorialEmbed,
    getAvailableProviders
};
