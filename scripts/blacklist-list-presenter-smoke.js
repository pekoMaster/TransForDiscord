const assert = require('assert');

const { buildBlacklistListPage, BUTTON_PREFIX } = require('../src/features/moderation/blacklist-list-presenter');

const entries = Array.from({ length: 12 }, (_, index) => ({
    platform: index % 2 === 0 ? 'twitter' : 'ptt',
    author: index % 2 === 0 ? `artist${index + 1}` : `user${index + 1}`,
    level: (index % 3) + 1,
    label: index === 0 ? 'AI Artist' : null
}));

{
    const page = buildBlacklistListPage(entries, { platform: 'twitter', page: 0 });
    assert.strictEqual(page.page, 0);
    assert.strictEqual(page.totalPages, 2);
    assert.strictEqual(page.embed.data.title, '📋 黑名單 (twitter)');
    assert.match(page.embed.data.description, /💬 \*\*1\.\*\* \[twitter\] @artist1 ⌈僅提示⌉ — AI Artist/);
    assert.match(page.embed.data.description, /\*\*10\.\*\*/);
    assert.doesNotMatch(page.embed.data.description, /\*\*11\.\*\*/);
    assert.strictEqual(page.embed.data.footer.text, '第 1/2 頁 • 共 12 條');
    assert.strictEqual(page.components.length, 1);
    assert.strictEqual(page.components[0].components[0].data.custom_id, `${BUTTON_PREFIX}prev`);
    assert.strictEqual(page.components[0].components[0].data.disabled, true);
    assert.strictEqual(page.components[0].components[1].data.custom_id, `${BUTTON_PREFIX}next`);
    assert.strictEqual(page.components[0].components[1].data.disabled, false);
}

{
    const page = buildBlacklistListPage(entries, { page: 1 });
    assert.strictEqual(page.page, 1);
    assert.match(page.embed.data.description, /\*\*11\.\*\*/);
    assert.match(page.embed.data.description, /\*\*12\.\*\*/);
    assert.strictEqual(page.embed.data.footer.text, '第 2/2 頁 • 共 12 條');
    assert.strictEqual(page.components[0].components[0].data.disabled, false);
    assert.strictEqual(page.components[0].components[1].data.disabled, true);
}

{
    const page = buildBlacklistListPage(entries, { page: 99 });
    assert.strictEqual(page.page, 1);
}

{
    const page = buildBlacklistListPage(entries.slice(0, 3));
    assert.strictEqual(page.totalPages, 1);
    assert.deepStrictEqual(page.components, []);
}

console.log('blacklist-list-presenter smoke ok');
