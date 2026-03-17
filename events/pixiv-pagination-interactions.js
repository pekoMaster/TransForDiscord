/**
 * Pixiv 翻頁互動處理器
 * 處理 Pixiv 多圖片翻頁按鈕的點擊事件
 *
 * 新架構（2026-02-10）：
 * - 一頁一張圖片，圖片顯示在 embed 內
 * - 使用按鈕切換不同圖片
 * - R18 和一般向處理相同
 *
 * 效能優化（2026-02-10）：
 * - 使用模組級別單例避免重複創建實例
 * - 記憶體快取熱門作品減少磁碟讀取
 */

const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const PixivExtractor = require('../ermiana-system/extractors/pixiv.js');
const PixivCacheManager = require('../utils/pixiv-cache-manager.js');

// 🚀 效能優化：模組級別單例（避免每次點擊都創建新實例）
const pixivExtractor = new PixivExtractor();
const cacheManager = new PixivCacheManager();

// 🚀 效能優化：記憶體快取（避免每次翻頁都讀取磁碟）
// 結構：Map<artworkId, { data: cachedData, timestamp: Date.now() }>
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 分鐘記憶體快取

// 防止快速點擊的冷卻機制
const clickCooldown = new Map();

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 只處理按鈕互動
        if (!interaction.isButton()) return;

        // 檢查是否為 Pixiv 翻頁按鈕
        if (!interaction.customId.startsWith('pixiv_')) return;

        try {
            // 解析按鈕 ID：pixiv_action_artworkId_targetPage
            const parts = interaction.customId.split('_');
            if (parts.length !== 4) return;

            const [, action, artworkId, targetPage] = parts;
            const pageNumber = parseInt(targetPage);

            // 檢查冷卻機制（防止快速點擊）
            const cooldownKey = `${interaction.user.id}_${artworkId}`;
            const now = Date.now();
            const cooldownTime = 1000; // 1 秒冷卻

            if (clickCooldown.has(cooldownKey)) {
                const lastClick = clickCooldown.get(cooldownKey);
                if (now - lastClick < cooldownTime) {
                    console.log(`[Pixiv翻頁] 用戶 ${interaction.user.tag} 點擊過於頻繁，跳過處理`);
                    return;
                }
            }

            // 設定冷卻
            clickCooldown.set(cooldownKey, now);

            // 檢查互動是否還有效並延遲回應
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            console.log(`[Pixiv翻頁] 用戶 ${interaction.user.tag} 點擊: ${action} → 第 ${pageNumber + 1} 張`);

            const originalURL = `https://www.pixiv.net/artworks/${artworkId}`;

            // 🚀 優先從記憶體快取獲取
            let fullCachedData = null;
            const memoryCacheEntry = memoryCache.get(artworkId);

            if (memoryCacheEntry && (Date.now() - memoryCacheEntry.timestamp < MEMORY_CACHE_TTL)) {
                // 記憶體快取命中
                fullCachedData = memoryCacheEntry.data;
                console.log(`[Pixiv翻頁] 記憶體快取命中: ${artworkId}`);
            } else {
                // 記憶體快取未命中，從磁碟讀取
                fullCachedData = await cacheManager.loadArtworkCache(artworkId);

                if (fullCachedData) {
                    // 存入記憶體快取
                    memoryCache.set(artworkId, {
                        data: fullCachedData,
                        timestamp: Date.now()
                    });
                    console.log(`[Pixiv翻頁] 磁碟快取命中，已存入記憶體: ${artworkId}`);
                }
            }

            if (!fullCachedData) {
                return interaction.followUp({
                    content: '⏰ **快取資料已過期**\n\n請重新張貼 Pixiv 網址以載入最新資料。',
                    ephemeral: true
                });
            }

            // 使用快取資料生成頁面回應（使用模組級別單例）
            const pageResult = pixivExtractor.createArtworkResponseFromCache(fullCachedData, originalURL, pageNumber);

            // 取得總圖片數
            const totalImages = pageResult.pagination.totalImages;
            const totalPages = pageResult.pagination.totalPages;

            // 建立翻頁按鈕（2張以上才顯示）
            let components = [];
            if (totalImages >= 2) {
                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`pixiv_first_${artworkId}_0`)
                            .setLabel('⏪')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pageNumber === 0),
                        new ButtonBuilder()
                            .setCustomId(`pixiv_prev_${artworkId}_${Math.max(0, pageNumber - 1)}`)
                            .setLabel('◀️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(pageNumber === 0),
                        new ButtonBuilder()
                            .setCustomId(`pixiv_next_${artworkId}_${Math.min(totalPages - 1, pageNumber + 1)}`)
                            .setLabel('▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(pageNumber === totalPages - 1),
                        new ButtonBuilder()
                            .setCustomId(`pixiv_last_${artworkId}_${totalPages - 1}`)
                            .setLabel('⏩')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(pageNumber === totalPages - 1)
                    );
                components = [buttons];
            }

            // embed 已包含圖片，直接更新訊息
            await interaction.editReply({
                embeds: [pageResult.embed],
                components: components
            });

            console.log(`[Pixiv翻頁] 成功切換到第 ${pageNumber + 1}/${totalPages} 張`);

            // 🚀 定期清理過期的記憶體快取（每次成功翻頁時檢查）
            cleanExpiredMemoryCache();

        } catch (error) {
            console.error('[Pixiv翻頁] 處理翻頁互動失敗:', error);

            // 只有在特定錯誤時才嘗試回應
            if (error.code !== 10062) { // 10062 = Unknown interaction (已超時)
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ 翻頁時發生錯誤，請稍後再試。',
                            ephemeral: true
                        });
                    } else {
                        await interaction.followUp({
                            content: '❌ 翻頁時發生錯誤，請稍後再試。',
                            ephemeral: true
                        });
                    }
                } catch (replyError) {
                    console.error('[Pixiv翻頁] 無法回應錯誤訊息:', replyError.message);
                }
            }
        }
    }
};

/**
 * 清理過期的記憶體快取
 * 避免記憶體洩漏
 */
function cleanExpiredMemoryCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [artworkId, entry] of memoryCache.entries()) {
        if (now - entry.timestamp > MEMORY_CACHE_TTL) {
            memoryCache.delete(artworkId);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`[Pixiv翻頁] 已清理 ${cleanedCount} 個過期記憶體快取`);
    }
}

// 每 10 分鐘自動清理一次記憶體快取
setInterval(cleanExpiredMemoryCache, 10 * 60 * 1000);
