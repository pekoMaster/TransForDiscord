function optimizeTwitterImageUrl(url) {
    return url.replace('?name=orig', '?name=large');
}

function optimizeCardImageUrl(url) {
    return url.replace(/([?&])name=\w+/g, '$1name=large');
}

function withSpoilerPrefix(url, blacklistEntry) {
    return blacklistEntry && blacklistEntry.level === 2 ? `SPOILER_${url}` : url;
}

function extractImagesFromTweet(tweet) {
    const images = [];
    try {
        if (tweet.media && tweet.media.all && tweet.media.all.length > 0) {
            tweet.media.all.forEach(media => {
                if (media && media.type !== 'video' && media.type !== 'gif' && media.url) {
                    images.push({ ...media, url: optimizeTwitterImageUrl(media.url) });
                }
            });

            if (images.length === 0) {
                tweet.media.all.forEach(media => {
                    if (media && (media.type === 'video' || media.type === 'gif') && media.thumbnail_url) {
                        images.push({ ...media, url: optimizeTwitterImageUrl(media.thumbnail_url) });
                    }
                });
            }
        }

        if (images.length === 0 && tweet.card && tweet.card.image && tweet.card.image.url) {
            const cardImage = tweet.card.image;
            images.push({
                type: 'card',
                url: optimizeCardImageUrl(cardImage.url),
                width: cardImage.width,
                height: cardImage.height,
                alt: cardImage.alt,
            });
        }
    } catch (error) {
        return images;
    }
    return images;
}

function extractMultipleImages(tweet, onError = null) {
    const images = [];
    const blacklistEntry = tweet._blacklistEntry;

    try {
        if (tweet.media && tweet.media.all) {
            tweet.media.all.forEach(media => {
                if (media && media.type !== 'video' && media.url) {
                    const optimizedUrl = media.url.replace('?name=orig', '?name=large');
                    images.push(withSpoilerPrefix(optimizedUrl, blacklistEntry));
                }
            });
        }

        if (images.length === 0 && tweet.card && tweet.card.image && tweet.card.image.url) {
            const cardImageUrl = tweet.card.image.url;
            const optimizedUrl = cardImageUrl.replace(/\?name=\w+/, '?name=large');
            images.push(withSpoilerPrefix(optimizedUrl, blacklistEntry));
        }
    } catch (error) {
        if (onError) {
            onError(error);
        }
    }
    return images;
}

module.exports = {
    extractImagesFromTweet,
    extractMultipleImages,
};
