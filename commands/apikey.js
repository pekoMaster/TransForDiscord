/**
 * /apikey — 管理個人 Gemini API Key
 * 所有回應皆為 ephemeral（只有自己看得見）
 * Key 透過 Modal 輸入，不會出現在任何聊天紀錄中
 */

const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const { removeKey, hasKey } = require('../utils/user-api-key-storage.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('apikey')
        .setDescription('管理你的個人 Gemini API Key（翻譯功能使用，僅自己可見）')
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('設定你的個人 Gemini API Key')
        )
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('移除你已儲存的 Gemini API Key')
        )
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('查看是否已設定個人 API Key')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (sub === 'set') {
            // Modal 輸入：內容不會出現在聊天紀錄
            const modal = new ModalBuilder()
                .setCustomId('apikey_set_modal')
                .setTitle('設定個人 Gemini API Key');

            const keyInput = new TextInputBuilder()
                .setCustomId('gemini_api_key')
                .setLabel('Gemini API Key（貼上後送出，不會被任何人看到）')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('AIzaSy...')
                .setRequired(true)
                .setMinLength(30)
                .setMaxLength(120);

            modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
            await interaction.showModal(modal);
            return;
        }

        if (sub === 'remove') {
            const removed = removeKey(userId);
            await interaction.reply({
                content: removed
                    ? '✅ 已移除你的個人 Gemini API Key。翻譯功能將改用系統預設 Key（若有設定）。'
                    : '❌ 你尚未設定個人 API Key，無需移除。',
                ephemeral: true
            });
            return;
        }

        if (sub === 'status') {
            const set = hasKey(userId);
            await interaction.reply({
                content: set
                    ? '✅ 已設定個人 Gemini API Key。翻譯功能將使用你的 Key。\n使用 `/apikey remove` 可移除。'
                    : '❌ 尚未設定個人 API Key。\n使用 `/apikey set` 設定後，翻譯功能將使用你的 Key。',
                ephemeral: true
            });
        }
    }
};
