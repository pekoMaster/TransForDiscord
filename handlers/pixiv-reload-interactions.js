/**
 * Pixiv 重新整理互動處理器
 *
 * 處理 `pixiv_reload_{artworkId}_{nextProxyIndex}` 按鈕。
 * 行為：
 *   1. 刪除該作品的本地快取
 *   2. 以 nextProxyIndex 重新抓取作品（切換代理服務）
 *   3. 重新建立 embed + 按鈕並編輯訊息
 *
 * 用途：當 Discord 無法抓到預覽圖（多半是代理服務暫時失效），
 * 用戶可點擊 🔄 換下一個代理重試。
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const PixivExtractor = require('../tfd-system/extractors/pixiv.js');
const PixivCacheManager = require('../utils/pixiv-cache-manager.js');
const { editWebhookMessage } = require('../utils/webhook-manager.js');
const { appendSpoilerButton } = require('../utils/spoiler-button-helper.js');

function getTimePrefix() {
    const now = new Date();
    return `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]`;
}

// 防止快速點擊冷卻（與 pixiv-pagination-interactions 獨立 Map）
const reloadCooldown = new Map();

module.exports = {
    async handlePixivReloadInteraction(interaction) {
        try {
            if (!interaction.isButton()) return;

            const prefix = 'pixiv_reload_';
            if (!interaction.customId || !interaction.customId.startsWith(prefix)) return;

            // customId: pixiv_reload_{artworkId}_{nextProxyIndex}
            const rest = interaction.customId.slice(prefix.length);
            const lastUnderscore = rest.lastIndexOf('_');
            if (lastUnderscore < 0) {
                return interaction.reply({ content: '無法解析 Pixiv 重新整理按鈕。', flags: MessageFlags.Ephemeral });
            }

            const artworkId = rest.slice(0, lastUnderscore);
            const nextProxyIndex = parseInt(rest.slice(lastUnderscore + 1), 10);

            if (!artworkId || Number.isNaN(nextProxyIndex)) {
                return interaction.reply({ content: '無法解析 Pixiv 重新整理按鈕。', flags: MessageFlags.Ephemeral });
            }

            // 冷卻檢查（2 秒）
            const cooldownKey = `${interaction.user.id}_${artworkId}`;
            const now = Date.now();
            const cooldownTime = 2000;
            if (reloadCooldown.has(cooldownKey)) {
                const last = reloadCooldown.get(cooldownKey);
                if (now - last < cooldownTime) {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '⏳ 點擊過於頻繁，請稍候再試。',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    return;
                }
            }
            reloadCooldown.set(cooldownKey, now);

            // deferUpdate 避免 3 秒超時
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // 1. 刪除快取
            const cacheManager = new PixivCacheManager();
            await cacheManager.deleteArtworkCache(artworkId);

            // 2. 以新代理索引重新抓取
            const proxyCount = (PixivExtractor.PROXY_SERVICES || []).length || 1;
            const safeProxyIndex = ((nextProxyIndex % proxyCount) + proxyCount) % proxyCount;
            const originalURL = `https://www.pixiv.net/artworks/${artworkId}`;
            const extractor = new PixivExtractor();

            console.log(`${getTimePrefix()} [Pixiv-Reload] 用戶 ${interaction.user.tag} 重試 ${artworkId} → proxy[${safeProxyIndex}] (${PixivExtractor.PROXY_SERVICES?.[safeProxyIndex] || '?'})`);

            let result;
            try {
                result = await extractor.extractArtwork(artworkId, originalURL, null, safeProxyIndex);
            } catch (err) {
                console.error(`${getTimePrefix()} [Pixiv-Reload] 重新抓取失敗:`, err.message);
                return interaction.followUp({
                    content: `❌ 重新抓取失敗：${err.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!result || !result.success || !result.embed) {
                return interaction.followUp({
                    content: '❌ 無法重新載入作品資料，請稍後再試。',
                    flags: MessageFlags.Ephemeral
                });
            }

            // 3. 組回訊息：embed + pagination/reload 按鈕
            const embeds = [result.embed];
            const pagination = result.pagination || {};
            const totalPages = pagination.totalPages || pagination.totalImages || 1;
            const currentPage = pagination.currentPage || 0;
            const nextNextProxyIndex = result.reloadMeta?.nextProxyIndex ?? ((safeProxyIndex + 1) % proxyCount);

            let components = [];
            if (totalPages > 1) {
                components = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`pixiv_first_${artworkId}_0`)
                            .setLabel('⏪')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId(`pixiv_prev_${artworkId}_${Math.max(0, currentPage - 1)}`)
                            .setLabel('◀️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId(`pixiv_next_${artworkId}_${Math.min(totalPages - 1, currentPage + 1)}`)
                            .setLabel('▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === totalPages - 1),
                        new ButtonBuilder()
                            .setCustomId(`pixiv_last_${artworkId}_${totalPages - 1}`)
                            .setLabel('⏩')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(currentPage === totalPages - 1),
                        new ButtonBuilder()
                            .setCustomId(`pixiv_reload_${artworkId}_${nextNextProxyIndex}`)
                            .setLabel('重整')
                            .setStyle(ButtonStyle.Secondary)
                    )
                ];
            } else {
                components = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`pixiv_reload_${artworkId}_${nextNextProxyIndex}`)
                            .setLabel('重整')
                            .setStyle(ButtonStyle.Secondary)
                    )
                ];
            }

            // 4. 編輯訊息（原訊息由 Webhook 發送），重新附加防爆雷按鈕
            components = appendSpoilerButton(components);
            const updatePayload = { embeds, components };
            try {
                await editWebhookMessage(interaction.channel, interaction.message.id, updatePayload);
                console.log(`${getTimePrefix()} [Pixiv-Reload] 已重新載入 ${artworkId} (proxy[${safeProxyIndex}])`);
            } catch (editError) {
                console.warn(`${getTimePrefix()} [Pixiv-Reload] Webhook 編輯失敗 (${editError.message})，改用 followUp`);
                try {
                    await interaction.followUp(updatePayload);
                } catch (followErr) {
                    console.error(`${getTimePrefix()} [Pixiv-Reload] followUp 也失敗:`, followErr.message);
                }
            }

        } catch (error) {
            console.error(`${getTimePrefix()} [Pixiv-Reload] 處理互動時發生錯誤:`, error);
            if (error.code === 10062) return; // Unknown interaction (已超時)
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '重新整理時發生錯誤，請稍後再試。',
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.followUp({
                        content: '重新整理時發生錯誤，請稍後再試。',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (_) {
                // 忽略回覆錯誤
            }
        }
    }
};
