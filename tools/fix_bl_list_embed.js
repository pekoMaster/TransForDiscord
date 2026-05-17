/**
 * Fix /pe blacklist list: plain text -> Embed with pagination (10 per page).
 * Run on VPS: node /tmp/fix_bl_list_embed.js
 */
const fs = require('fs');
const filePath = '/root/TransForDiscord/commands/pe.js';

let content = fs.readFileSync(filePath, 'utf-8');

// Step 1: Add imports
const oldImport = `const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} = require('discord.js');`;

const newImport = `const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');`;

if (content.includes(oldImport)) {
    content = content.replace(oldImport, newImport);
    console.log('Step 1: Added imports');
} else {
    console.log('WARNING: Import block not found');
}

// Step 2: Replace the list handler by finding exact boundaries
const listStart = "    if (sub === 'list') {";
const afterListBlock = "}\n\nasync function handleBlacklistSwitch";

const startIdx = content.indexOf(listStart);
const endIdx = content.indexOf(afterListBlock);

if (startIdx === -1 || endIdx === -1) {
    console.log('WARNING: Could not find list handler boundaries');
    console.log('startIdx:', startIdx, 'endIdx:', endIdx);
    process.exit(1);
}

const before = content.substring(0, startIdx);
const after = content.substring(endIdx);

const newListHandler = [
    "    if (sub === 'list') {",
    "        const platform = interaction.options.getString('platform');",
    "        const list = gbm.list(guildId, platform || null);",
    "",
    "        if (list.length === 0) {",
    "            return interaction.reply({",
    "                content: '📋 本伺服器目前沒有黑名單記錄',",
    "                flags: MessageFlags.Ephemeral",
    "            });",
    "        }",
    "",
    "        const PER_PAGE = 10;",
    "        const totalPages = Math.ceil(list.length / PER_PAGE);",
    "        const levelEmoji = { 1: '💬', 2: '🕶️', 3: '🚫' };",
    "        const levelNames = { 1: '僅提示', 2: '防爆雷', 3: '封鎖' };",
    "",
    "        function buildPage(page) {",
    "            const start = page * PER_PAGE;",
    "            const slice = list.slice(start, start + PER_PAGE);",
    "            const lines = slice.map((r, i) => {",
    "                const num = start + i + 1;",
    "                const emoji = levelEmoji[r.level] || '❓';",
    "                const authorDisplay = r.platform === 'twitter' ? `@${r.author}` : r.author;",
    "                const labelText = r.label ? ` — ${r.label}` : '';",
    "                return `${emoji} **${num}.** \`${r.platform}\` ${authorDisplay} ⌜${levelNames[r.level] || r.level}⌝${labelText}`;",
    "            });",
    "",
    "            const filterText = platform ? ` (${platform})` : '';",
    "            const embed = new EmbedBuilder()",
    "                .setTitle(`📋 黑名單${filterText}`)",
    "                .setDescription(lines.join('\n'))",
    "                .setFooter({ text: `第 ${page + 1}/${totalPages} 頁 • 共 ${list.length} 條` })",
    "                .setColor(0x2b2d31);",
    "",
    "            const components = [];",
    "            if (totalPages > 1) {",
    "                const row = new ActionRowBuilder().addComponents(",
    "                    new ButtonBuilder()",
    "                        .setCustomId(`bl_prev_${page}`)",
    "                        .setLabel('◀ 上一頁')",
    "                        .setStyle(ButtonStyle.Secondary)",
    "                        .setDisabled(page === 0),",
    "                    new ButtonBuilder()",
    "                        .setCustomId(`bl_next_${page}`)",
    "                        .setLabel('下一頁 ▶')",
    "                        .setStyle(ButtonStyle.Secondary)",
    "                        .setDisabled(page === totalPages - 1)",
    "                );",
    "                components.push(row);",
    "            }",
    "",
    "            return { embeds: [embed], components, flags: MessageFlags.Ephemeral };",
    "        }",
    "",
    "        const reply = await interaction.reply({ ...buildPage(0), fetchReply: true });",
    "",
    "        if (totalPages <= 1) return;",
    "",
    "        const collector = reply.createMessageComponentCollector({ time: 120_000 });",
    "        collector.on('collect', async (btn) => {",
    "            if (btn.user.id !== interaction.user.id) {",
    "                return btn.reply({ content: '❌ 只有指令使用者可以翻頁', flags: MessageFlags.Ephemeral });",
    "            }",
    "            const [, dir, pageStr] = btn.customId.split('_');",
    "            let page = parseInt(pageStr, 10);",
    "            page = dir === 'next' ? page + 1 : page - 1;",
    "            page = Math.max(0, Math.min(page, totalPages - 1));",
    "            await btn.update(buildPage(page));",
    "        });",
    "        collector.on('end', async () => {",
    "            try { await interaction.editReply({ components: [] }); } catch (_) {}",
    "        });",
    "        return;",
    "    }",
    "",
].join('\n');

content = before + newListHandler + after;

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Step 2: Replaced list handler with paginated embed');
console.log('Done!');
