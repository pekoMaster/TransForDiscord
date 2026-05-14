#!/bin/bash
# TFD DB 緊急恢復腳本 — 本機 → VPS
# 會先停止 bot，上傳後自動重啟

VPS="root@64.118.134.188"
VPS_DB="/root/TransForDiscord/data/tfd.db"
LOCAL_DB="/d/OneDrive/RB/DISCORDBOT/TransForDiscord/data/tfd.db"

echo "⚠️  緊急恢復模式"
echo "─────────────────────────────────"
echo "來源（本機）：$LOCAL_DB"
echo "目標（VPS）：$VPS:$VPS_DB"
echo ""

# 確認本機 DB 存在
if [ ! -f "$LOCAL_DB" ]; then
    echo "❌ 本機資料庫不存在：$LOCAL_DB"
    echo "   請先執行 db-pull.sh 取得快照，或指定正確路徑"
    exit 1
fi

echo "本機 DB 資訊："
ls -lh "$LOCAL_DB"
echo ""

read -p "確定要上傳並覆蓋 VPS 資料庫嗎？輸入 yes 確認：" CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "已取消"
    exit 0
fi

TS=$(date +%Y%m%d_%H%M%S)

# 備份 VPS 現有 DB
echo ""
echo "📦 備份 VPS 當前資料庫..."
ssh "$VPS" "sqlite3 $VPS_DB \".backup /root/TransForDiscord/data/db_backups/tfd_before_restore_${TS}.db\" 2>/dev/null || cp $VPS_DB /root/TransForDiscord/data/db_backups/tfd_before_restore_${TS}.db 2>/dev/null || true"
ssh "$VPS" "mkdir -p /root/TransForDiscord/data/db_backups && cp $VPS_DB /root/TransForDiscord/data/db_backups/tfd_before_restore_${TS}.db"
echo "   VPS 備份：/root/TransForDiscord/data/db_backups/tfd_before_restore_${TS}.db"

# 停止 bot
echo ""
echo "⏹️  停止 bot..."
ssh "$VPS" "pm2 stop transfordiscord"
sleep 2

# 上傳
echo "⬆️  上傳資料庫..."
scp "$LOCAL_DB" "$VPS:/tmp/tfd_restore_${TS}.db"

# 替換
echo "🔄 替換資料庫..."
ssh "$VPS" "cp /tmp/tfd_restore_${TS}.db $VPS_DB && rm -f /tmp/tfd_restore_${TS}.db"

# 重啟
echo "▶️  重啟 bot..."
ssh "$VPS" "pm2 start transfordiscord"
sleep 3

# 確認狀態
echo ""
echo "📊 VPS 資料庫確認："
ssh "$VPS" "sqlite3 $VPS_DB \"
    SELECT '  伺服器數：' || COUNT(*) FROM guild_settings;
    SELECT '  黑名單數：' || COUNT(*) FROM guild_blacklist;
    SELECT '  API Key 數：' || COUNT(*) FROM user_api_keys;
\""

echo ""
echo "✅ 恢復完成！"
