function shouldUseMultipleEmbeds(tweetId, tweetType) {
    return tweetType === 'multi-image';
}

function shouldUseGASVideoMode(tweetId, tweetType) {
    const supportedTypes = [
        // 'multi-video',
        // 'multi-image',
    ];

    supportedTypes.includes(tweetType);
    return false;
}

module.exports = {
    shouldUseMultipleEmbeds,
    shouldUseGASVideoMode,
};
