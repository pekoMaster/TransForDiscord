/**
 * Twitter 重新載入互動處理器
 *
 * 處理 V1 類型推文（文字、圖片、文章等）的 twitter_reload_{tweetId} 按鈕。
 * 使用 TFDTwitterExtractor 重新提取推文，確保重新整理後保持 V1 格式
 * （含翻譯、引用、回覆、全文展開等按鈕），而非降級成簡化的分頁嵌入式格式。
 *
 * 注意：V2 影片推文使用 Components V2 格式，有各自的按鈕處理器，不會走這裡。
 */

const { EmbedBuilder, MessageFlags } = require('discord.js');
const TFDTwitterExtractor = require('../tfd-system/extractors/twitter-v2.js');
const { appendReportButton } = require('../utils/spoiler-button-helper.js');
const tlog = require('../utils/tfd-logger');

module.exports = {
  async handleTwitterReloadInteraction(interaction) {
    try {
      if (!interaction.isButton()) return;

      // 解析 tweetId：支援 customId 格式 `twitter_reload_{tweetId}`
      let tweetId = null;
      const prefix = 'twitter_reload_';
      if (interaction.customId && interaction.customId.startsWith(prefix)) {
        tweetId = interaction.customId.slice(prefix.length);
      }

      if (!tweetId) {
        return interaction.reply({ content: '無法解析推文 ID。', flags: MessageFlags.Ephemeral });
      }

      // 使用 deferUpdate 避免 3 秒限制，稍後用 editReply 更新訊息
      await interaction.deferUpdate();

      // 使用 TFDTwitterExtractor 重新提取推文，保留 V1 完整格式
      const extractor = new TFDTwitterExtractor();
      const originalURL = `https://x.com/i/status/${tweetId}`;
      const result = await extractor.handleEnhancedTwitterExtraction(tweetId, originalURL, null);

      if (!result || !result.success) {
        return interaction.followUp({ content: '無法載入推文資料。', flags: MessageFlags.Ephemeral });
      }

      try { require('../db').tfdStats.record('reload', interaction.guildId, interaction.user.id); } catch (_) {}
      const components = appendReportButton(result.components || []);

      // 多圖片推文：重建多嵌入式訊息
      if (result.embed && result.multipleImages && result.multipleImages.length > 0) {
        const embeds = [];
        const tweetURL = result.originalURL || originalURL;

        const mainEmbed = result.embed;
        mainEmbed.setURL(tweetURL);
        mainEmbed.setImage(null);
        embeds.push(mainEmbed);

        for (const imageUrl of result.multipleImages) {
          embeds.push(new EmbedBuilder().setURL(tweetURL).setImage(imageUrl));
        }

        return await interaction.editReply({ embeds, components });
      }

      // V1 一般推文（文字、單圖、文章等）：使用 embed + components 更新
      if (result.embed) {
        return await interaction.editReply({
          embeds: [result.embed],
          components
        });
      }

      // V2 影片推文（理論上不應出現 twitter_reload_ 按鈕，防禦性處理）
      if (result.isV2 && result.v2Container) {
        return await interaction.editReply({
          components: [result.v2Container],
          flags: MessageFlags.IsComponentsV2
        });
      }

      return interaction.followUp({ content: '無法重建推文格式。', flags: MessageFlags.Ephemeral });

    } catch (error) {
      tlog.sysError('twitter-reload', `處理互動時發生錯誤: ${error}`);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '處理推文重新載入時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral });
        } else {
          await interaction.followUp({ content: '處理推文重新載入時發生錯誤，請稍後再試。', flags: MessageFlags.Ephemeral });
        }
      } catch (e) {
        // 忽略回覆錯誤
      }
    }
  }
};
