const assert = require('assert');

const SharedNormalizeAuthor = require('../src/features/moderation/normalize-author');
const LegacyNormalizeAuthor = require('../utils/normalize-author');

assert.strictEqual(LegacyNormalizeAuthor, SharedNormalizeAuthor);

const { normalizeAuthorForBlacklist } = SharedNormalizeAuthor;

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({
        siteName: 'twitter',
        tweet: {
            author: {
                screen_name: ' Peko ',
                id: 12345
            }
        }
    }),
    { platform: 'twitter', author: 'peko', uid: '12345' }
);

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({
        siteName: 'twitter',
        embed: { author: { name: '@Miko' } }
    }),
    { platform: 'twitter', author: 'miko', uid: null }
);

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({
        siteName: 'ptt',
        author: 'user123 (nickname)'
    }),
    { platform: 'ptt', author: 'user123', uid: null }
);

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({
        siteName: 'ptt',
        embed: { data: { author: { name: 'BoardUser' } } }
    }),
    { platform: 'ptt', author: 'boarduser', uid: null }
);

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({
        siteName: 'pixiv',
        embed: { data: { author: { name: 'PixivArtist' } } }
    }),
    { platform: 'pixiv', author: 'pixivartist', uid: null }
);

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({
        siteName: 'pixiv',
        embed: { data: { footer: { text: 'Artwork by FooterArtist - Pixiv' } } }
    }),
    { platform: 'pixiv', author: 'footerartist', uid: null }
);

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({
        siteName: 'instagram',
        embed: { data: { author: { name: '@InstaUser' } } }
    }),
    { platform: 'instagram', author: 'instauser', uid: null }
);

assert.deepStrictEqual(
    normalizeAuthorForBlacklist({ siteName: 'unknown-site' }),
    { platform: 'unknown-site', author: null, uid: null }
);

console.log('normalize-author smoke ok');
