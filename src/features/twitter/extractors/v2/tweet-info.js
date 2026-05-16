function extractTweetId(url) {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
}

function getQuoteTweetInfo(tweet) {
    try {
        if (tweet.quote && tweet.quote.author) {
            const quoteTweet = tweet.quote;
            return {
                tweet: quoteTweet,
                tweetId: quoteTweet.id,
                username: quoteTweet.author.screen_name,
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

module.exports = {
    extractTweetId,
    getQuoteTweetInfo,
};
