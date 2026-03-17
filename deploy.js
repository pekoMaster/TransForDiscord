/**
 * deploy.js — 部署斜線指令到 Discord
 * 執行：node deploy.js
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    try {
        const cmd = require(path.join(commandsPath, file));
        if (cmd.data) {
            commands.push(cmd.data.toJSON());
            console.log(`✅ 載入指令：${cmd.data.name}`);
        }
    } catch (e) {
        console.error(`❌ 載入 ${file} 失敗:`, e.message);
    }
}

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log(`\n開始部署 ${commands.length} 個斜線指令（Global）...`);
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log(`✅ 成功部署 ${data.length} 個斜線指令。`);
    } catch (error) {
        console.error('❌ 部署失敗:', error);
    }
})();
