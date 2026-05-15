const axios = require('axios');
const { normalizeProviderError } = require('../errors');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-mini';

async function translate({ text, apiKey, prompt }) {
    try {
        const response = await axios.post(OPENAI_API_URL, {
            model: DEFAULT_MODEL,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: text }
            ],
            max_tokens: 2048,
            temperature: 0.3
        }, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const translatedText = response.data?.choices?.[0]?.message?.content?.trim();
        if (!translatedText) throw new Error('OpenAI returned empty translation');
        return { success: true, text: translatedText, model: DEFAULT_MODEL };
    } catch (error) {
        const normalized = normalizeProviderError(error);
        return {
            success: false,
            errorType: normalized.errorType,
            error: normalized.message,
            rawError: normalized.rawMessage
        };
    }
}

module.exports = {
    translate,
    DEFAULT_MODEL
};
