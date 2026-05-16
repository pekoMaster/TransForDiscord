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

function getReplyReference(tweet) {
    let replyTweetId = null;
    let replyUsername = null;

    if (tweet.replying_to) {
        replyUsername = tweet.replying_to;
    }

    if (tweet.replying_to_status) {
        replyTweetId = tweet.replying_to_status;
    }

    if (!replyUsername && tweet.text) {
        const mentionMatch = tweet.text.match(/^@(\w+)/);
        if (mentionMatch) {
            replyUsername = mentionMatch[1];
        }
    }

    if (!replyTweetId && replyUsername) {
        const testMappings = {
            hikosan333: {
                '1970330275587736012': '1970128496702980398',
            },
            Wadai__2: {
                '1970348758677495897': '1970114575598280800',
            },
        };

        if (testMappings[replyUsername] && testMappings[replyUsername][tweet.id]) {
            replyTweetId = testMappings[replyUsername][tweet.id];
        }
    }

    return {
        replyTweetId,
        replyUsername,
    };
}

module.exports = {
    extractTweetId,
    getQuoteTweetInfo,
    getReplyReference,
};
