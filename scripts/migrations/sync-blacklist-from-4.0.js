/**
 * 一次性腳本：從 4.0 的 JSON 黑名單匯入 TFD SQLite
 * 目標伺服器：756195780242440337
 *
 * 用法：
 *   node scripts/migrations/sync-blacklist-from-4.0.js
 *   node scripts/sync-blacklist-from-4.0.js (legacy wrapper)
 */

const fs = require('fs');
const path = require('path');
const db = require('../../db');

const GUILD_ID = '756195780242440337';
const ADDED_BY = 'sync_from_4.0';
const BASE_4 = path.resolve(__dirname, '..', '..', '..', '4.0', 'data', 'link');

const PLATFORMS = ['twitter', 'ptt', 'pixiv', 'youtube'];

function main() {
    db.init();

    db.guilds._ensure(GUILD_ID);

    let total = 0;
    let skipped = 0;

    for (const platform of PLATFORMS) {
        const filePath = path.join(BASE_4, platform, 'black_list.json');
        if (!fs.existsSync(filePath)) {
            console.log(`[${platform}] 檔案不存在，跳過`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const list = data.blacklist || [];

        if (list.length === 0) {
            console.log(`[${platform}] 無資料`);
            continue;
        }

        for (const entry of list) {
            const existing = db.blacklist.check(GUILD_ID, platform, entry.author, entry.uid || null);
            if (existing) {
                console.log(`[${platform}] 已存在，跳過: ${entry.author}`);
                skipped++;
                continue;
            }

            db.blacklist.add(GUILD_ID, platform, entry.author, {
                uid: entry.uid || null,
                level: entry.level,
                label: entry.label || null,
                addedBy: ADDED_BY,
                reason: '從 4.0 同步'
            });
            total++;
            console.log(`[${platform}] 匯入: ${entry.author} (等級 ${entry.level})`);
        }
    }

    console.log(`\n完成！匯入 ${total} 筆，跳過 ${skipped} 筆（已存在）`);

    db.close();
}

if (require.main === module) {
    main();
}

module.exports = {
    main
};
