const ERROR_MESSAGES = {
    NO_PROVIDER_SELECTED: '❌ 請先使用 `/pe api model` 選擇翻譯引擎，再使用翻譯功能。',
    NO_API_KEY: '❌ 你選擇的翻譯引擎尚未設定 API Key。請使用 `/pe api add` 設定 Key，或使用 `/pe api model` 更換引擎。',
    INVALID_API_KEY: '❌ API Key 無效，請重新設定。',
    QUOTA_EXHAUSTED: '⚠️ API 額度已用完或被限流，請稍後再試。',
    TIMEOUT: '⏰ 翻譯超時，請稍後再試。',
    TEXT_TOO_LONG: '❌ 文字過長，暫時無法翻譯。',
    ALL_PROVIDERS_FAILED: '❌ 所有翻譯引擎都失敗，請稍後再試。',
    FREE_NOT_READY: '❌ 免費翻譯尚未啟用，請先選擇 Gemini、OpenRouter、OpenAI 或 Claude。',
    UNKNOWN_ERROR: '❌ 翻譯失敗，請稍後再試。'
};

function normalizeProviderError(error) {
    const message = error?.message || String(error || '');
    const status = error?.response?.status;

    if (status === 401 || status === 403 || /invalid|api key/i.test(message)) {
        return {
            errorType: 'INVALID_API_KEY',
            message: ERROR_MESSAGES.INVALID_API_KEY,
            rawMessage: message
        };
    }

    if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(message)) {
        return {
            errorType: 'QUOTA_EXHAUSTED',
            message: ERROR_MESSAGES.QUOTA_EXHAUSTED,
            rawMessage: message
        };
    }

    if (/timeout|ETIMEDOUT/i.test(message)) {
        return {
            errorType: 'TIMEOUT',
            message: ERROR_MESSAGES.TIMEOUT,
            rawMessage: message
        };
    }

    return {
        errorType: 'UNKNOWN_ERROR',
        message: ERROR_MESSAGES.UNKNOWN_ERROR,
        rawMessage: message
    };
}

function failure(errorType, overrideMessage = null) {
    return {
        success: false,
        text: null,
        translated: null,
        errorType,
        error: overrideMessage || ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR
    };
}

module.exports = {
    ERROR_MESSAGES,
    normalizeProviderError,
    failure
};
