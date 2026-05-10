/**
 * 翻譯按鈕建立器
 * 提供統一的翻譯按鈕建立功能給所有提取器使用
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class TranslationButtonBuilder {
    /**
     * 建立翻譯按鈕
     * @param {string} text - 要翻譯的原始文字
     * @param {string} sourceId - 來源識別碼 (用於快取管理)
     * @returns {ActionRowBuilder|null} 翻譯按鈕組件
     */
    static buildTranslationButton(text, sourceId) {
        // 檢查文字是否有效
        if (!text || typeof text !== 'string' || text.trim() === '') {
            return null;
        }

        // 檢查文字長度（避免過短的內容）
        if (text.trim().length < 10) {
            return null;
        }

        try {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`translate_google_${sourceId}`)
                        .setLabel('Google 翻譯')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`translate_deepl_${sourceId}`)
                        .setLabel('DeepL 翻譯')
                        .setStyle(ButtonStyle.Secondary)
                );

            return row;
        } catch (error) {
            console.error('[TranslationButtonBuilder] 建立翻譯按鈕失敗:', error.message);
            return null;
        }
    }

    /**
     * 將翻譯按鈕添加到現有的 components 陣列
     * @param {Array} components - 現有的 components 陣列
     * @param {string} text - 要翻譯的原始文字
     * @param {string} sourceId - 來源識別碼
     * @returns {Array} 更新後的 components 陣列
     */
    static addTranslationButton(components, text, sourceId) {
        const translationButton = this.buildTranslationButton(text, sourceId);

        if (!translationButton) {
            return components;
        }

        if (!components || components.length === 0) {
            return [translationButton];
        }

        // Discord 限制每個訊息最多 5 個 ActionRow
        if (components.length >= 5) {
            console.warn('[TranslationButtonBuilder] components 已達上限，無法添加翻譯按鈕');
            return components;
        }

        // 將翻譯按鈕添加到陣列末尾
        return [...components, translationButton];
    }
}

module.exports = TranslationButtonBuilder;
