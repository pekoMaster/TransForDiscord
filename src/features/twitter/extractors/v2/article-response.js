const { ActionRowBuilder, EmbedBuilder } = require('discord.js');

function getArticleText(article) {
    if (article?.content?.blocks) {
        return article.content.blocks
            .filter(block => block.text && block.text.trim())
            .map(block => block.text.trim())
            .join('\n\n');
    }

    return article?.preview_text || '';
}

function buildArticleTweetResponse(tweet, originalURL, dependencies) {
    const article = tweet.article;
    const embed = new EmbedBuilder();
    embed.setColor(0x1DA1F2);

    try {
        embed.setAuthor({
            name: `@${tweet.author.screen_name}`,
            iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url,
            url: `https://twitter.com/${tweet.author.screen_name}`
        });
    } catch (e) { /* ignore */ }

    const title = article.title || tweet.author.name || tweet.author.screen_name;
    embed.setTitle(title);
    embed.setURL(originalURL);

    const fullText = getArticleText(article);
    let truncationResult = null;
    if (fullText) {
        truncationResult = dependencies.textTruncator.processTweetContent(fullText, '文章');
        embed.setDescription(truncationResult.text);
    }

    if (article.cover_media && article.cover_media.original_img_url) {
        embed.setImage(article.cover_media.original_img_url);
    }

    const engagement = tweet.engagement || {};
    const stats = [];
    if (engagement.likes) stats.push(`❤️ ${engagement.likes.toLocaleString()}`);
    if (engagement.retweets) stats.push(`🔁 ${engagement.retweets.toLocaleString()}`);
    if (engagement.views) stats.push(`👁️ ${engagement.views.toLocaleString()}`);
    const footerText = `📝 X 文章` + (stats.length > 0 ? `　${stats.join('　')}` : '');
    embed.setFooter({ text: footerText });

    if (tweet.created_timestamp) {
        embed.setTimestamp(new Date(tweet.created_timestamp * 1000));
    }

    const toggleButtons = [];

    if (fullText && fullText.length >= 10) {
        toggleButtons.push(dependencies.buildTranslateButtonComponent(tweet.id, false));
    }

    if (truncationResult && truncationResult.isTruncated) {
        toggleButtons.push(dependencies.buildAllToggleButtonComponent(tweet.id, false));
    }

    toggleButtons.push(dependencies.buildReloadButtonComponent(tweet.id));

    let components = null;
    if (toggleButtons.length > 0) {
        components = [new ActionRowBuilder().addComponents(...toggleButtons)];
    }

    return {
        success: true,
        embed: embed,
        components: components,
        siteName: 'twitter',
        contentType: 'article',
        videoUrls: [],
        originalText: fullText,
        fullText: truncationResult ? truncationResult.fullText : fullText,
        tweetId: tweet.id,
        originalURL: originalURL
    };
}

module.exports = {
    buildArticleTweetResponse
};
