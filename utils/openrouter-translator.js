/**
 * OpenRouter 多層翻譯器
 * 使用免費模型進行 VTuber 優化翻譯，支援主/副/備用三層自動切換
 * API 相容 OpenAI 格式：https://openrouter.ai/api/v1/chat/completions
 */

const axios = require('axios');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// 三層模型設定（依優先順序）
const MODELS = [
    {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        tier: 'primary',
        label: 'Llama 3.3 70B'
    },
    {
        id: 'google/gemma-3-27b-it:free',
        tier: 'secondary',
        label: 'Gemma 3 27B'
    },
    {
        id: 'mistralai/mistral-7b-instruct:free',
        tier: 'backup',
        label: 'Mistral 7B'
    }
];

// 各模型冷卻狀態 Map<modelId, cooldownUntil>
const modelCooldowns = new Map();

const COOLDOWN_MS = 5 * 60 * 1000; // 429 後冷卻 5 分鐘
const REQUEST_TIMEOUT = 30000; // 30 秒超時

/**
 * 檢查模型是否在冷卻中
 */
function isOnCooldown(modelId) {
    const until = modelCooldowns.get(modelId);
    if (!until) return false;
    if (Date.now() >= until) {
        modelCooldowns.delete(modelId);
        return false;
    }
    return true;
}

/**
 * 設定模型冷卻
 */
function setCooldown(modelId, durationMs) {
    modelCooldowns.set(modelId, Date.now() + durationMs);
    const label = MODELS.find(m => m.id === modelId)?.label || modelId;
    const minutes = Math.round(durationMs / 60000);
    console.log(`[OpenRouter] ${label} 觸發限流，冷卻 ${minutes} 分鐘`);
}

/**
 * 偵測經紀人/工作人員代發文
 */
function detectManagerPost(text) {
    const patterns = [
        { pattern: /マネジャーより|マネージャーより|マネジャーから/i, type: '經紀人' },
        { pattern: /スタッフより|スタッフから/i, type: '工作人員' },
        { pattern: /運営より|運営から/i, type: '營運團隊' },
        { pattern: /事務所より|事務所から/i, type: '事務所' }
    ];

    for (const { pattern, type } of patterns) {
        if (pattern.test(text)) {
            // 檢查是否含有引用（偶像本人的話）
            const hasIdolContent = /「[^」]+」|『[^』]+』/.test(text);
            return { isManagerPost: true, managerType: type, hasIdolContent };
        }
    }
    return { isManagerPost: false };
}

/**
 * 建立 VTuber 優化翻譯提示詞
 */
function buildPrompt(text) {
    const managerDetection = detectManagerPost(text);

    let systemPrompt = `你是一位專業的 VTuber 文化翻譯專家。請將以下文字翻譯成繁體中文（台灣用語）。

**翻譯規則**：
1. **VTuber 名稱處理**：
   - Hololive（ホロライブ）成員名稱保留原文或使用常見譯名
   - Nijisanji（にじさんじ）成員名稱保留原文或使用常見譯名
   - 其他 VTuber 名稱保留原文
   - 粉絲稱呼保留原文（如：野うさぎ、35P、こよりすと 等）

2. **專有名詞處理**：
   - 直播術語：配信→直播、枠→時段、アーカイブ→存檔、スパチャ→SC/超級留言、メン限→會限
   - 遊戲/活動名稱保留原文
   - 公司/團體名稱保留原文

3. **語氣保持**：
   - 保持原文的情緒和語氣
   - 保留顏文字和表情符號
   - 草/w/wwww 可翻譯為「笑」或保留

4. **格式要求**：
   - 只輸出翻譯結果，不要加任何說明
   - 保持原文的換行格式`;

    if (managerDetection.isManagerPost) {
        systemPrompt += `

5. **【重要】${managerDetection.managerType}代發文處理**：
   - 此文章由「${managerDetection.managerType}」代為發布，不是偶像本人發文
   - 翻譯時使用第三人稱或客觀敘述，不要用偶像的第一人稱視角
   - 「マネジャーより」→「經紀人代發」、「スタッフより」→「工作人員代發」、「運営より」→「營運團隊代發」
   - 保持公告性質的正式語氣`;

        if (managerDetection.hasIdolContent) {
            systemPrompt += `
   - 引用部分（「」『』內）保持偶像的第一人稱語氣`;
        }
    }

    return systemPrompt;
}

/**
 * 呼叫單一 OpenRouter 模型
 */
async function callModel(modelId, text) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY 未設定');

    const response = await axios.post(
        OPENROUTER_API_URL,
        {
            model: modelId,
            messages: [
                { role: 'system', content: buildPrompt(text) },
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
            timeout: REQUEST_TIMEOUT
        }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('模型回傳空內容');

    return content.trim();
}

/**
 * 主翻譯函數：依序嘗試三層模型，遇到限流自動冷卻並切換
 * @param {string} text - 要翻譯的文字
 * @returns {{ success: boolean, text: string, model: string, error?: string, errorType?: string }}
 */
async function translate(text) {
    if (!text || text.trim().length === 0) {
        return { success: true, text: '', model: 'none' };
    }

    const availableModels = MODELS.filter(m => !isOnCooldown(m.id));

    if (availableModels.length === 0) {
        // 所有模型都在冷卻，回報錯誤讓上層使用 DeepL 兜底
        return {
            success: false,
            error: '所有 OpenRouter 模型暫時達到使用限制，請稍後再試',
            errorType: 'ALL_MODELS_COOLDOWN'
        };
    }

    for (const model of availableModels) {
        try {
            console.log(`[OpenRouter] 使用 ${model.label} 翻譯 (${text.length} 字)`);
            const result = await callModel(model.id, text);
            console.log(`[OpenRouter] ${model.label} 翻譯成功`);
            return { success: true, text: result, model: model.id };

        } catch (err) {
            const status = err.response?.status;

            if (status === 429) {
                setCooldown(model.id, COOLDOWN_MS);
                // 繼續嘗試下一個模型
                continue;
            }

            if (status === 402) {
                // 額度不足（免費模型不應發生，但保險起見）
                console.error(`[OpenRouter] ${model.label} 額度不足`);
                setCooldown(model.id, 60 * 60 * 1000); // 冷卻 1 小時
                continue;
            }

            // 其他錯誤（網路/超時/模型錯誤）→ 嘗試下一個
            console.warn(`[OpenRouter] ${model.label} 失敗 (${status || err.code || err.message})，切換到下一個模型`);
        }
    }

    return {
        success: false,
        error: '所有 OpenRouter 模型均失敗',
        errorType: 'ALL_MODELS_FAILED'
    };
}

/**
 * 取得各模型狀態（供除錯用）
 */
function getModelStatus() {
    return MODELS.map(m => ({
        id: m.id,
        label: m.label,
        tier: m.tier,
        available: !isOnCooldown(m.id),
        cooldownUntil: modelCooldowns.get(m.id) || null
    }));
}

module.exports = { translate, getModelStatus };
