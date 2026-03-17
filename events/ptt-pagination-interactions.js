/**
 * PTT 翻頁互動處理器
 * 處理 PTT 多圖片翻頁按鈕的點擊事件
 * 完全參考 Pixiv 翻頁處理器的架構
 */

const { Events } = require('discord.js');
const PTTExtractor = require('../ermiana-system/extractors/ptt.js');
const PTTCacheManager = require('../utils/ptt-cache-manager.js');

// 防止快速點擊的冷卻機制
const clickCooldown = new Map();

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // 只處理按鈕互動
        if (!interaction.isButton()) return;

        // 檢查是否為 PTT 翻頁按鈕
        if (!interaction.customId.startsWith('ptt_')) return;

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
                    console.log(`[PTT翻頁] 用戶 ${interaction.user.tag} 點擊過於頻繁，跳過處理`);
                    return;
                }
            }

            // 設定冷卻
            clickCooldown.set(cooldownKey, now);

            // 檢查互動是否還有效並延遲回應
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            console.log(`[PTT翻頁] 用戶 ${interaction.user.tag} 點擊: ${action} → 第 ${pageNumber + 1} 頁`);

            // 🚀 從快取獲取資料
            const cacheManager = new PTTCacheManager();

            // 從快取中尋找對應的文章（需要從快取目錄中查找）
            const cachedData = await cacheManager.loadArticleCache(articleHash);

            if (!cachedData) {
                // 快取已過期，要求用戶重新張貼網址
                return interaction.reply({
                    content: '⏰ **頁面資料已過期**\n\n為了最佳效能，翻頁資料只保存24小時。\n請重新張貼 PTT 網址以載入最新資料。',
                    ephemeral: true
                });
            }

            // 使用快取資料生成頁面回應
            const pttExtractor = new PTTExtractor();
            const originalURL = cachedData.url;

            const pageResult = pttExtractor.createArticleResponseFromCache(cachedData, originalURL, pageNumber);

            // 準備 Embeds 和按鈕
            const embeds = pageResult.embeds || [pageResult.embed];
            const components = pageResult.components || [];

            // 更新訊息：多個嵌入式訊息 + 翻頁按鈕
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: embeds,
                    components: components
                });
            } else {
                await interaction.update({
                    embeds: embeds,
                    components: components
                });
            }

            console.log(`[PTT翻頁] 成功切換到第 ${pageNumber + 1} 頁`);

        } catch (error) {
            console.error('[PTT翻頁] 處理翻頁互動失敗:', error);

            // 只有在特定錯誤時才嘗試回應
            if (error.code !== 10062) { // 10062 = Unknown interaction (已超時)
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '翻頁時發生錯誤，請稍後再試。',
                            ephemeral: true
                        });
                    } else if (interaction.deferred && !interaction.replied) {
                        await interaction.editReply({
                            content: '翻頁時發生錯誤，請稍後再試。'
                        });
                    }
                } catch (replyError) {
                    console.error('[PTT翻頁] 無法回應錯誤訊息:', replyError.message);
                }
            } else {
                console.log('[PTT翻頁] 互動已超時，跳過錯誤回應');
            }
        }
    }
};
