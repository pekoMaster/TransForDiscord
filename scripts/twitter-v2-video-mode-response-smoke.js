const assert = require('node:assert/strict');

const {
    buildBasicEmbed,
    buildGASVideoModeResponse,
    buildHTMLVideoModeResponse
} = require('../src/features/twitter/extractors/v2/video-mode-response');

function createLogger() {
    const entries = [];
    return {
        entries,
        sysError: (scope, message) => entries.push({ scope, message })
    };
}

async function run() {
    const logger = createLogger();
    const noGasResult = await buildGASVideoModeResponse({}, 'https://twitter.com/u/status/100', 'video', {
        getGasURL: () => '',
        extractTweetId: () => '100',
        logger
    });

    assert.equal(noGasResult, null);
    assert.equal(logger.entries[0].message, '未配置 GOOGLE_APP_SCRIPT_URL 環境變數');

    const gasResult = await buildGASVideoModeResponse({}, 'https://twitter.com/u/status/100?a=1', 'multi-video', {
        getGasURL: () => 'https://script.google.com/macros/s/test/exec',
        extractTweetId: url => url.match(/status\/(\d+)/)?.[1] || null,
        logger: createLogger()
    });

    assert.deepEqual(gasResult, {
        gasURL: 'https://script.google.com/macros/s/test/exec?tweet_id=100&type=multi-video&original_url=https%3A%2F%2Ftwitter.com%2Fu%2Fstatus%2F100%3Fa%3D1',
        originalURL: 'https://twitter.com/u/status/100?a=1',
        tweetType: 'multi-video',
        mode: 'gas_video'
    });

    const basicEmbed = buildBasicEmbed({
        author: {
            screen_name: 'tester',
            name: 'Tester',
            avatar_url: 'https://example.com/avatar.jpg'
        },
        created_at: '2024-01-01T00:00:00.000Z'
    }, 'https://twitter.com/tester/status/100');

    const basicEmbedJSON = basicEmbed.toJSON();
    assert.equal(basicEmbedJSON.author.name, '@tester');
    assert.equal(basicEmbedJSON.title, 'Tester');
    assert.equal(basicEmbedJSON.url, 'https://twitter.com/tester/status/100');
    assert.equal(basicEmbedJSON.color, 1942002);
    assert.equal(basicEmbedJSON.timestamp, '2024-01-01T00:00:00.000Z');

    const htmlLogger = createLogger();
    const htmlResult = await buildHTMLVideoModeResponse({
        author: {
            screen_name: 'tester',
            name: 'Tester'
        },
        text: 'video text',
        created_at: '2024-01-01T00:00:00.000Z'
    }, 'https://twitter.com/tester/status/100', 'video-with-images', {
        extractVideos: () => ['https://video/1.mp4'],
        extractImages: () => ['https://image/1.jpg', 'https://image/2.jpg'],
        buildHTML: options => `html:${options.videos.length}:${options.images.length}:${options.tweetData.author.screen_name}`,
        handleMixedMediaTweetFallback: async () => ({ success: true, fallback: true }),
        logger: htmlLogger
    });

    assert.equal(htmlResult.success, true);
    assert.equal(htmlResult.htmlContent, 'html:1:2:tester');
    assert.equal(htmlResult.contentType, 'video-with-images');
    assert.equal(htmlResult.siteName, 'twitter');
    assert.equal(htmlResult.isHTMLResponse, true);
    assert.equal(htmlResult.originalURL, 'https://twitter.com/tester/status/100');
    assert.equal(htmlResult.videosCount, 1);
    assert.equal(htmlResult.imagesCount, 2);
    assert.equal(htmlResult.embed.toJSON().title, 'Tester');

    const fallbackLogger = createLogger();
    const fallbackResult = await buildHTMLVideoModeResponse({
        author: {},
        text: 'broken'
    }, 'https://twitter.com/tester/status/101', 'multi-video', {
        extractVideos: () => ['https://video/1.mp4'],
        extractImages: () => [],
        buildHTML: () => {
            throw new Error('html failed');
        },
        handleMixedMediaTweetFallback: async () => ({ success: true, fallback: true }),
        logger: fallbackLogger
    });

    assert.deepEqual(fallbackResult, { success: true, fallback: true });
    assert.equal(fallbackLogger.entries[0].scope, 'Enhanced-Twitter');
    assert.equal(fallbackLogger.entries[0].message, 'HTML 影片播放模式處理失敗: html failed');
    assert.equal(fallbackLogger.entries[1].scope, 'Twitter-V2');

    console.log('twitter v2 video mode response smoke ok');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
