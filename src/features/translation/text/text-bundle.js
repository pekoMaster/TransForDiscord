const QUOTE_SEPARATOR = '\n\n---QUOTE---\n\n';
const REPLY_SEPARATOR = '\n\n---REPLY---\n\n';

function buildTextBundle({ main, quote = '', reply = '' } = {}) {
    let combined = main || '';
    if (quote) combined += QUOTE_SEPARATOR + quote;
    if (reply) combined += REPLY_SEPARATOR + reply;
    return {
        main: main || '',
        quote: quote || '',
        reply: reply || '',
        combined
    };
}

function splitTranslatedBundle(translatedText) {
    let main = translatedText || '';
    let reply = '';
    let quote = '';

    if (main.includes('---REPLY---')) {
        const parts = main.split(/---REPLY---/);
        main = parts[0];
        reply = parts.slice(1).join('').trim();
    }

    if (main.includes('---QUOTE---')) {
        const parts = main.split(/---QUOTE---/);
        main = parts[0];
        quote = parts.slice(1).join('').trim();
    }

    return {
        main: main.replace(/---QUOTE---/g, '').replace(/---REPLY---/g, '').trim(),
        quote,
        reply
    };
}

function combineTranslatedBundle({ main = '', quote = '', reply = '' } = {}) {
    let combined = main || '';
    if (quote) combined += QUOTE_SEPARATOR + quote;
    if (reply) combined += REPLY_SEPARATOR + reply;
    return combined;
}

module.exports = {
    QUOTE_SEPARATOR,
    REPLY_SEPARATOR,
    buildTextBundle,
    splitTranslatedBundle,
    combineTranslatedBundle
};
