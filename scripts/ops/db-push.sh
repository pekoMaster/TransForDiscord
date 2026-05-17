#!/bin/bash
# =============================================================================
# db-push.sh — TFD 資料庫緊急恢復腳本（本機 → VPS）
# =============================================================================
#
# 【用途】
#   當 VPS 資料毀損或需要還原備份時，將本機的 DB 上傳覆蓋 VPS。
#   執行前會自動停止 bot，上傳完成後自動重啟。
#
# 【執行方式】
#   在 Git Bash 中執行：
#     bash db-push.sh
#   執行後會要求輸入 "yes" 確認，避免誤觸。
#
# 【若要上傳特定備份快照而非最新 DB】
#   先將目標快照複製為本機 DB，再執行此腳本：
#     cp data/db_backups/tfd_20260514_120000_before_pull.db data/tfd.db
#     bash db-push.sh
#
# 【前置需求】
#   同 db-pull.sh（.env 設定、SSH 金鑰）
#   額外需求：VPS 上 pm2 已安裝且 bot 程序名稱為 transfordiscord
#
# 【執行流程】
#   1. 讀取 .env 設定，確認本機 DB 存在
#   2. 要求使用者輸入 "yes" 確認（防呆）
#   3. 備份 VPS 當前 DB 到 VPS 的 db_backups/ 目錄
#   4. 停止 VPS 上的 bot（pm2 stop）
#   5. 上傳本機 DB 到 VPS
#   6. 重啟 bot（pm2 start）
#   7. 印出 VPS DB 筆數確認資料正確
#
# 【注意事項】
#   - VPS bot 停機期間用戶無法使用 TFD 功能，請在離峰時執行
#   - 若上傳失敗，bot 仍會嘗試重啟（但可能使用損毀的 DB）
#   - 若需要恢復 VPS 上的備份（而非本機），請直接在 VPS 執行：
#       sqlite3 /root/TransForDiscord/data/tfd.db ".restore /path/to/backup.db"
#
# =============================================================================

set -e

# --- 讀取 .env ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ 找不到 .env 檔案：$ENV_FILE"
    exit 1
fi

eval "$(grep '^TFD_' "$ENV_FILE" | sed 's/\r//')"

# --- 路徑轉換 ---
to_bash_path() {
    echo "$1" | sed 's|^\([A-Za-z]\):|/\L\1|' | sed 's|\\|/|g'
}

VPS="${TFD_VPS_USER}@${TFD_VPS_HOST}"
VPS_DB="$TFD_VPS_DB_PATH"
VPS_BACKUP_DIR="$(dirname "$TFD_VPS_DB_PATH")/db_backups"
LOCAL_DB="$(to_bash_path "$TFD_LOCAL_DB_PATH")"

# --- 驗證 ---
if [ -z "$TFD_VPS_HOST" ] || [ -z "$TFD_VPS_USER" ]; then
    echo "❌ .env 缺少必要變數"
    exit 1
fi

if [ ! -f "$LOCAL_DB" ]; then
    echo "❌ 本機資料庫不存在：$LOCAL_DB"
    echo "   請先執行 db-pull.sh，或從 db_backups/ 複製一個快照到此路徑"
    exit 1
fi

# --- 顯示資訊 ---
echo "⚠️  緊急恢復模式"
echo "────────────────────────────────────"
echo "來源（本機）：$LOCAL_DB"
echo "目標（VPS） ：${TFD_VPS_HOST}:${VPS_DB}"
echo "本機檔案大小：$(du -h "$LOCAL_DB" | cut -f1)"
echo ""
echo "此操作將："
echo "  1. 停止 VPS 上的 bot（有短暫服務中斷）"
echo "  2. 以本機 DB 覆蓋 VPS DB"
echo "  3. 重啟 bot"
echo ""

read -p "確定繼續嗎？請輸入 yes：" CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "已取消"
    exit 0
fi

TS=$(date +%Y%m%d_%H%M%S)

# --- 備份 VPS 現有 DB ---
echo ""
echo "📦 備份 VPS 當前資料庫..."
ssh "$VPS" "mkdir -p '$VPS_BACKUP_DIR' && sqlite3 '$VPS_DB' \".backup ${VPS_BACKUP_DIR}/tfd_before_restore_${TS}.db\""
echo "   VPS 備份：${VPS_BACKUP_DIR}/tfd_before_restore_${TS}.db"

# --- 停止 bot ---
echo ""
echo "⏹️  停止 bot..."
ssh "$VPS" "pm2 stop transfordiscord" || true
sleep 2

# --- 上傳 ---
echo "⬆️  上傳中..."
REMOTE_TMP="/tmp/tfd_restore_${TS}.db"
scp -q "$LOCAL_DB" "$VPS:$REMOTE_TMP"

# --- 替換 ---
echo "🔄 替換資料庫..."
ssh "$VPS" "cp '$REMOTE_TMP' '$VPS_DB' && rm -f '$REMOTE_TMP'"

# --- 重啟 ---
echo "▶️  重啟 bot..."
ssh "$VPS" "pm2 start transfordiscord"
sleep 3

# --- 確認 ---
echo ""
echo "📊 VPS 資料庫確認："
ssh "$VPS" "sqlite3 '$VPS_DB' \"
    SELECT '  伺服器數：' || COUNT(*) FROM guild_settings;
    SELECT '  黑名單數：' || COUNT(*) FROM guild_blacklist;
    SELECT '  API Key 數：' || COUNT(*) FROM user_api_keys;
\""

echo ""
echo "✅ 恢復完成：$(date '+%Y-%m-%d %H:%M:%S')"
