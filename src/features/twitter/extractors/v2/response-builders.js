const { EmbedBuilder } = require('discord.js');

function buildProfileEmbed(user, originalURL) {
    const embed = new EmbedBuilder();
    embed.setColor(0x1DA1F2);

    embed.setAuthor({
        name: `@${user.screen_name}`,
        iconURL: user.avatar_url,
        url: originalURL,
    });

    let titleText = user.name;
    if (user.verification && user.verification.verified) {
        titleText += ' ✓';
    }
    embed.setTitle(titleText);
    embed.setURL(originalURL);

    if (user.description) {
        const maxLength = 500;
        let description = user.description;
        if (description.length > maxLength) {
            description = description.substring(0, maxLength) + '...';
        }
        embed.setDescription(description);
    }

    const stats = [];
    if (user.followers !== undefined) {
        stats.push(`👥 追蹤者: ${user.followers.toLocaleString()}`);
    }
    if (user.following !== undefined) {
        stats.push(`📌 追蹤中: ${user.following.toLocaleString()}`);
    }
    if (user.tweets !== undefined) {
        stats.push(`🐦 推文: ${user.tweets.toLocaleString()}`);
    }
    if (user.likes !== undefined) {
        stats.push(`❤️ 喜歡: ${user.likes.toLocaleString()}`);
    }

    if (stats.length > 0) {
        embed.addFields({
            name: '統計資訊',
            value: stats.join('\n'),
            inline: true,
        });
    }

    const extraInfo = [];
    if (user.location) {
        extraInfo.push(`📍 位置: ${user.location}`);
    }
    if (user.website) {
        extraInfo.push(`🔗 網站: [${user.website.display_url}](${user.website.url})`);
    }
    if (user.joined) {
        const joinDate = new Date(user.joined);
        const formattedDate = joinDate.toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        extraInfo.push(`📅 加入時間: ${formattedDate}`);
    }

    if (extraInfo.length > 0) {
        embed.addFields({
            name: '其他資訊',
            value: extraInfo.join('\n'),
            inline: true,
        });
    }

    if (user.banner_url) {
        embed.setImage(user.banner_url);
    }

    if (user.avatar_url) {
        const fullAvatarUrl = user.avatar_url.replace('_normal', '_400x400');
        embed.setThumbnail(fullAvatarUrl);
    }

    let footerText = 'Twitter Profile | Peko Embed';
    if (user.protected) {
        footerText = '🔒 受保護的帳號 | ' + footerText;
    }

    embed.setFooter({
        text: footerText,
        iconURL: 'https://abs.twimg.com/favicons/twitter.2.ico',
    });

    embed.setTimestamp();

    return embed;
}

function createPassthroughResponse(originalURL) {
    return {
        success: true,
        passthrough: true,
        originalURL,
        contentType: 'passthrough',
    };
}

function createErrorResponse(errorMessage, originalURL) {
    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('Twitter 提取失敗')
        .setDescription(`錯誤: ${errorMessage}`)
        .setURL(originalURL)
        .setFooter({
            text: 'Peko Embed',
            iconURL: 'https://abs.twimg.com/favicons/twitter.2.ico',
        })
        .setTimestamp();

    return {
        success: false,
        error: errorMessage,
        embed: errorEmbed,
        siteName: 'twitter',
        contentType: 'error',
    };
}

module.exports = {
    buildProfileEmbed,
    createPassthroughResponse,
    createErrorResponse,
};
