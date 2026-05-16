const assert = require('assert');
const { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');

const { applyBlacklistDecoration } = require('../src/features/moderation/blacklist-result-decorator');

const noopLogger = () => {};

function getFooterText(embed) {
    return embed.data?.footer?.text || null;
}

{
    const embed = new EmbedBuilder().setTitle('Post');
    applyBlacklistDecoration({ embed }, { level: 1, label: 'AI Artist' }, noopLogger);
    assert.strictEqual(getFooterText(embed), '⚠️ AI Artist');
}

{
    const embed = new EmbedBuilder().setTitle('Post').setFooter({ text: 'PekoEmbed', iconURL: 'https://example.com/icon.png' });
    applyBlacklistDecoration({ embed }, { level: 1, label: 'AI Artist' }, noopLogger);
    assert.strictEqual(getFooterText(embed), '⚠️ AI Artist | PekoEmbed');
    assert.strictEqual(embed.data.footer.icon_url, 'https://example.com/icon.png');
}

{
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent('hello')
    );
    applyBlacklistDecoration({ isV2: true, v2Container: container }, { level: 1, label: 'AI Artist' }, noopLogger);
    const warning = container.components.at(-1);
    assert.strictEqual(warning.data.content, '⚠️ AI Artist');
}

{
    const embed = new EmbedBuilder()
        .setTitle('Title')
        .setDescription('Description')
        .addFields({ name: 'Quote', value: 'Field value' });
    applyBlacklistDecoration({ embed }, { level: 2, label: 'Sensitive' }, noopLogger);
    assert.strictEqual(embed.data.title, '||🕶️ Title||');
    assert.strictEqual(embed.data.description, '||Description||');
    assert.strictEqual(embed.data.fields[0].value, '||Field value||');
    assert.strictEqual(getFooterText(embed), '🕶️ Sensitive');
}

{
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# <@1> https://x.com/a/status/1\nBody line'))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('https://example.com/a.png')
        ));
    applyBlacklistDecoration({ isV2: true, v2Container: container }, { level: 2, label: 'Sensitive' }, noopLogger);
    assert.strictEqual(container.components[0].data.content, '-# <@1> https://x.com/a/status/1\n||Body line||');
    assert.strictEqual(container.components[1].items[0].data.spoiler, true);
    assert.strictEqual(container.components.at(-1).data.content, '🕶️ Sensitive');
}

assert.doesNotThrow(() => {
    applyBlacklistDecoration({}, { level: 1, label: 'No Target' }, noopLogger);
    applyBlacklistDecoration({}, { level: 2, label: 'No Target' }, noopLogger);
    applyBlacklistDecoration({ embed: {} }, { level: 2, label: 'Plain Object' }, noopLogger);
});

console.log('blacklist-result-decorator smoke ok');
