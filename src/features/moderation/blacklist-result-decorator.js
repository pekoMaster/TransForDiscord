const { TextDisplayBuilder } = require('discord.js');

function applyBlacklistDecoration(result, entry, logger = () => {}) {
    if (!result || !entry) return result;

    if (entry.level === 1) {
        applyLevelOneWarning(result, entry, logger);
    }

    if (entry.level === 2) {
        applyLevelTwoSpoiler(result, entry, logger);
    }

    return result;
}

function applyLevelOneWarning(result, entry, logger) {
    const label = entry.label || '未指定';
    const warningText = `⚠️ ${label}`;

    if (result.isV2 && result.v2Container) {
        appendV2Text(result.v2Container, warningText, logger, 'V2 Level 1 warning failed');
    }

    if (result.embed && typeof result.embed.setFooter === 'function') {
        const existingFooter = getEmbedFooterText(result.embed);
        const footerText = existingFooter ? `${warningText} | ${existingFooter}` : warningText;
        setEmbedFooter(result.embed, footerText);
    }
}

function applyLevelTwoSpoiler(result, entry, logger) {
    const label = entry.label || '未指定';

    if (result.isV2 && result.v2Container) {
        applyV2Spoiler(result.v2Container, logger);
        appendV2Text(result.v2Container, `🕶️ ${label}`, logger, 'V2 Level 2 spoiler footer failed');
    }

    if (result.embed) {
        const data = result.embed.data;
        if (data?.description) {
            data.description = spoilerText(data.description);
        }
        if (data?.title) {
            data.title = spoilerText(`🕶️ ${data.title}`);
        }
        if (Array.isArray(data?.fields)) {
            for (const field of data.fields) {
                if (field.value) field.value = spoilerText(field.value);
            }
        }
        const existingFooter = getEmbedFooterText(result.embed);
        const spoilerFooter = `🕶️ ${label}`;
        const footerText = existingFooter ? `${spoilerFooter} | ${existingFooter}` : spoilerFooter;
        setEmbedFooter(result.embed, footerText);
    }
}

function applyV2Spoiler(container, logger) {
    try {
        for (const component of container.components || []) {
            if (typeof component.data?.content === 'string') {
                component.data.content = spoilerTextDisplayContent(component.data.content);
            }
            const mediaItems = component.components || component.items;
            if (Array.isArray(mediaItems)) {
                for (const item of mediaItems) {
                    if (item.data) item.data.spoiler = true;
                }
            }
        }
    } catch (error) {
        logger(`V2 Level 2 spoiler failed: ${error.message}`, 'error');
    }
}

function appendV2Text(container, text, logger, errorPrefix) {
    try {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(text)
        );
    } catch (error) {
        logger(`${errorPrefix}: ${error.message}`, 'error');
    }
}

function spoilerTextDisplayContent(content) {
    const lines = content.split('\n');
    const headerLines = [];
    const bodyLines = [];

    for (const line of lines) {
        if (line.startsWith('-#')) headerLines.push(line);
        else bodyLines.push(line);
    }

    if (bodyLines.length === 0) return content;
    return [...headerLines, spoilerText(bodyLines.join('\n'))].join('\n');
}

function spoilerText(text) {
    if (typeof text !== 'string' || text.length === 0) return text;
    if (text.startsWith('||') && text.endsWith('||')) return text;
    return `||${text}||`;
}

function getEmbedFooterText(embed) {
    return embed?.data?.footer?.text || embed?.footer?.text || '';
}

function getEmbedFooterIconURL(embed) {
    return embed?.data?.footer?.icon_url || embed?.footer?.iconURL || embed?.footer?.icon_url || null;
}

function setEmbedFooter(embed, text) {
    const iconURL = getEmbedFooterIconURL(embed);
    const footer = iconURL ? { text, iconURL } : { text };
    try {
        embed.setFooter(footer);
    } catch (_) {}
}

module.exports = {
    applyBlacklistDecoration,
    applyLevelOneWarning,
    applyLevelTwoSpoiler
};
