const { translateTweet } = require('./service/translation-service');
const textBundle = require('./text/text-bundle');
const errors = require('./errors');
const keyResolver = require('./keys/key-resolver');
const providers = require('./providers/provider-registry');

module.exports = {
    translateTweet,
    ...textBundle,
    ...errors,
    ...keyResolver,
    ...providers
};
