function getAllMedia(tweet) {
    return Array.isArray(tweet?.media?.all) ? tweet.media.all : [];
}

function isVideoMedia(media) {
    return media && (media.type === 'video' || media.type === 'gif');
}

function isImageLikeMedia(media) {
    return media && media.type !== 'video';
}

function isReplyTweet(tweet) {
    return !!(
        tweet?.replying_to ||
        tweet?.replying_to_status ||
        (tweet?.text && tweet.text.startsWith('@'))
    );
}

function isQuoteTweet(tweet) {
    return !!(tweet?.quote && tweet.quote.author);
}

function hasVideoContent(tweet) {
    return getAllMedia(tweet).some(isVideoMedia);
}

function hasImageContent(tweet) {
    return getAllMedia(tweet).some(isImageLikeMedia);
}

function getImageCount(tweet) {
    return getAllMedia(tweet).filter(isImageLikeMedia).length;
}

function getVideoCount(tweet) {
    return getAllMedia(tweet).filter(isVideoMedia).length;
}

function analyzeTweetType(tweet) {
    if (tweet.article) {
        return 'article';
    }

    const hasVideo = hasVideoContent(tweet);
    const hasImages = hasImageContent(tweet);
    const isReply = isReplyTweet(tweet);
    const isQuote = isQuoteTweet(tweet);
    const imageCount = getImageCount(tweet);
    const videoCount = getVideoCount(tweet);

    if (hasVideo && hasImages) {
        if (videoCount === 1) {
            return 'video-with-images';
        }
        return 'multi-video-with-images';
    }

    if (hasVideo && !hasImages) {
        if (videoCount === 1) {
            return 'video';
        }
        return 'multi-video';
    }

    if (isQuote && hasImages) {
        if (imageCount > 1) {
            return 'multi-image';
        }
        return 'quote-with-media';
    } else if (isQuote) {
        return 'quote';
    } else if (isReply && hasImages) {
        if (imageCount > 1) {
            return 'multi-image';
        }
        return 'reply-with-media';
    } else if (isReply) {
        return 'reply';
    } else if (imageCount > 1) {
        return 'multi-image';
    } else if (imageCount === 1) {
        return 'single-image';
    }
    return 'text';
}

module.exports = {
    analyzeTweetType,
    isReplyTweet,
    isQuoteTweet,
    hasVideoContent,
    hasImageContent,
    getImageCount,
    getVideoCount,
};
