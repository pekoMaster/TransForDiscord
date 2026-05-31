const { MessageFlags } = require("discord.js");
const komicaCache = require("../utils/komica-thread-cache");
const KomicaExtractor = require("../tfd-system/extractors/komica");
const tfd = require("../utils/tfd-logger");

const _extractor = new KomicaExtractor();

async function ensureCache(interaction, threadId) {
    let cached = komicaCache.get(threadId);
    if (cached) return cached;

    const embedUrl = interaction.message?.embeds?.[0]?.url;
    if (!embedUrl) {
        await interaction.followUp({ content: "快取已過期，請重新貼上網址。", flags: MessageFlags.Ephemeral });
        return null;
    }

    const data = await _extractor.fetchThread(embedUrl);
    if (!data.success) {
        await interaction.followUp({ content: "重新抓取失敗：" + data.error, flags: MessageFlags.Ephemeral });
        return null;
    }

    komicaCache.set(threadId, { posts: data.posts, boardName: data.boardName, threadUrl: embedUrl });
    return komicaCache.get(threadId);
}

async function renderPage(interaction, cached, index, spoiler) {
    const { posts, boardName, threadUrl } = cached;
    const replyCount = posts.length - 1;
    const safeIndex = Math.max(0, Math.min(index, replyCount));

    const embed = _extractor.buildEmbed(posts[safeIndex], safeIndex, replyCount, boardName, threadUrl, spoiler);
    const components = _extractor.buildButtons(posts[0].no, safeIndex, replyCount, spoiler);

    await interaction.editReply({ embeds: [embed], components });
}

module.exports = {
    async handleKomicaButton(interaction) {
        if (!interaction.isButton()) return;
        const id = interaction.customId;

        // komica_nav_{threadId}_{index}_{spoiler:s|n}
        if (id.startsWith("komica_nav_")) {
            const parts = id.split("_");
            const threadId = parts[2];
            const targetIndex = parseInt(parts[3], 10);
            const spoiler = parts[4] === "s";

            if (!threadId || isNaN(targetIndex)) {
                return interaction.reply({ content: "無法解析按鈕資訊。", flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();
            try {
                const cached = await ensureCache(interaction, threadId);
                if (!cached) return;
                await renderPage(interaction, cached, targetIndex, spoiler);
            } catch (e) {
                tfd.sysError("KomicaNav", "導覽失敗: " + e.message);
                try { await interaction.followUp({ content: "導覽失敗，請稍後再試。", flags: MessageFlags.Ephemeral }); } catch (_) {}
            }
            return;
        }

        // komica_sp_{threadId}_{index}_{targetSpoiler:s|n}
        if (id.startsWith("komica_sp_")) {
            const parts = id.split("_");
            const threadId = parts[2];
            const currentIndex = parseInt(parts[3], 10);
            const spoiler = parts[4] === "s";

            await interaction.deferUpdate();
            try {
                const cached = await ensureCache(interaction, threadId);
                if (!cached) return;
                await renderPage(interaction, cached, currentIndex, spoiler);
            } catch (e) {
                tfd.sysError("KomicaSpoiler", "切換防雷失敗: " + e.message);
            }
            return;
        }

        // komica_ref_{threadId}_{index}_{spoiler:s|n}
        if (id.startsWith("komica_ref_")) {
            const parts = id.split("_");
            const threadId = parts[2];
            const currentIndex = parseInt(parts[3], 10);
            const spoiler = parts[4] === "s";

            await interaction.deferUpdate();
            try {
                komicaCache.del(threadId);
                const cached = await ensureCache(interaction, threadId);
                if (!cached) return;
                await renderPage(interaction, cached, currentIndex, spoiler);
            } catch (e) {
                tfd.sysError("KomicaRefresh", "重整失敗: " + e.message);
                try { await interaction.followUp({ content: "重整失敗，請稍後再試。", flags: MessageFlags.Ephemeral }); } catch (_) {}
            }
            return;
        }
    }
};
