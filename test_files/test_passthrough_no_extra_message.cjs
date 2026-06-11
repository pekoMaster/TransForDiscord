/**
 * 回歸測試：vxtwitter 這類「passthrough（第三方已可原生嵌入）」URL + 一般訊息
 * 必須：
 *   1. 不發送任何 webhook / messageSender / V2 訊息（不額外多發一則純文字）
 *   2. 不呼叫 embedSuppresser（不壓掉 Discord 原生預覽）
 *   3. 不刪除原訊息（使用者原文與原生嵌入都保留）
 *
 * 對應使用者擔憂：4.0 出現過「vxtwitter + 一般訊息 → 額外多發一則文字」，
 * 確認 TFD 的新 URL 文字保留修正不會在 TFD 重蹈覆轍。
 */

const assert = require('assert');
const path = require('path');

const HandlerPath = path.resolve(__dirname, '../tfd-system/core/message-handler-v2.js');
const TFDMessageHandler = require(HandlerPath);

function makeMessage(content) {
    const calls = [];
    const message = {
        id: 'test-msg-1',
        content,
        // guild 設為 null → 跳過 abuse 偵測與黑名單（避免 DB 依賴）
        guild: null,
        guildId: null,
        channelId: 'test-channel',
        author: { id: 'user-1', tag: 'tester#0001', username: 'tester' },
        member: null,
        channel: { id: 'test-channel', name: 'test' },
        attachments: { size: 0 },
        reference: null,
        delete: async () => { calls.push(['delete']); },
    };
    return { message, calls };
}

function instrument(handler, calls) {
    // 任何「會送出訊息 / 改動原訊息」的方法都換成 spy
    const sendMethods = [
        'sendViaWebhook', 'sendExtraViaWebhook', 'messageSender',
        'sendTwitterV2', 'sendPixivSingle', 'sendPixivWithPagination',
        'sendPTTWithPagination', 'sendPTTWithMultipleEmbeds', 'sendPTTWithSpoiler',
        'sendThreadsWithMultipleEmbeds', 'sendTwitterWithPagination',
        'sendTwitterWithMultipleEmbeds', 'sendTwitterMixedMedia', 'sendTwitterWithGAS',
        'sendWithVideoLinks', 'embedSuppresser',
    ];
    for (const name of sendMethods) {
        handler[name] = async (...args) => { calls.push([name, args]); };
    }
}

// ── 情境 1：passthrough（vxtwitter 第三方）+ 一般訊息 ──
async function testPassthrough() {
    const handler = new TFDMessageHandler();
    const vxUrl = 'https://vxtwitter.com/someone/status/1234567890';
    const passthrough = {
        success: true,
        passthrough: true,
        originalURL: vxUrl,
        contentType: 'passthrough',
        siteName: 'twitter',
    };

    const { message, calls } = makeMessage(`${vxUrl} 這是一段一般訊息`);
    handler.shouldProcessMessage = () => true;
    handler.linkProcessor.processMessage = async () => [passthrough];
    instrument(handler, calls);

    await handler.handleMessage(message);

    const called = calls.map(c => c[0]);
    console.log('[情境1] 被呼叫的送出/改動方法:', called.length ? called.join(', ') : '(無)');
    assert.deepStrictEqual(
        called, [],
        `passthrough 不應觸發任何送出/刪除/抑制，但實際呼叫了: ${called.join(', ')}`
    );
    console.log('✅ 情境1 PASS: vxtwitter(passthrough) + 一般訊息 → 不額外發文、不壓原生預覽、不刪原訊息\n');
}

// ── 情境 2：兩個可預覽 URL + 一般訊息（混雜）──
async function testMixedTwoPreviews() {
    const handler = new TFDMessageHandler();
    const url1 = 'https://example.com/a/1';
    const url2 = 'https://example.com/b/2';
    const normalText = '這是一段一般訊息';

    // 兩個會產生 TFD 自家預覽（embed）的結果；siteName 用 generic 走最單純的 messageSender 分支
    const mk = (url) => ({ success: true, siteName: 'genericsite', embed: { data: {} }, originalURL: url });
    const results = [mk(url1), mk(url2)];

    // 訊息內容刻意把「文字」夾在兩個 URL 中間，驗證順序與不吃字
    const { message, calls } = makeMessage(`${url1} ${normalText} ${url2}`);
    handler.shouldProcessMessage = () => true;
    handler.linkProcessor.processMessage = async () => results;
    instrument(handler, calls);

    await handler.handleMessage(message);

    const previewSends = calls.filter(c => c[0] === 'messageSender');
    const otherSends = calls.filter(c => ['sendViaWebhook', 'sendExtraViaWebhook'].includes(c[0]));

    console.log('[情境2] _userText（保留的一般訊息）:', JSON.stringify(message._userText));
    console.log('[情境2] messageSender 次數:', previewSends.length, '/ 其他文字送出次數:', otherSends.length);

    // (a) 文字沒被吃掉
    assert.ok(
        message._userText && message._userText.includes(normalText),
        `一般訊息被吃掉了！_userText=${JSON.stringify(message._userText)}`
    );
    // (b) 兩個 URL 都各送一則預覽，且依訊息順序
    assert.strictEqual(previewSends.length, 2, `應送出 2 則預覽，實際 ${previewSends.length}`);
    assert.strictEqual(previewSends[0][1][5], url1, '第一則預覽應對應 url1（順序錯誤）');
    assert.strictEqual(previewSends[1][1][5], url2, '第二則預覽應對應 url2（順序錯誤）');
    // (c) 沒有「額外」的純文字訊息（一般訊息應併進第一則預覽，而非另發）
    assert.strictEqual(otherSends.length, 0, `不應有額外的獨立文字送出，實際 ${otherSends.length} 次`);

    console.log('✅ 情境2 PASS: 兩個可預覽 + 一般訊息 → 依序各一則、文字保留、無額外發文\n');
}

async function run() {
    await testPassthrough();
    await testMixedTwoPreviews();
    console.log('🎉 全部通過');
}

run().catch(err => {
    console.error('\n❌ FAIL:', err.message);
    process.exit(1);
});
