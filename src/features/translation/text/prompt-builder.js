const BASE_RULES = [
    '你是一位熟悉 VTuber 社群語境的翻譯助手。',
    '請將文字翻譯成自然的繁體中文。',
    '保留人名、團體名、專有名詞、網址、hashtag、emoji、顏文字。',
    '人名（包括日文、英文、韓文等所有人名）必須保持原樣，絕對不要翻譯或音譯。例如「クマリンちゃん」要保持「クマリンちゃん」，不要翻譯成「小熊醬」。',
    '不要加入原文沒有的解釋。',
    '如果文字包含 ---QUOTE--- 或 ---REPLY---，請保留這些分隔符。'
];

function buildPrompt({ authorName = null, context = '' } = {}) {
    const lines = ['請翻譯成繁體中文', ...BASE_RULES];

    if (authorName) {
        lines.push(`發文者名稱是「${authorName}」，第一人稱語氣請優先視為該作者。`);
    }

    if (context) {
        lines.push(`額外上下文：\n${context}`);
    }

    lines.push('請翻譯成繁體中文');
    return lines.join('\n');
}

module.exports = {
    buildPrompt
};
