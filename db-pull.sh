#!/bin/bash
# TFD DB 拉取腳本 — VPS → 本機
# 使用 sqlite3 .backup 確保 WAL 安全，不受 bot 運作影響

VPS="root@64.118.134.188"
VPS_DB="/root/TransForDiscord/data/tfd.db"
LOCAL_DB="/d/OneDrive/RB/DISCORDBOT/TransForDiscord/data/tfd.db"
BACKUP_DIR="/d/OneDrive/RB/DISCORDBOT/TransForDiscord/data/db_backups"

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)

# 備份本機現有 DB（保留舊快照）
if [ -f "$LOCAL_DB" ]; then
    cp "$LOCAL_DB" "$BACKUP_DIR/tfd_${TS}_before_pull.db"
    echo "📁 本機舊版備份：$BACKUP_DIR/tfd_${TS}_before_pull.db"
fi

# 在 VPS 用 sqlite3 .backup 建立安全副本（不受 WAL lock 影響）
echo "📦 VPS 建立安全副本..."
ssh "$VPS" "sqlite3 $VPS_DB \".backup /tmp/tfd_pull_${TS}.db\""

# 拉下來
echo "⬇️  下載中..."
scp "$VPS:/tmp/tfd_pull_${TS}.db" "$LOCAL_DB"

# 清理 VPS 暫存
ssh "$VPS" "rm -f /tmp/tfd_pull_${TS}.db"

echo ""
echo "✅ 完成！本機資料庫已更新：$LOCAL_DB"

# 顯示資料筆數確認
if command -v sqlite3 &>/dev/null; then
    echo ""
    echo "📊 快速確認："
    sqlite3 "$LOCAL_DB" "
        SELECT '  伺服器數：' || COUNT(*) FROM guild_settings;
        SELECT '  黑名單數：' || COUNT(*) FROM guild_blacklist;
        SELECT '  API Key 數：' || COUNT(*) FROM user_api_keys;
        SELECT '  統計筆數：' || COUNT(*) FROM tfd_stats;
    "
fi
