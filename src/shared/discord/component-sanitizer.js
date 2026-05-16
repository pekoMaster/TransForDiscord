const { ActionRowBuilder } = require('discord.js');

const ACTION_ROW_TYPE = 1;
const MAX_ACTION_ROW_COMPONENTS = 5;

function sanitizeComponentsForSend(components) {
    if (!Array.isArray(components) || components.length === 0) return undefined;

    const sanitized = [];

    for (const component of components) {
        if (!isActionRow(component)) {
            sanitized.push(component);
            continue;
        }

        const rowComponents = getActionRowComponents(component);
        if (rowComponents.length === 0) continue;

        for (let i = 0; i < rowComponents.length; i += MAX_ACTION_ROW_COMPONENTS) {
            const chunk = rowComponents.slice(i, i + MAX_ACTION_ROW_COMPONENTS);
            if (chunk.length > 0) {
                sanitized.push(new ActionRowBuilder().addComponents(...chunk));
            }
        }
    }

    return sanitized.length > 0 ? sanitized : undefined;
}

function isActionRow(component) {
    return getComponentType(component) === ACTION_ROW_TYPE;
}

function getComponentType(component) {
    return component?.data?.type ?? component?.type ?? null;
}

function getActionRowComponents(component) {
    try {
        return ActionRowBuilder.from(component).components || [];
    } catch (_) {
        return component?.components || component?.data?.components || [];
    }
}

module.exports = {
    sanitizeComponentsForSend
};
