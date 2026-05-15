const axios = require('axios');
const { normalizeProviderError } = require('../errors');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6-20250227';

async function translate({ text, apiKey, prompt }) {
    try {
        const response = await axios.post(CLAUDE_API_URL, {
            model: DEFAULT_MODEL,
            max_tokens: 2048,
            system: prompt,
            messages: [
                { role: 'user', content: text }
            ]
        }, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const translatedText = response.data?.content?.[0]?.text?.trim();
        if (!translatedText) throw new Error('Claude returned empty translation');
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
