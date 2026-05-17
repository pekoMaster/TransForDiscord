"""
Fix /pe blacklist list: plain text -> Embed with pagination (10 per page).
Adds EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle imports.
Replaces the list handler with paginated embed version.
"""

path = "/root/TransForDiscord/commands/pe.js"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Step 1: Add EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle to imports
old_import = """const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} = require('discord.js');"""

new_import = """const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');"""

if old_import in content:
    content = content.replace(old_import, new_import)
    print("Step 1: Added EmbedBuilder/ActionRowBuilder/ButtonBuilder/ButtonStyle imports")
else:
    print("WARNING: Import block not found, check manually")

# Step 2: Replace the list handler
old_list = """    if (sub === 'list') {
        const platform = interaction.options.getString('platform');
        const list = gbm.list(guildId, platform || null);

        if (list.length === 0) {
            return interaction.reply({
                content: '📋 本伺服器目前沒有黑名單記錄',
                flags: MessageFlags.Ephemeral
            });
        }

        const levelNames = { 1: '僅提示', 2: '防爆雷', 3: '封鎖' };
        const lines = list.slice(0, 10).map((r, i) => {
            const authorDisplay = r.platform === 'twitter' ? `@${r.author}` : r.author;
            return `${i + 1}. [${r.platform}] ${authorDisplay} — 等級 ${r.level} (${levelNames[r.level] || r.level})${r.label ? ` 【${r.label}】` : ''}`;
        });

        let content = `📋 本伺服器黑名單（共 ${list.length} 條）:\\n${lines.join('\\n')}`;

        if (list.length > 10) {
            content += `\\n...另有 ${list.length - 10} 條（每頁最多顯示 10 條）`;
        }

        return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }"""

new_list = """    if (sub === 'list') {
        const platform = interaction.options.getString('platform');
        const list = gbm.list(guildId, platform || null);

        if (list.length === 0) {
            return interaction.reply({
                content: '📋 本伺服器目前沒有黑名單記錄',
                flags: MessageFlags.Ephemeral
            });
        }

        const PER_PAGE = 10;
        const totalPages = Math.ceil(list.length / PER_PAGE);
        const levelEmoji = { 1: '💬', 2: '🕶️', 3: '🚫' };
        const levelNames = { 1: '僅提示', 2: '防爆雷', 3: '封鎖' };

        function buildPage(page) {
            const start = page * PER_PAGE;
            const slice = list.slice(start, start + PER_PAGE);
            const lines = slice.map((r, i) => {
                const num = start + i + 1;
                const emoji = levelEmoji[r.level] || '❓';
                const authorDisplay = r.platform === 'twitter' ? `@${r.author}` : r.author;
                const labelText = r.label ? ` — ${r.label}` : '';
                return `${emoji} **${num}.** \`${r.platform}\` ${authorDisplay} ⌜${levelNames[r.level] || r.level}⌝${labelText}`;
            });

            const filterText = platform ? ` (${platform})` : '';
            const embed = new EmbedBuilder()
                .setTitle(`📋 黑名單${filterText}`)
                .setDescription(lines.join('\\n'))
                .setFooter({ text: `第 ${page + 1}/${totalPages} 頁 • 共 ${list.length} 條` })
                .setColor(0x2b2d31);

            const components = [];
            if (totalPages > 1) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`bl_prev_${page}`)
                        .setLabel('◀ 上一頁')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId(`bl_next_${page}`)
                        .setLabel('下一頁 ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );
                components.push(row);
            }

            return { embeds: [embed], components, flags: MessageFlags.Ephemeral };
        }

        const reply = await interaction.reply({ ...buildPage(0), fetchReply: true });

        if (totalPages <= 1) return;

        const collector = reply.createMessageComponentCollector({ time: 120_000 });
        collector.on('collect', async (btn) => {
            if (btn.user.id !== interaction.user.id) {
                return btn.reply({ content: '❌ 只有指令使用者可以翻頁', flags: MessageFlags.Ephemeral });
            }
            const [, dir, pageStr] = btn.customId.split('_');
            let page = parseInt(pageStr, 10);
            page = dir === 'next' ? page + 1 : page - 1;
            page = Math.max(0, Math.min(page, totalPages - 1));
            await btn.update(buildPage(page));
        });
        collector.on('end', async () => {
            try { await interaction.editReply({ components: [] }); } catch (_) {}
        });
        return;
    }"""

if old_list in content:
    content = content.replace(old_list, new_list)
    print("Step 2: Replaced list handler with paginated embed version")
else:
    print("WARNING: List handler block not found! Trying without escaped newlines...")
    # The file might have actual newlines, not escaped
    # Let's try a different approach - find and replace by unique markers
    print("Attempting line-by-line replacement...")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done!")
