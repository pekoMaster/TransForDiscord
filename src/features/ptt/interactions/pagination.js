/**
 * PTT 翻頁互動處理器
 * 處理 PTT 多圖片翻頁按鈕的點擊事件
 * 完全參考 Pixiv 翻頁處理器的架構
 */

const { Events, MessageFlags } = require('discord.js');
const PTTExtractor = require('../../../../tfd-system/extractors/ptt.js');
const PTTCacheManager = require('../cache/ptt-cache-manager.js');
const tlog = require('../../../shared/logging/tfd-logger');

// 記憶體快取（避免每次翻頁都讀取磁碟）
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

// 防止快速點擊的冷卻機制
const clickCooldown = new Map();

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 只處理按鈕互動
        if (!interaction.isButton()) return;

        // 檢查是否為 PTT 翻頁按鈕
        if (!interaction.customId.startsWith('ptt_')) return;

        // 重整按鈕單獨處理
        if (interaction.customId.startsWith('ptt_reload_')) {
            await handlePttReload(interaction);
            return;
        }

        // 展開/縮回按鈕
        if (interaction.customId.startsWith('ptt_expand_') || interaction.customId.startsWith('ptt_collapse_')) {
            await handlePttExpandCollapse(interaction);
            return;
        }

        try {
            // 解析按鈕 ID：ptt_action_articleHash_targetPage
            const parts = interaction.customId.split('_');
            if (parts.length !== 4) return;

            const [, action, articleHash, targetPage] = parts;
            const pageNumber = parseInt(targetPage);

            // 檢查冷卻機制（防止快速點擊）
            const cooldownKey = `${interaction.user.id}_${articleHash}`;
            const now = Date.now();
            const cooldownTime = 1500; // 1.5 秒冷卻

            if (clickCooldown.has(cooldownKey)) {
                const lastClick = clickCooldown.get(cooldownKey);
                if (now - lastClick < cooldownTime) {
                    if (!interaction.deferred && !interaction.replied) {
                        await interaction.deferUpdate();
                    }
                    return;
                }
            }

            // 設定冷卻
            clickCooldown.set(cooldownKey, now);

            // 檢查互動是否還有效並延遲回應
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            tlog.sys('PTT翻頁', `用戶 ${interaction.user.tag} 點擊: ${action} → 第 ${pageNumber + 1} 頁`);

            // 優先從記憶體快取獲取
            let cachedData = null;
            const memoryCacheEntry = memoryCache.get(articleHash);

            if (memoryCacheEntry && (Date.now() - memoryCacheEntry.timestamp < MEMORY_CACHE_TTL)) {
                cachedData = memoryCacheEntry.data;
            } else {
                const cacheManager = new PTTCacheManager();
                cachedData = await cacheManager.loadArticleCache(articleHash);

                if (cachedData) {
                    memoryCache.set(articleHash, { data: cachedData, timestamp: Date.now() });
                }
            }

            if (!cachedData) {
                return interaction.followUp({
                    content: '⏰ **頁面資料已過期**\n\n為了最佳效能，翻頁資料只保存24小時。\n請重新張貼 PTT 網址以載入最新資料。',
                    flags: MessageFlags.Ephemeral
                });
            }

            // 使用快取資料生成頁面回應
            const pttExtractor = new PTTExtractor();
            const originalURL = cachedData.url;

            const pageResult = pttExtractor.createArticleResponseFromCache(cachedData, originalURL, pageNumber);

            // 準備 Embeds 和按鈕
            const embeds = pageResult.embeds || [pageResult.embed];
            const components = pageResult.components || [];

            await interaction.editReply({
                embeds: embeds,
                components: components
            });

            tlog.sys('PTT翻頁', `成功切換到第 ${pageNumber + 1} 頁`);

            cleanExpiredMemoryCache();

        } catch (error) {
            tlog.sysError('PTT翻頁', `處理翻頁互動失敗: ${error}`);

            // 只有在特定錯誤時才嘗試回應
            if (error.code !== 10062) { // 10062 = Unknown interaction (已超時)
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '翻頁時發生錯誤，請稍後再試。',
                            flags: MessageFlags.Ephemeral
                        });
                    } else if (interaction.deferred && !interaction.replied) {
                        await interaction.editReply({
                            content: '翻頁時發生錯誤，請稍後再試。'
                        });
                    }
                } catch (replyError) {
                    tlog.sysError('PTT翻頁', `無法回應錯誤訊息: ${replyError.message}`);
                }
            } else {
                tlog.sys('PTT翻頁', '互動已超時，跳過錯誤回應');
            }
        }
    }
};

async function handlePttReload(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    const originalURL = interaction.message.embeds?.[0]?.url;
    if (!originalURL) {
        return interaction.followUp({
            content: '❌ 無法取得文章網址',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const articleHash = interaction.customId.replace('ptt_reload_', '');

        // 清除記憶體快取和磁碟快取，強制重新抓取
        memoryCache.delete(articleHash);
        const cacheManager = new PTTCacheManager();
        const cacheFile = cacheManager.getArticleCacheFile(articleHash);
        const fsPromises = require('fs').promises;
        try { await fsPromises.unlink(cacheFile); } catch {}

        // 重新提取文章
        const pttExtractor = new PTTExtractor();
        const result = await pttExtractor.extractArticle(
            { board: '' },
            pttExtractor.convertToPttweb(originalURL),
            originalURL
        );

        if (!result.success) {
            return interaction.followUp({
                content: `❌ 重整失敗: ${result.error || '無法取得文章'}`,
                flags: MessageFlags.Ephemeral
            });
        }

        const embeds = result.embeds || [result.embed];
        const components = result.components || [];
        await interaction.editReply({ embeds, components });
        tlog.sys('PTT重整', `重整成功: ${originalURL}`);
    } catch (error) {
        tlog.sysError('PTT重整', `重整失敗: ${error.message}`);
        try {
            await interaction.followUp({
                content: '❌ 重整失敗，請稍後再試',
                flags: MessageFlags.Ephemeral
            });
        } catch {}
    }
}

async function handlePttExpandCollapse(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    const isExpand = interaction.customId.startsWith('ptt_expand_');
    const articleHash = interaction.customId.replace(/^ptt_(expand|collapse)_/, '');

    try {
        // 從快取取得完整內容
        let cachedData = null;
        const memoryCacheEntry = memoryCache.get(articleHash);

        if (memoryCacheEntry && (Date.now() - memoryCacheEntry.timestamp < MEMORY_CACHE_TTL)) {
            cachedData = memoryCacheEntry.data;
        } else {
            const cacheManager = new PTTCacheManager();
            cachedData = await cacheManager.loadArticleCache(articleHash);
            if (cachedData) {
                memoryCache.set(articleHash, { data: cachedData, timestamp: Date.now() });
            }
        }

        if (!cachedData || !cachedData.articleData) {
            return interaction.followUp({
                content: '⏰ **資料已過期**，請重新貼上 PTT 網址。',
                flags: MessageFlags.Ephemeral
            });
        }

        const { articleData } = cachedData;
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        // 取得目前的 embed 和 components
        const currentEmbed = interaction.message.embeds[0];
        if (!currentEmbed) return;

        const newEmbed = EmbedBuilder.from(currentEmbed);

        if (isExpand) {
            // 展開：用完整內容替換
            const fullContent = articleData.fullContent || articleData.content;
            // Discord embed description 上限 4096 字
            const displayContent = fullContent.length > 3800
                ? fullContent.substring(0, 3800) + '...'
                : fullContent;
            const header = `作者 ${articleData.author}\n\n`;
            newEmbed.setDescription(header + displayContent);
        } else {
            // 縮回：用截斷內容替換
            const header = `作者 ${articleData.author}\n\n`;
            newEmbed.setDescription(header + articleData.content);
        }

        // 重建按鈕：切換展開/縮回
        const existingRows = interaction.message.components || [];
        const newComponents = [];

        for (const row of existingRows) {
            const newRow = new ActionRowBuilder();
            for (const component of row.components) {
                const id = component.customId;
                if (id && id.startsWith('ptt_expand_')) {
                    newRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ptt_collapse_${articleHash}`)
                            .setLabel('縮回')
                            .setStyle(ButtonStyle.Secondary)
                    );
                } else if (id && id.startsWith('ptt_collapse_')) {
                    newRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ptt_expand_${articleHash}`)
                            .setLabel('展開')
                            .setStyle(ButtonStyle.Secondary)
                    );
                } else {
                    newRow.addComponents(ButtonBuilder.from(component));
                }
            }
            newComponents.push(newRow);
        }

        // 保留所有現有 embeds（多圖）
        const allEmbeds = interaction.message.embeds.map((e, i) =>
            i === 0 ? newEmbed : EmbedBuilder.from(e)
        );

        await interaction.editReply({
            embeds: allEmbeds,
            components: newComponents
        });

        tlog.sys('PTT展開', `用戶 ${interaction.user.tag} ${isExpand ? '展開' : '縮回'}全文`);
    } catch (error) {
        tlog.sysError('PTT展開', `處理失敗: ${error.message}`);
        try {
            await interaction.followUp({
                content: '❌ 操作失敗，請稍後再試。',
                flags: MessageFlags.Ephemeral
            });
        } catch {}
    }
}

function cleanExpiredMemoryCache() {
    const now = Date.now();
    for (const [hash, entry] of memoryCache.entries()) {
        if (now - entry.timestamp > MEMORY_CACHE_TTL) {
            memoryCache.delete(hash);
        }
    }
}

setInterval(cleanExpiredMemoryCache, 10 * 60 * 1000);
