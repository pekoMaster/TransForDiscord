const axios = require('axios');
const { normalizeProviderError } = require('../errors');

const FREE_API_BASE_URL = (process.env.FREE_API_BASE_URL || '').replace(/\/$/, '');
const FREE_API_URL = `${FREE_API_BASE_URL}/chat/completions`;
const DEFAULT_MODEL = process.env.FREE_MODEL || 'mimo-v2.5-pro';

async function translate({ text, prompt }) {
    try {
        if (!FREE_API_BASE_URL || !process.env.FREE_API_KEY) {
            throw new Error('FREE provider is not configured');
        }

        const response = await axios.post(FREE_API_URL, {
            model: DEFAULT_MODEL,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: text }
            ],
            max_tokens: 2048,
            temperature: 0.3
        }, {
            headers: {
                Authorization: `Bearer ${process.env.FREE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const translatedText = response.data?.choices?.[0]?.message?.content?.trim();
        if (!translatedText) throw new Error('FREE provider returned empty translation');
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
