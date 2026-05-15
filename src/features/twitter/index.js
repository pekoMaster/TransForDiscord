module.exports = {
    state: require('./state/v2-state-store'),
    containers: require('./containers/v2-container-builder'),
    extractors: {
        TwitterV2Extractor: require('./extractors/twitter-v2-extractor'),
        TwitterLegacyExtractor: require('./extractors/twitter-legacy-extractor')
    },
    interactions: {
        toggleAll: require('./interactions/toggle-all'),
        expand: require('./interactions/expand'),
        mediaPagination: require('./interactions/media-pagination'),
        reload: require('./interactions/reload'),
        translation: require('./interactions/translation'),
        v2Router: require('./interactions/v2-router')
    },
    posting: require('./posting/twitter-posting-handler')
};
