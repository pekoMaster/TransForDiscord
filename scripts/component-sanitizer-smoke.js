const assert = require('assert');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { sanitizeComponentsForSend } = require('../src/features/discord/component-sanitizer');

function button(id) {
    return new ButtonBuilder()
        .setCustomId(id)
        .setLabel(id)
        .setStyle(ButtonStyle.Secondary);
}

const emptyRow = new ActionRowBuilder();
assert.strictEqual(sanitizeComponentsForSend([emptyRow]), undefined);

const mixedRows = sanitizeComponentsForSend([
    emptyRow,
    new ActionRowBuilder().addComponents(button('valid'))
]);
assert.strictEqual(mixedRows.length, 1);
assert.strictEqual(mixedRows[0].components.length, 1);

const oversized = new ActionRowBuilder().addComponents(
    button('b1'),
    button('b2'),
    button('b3'),
    button('b4'),
    button('b5'),
    button('b6')
);
const splitRows = sanitizeComponentsForSend([oversized]);
assert.strictEqual(splitRows.length, 2);
assert.strictEqual(splitRows[0].components.length, 5);
assert.strictEqual(splitRows[1].components.length, 1);

const v2LikeContainer = { data: { type: 17 }, components: [{ data: { type: 10 } }] };
assert.strictEqual(sanitizeComponentsForSend([v2LikeContainer])[0], v2LikeContainer);

console.log('component-sanitizer smoke ok');
