function optimizeTwitterImageUrl(url) {
    return url.replace('?name=orig', '?name=large');
}

function optimizeCardImageUrl(url) {
    return url.replace(/([?&])name=\w+/g, '$1name=large');
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

module.exports = {
    extractImagesFromTweet,
};
