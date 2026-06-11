/**
 * 回歸測試：Threads 影片（isV2 + 外層 result.components）發送時必須保留按鈕
 *
 * Bug：sendTwitterV2 原本只送 components:[container]，把 Threads 影片的
 *      重整/展開/回報 按鈕（在 result.components）丟掉 → 貼了沒按鈕、無法移除。
 * 修法：V2 結果若帶外層 result.components，用 addActionRowComponents 塞進 container 內
 *      （與 Twitter V2 按鈕相同模式）；Twitter/Instagram V2 無此欄位 → no-op。
 *
 * 用真的 discord.js builder，順便驗證 ContainerBuilder 確實接受「影片 gallery + 按鈕排」。
 */

const assert = require('assert');
const path = require('path');
const {
    ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const TFDMessageHandler = require(path.resolve(__dirname, '../tfd-system/core/message-handler-v2.js'));

function makeMessage() {
    return {
        id: 'msg-x', author: { id: 'u1' }, member: null,
        guild: null, guildId: null, channelId: 'c1', channel: { id: 'c1' },
        _isFirstUrlConversion: true, _userText: '',
    };
}

function fakeThreadsContainer() {
    const c = new ContainerBuilder().setAccentColor(0x000000);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('作者\n內文'));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# 🧵 Threads | Peko Embed'));
    return c;
}

function threadsButtons() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('threads_reload_abc').setLabel('重整').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('report_btn_123').setLabel('回報').setStyle(ButtonStyle.Secondary),
    );
    return [row];
}

function captureSend(handler) {
    const captured = {};
    handler.sendViaWebhook = async (_m, options) => { captured.options = options; return { id: 's1' }; };
    return captured;
}

// 從 container 內找出所有按鈕的 customId
function buttonIdsInContainer(container) {
    const ids = [];
    for (const comp of container.components || []) {
        const sub = comp?.components || comp?.data?.components || [];
        for (const b of sub) {
            const id = b?.data?.custom_id || b?.custom_id;
            if (id) ids.push(id);
        }
    }
    return ids;
}

async function testThreadsVideoKeepsButtons() {
    const handler = new TFDMessageHandler();
    const captured = captureSend(handler);

    const result = {
        success: true, siteName: 'threads', isV2: true,
        v2Container: fakeThreadsContainer(),
        components: threadsButtons(),
        originalURL: 'https://www.threads.com/@x/post/abc',
    };

    await handler.sendTwitterV2(makeMessage(), result);

    const comps = captured.options.components;
    assert.strictEqual(comps.length, 1, `V2 仍送單一 [container]，實際 ${comps.length}`);
    const ids = buttonIdsInContainer(comps[0]);
    console.log('[Threads影片] container 內按鈕:', ids.join(', ') || '(無)');
    assert.ok(ids.includes('threads_reload_abc'), '缺少「重整」按鈕');
    assert.ok(ids.includes('report_btn_123'), '缺少「回報」按鈕（無法移除的根因）');
    console.log('✅ Threads 影片按鈕已塞進 container，貼文可移除/重整\n');
}

async function testTwitterV2Unaffected() {
    const handler = new TFDMessageHandler();
    const captured = captureSend(handler);

    const c = new ContainerBuilder().setAccentColor(0x000000);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('tweet'));
    const before = c.components.length;

    const result = {
        success: true, siteName: 'twitter', isV2: true,
        v2Container: c, originalURL: 'https://x.com/a/status/1',
        // 無 result.components
    };

    await handler.sendTwitterV2(makeMessage(), result);

    const comps = captured.options.components;
    assert.strictEqual(comps.length, 1, 'Twitter V2 應只送 [container]');
    // 只多了 marker TextDisplay + separator（2 個），不應被插入任何 action row
    const ids = buttonIdsInContainer(comps[0]);
    console.log('[Twitter V2] container 內按鈕:', ids.join(', ') || '(無，符合預期)');
    assert.strictEqual(ids.length, 0, 'Twitter V2 不應被本次修改插入額外按鈕');
    console.log(`✅ Twitter V2 不受影響（container 子元件 ${before} → ${comps[0].components.length}，僅加 marker）\n`);
}

(async () => {
    await testThreadsVideoKeepsButtons();
    await testTwitterV2Unaffected();
    console.log('🎉 全部通過');
})().catch(err => { console.error('\n❌ FAIL:', err.message); process.exit(1); });
