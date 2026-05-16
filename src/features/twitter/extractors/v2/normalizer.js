function normalizeVxTwitterResponse(data, tid) {
    if (!data) return null;

    const tweetId = data.tweetID || tid;
    const text = data.text || data.description || '';
    const userScreenName = data.user_screen_name || '';
    const userName = data.user_name || userScreenName;
    const profileImageUrl = data.user_profile_image_url || '';

    if (!userScreenName) return null;

    const tweet = {
        id: tweetId,
        text,
        created_timestamp: data.date_epoch || null,
        author: {
            id: null,
            name: userName,
            screen_name: userScreenName,
            profile_image_url_https: profileImageUrl,
            avatar_url: profileImageUrl,
        },
        engagement: {
            likes: data.likes || 0,
            retweets: data.retweets || 0,
            replies: data.replies || 0,
            views: data.views || 0,
        },
        media: null,
        replying_to: null,
        replying_to_status: null,
        quote: null,
        _fromVxTwitter: true,
    };

    if (data.media_extended && data.media_extended.length > 0) {
        tweet.media = {
            all: data.media_extended.map(media => {
                const mediaType = media.type === 'image' ? 'photo' : (media.type || 'photo');
                if (mediaType === 'video' || mediaType === 'gif') {
                    return {
                        type: mediaType,
                        url: media.thumbnail_url || media.url,
                        variants: media.url ? [{ url: media.url, bitrate: 2176000, content_type: 'video/mp4' }] : [],
                    };
                }
                return { type: 'photo', url: media.url };
            }),
        };
    } else if (data.mediaURLs && data.mediaURLs.length > 0) {
        tweet.media = { all: data.mediaURLs.map(url => ({ type: 'photo', url })) };
    }

    return tweet;
}

module.exports = {
    normalizeVxTwitterResponse,
};
