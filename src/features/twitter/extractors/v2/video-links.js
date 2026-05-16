function isVideoMedia(media) {
    return media && (media.type === 'video' || media.type === 'gif') && media.url;
}

function videoLinkFormat(videoUrl) {
    return videoUrl || '';
}

function extractVideoUrls(tweet, formatVideoUrl = videoLinkFormat) {
    try {
        const mediaItems = Array.isArray(tweet?.media?.all) ? tweet.media.all : [];
        return mediaItems
            .filter(isVideoMedia)
            .map(media => formatVideoUrl(media.url));
    } catch (error) {
        return [];
    }
}

function formatVideoUrls(videoUrls) {
    if (!videoUrls || videoUrls.length === 0) {
        return [];
    }

    return videoUrls.map((url, index) => `[影片${index + 1}](${url})`);
}

module.exports = {
    formatVideoUrls,
    extractVideoUrls,
    videoLinkFormat,
};
