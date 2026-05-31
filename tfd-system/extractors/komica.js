const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");
const komicaCache = require("../../utils/komica-thread-cache");
const tfd = require("../../utils/tfd-logger");

const KOMICA_COLOR = 0x8B0000;
const CONTENT_LIMIT = 350;
const HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://komica1.org/",
};

class KomicaExtractor {
    constructor() {
        this.name = "komica";
    }

    async extract(matchResult, message = null) {
        const { extractedData, originalURL } = matchResult;
        const { threadId } = extractedData;

        const cached = komicaCache.get(threadId);
        if (cached) {
            return this.buildResult(cached, 0, false);
        }

        const data = await this.fetchThread(originalURL);
        if (!data.success) throw new Error(data.error);

        komicaCache.set(threadId, { posts: data.posts, boardName: data.boardName, threadUrl: originalURL });
        return this.buildResult(komicaCache.get(threadId), 0, false);
    }

    async fetchThread(url) {
        try {
            const baseUrl = new URL(url).origin;
            const res = await axios.get(url, { headers: HTTP_HEADERS, timeout: 15000 });
            const $ = cheerio.load(res.data);

            const boardName = $("h1").first().text().trim() || "未知板";
            const posts = [];

            $("div[id^='r'].post").each(function() {
                const no = $(this).attr("data-no") || "";
                const isOP = posts.length === 0;

                const title = $(this).find(".title").text().trim() || "";
                const author = $(this).find(".author").text().trim() || "無名";
                const timestamp = $(this).find(".date").text().trim() || "";
                const postId = $(this).find(".id").text().trim() || "";

                let content = $(this).find(".quote").html() || "";
                content = content.replace(/<br\s*\/?>/gi, "\n");
                content = content.replace(/<[^>]+>/g, "");
                content = content
                    .replace(/&gt;/g, ">")
                    .replace(/&lt;/g, "<")
                    .replace(/&amp;/g, "&")
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&#x([0-9A-Fa-f]+);/gi, function(_, hex) { return String.fromCodePoint(parseInt(hex, 16)); })
                    .replace(/&#([0-9]+);/g, function(_, dec) { return String.fromCodePoint(parseInt(dec, 10)); })
                    .trim();

                var imgAnchor = $(this).find("a:has(img.img)").attr("href");
                var imgThumb = $(this).find("img.img").attr("src");
                var rawSrc = imgAnchor || imgThumb;
                var image = rawSrc ? new URL(rawSrc, baseUrl).href : null;

                posts.push({ no, isOP, title, author, timestamp, postId, content, image });
            });

            if (posts.length === 0) {
                return { success: false, error: "找不到任何貼文" };
            }

            return { success: true, posts, boardName };
        } catch (e) {
            tfd.sysError("KomicaExtractor", "抓取失敗: " + e.message);
            return { success: false, error: e.message };
        }
    }

    buildResult(cached, index, spoiler) {
        const { posts, boardName, threadUrl } = cached;
        const replyCount = posts.length - 1;
        const post = posts[index];

        const embed = this.buildEmbed(post, index, replyCount, boardName, threadUrl, spoiler);
        const components = this.buildButtons(posts[0].no, index, replyCount, spoiler);

        return { embeds: [embed], components };
    }

    buildEmbed(post, index, replyCount, boardName, threadUrl, spoiler) {
        const label = index === 0 ? "OP" : "回覆 " + index + "/" + replyCount;
        const displayTitle = post.title ? "【" + post.title + "】" : "";

        let content = post.content || "（無內文）";
        if (content.length > CONTENT_LIMIT) {
            content = content.substring(0, CONTENT_LIMIT) + "...";
        }

        if (spoiler) {
            content = "||" + content.replace(/\|/g, "｜") + "||";
        }

        const embed = new EmbedBuilder()
            .setColor(KOMICA_COLOR)
            .setURL(threadUrl)
            .setTitle(displayTitle + boardName + " — " + label)
            .setDescription(content)
            .setFooter({ text: "No." + post.no + " • Komica" });

        const authorLine = [post.author, post.postId, post.timestamp].filter(Boolean).join(" | ");
        if (authorLine) embed.setAuthor({ name: authorLine });

        if (post.image && !spoiler) {
            embed.setImage(post.image);
        } else if (post.image && spoiler) {
            embed.addFields({ name: "​", value: "||[含圖片 — 取消防雷後顯示]||" });
        }

        return embed;
    }

    buildButtons(threadId, currentIndex, replyCount, spoiler) {
        const rows = [];
        const sp = spoiler ? "s" : "n";

        if (replyCount > 0) {
            const atStart = currentIndex === 0;
            const atEnd = currentIndex >= replyCount;

            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(atStart ? "komica_noop_op_" + threadId : "komica_nav_" + threadId + "_0_" + sp)
                    .setLabel("OP")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(atStart),
                new ButtonBuilder()
                    .setCustomId(atStart ? "komica_noop_prev_" + threadId : "komica_nav_" + threadId + "_" + (currentIndex - 1) + "_" + sp)
                    .setLabel("◀")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(atStart),
                new ButtonBuilder()
                    .setCustomId(atEnd ? "komica_noop_next_" + threadId : "komica_nav_" + threadId + "_" + (currentIndex + 1) + "_" + sp)
                    .setLabel("▶")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(atEnd),
                new ButtonBuilder()
                    .setCustomId(atEnd ? "komica_noop_last_" + threadId : "komica_nav_" + threadId + "_" + replyCount + "_" + sp)
                    .setLabel("末 (" + replyCount + ")")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(atEnd)
            );
            rows.push(navRow);
        }

        const toolRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("komica_sp_" + threadId + "_" + currentIndex + "_" + (spoiler ? "n" : "s"))
                .setLabel(spoiler ? "顯示內容" : "防爆雷")
                .setStyle(spoiler ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("komica_ref_" + threadId + "_" + currentIndex + "_" + sp)
                .setLabel("重整")
                .setStyle(ButtonStyle.Secondary)
        );
        rows.push(toolRow);

        return rows;
    }
}

module.exports = KomicaExtractor;
