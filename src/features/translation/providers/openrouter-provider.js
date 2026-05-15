const axios = require('axios');
const { normalizeProviderError } = require('../errors');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS = [
    'z-ai/glm-4.5-air:free',
    'stepfun/step-3.5-flash:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'minimax/minimax-m2.5:free',
    'openai/gpt-oss-120b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'openrouter/free'
];

let currentModelIndex = 0;
const modelCooldowns = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

function isOnCooldown(model) {
    const until = modelCooldowns.get(model);
    if (!until) return false;
    if (Date.now() >= until) {
        modelCooldowns.delete(model);
        return false;
    }
    return true;
}

async function translate({ text, apiKey, prompt }) {
    let lastError = null;
    const total = MODELS.length;

    for (let i = 0; i < total; i++) {
        const idx = (currentModelIndex + i) % total;
        const model = MODELS[idx];
        if (isOnCooldown(model)) continue;

        try {
            const response = await axios.post(OPENROUTER_API_URL, {
                model,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: text }
                ],
                max_tokens: 2048,
                temperature: 0.3
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/TransForDiscord',
                    'X-Title': 'TransForDiscord'
                },
                timeout: 30000
            });

            const translatedText = response.data?.choices?.[0]?.message?.content?.trim();
            if (!translatedText) throw new Error('OpenRouter returned empty translation');
            currentModelIndex = (idx + 1) % total;
            return { success: true, text: translatedText, model };
        } catch (error) {
            lastError = error;
            if (error.response?.status === 429) {
                modelCooldowns.set(model, Date.now() + COOLDOWN_MS);
            }
        }
    }

    const normalized = normalizeProviderError(lastError);
    return {
        success: false,
        errorType: normalized.errorType,
        error: normalized.message,
        rawError: normalized.rawMessage
    };
}

function getModelStatus() {
    return MODELS.map((model, idx) => ({
        id: model,
        label: model,
        available: !isOnCooldown(model),
        isNext: idx === currentModelIndex,
        cooldownUntil: modelCooldowns.get(model) || null
    }));
}

function resetIndex() {
    currentModelIndex = 0;
}

module.exports = {
    translate,
    getModelStatus,
    resetIndex,
    MODELS
};
