const DEFAULT_ALLOWED_BOT_MESSAGES = Object.freeze([
    { guildId: '893068521121132594', botId: '1113221032908693534' }
]);

function parseAllowedBotMessages(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') return [];
    return rawValue.split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
            const [guildId, botId] = entry.split(':').map(part => part && part.trim());
            return guildId && botId ? { guildId, botId } : null;
        })
        .filter(Boolean);
}

function getAllowedBotMessages() {
    return DEFAULT_ALLOWED_BOT_MESSAGES.concat(parseAllowedBotMessages(process.env.TFD_ALLOWED_BOT_MESSAGES));
}

function isAllowedBotMessage(message) {
    if (!message || !message.author || !message.author.bot) return false;
    const guildId = message.guildId || message.guild?.id || null;
    const botId = message.author.id;
    if (!guildId || !botId) return false;

    return getAllowedBotMessages().some(entry => entry.guildId === guildId && entry.botId === botId);
}

module.exports = {
    DEFAULT_ALLOWED_BOT_MESSAGES,
    parseAllowedBotMessages,
    getAllowedBotMessages,
    isAllowedBotMessage
};
