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

module.exports = {
    isReplyTweet,
    isQuoteTweet,
    hasVideoContent,
    hasImageContent,
    getImageCount,
    getVideoCount,
};
