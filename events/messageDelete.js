const videoReplyTracker = require('../utils/video-reply-tracker');
const tfd = require('../utils/tfd-logger');

module.exports = {
    async execute(message, client) {
        const tracked = videoReplyTracker.lookup(message.id);
        if (!tracked) return;
        videoReplyTracker.remove(message.id);
        try {
            const channel = await client.channels.fetch(tracked.channelId).catch(() => null);
            if (!channel) return;
            const botMsg = await channel.messages.fetch(tracked.botMsgId).catch(() => null);
            if (botMsg) await botMsg.delete().catch(() => {});
        } catch (e) {
            tfd.sysWarn('MessageDelete', '跟刪失敗: ' + e.message);
        }
    }
};
