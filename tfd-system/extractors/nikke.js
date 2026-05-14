/**
 * TFD 系統 - 勝利女神：妮姬 官方網站提取器
 * 抓取 nikke.hotcool.tw/News_detail-{id} 頁面
 *
 * 擷取欄位：
 *   - 標題：div.new_box2 > div.title
 *   - 日期：div.time > span:first-child
 *   - 類型標籤：div.time > span:last-child（重要 / 活動 等）
 *   - 內文：div#content（分段放入 Field，支援展開/收合按鈕）
 *   - Icon：固定 hotcool.tw CDN 路徑
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HTTPClient = require('../utils/http-client');
const URLConverterLogger = require('../utils/url-converter-logger');
const tfd = require('../../utils/tfd-logger');

const NIKKE_ICON      = 'https://static.hotcool.tw/static/act/slnstw/gw_new/pc/ossweb-img/footer_spec_icon.png';
const NIKKE_COLOR     = 0xC8A86B; // 妮姬主題金色
const CHUNK_SIZE      = 800;      // 每段最多 800 字（field value ≤ 1024）
const MAX_TOTAL_CHARS = 5800;     // Discord embed 上限 6000，留 200 緩衝

class NikkeExtractor {
    constructor() {
        this.httpClient = new HTTPClient();
        this.name = '勝利女神：妮姬';
    }

    async extract(matchResult, message = null) {
        const { originalURL, extractedData } = matchResult;
        const newsId = extractedData[0];

        try {
            tfd.sys('Nikke', `獲取公告: ${originalURL}`);

            const html = await this.httpClient.fetchHTML(originalURL, {
                timeout: 15000,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'zh-TW,zh;q=0.9',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (!html || html.length < 200) {
                throw new Error('無法取得頁面內容');
            }

            const data = this.parsePage(html);
            if (!data.title) {
                throw new Error('無法解析文章標題');
            }

            tfd.sys('Nikke', `成功取得: ${data.title}`);

            const userId = message?.author?.id || '0';
            const embed = this.buildEmbed(data, originalURL, false);
            const components = this.buildButtons(newsId, userId, false);

            URLConverterLogger.logConversion('nikke', message, `公告: ${data.title}`);

            return {
                success: true,
                embed,
                components,
                siteName: 'nikke',
                contentType: 'news'
            };

        } catch (error) {
            tfd.sysError('Nikke', `處理失敗: ${error.message}`);
            return this.createErrorResponse(error.message, originalURL);
        }
    }

    // ─── 解析 ──────────────────────────────────────────────────────

    parsePage(html) {
        return {
            title:   this.parseTitle(html),
            date:    this.parseDate(html),
            tag:     this.parseTag(html),
            content: this.parseContent(html)
        };
    }

    /** div.new_box2 > div.title */
    parseTitle(html) {
        const m = html.match(/<div[^>]+class="title pr"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
        return m ? this.cleanText(m[1]) : null;
    }

    /** div.time > span:first-child → 日期 */
    parseDate(html) {
        const m = html.match(/<div[^>]+class="time pr"[^>]*>\s*<span>([\s\S]*?)<\/span>/i);
        return m ? this.cleanText(m[1]) : null;
    }

    /** div.time > span:last-child → 重要 / 活動 等標籤 */
    parseTag(html) {
        const m = html.match(/<div[^>]+class="time pr"[^>]*>[\s\S]*?<span>[^<]*<\/span>\s*<span>([\s\S]*?)<\/span>/i);
        return m ? this.cleanText(m[1]) : null;
    }

    /** div#content → 全文（去除 HTML，<br> 轉空格，不保留空行） */
    parseContent(html) {
        const startIdx = html.indexOf('id="content"');
        if (startIdx === -1) return null;

        // 跳過開始標籤的 > 之後才是內容
        const tagEnd = html.indexOf('>', startIdx) + 1;
        const after = html.substring(tagEnd);
        const endIdx = after.search(/class="page_footer"|class="footer_|<footer/i);
        const raw = endIdx > 0 ? after.substring(0, endIdx) : after.substring(0, 30000);

        let text = raw
            .replace(/<br\s*\/?>/gi, ' ')          // <br> → 空格（不強制換行）
            .replace(/<[^>]+>/g, '')               // 移除所有 HTML 標籤
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&mdash;/g, '—')
            .replace(/&ndash;/g, '–')
            .replace(/&hellip;/g, '…')
            .replace(/&#\d+;/g, '')
            .replace(/[ \t]+/g, ' ')               // 清除連續空白
            .replace(/\n[ \t]+/g, '\n')            // 清除行首空白
            .replace(/\n{2,}/g, '\n')              // 多換行 → 單換行（無空行）
            .trim();

        return text || null;
    }

    /**
     * 將長文本分段，每段不超過 CHUNK_SIZE 字元
     * 優先在換行處切割，單行超長時硬切
     */
    splitContent(text) {
        if (!text) return [];
        if (text.length <= CHUNK_SIZE) return [text];

        const chunks = [];
        const lines = text.split('\n');
        let current = '';

        for (const line of lines) {
            const sep = current ? '\n' : '';
            const test = current + sep + line;

            if (test.length > CHUNK_SIZE && current) {
                // 本段已滿，先存入，再處理這行
                chunks.push(current);
                current = '';
                // 若單行本身超長，硬切
                let remaining = line;
                while (remaining.length > CHUNK_SIZE) {
                    chunks.push(remaining.substring(0, CHUNK_SIZE));
                    remaining = remaining.substring(CHUNK_SIZE);
                }
                current = remaining;
            } else if (test.length > CHUNK_SIZE) {
                // current 是空的但單行就超長（硬切）
                let remaining = line;
                while (remaining.length > CHUNK_SIZE) {
                    chunks.push(remaining.substring(0, CHUNK_SIZE));
                    remaining = remaining.substring(CHUNK_SIZE);
                }
                current = remaining;
            } else {
                current = test;
            }
        }

        if (current.trim()) chunks.push(current);
        return chunks;
    }

    // ─── Embed 建構 ────────────────────────────────────────────────

    /**
     * @param {Object}  data     解析結果
     * @param {string}  url      原始 URL
     * @param {boolean} expanded 是否顯示完整內文（多段）
     */
    buildEmbed(data, url, expanded) {
        const TITLE_LIMIT = 256;
        const FIELD_LIMIT = 1024;

        const safeTitle = data.title?.length > TITLE_LIMIT
            ? data.title.substring(0, TITLE_LIMIT - 1) + '…'
            : data.title;

        const embed = new EmbedBuilder()
            .setColor(NIKKE_COLOR)
            .setAuthor({
                name: '勝利女神：妮姬 官方公告',
                iconURL: NIKKE_ICON,
                url: 'https://nikke.hotcool.tw/news.html'
            })
            .setTitle(safeTitle)
            .setURL(url);

        const fields = [];

        // 日期 & 類型（非並行）
        if (data.date) {
            fields.push({ name: '📅 日期', value: data.date.substring(0, FIELD_LIMIT), inline: false });
        }
        if (data.tag) {
            fields.push({ name: '🏷️ 類型', value: data.tag.substring(0, FIELD_LIMIT), inline: false });
        }

        // 內文分段
        const chunks = this.splitContent(data.content);
        if (chunks.length > 0) {
            if (!expanded) {
                // 收合：只顯示第一段
                fields.push({ name: '📄 內文', value: chunks[0], inline: false });
            } else {
                // 展開：塞入所有段落，不超過 MAX_TOTAL_CHARS
                let usedChars = (safeTitle?.length || 0)
                    + 20   // author name 估算
                    + 40;  // footer 估算
                for (const f of fields) usedChars += f.name.length + f.value.length;

                for (let i = 0; i < chunks.length; i++) {
                    const fieldName = i === 0 ? '📄 內文' : '\u200b';
                    const cost = fieldName.length + chunks[i].length;
                    if (usedChars + cost > MAX_TOTAL_CHARS) break;
                    fields.push({ name: fieldName, value: chunks[i], inline: false });
                    usedChars += cost;
                }
            }
        }

        if (fields.length > 0) {
            embed.addFields(fields);
        }

        embed
            .setFooter({ text: '勝利女神：妮姬 | nikke.hotcool.tw', iconURL: NIKKE_ICON })
            .setTimestamp();

        return embed;
    }

    /**
     * 建立展開/收合按鈕
     * @param {string}  newsId   文章 ID
     * @param {string}  userId   發文者 Discord ID
     * @param {boolean} expanded 目前是否已展開
     */
    buildButtons(newsId, userId, expanded) {
        const button = new ButtonBuilder()
            .setCustomId(`nikke_${expanded ? 'collapse' : 'expand'}_${newsId}_${userId}`)
            .setLabel(expanded ? '縮回內文' : '顯示全文')
            .setStyle(ButtonStyle.Secondary);

        return [new ActionRowBuilder().addComponents(button)];
    }

    // ─── 工具 ──────────────────────────────────────────────────────

    cleanText(text) {
        if (!text) return null;
        return text
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim() || null;
    }

    createErrorResponse(msg, url) {
        return {
            success: false,
            error: msg,
            siteName: 'nikke',
            embed: new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('妮姬公告取得失敗')
                .setDescription(`錯誤：${msg}`)
                .setURL(url)
                .setFooter({ text: '勝利女神：妮姬', iconURL: NIKKE_ICON })
                .setTimestamp()
        };
    }
}

module.exports = NikkeExtractor;
