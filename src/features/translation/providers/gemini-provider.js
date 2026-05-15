const { normalizeProviderError } = require('../errors');

const MODEL_FALLBACKS = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.1-pro-preview'
];

function isRetryableGeminiError(errorType, rawMessage = '') {
    if (errorType === 'QUOTA_EXHAUSTED' || errorType === 'TIMEOUT') return true;
    return /503|UNAVAILABLE|404|not found|not supported|INVALID_ARGUMENT/i.test(rawMessage);
}

async function translate({ text, apiKey, prompt }) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    let lastError = null;

    for (const model of MODEL_FALLBACKS) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: `${prompt}\n\n原文：\n${text}\n\n譯文：`
            });

            const translatedText = response.text?.trim();
            if (!translatedText) throw new Error('Gemini returned empty translation');
            return { success: true, text: translatedText, model };
        } catch (error) {
            lastError = error;
            const normalized = normalizeProviderError(error);
            if (!isRetryableGeminiError(normalized.errorType, normalized.rawMessage)) {
                break;
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

module.exports = {
    translate,
    MODEL_FALLBACKS
};
