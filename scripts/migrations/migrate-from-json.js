/**
 * scripts/migrations/migrate-from-json.js
 *
 * 從舊版 JSON 檔案遷移到新版 SQLite + 加密 API Key
 *
 * 來源：
 *   - tfd-system/config/tfd-config.json   → guild_settings, guild_blocked_channels, guild_excluded_users
 *   - data/user-api-keys.json             → user_api_keys（加密）
 *
 * 注意：
 *   1. 舊版 excludedUsers/blockedChannels 是全域，遷移時無法判斷屬於哪個伺服器
 *      → 改放在 guild_id = '__legacy_global__' 標記為「舊版全域」，使用者需手動清理
 *   2. 舊版 LOG_CHANNEL_ID 是 hardcode，不會自動匯入
 *   3. 執行前會自動備份原 JSON 到 data/.migration-backup-{timestamp}/
 *
 * 用法：
 *   node scripts/migrations/migrate-from-json.js [--dry-run]
 *   node scripts/migrate-from-json.js [--dry-run] (legacy wrapper)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const db = require('../../db');
const { encrypt } = require('../../src/shared/crypto/crypto-helper.js');

const ROOT = path.join(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT, 'tfd-system', 'config', 'tfd-config.json');
const API_KEYS_PATH = path.join(ROOT, 'data', 'user-api-keys.json');
const LEGACY_GLOBAL_GUILD = '__legacy_global__';

const dryRun = process.argv.includes('--dry-run');

function log(msg) {
    const prefix = dryRun ? '[DRY-RUN] ' : '';
    console.log(`${prefix}${msg}`);
}

function readJsonSafe(p) {
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.error(`讀取 ${p} 失敗:`, e.message);
        return null;
    }
}

function backupJsons() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(ROOT, 'data', `.migration-backup-${ts}`);
    if (dryRun) {
        log(`會備份原始 JSON 到: ${backupDir}`);
        return;
    }
    fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(CONFIG_PATH)) {
        fs.copyFileSync(CONFIG_PATH, path.join(backupDir, 'tfd-config.json'));
    }
    if (fs.existsSync(API_KEYS_PATH)) {
        fs.copyFileSync(API_KEYS_PATH, path.join(backupDir, 'user-api-keys.json'));
    }
    log(`原始 JSON 已備份到 ${backupDir}`);
}

// ──────────────────────────────────────────────────
// 1. 遷移 tfd-config.json
// ──────────────────────────────────────────────────
function migrateConfig() {
    const cfg = readJsonSafe(CONFIG_PATH);
    if (!cfg) {
        log('沒有 tfd-config.json，跳過');
        return;
    }

    log(`讀取 tfd-config.json ✓`);

    // (a) per-guild settings（log channel 等）
    const guildSettings = cfg.guildSettings || {};
    let guildCount = 0;
    for (const [guildId, settings] of Object.entries(guildSettings)) {
        if (!dryRun) {
            db.guilds.upsert({
                guildId,
                logChannelId: settings.logChannelId || null
            });
        }
        guildCount++;
        log(`  guild ${guildId} → log_channel_id=${settings.logChannelId || '(none)'}`);
    }
    log(`遷移 ${guildCount} 個 guild_settings`);

    // (b) 全域排除使用者 / 排除頻道 → 標記為 legacy global
    const legacyUsers = cfg.settings?.excludedUsers || [];
    const legacyChannels = cfg.settings?.blockedChannels || [];

    if (legacyUsers.length > 0 || legacyChannels.length > 0) {
        if (!dryRun) {
            db.guilds.upsert({ guildId: LEGACY_GLOBAL_GUILD, guildName: '[Legacy Global - 請手動清理]' });
        }
        log(`偵測到舊版全域排除清單（無法歸屬 guild）：`);
        log(`  → 暫存於 guild_id = "${LEGACY_GLOBAL_GUILD}"，使用者上線後請手動清理`);
    }

    for (const userId of legacyUsers) {
        if (!dryRun) {
            db.excludedUsers.add(LEGACY_GLOBAL_GUILD, userId, null, 'migrated from legacy global');
        }
        log(`  excluded user: ${userId}`);
    }
    for (const channelId of legacyChannels) {
        if (!dryRun) {
            db.blockedChannels.add(LEGACY_GLOBAL_GUILD, channelId, null, 'migrated from legacy global');
        }
        log(`  blocked channel: ${channelId}`);
    }
    log(`遷移 ${legacyUsers.length} 個 excluded users + ${legacyChannels.length} 個 blocked channels (legacy)`);
}

// ──────────────────────────────────────────────────
// 2. 遷移 user-api-keys.json（加密）
// ──────────────────────────────────────────────────
function migrateApiKeys() {
    const data = readJsonSafe(API_KEYS_PATH);
    if (!data) {
        log('沒有 user-api-keys.json，跳過');
        return;
    }

    let total = 0;
    for (const [userId, providers] of Object.entries(data)) {
        for (const [provider, plainKey] of Object.entries(providers)) {
            if (typeof plainKey !== 'string' || !plainKey) continue;

            if (!dryRun) {
                const encrypted = encrypt(plainKey);
                db.apiKeys.upsert(userId, provider, encrypted, 1);
            }
            total++;
            log(`  user ${userId.slice(0, 6)}... × ${provider} → 加密 ✓`);
        }
    }
    log(`遷移 ${total} 個 user_api_keys（已 AES-256-GCM 加密）`);
}

// ──────────────────────────────────────────────────
// 主程序
// ──────────────────────────────────────────────────
async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TFD Migration: JSON → SQLite');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (dryRun) {
        console.log('** DRY-RUN 模式：不實際寫入資料庫 **');
    }

    backupJsons();

    if (!dryRun) {
        db.init();
    }

    migrateConfig();
    migrateApiKeys();

    if (!dryRun) {
        db.close();
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('遷移完成');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('後續手動步驟：');
    console.log('  1. 確認 data/tfd.db 已產生');
    console.log('  2. 確認 data/.encryption-key 已產生（或設定 TFD_ENCRYPTION_KEY 環境變數）');
    console.log('  3. 在每個伺服器執行 /pe 指令重新設定 log channel 與排除清單');
    console.log(`  4. 確認舊資料無誤後，可刪除 ${CONFIG_PATH}`);
    console.log(`  5. 確認舊資料無誤後，可刪除 ${API_KEYS_PATH}`);
}

if (require.main === module) {
    main().catch(err => {
        console.error('遷移失敗:', err);
        process.exit(1);
    });
}

module.exports = {
    main,
    migrateConfig,
    migrateApiKeys,
    backupJsons
};
