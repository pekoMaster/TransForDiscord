const {
    getMessageState,
    setMessageState
} = require('../../state/v2-state-store');

function getViewMessageId(interaction) {
    return interaction?.message?.id || null;
}

function getStoredViewState(interaction, getState = getMessageState) {
    const messageId = getViewMessageId(interaction);
    if (!messageId) return null;
    return getState(messageId);
}

function setStoredViewState(interaction, state, setState = setMessageState) {
    const messageId = getViewMessageId(interaction);
    if (!messageId) return null;
    return setState(messageId, state);
}

module.exports = {
    getStoredViewState,
    setStoredViewState
};
