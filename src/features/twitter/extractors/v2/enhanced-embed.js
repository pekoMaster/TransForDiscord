const { EmbedBuilder } = require('discord.js');

function addQuoteField(embed, quoteInfo, dependencies) {
    const quoteTweet = quoteInfo.tweet;
    const quoteUsername = quoteTweet.author.screen_name;
    const quoteDisplayName = quoteTweet.author.name || quoteTweet.author.screen_name;
    const rawQuoteContent = quoteTweet.text || '引用內容';
    const quoteTruncationResult = dependencies.textTruncator.processTweetContent(rawQuoteContent, '引用推文');
    const truncatedQuoteContent = quoteTruncationResult.text;

    const quotedContent = truncatedQuoteContent
        .split('\n')
        .map(line => {
            if (line.trim() === '') {
                return '> 　';
            }
            return `> ${line}`;
        })
        .join('\n');

    const fieldName = '\u200B';
    const quotedTweetURL = `https://twitter.com/${quoteUsername}/status/${quoteInfo.tweetId}`;
    const authorProfileURL = `https://twitter.com/${quoteUsername}`;
    const fieldValue = `> [RT](${quotedTweetURL}): ${quoteDisplayName} ([@${quoteUsername}](${authorProfileURL}))\n> 　\n${quotedContent}`;

    embed.addFields({
        name: fieldName,
        value: fieldValue,
        inline: false
    });
}

function setEnhancedEmbedImages(embed, tweet, replyInfo, tweetType, quoteInfo, dependencies) {
    const tweetImages = dependencies.extractImagesFromTweet(tweet);
    const replyImages = replyInfo && replyInfo.tweet ? dependencies.extractImagesFromTweet(replyInfo.tweet) : [];
    const quoteImages = quoteInfo && quoteInfo.tweet ? dependencies.extractImagesFromTweet(quoteInfo.tweet) : [];

    let primaryImage = null;

    if (replyInfo && replyInfo.tweet) {
        if (tweetImages.length > 0) {
            primaryImage = tweetImages[0].url;
        }
        void replyImages;
    } else if (quoteInfo && quoteInfo.tweet) {
        if (tweetImages.length > 0) {
            primaryImage = tweetImages[0].url;
        } else if (quoteImages.length > 0) {
            primaryImage = quoteImages[0].url;
        }
    } else if (tweetImages.length > 0) {
        primaryImage = tweetImages[0].url;
    }

    if (primaryImage) {
        const blacklistEntry = tweet._blacklistEntry;
        if (blacklistEntry && blacklistEntry.level === 2) {
            embed.setImage(`SPOILER_${primaryImage}`);
        } else {
            embed.setImage(primaryImage);
        }
    }
}

function buildEnhancedEmbed(tweet, originalURL, replyInfo, tweetType, quoteInfo, showQuote = true, dependencies) {
    const embed = new EmbedBuilder();
    embed.setColor(0x1DA1F2);

    try {
        embed.setAuthor({
            name: `@${tweet.author.screen_name}`,
            iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url,
            url: `https://twitter.com/${tweet.author.screen_name}`
        });
    } catch (error) { /* ignore */ }

    try {
        const displayName = tweet.author.name || tweet.author.screen_name;
        embed.setTitle(displayName);
        embed.setURL(originalURL);
    } catch (error) { /* ignore */ }

    let truncationResult = null;

    try {
        let description = '';

        if (tweet.text) {
            truncationResult = dependencies.textTruncator.processTweetContent(tweet.text, '主推文');
            description = truncationResult.text;
        }

        const blacklistEntry = tweet._blacklistEntry;
        if (blacklistEntry && blacklistEntry.level === 2 && description) {
            description = `||${description}||`;
        }

        if (description) {
            embed.setDescription(description);
        }
    } catch (error) { /* ignore */ }

    try {
        if (replyInfo && replyInfo.tweet) {
            // Kept for compatibility with the previous no-op reply branch.
        } else if (replyInfo && replyInfo.username) {
            // Kept for compatibility with the previous no-op reply branch.
        }
    } catch (error) { /* ignore */ }

    try {
        if (quoteInfo && quoteInfo.tweet && showQuote) {
            addQuoteField(embed, quoteInfo, dependencies);
        }
    } catch (error) { /* ignore */ }

    try {
        setEnhancedEmbedImages(embed, tweet, replyInfo, tweetType, quoteInfo, dependencies);
    } catch (error) { /* ignore */ }

    try {
        if (tweet.created_at) {
            embed.setTimestamp(new Date(tweet.created_at));
        }
    } catch (error) { /* ignore */ }

    try {
        const stats = [];
        if (tweet.likes) stats.push(`❤️ ${tweet.likes}`);
        if (tweet.retweets) stats.push(`🔄 ${tweet.retweets}`);
        if (tweet.replies) stats.push(`💬 ${tweet.replies}`);

        let tweetTypeLabel = '';
        if (replyInfo && replyInfo.username) {
            tweetTypeLabel = '回覆文章 ';
        } else if (quoteInfo && quoteInfo.tweet) {
            tweetTypeLabel = '轉推文章 ';
        }

        const blacklistEntry = tweet._blacklistEntry;
        let footerText = '';

        if (blacklistEntry && (blacklistEntry.level === 1 || blacklistEntry.level === 2)) {
            footerText = `${blacklistEntry.label}，觀看內文請自行斟酌`;
        } else if (stats.length > 0) {
            footerText = `${stats.join(' • ')} | ${tweetTypeLabel}Peko Embed`;
        } else {
            footerText = `${tweetTypeLabel}Peko Embed`;
        }

        embed.setFooter({
            text: footerText,
            iconURL: 'https://abs.twimg.com/favicons/twitter.2.ico'
        });
    } catch (error) { /* ignore */ }

    return {
        embed: embed,
        truncationResult: truncationResult
    };
}

module.exports = {
    buildEnhancedEmbed,
    setEnhancedEmbedImages
};
