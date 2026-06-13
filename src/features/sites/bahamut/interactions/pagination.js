/**
 * 巴哈姆特多圖翻頁互動處理器（由 interaction-create.js 路由 baha_ 分派）
 * customId: baha_{action}_{hash}_{page}
 *
 * 注意：articleHash 為 bsn_snA（含底線），以「action=第2段、page=末段、
 *       hash=中間全部 join('_')」解析，避免被底線切斷。
 */
const { MessageFlags } = require('discord.js');
const BahamutExtractor = require('../bahamut-extractor.js');
const BahamutCacheManager = require('../bahamut-cache-manager.js');
const tlog = require('../../../../shared/logging/tfd-logger');

// 記憶體快取（避免每次翻頁都讀磁碟）
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5 * 60 * 1000;
const clickCooldown = new Map();

async function execute(interaction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('baha_')) return;

    try {
        const parts = interaction.customId.split('_');
        if (parts.length < 4) return;
        const action = parts[1];
        const pageNumber = parseInt(parts[parts.length - 1]);
        const articleHash = parts.slice(2, -1).join('_');
        if (Number.isNaN(pageNumber)) return;

        // 冷卻（防快速連點）
        const cooldownKey = `${interaction.user.id}_${articleHash}`;
        const now = Date.now();
        if (clickCooldown.has(cooldownKey) && now - clickCooldown.get(cooldownKey) < 1500) {
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
            return;
        }
        clickCooldown.set(cooldownKey, now);

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
        }

        tlog.sys('巴哈翻頁', `用戶 ${interaction.user.tag} 點擊: ${action} → 第 ${pageNumber + 1} 頁`);

        // 優先記憶體快取，否則讀磁碟
        let cachedData = null;
        const memEntry = memoryCache.get(articleHash);
        if (memEntry && (Date.now() - memEntry.timestamp < MEMORY_CACHE_TTL)) {
            cachedData = memEntry.data;
        } else {
            const cacheManager = new BahamutCacheManager();
            cachedData = await cacheManager.loadArticleCache(articleHash);
            if (cachedData) memoryCache.set(articleHash, { data: cachedData, timestamp: Date.now() });
        }

        if (!cachedData) {
            return interaction.followUp({
                content: '⏰ **頁面資料已過期**\n\n翻頁資料只保存 24 小時。\n請重新張貼巴哈姆特網址以載入最新資料。',
                flags: MessageFlags.Ephemeral
            });
        }

        const extractor = new BahamutExtractor();
        const pageResult = extractor.createArticleResponseFromCache(cachedData, cachedData.url, pageNumber);

        const embeds = pageResult.embeds || [pageResult.embed];
        const components = pageResult.components || [];

        await interaction.editReply({ embeds, components });
        tlog.sys('巴哈翻頁', `成功切換到第 ${pageNumber + 1} 頁`);

        cleanExpiredMemoryCache();

    } catch (error) {
        tlog.sysError('巴哈翻頁', `處理失敗: ${error.message}`);
        if (error.code !== 10062) { // 10062 = Unknown interaction（已超時）
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '翻頁時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral });
                } else if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: '翻頁時發生錯誤，請稍後再試。' });
                }
            } catch (e) {
                tlog.sysError('巴哈翻頁', `無法回應錯誤訊息: ${e.message}`);
            }
        }
    }
}

function cleanExpiredMemoryCache() {
    const now = Date.now();
    for (const [hash, entry] of memoryCache.entries()) {
        if (now - entry.timestamp > MEMORY_CACHE_TTL) memoryCache.delete(hash);
    }
}

setInterval(cleanExpiredMemoryCache, 10 * 60 * 1000);

module.exports = { execute };
