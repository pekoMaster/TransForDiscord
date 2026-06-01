const assert = require('assert');
const ThreadsExtractor = require('../tfd-system/extractors/threads.js');

function embedJson(result) {
    assert.strictEqual(result.success, true);
    assert.ok(result.embed, 'expected an embed result');
    return typeof result.embed.toJSON === 'function' ? result.embed.toJSON() : result.embed;
}

(async () => {
    const extractor = new ThreadsExtractor();

    const summaryUrl = 'https://www.threads.com/@paraen_van/post/DZApYoUDwqL';
    const summaryResult = await extractor.extractPost('paraen_van', 'DZApYoUDwqL', summaryUrl);
    const summaryEmbed = embedJson(summaryResult);
    assert.match(summaryEmbed.description || '', /好奇問個/);
    assert.ok(!summaryEmbed.image, 'summary-card avatar must not be rendered as post image');

    const publicUrl = 'https://www.threads.com/@andydes_21/post/DYmgEg3EnM1';
    const publicResult = await extractor.extractPost('andydes_21', 'DYmgEg3EnM1', publicUrl);
    const publicEmbed = embedJson(publicResult);
    assert.match(publicEmbed.description || '', /當然是去笑虎家|名正言順的同居/);
    assert.ok(publicEmbed.image?.url || publicEmbed.image, 'expected official OG image');

    const unavailableUrl = 'https://www.threads.com/@trueisneverend/post/DZBBIg3kz4i';
    const unavailableResult = await extractor.extractPost('trueisneverend', 'DZBBIg3kz4i', unavailableUrl);
    const unavailableEmbed = embedJson(unavailableResult);
    assert.notStrictEqual(unavailableResult.contentType, 'url_conversion');
    assert.ok(!unavailableResult.convertedURL, 'must not send proxy URL for Discord native preview');
    assert.ok(!/Join Threads to share ideas/i.test(unavailableEmbed.description || ''));

    console.log('Threads preview fallback regression passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
