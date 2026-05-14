/**
 * OpenRouter 輪調翻譯器
 * VPS 在 HK，Gemini 直接 API 被 Google 地區封鎖，改用 OpenRouter 作為翻譯 fallback
 */

const DISABLED = false;

const axios = require('axios');
const tfd = require('./tfd-logger');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * 輪調模型清單，依中文能力由強到弱排序（共 27 個）
 *
 * 排除：nvidia/llama-nemotron-embed-vl-1b-v2:free（嵌入向量模型，無法生成文字）
 *
 * ── Tier 1：中文母語模型（中國廠商，中文訓練資料最充足）──────────────────────
 * ── Tier 2：大型多語言模型（規模大、中文表現良好）──────────────────────────────
 * ── Tier 3：中等中文支援（英文為主但仍能翻譯）──────────────────────────────────
 * ── Tier 4：有限中文支援（模型偏小或英文導向，翻譯品質較不穩定）────────────────
 */
const MODELS = [
    // ── Tier 1：中文母語模型 ──────────────────────────────────────────────────────
    {
        id: 'z-ai/glm-4.5-air:free',
        label: 'GLM 4.5 Air'           // 智譜AI（中國），中文最強
    },
    {
        id: 'stepfun/step-3.5-flash:free',
        label: 'Step 3.5 Flash'        // 階躍星辰（中國），中文優秀
    },
    {
        id: 'qwen/qwen3-next-80b-a3b-instruct:free',
        label: 'Qwen3 80B'             // 阿里巴巴，大型中文旗艦
    },
    {
        id: 'minimax/minimax-m2.5:free',
        label: 'MiniMax M2.5'          // MiniMax（中國），中文優秀
    },
    {
        id: 'qwen/qwen3-coder:free',
        label: 'Qwen3 Coder'           // 阿里巴巴，代碼模型但中文良好
    },
    {
        id: 'qwen/qwen3-4b:free',
        label: 'Qwen3 4B'              // 阿里巴巴，小型但中文基礎扎實
    },

    // ── Tier 2：大型多語言模型 ───────────────────────────────────────────────────
    {
        id: 'openai/gpt-oss-120b:free',
        label: 'GPT-OSS 120B'          // 大型，中文良好
    },
    {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        label: 'Llama 3.3 70B'         // 70B，中文良好
    },
    {
        id: 'google/gemma-3-27b-it:free',
        label: 'Gemma 3 27B'           // Google，中文良好
    },
    {
        id: 'openai/gpt-oss-20b:free',
        label: 'GPT-OSS 20B'
    },
    {
        id: 'nousresearch/hermes-3-llama-3.1-405b:free',
        label: 'Hermes 3 405B'         // Llama 基礎，超大型
    },
    {
        id: 'google/gemma-3-12b-it:free',
        label: 'Gemma 3 12B'
    },

    // ── Tier 3：中等中文支援 ─────────────────────────────────────────────────────
    {
        id: 'nvidia/nemotron-3-super-120b-a12b:free',
        label: 'Nemotron Super 120B'   // NVIDIA，英文導向但規模大
    },
    {
        id: 'mistralai/mistral-small-3.1-24b-instruct:free',
        label: 'Mistral Small 3.1'     // 中文有限但尚可
    },
    {
        id: 'google/gemma-3-4b-it:free',
        label: 'Gemma 3 4B'
    },
    {
        id: 'google/gemma-3n-e4b-it:free',
        label: 'Gemma 3n 4B'
    },
    {
        id: 'arcee-ai/trinity-large-preview:free',
        label: 'Trinity Large'         // 英文導向
    },
    {
        id: 'arcee-ai/trinity-mini:free',
        label: 'Trinity Mini'
    },

    // ── Tier 4：有限中文支援（備用，模型偏小或英文為主）──────────────────────────
    {
        id: 'nvidia/nemotron-3-nano-30b-a3b:free',
        label: 'Nemotron Nano 30B'
    },
    {
        id: 'nvidia/nemotron-nano-12b-v2-vl:free',
        label: 'Nemotron Nano 12B'
    },
    {
        id: 'nvidia/nemotron-nano-9b-v2:free',
        label: 'Nemotron Nano 9B'
    },
    {
        id: 'meta-llama/llama-3.2-3b-instruct:free',
        label: 'Llama 3.2 3B'
    },
    {
        id: 'google/gemma-3n-e2b-it:free',
        label: 'Gemma 3n 2B'           // 很小，品質不穩定
    },
    {
        id: 'liquid/lfm-2.5-1.2b-thinking:free',
        label: 'LFM 1.2B Thinking'     // 超小
    },
    {
        id: 'liquid/lfm-2.5-1.2b-instruct:free',
        label: 'LFM 1.2B Instruct'     // 超小
    },
    {
        id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
        label: 'Venice Uncensored'     // 英文為主
    },
    {
        id: 'openrouter/free',
        label: 'OpenRouter Free Route' // 自動路由，最後備用
    }
];

// Round-robin 指標：下一次翻譯從這個位置的模型開始
let currentModelIndex = 0;

// 各模型冷卻狀態 Map<modelId, cooldownUntil>
const modelCooldowns = new Map();

const COOLDOWN_MS = 5 * 60 * 1000; // 429 後冷卻 5 分鐘
const REQUEST_TIMEOUT = 30000;      // 30 秒超時

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
    tfd.sys('OpenRouter', `${label} 觸發限流，冷卻 ${minutes} 分鐘`);
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
            const hasIdolContent = /「[^」]+」|『[^』]+』/.test(text);
            return { isManagerPost: true, managerType: type, hasIdolContent };
        }
    }
    return { isManagerPost: false };
}

/**
 * 建立 VTuber 優化翻譯提示詞
 */
function buildPrompt(text, options = {}) {
    const managerDetection = detectManagerPost(text);

    let systemPrompt = `你是一位專業的 VTuber 文化翻譯專家。請將以下文字翻譯成繁體中文（台灣用語）。

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

    if (managerDetection.isManagerPost) {
        systemPrompt += `

5. 【重要】${managerDetection.managerType}代發文處理：
   - 此文章由「${managerDetection.managerType}」代為發布，不是偶像本人發文
   - 翻譯時使用第三人稱或客觀敘述，不要用偶像的第一人稱視角
   - 「マネジャーより」→「經紀人代發」、「スタッフより」→「工作人員代發」、「運営より」→「營運團隊代發」
   - 保持公告性質的正式語氣`;

        if (managerDetection.hasIdolContent) {
            systemPrompt += `
   - 引用部分（「」『』內）保持偶像的第一人稱語氣`;
        }
    }

    if (options.authorName) {
        const ruleNum = managerDetection.isManagerPost ? 6 : 5;
        systemPrompt += `

${ruleNum}. 帳號自稱判定：
   - 發文者的帳號名稱為「${options.authorName}」
   - 如果推文內容中出現與帳號名稱相同或部分相同的詞彙，這很可能是發文者用自己的名字自稱
   - 翻譯時應將這類自稱翻譯為第一人稱「我」，而非直接保留或翻譯名字`;
    }

    return systemPrompt;
}

/**
 * 呼叫單一 OpenRouter 模型
 */
async function callModel(modelId, text, options = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY 未設定');

    const response = await axios.post(
        OPENROUTER_API_URL,
        {
            model: modelId,
            messages: [
                { role: 'system', content: buildPrompt(text, options) },
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
 * 主翻譯函數：從 currentModelIndex 開始輪調，失敗換下一個
 * 成功後將指標前移，使下次請求從下一個模型開始（均勻分散負載）
 * 冷卻中的模型自動跳過
 *
 * @param {string} text - 要翻譯的文字
 * @returns {{ success: boolean, text: string, model: string, error?: string, errorType?: string }}
 */
async function translate(text, options = {}) {
    if (DISABLED) {
        return { success: false, error: 'OpenRouter 已暫時停用', errorType: 'DISABLED' };
    }

    if (!text || text.trim().length === 0) {
        return { success: true, text: '', model: 'none' };
    }

    const total = MODELS.length;
    const startIndex = currentModelIndex;

    for (let i = 0; i < total; i++) {
        const idx = (startIndex + i) % total;
        const model = MODELS[idx];

        if (isOnCooldown(model.id)) {
            continue;
        }

        try {
            tfd.sys('OpenRouter', `[${idx + 1}/${total}] 使用 ${model.label} 翻譯 (${text.length} 字)`);
            const result = await callModel(model.id, text, options);

            // 成功：指標移到下一個，讓下次從不同模型開始
            currentModelIndex = (idx + 1) % total;
            tfd.sys('OpenRouter', `${model.label} 翻譯成功，下次從 ${MODELS[currentModelIndex].label} 開始`);

            return { success: true, text: result, model: model.id };

        } catch (err) {
            const status = err.response?.status;

            if (status === 429) {
                setCooldown(model.id, COOLDOWN_MS);
                continue;
            }

            if (status === 402) {
                // 額度不足（免費模型不應發生，但保險起見）
                tfd.sysError('OpenRouter', `${model.label} 額度不足`);
                setCooldown(model.id, 60 * 60 * 1000); // 冷卻 1 小時
                continue;
            }

            // 其他錯誤（網路/超時/模型錯誤）→ 嘗試下一個，不設冷卻
            tfd.sysWarn('OpenRouter', `${model.label} 失敗 (${status || err.code || err.message})，切換到下一個`);
        }
    }

    // 全部都失敗或冷卻中
    const allCooled = MODELS.every(m => isOnCooldown(m.id));
    return {
        success: false,
        error: allCooled
            ? '所有 OpenRouter 模型暫時達到使用限制，請稍後再試'
            : '所有 OpenRouter 模型均失敗',
        errorType: allCooled ? 'ALL_MODELS_COOLDOWN' : 'ALL_MODELS_FAILED'
    };
}

/**
 * 取得各模型狀態（供 /tfd status 除錯用）
 */
function getModelStatus() {
    return MODELS.map((m, idx) => ({
        id: m.id,
        label: m.label,
        available: !isOnCooldown(m.id),
        isNext: idx === currentModelIndex,
        cooldownUntil: modelCooldowns.get(m.id) || null
    }));
}

/**
 * 手動重置 round-robin 指標（除錯用）
 */
function resetIndex() {
    currentModelIndex = 0;
    tfd.sys('OpenRouter', 'Round-robin 指標已重置');
}

module.exports = { translate, getModelStatus, resetIndex };
