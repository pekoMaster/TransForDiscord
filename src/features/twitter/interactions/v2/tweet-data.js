const HTTPClient = require('../../../../shared/http/http-client');
const TFDTwitterExtractor = require('../../extractors/twitter-v2-extractor');
const { cacheTweetData } = require('../../containers/v2-container-builder');

async function hydrateTweetBundle(tweetId, originalURL = null) {
    const httpClient = new HTTPClient();
    const resp = await httpClient.fetchJSON(`https://api.fxtwitter.com/i/status/${tweetId}`, { timeout: 5000 });
    if (!resp?.tweet) return null;

    const tweet = resp.tweet;
    const fallbackOriginalURL = originalURL || `https://twitter.com/i/status/${tweetId}`;
    const extractor = new TFDTwitterExtractor();

    let quoteData = null;
    let replyData = null;

    if (extractor.isReplyTweet(tweet)) {
        const replyInfo = await extractor.getReplyTweetInfo(tweet);
        if (replyInfo) {
            replyData = {
                tweet: replyInfo.tweet || null,
                tweetId: replyInfo.tweetId || null
            };
        }
    }

    if (extractor.isQuoteTweet(tweet)) {
        const quoteInfo = extractor.getQuoteTweetInfo(tweet);
        if (quoteInfo) {
            quoteData = {
                tweet: quoteInfo.tweet || null,
                tweetId: quoteInfo.tweetId || null
            };
        }
    }

    const hydrated = { tweet, originalURL: fallbackOriginalURL, quoteData, replyData };
    cacheTweetData(tweetId, hydrated);
    return hydrated;
}

module.exports = {
    hydrateTweetBundle
};
