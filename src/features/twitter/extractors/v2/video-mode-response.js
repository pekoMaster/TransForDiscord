const { EmbedBuilder } = require('discord.js');

async function buildGASVideoModeResponse(tweet, originalURL, tweetType, dependencies) {
    try {
        const gasURL = dependencies.getGasURL();
        if (!gasURL) {
            dependencies.logger.sysError('Enhanced-Twitter', '未配置 GOOGLE_APP_SCRIPT_URL 環境變數');
            return null;
        }

        const tweetId = dependencies.extractTweetId(originalURL);
        if (!tweetId) {
            dependencies.logger.sysError('Enhanced-Twitter', '無法提取推文 ID');
            return null;
        }

        const gasQueryURL = `${gasURL}?tweet_id=${tweetId}&type=${tweetType}&original_url=${encodeURIComponent(originalURL)}`;

        return {
            gasURL: gasQueryURL,
            originalURL: originalURL,
            tweetType: tweetType,
            mode: 'gas_video'
        };
    } catch (error) {
        dependencies.logger.sysError('Enhanced-Twitter', `GAS 模式處理錯誤: ${error}`);
        return null;
    }
}

function buildBasicEmbed(tweet, originalURL) {
    const embed = new EmbedBuilder();

    if (tweet.author) {
        embed.setAuthor({
            name: `@${tweet.author.screen_name}`,
            iconURL: tweet.author.profile_image_url_https || tweet.author.avatar_url,
            url: `https://twitter.com/${tweet.author.screen_name}`
        });

        const displayName = tweet.author.name || tweet.author.screen_name;
        embed.setTitle(displayName);
    }

    embed.setColor(0x1DA1F2);
    embed.setURL(originalURL);

    if (tweet.created_at) {
        const createdDate = new Date(tweet.created_at);
        embed.setTimestamp(createdDate);
    }

    return embed;
}

async function buildHTMLVideoModeResponse(tweet, originalURL, tweetType, dependencies) {
    try {
        const videos = dependencies.extractVideos(tweet);
        const images = dependencies.extractImages(tweet);

        const tweetData = {
            author: {
                name: tweet.author?.name || 'Unknown',
                screen_name: tweet.author?.screen_name || 'unknown'
            },
            text: tweet.text || '',
            created_at: tweet.created_at
        };

        const htmlContent = dependencies.buildHTML({
            tweetData,
            videos,
            images,
            originalURL,
            siteName: 'Enhanced TFD'
        });

        const basicEmbed = buildBasicEmbed(tweet, originalURL);

        return {
            success: true,
            htmlContent: htmlContent,
            embed: basicEmbed,
            contentType: tweetType,
            siteName: 'twitter',
            isHTMLResponse: true,
            originalURL: originalURL,
            videosCount: videos.length,
            imagesCount: images.length
        };
    } catch (error) {
        dependencies.logger.sysError('Enhanced-Twitter', `HTML 影片播放模式處理失敗: ${error.message}`);
        dependencies.logger.sysError('Twitter-V2', error.stack);
        return await dependencies.handleMixedMediaTweetFallback(tweet, originalURL, tweetType);
    }
}

module.exports = {
    buildBasicEmbed,
    buildGASVideoModeResponse,
    buildHTMLVideoModeResponse
};
