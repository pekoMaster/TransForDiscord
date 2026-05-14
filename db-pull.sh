#!/bin/bash
# =============================================================================
# db-pull.sh — TFD 資料庫拉取腳本（VPS → 本機）
# =============================================================================
#
# 【用途】
#   將 VPS 上運作中的 TFD SQLite 資料庫安全地同步到本機，用於備份。
#   即使 bot 正在寫入資料庫，也能安全執行（透過 sqlite3 .backup 指令）。
#
# 【執行方式】
#   在 Git Bash 中執行：
#     bash db-pull.sh
#   或由 Windows 排程自動觸發（見 db-pull.bat）
#
# 【前置需求】
#   1. Git Bash 已安裝（https://gitforwindows.org）
#   2. SSH 金鑰已設定，可直接連線 VPS 不需輸入密碼
#      驗證方法：ssh root@<VPS_HOST> "echo ok"
#   3. .env 檔案存在且包含以下變數：
#      TFD_VPS_HOST        — VPS IP 位址
#      TFD_VPS_USER        — VPS SSH 登入帳號
#      TFD_VPS_DB_PATH     — VPS 上的資料庫檔案完整路徑
#      TFD_LOCAL_DB_PATH   — 本機資料庫存放路徑（Windows 路徑，會自動轉換）
#      TFD_LOCAL_BACKUP_DIR — 本機舊版備份存放目錄
#
# 【執行流程】
#   1. 讀取 .env 設定
#   2. 將本機現有 DB 備份到 db_backups/（保留舊快照）
#   3. 在 VPS 透過 sqlite3 .backup 產生安全副本（不影響 bot 運作）
#   4. scp 下載到本機，覆蓋本機 DB
#   5. 清理 VPS 暫存檔
#
# 【備份保留】
#   每次 pull 前會將本機舊 DB 另存為：
#     db_backups/tfd_YYYYMMDD_HHMMSS_before_pull.db
#   舊備份不會自動清除，請定期手動刪除過舊的檔案。
#
# =============================================================================

set -e  # 任何指令失敗立即停止

# --- 讀取 .env ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ 找不到 .env 檔案：$ENV_FILE"
    echo "   請確認 .env 存在並包含 TFD_VPS_HOST 等變數"
    exit 1
fi

# 只讀取 TFD_ 開頭的變數（避免污染環境）
eval "$(grep '^TFD_' "$ENV_FILE" | sed 's/\r//')"

# --- 路徑轉換（Windows 路徑 → Git Bash 路徑）---
# 例：D:/foo/bar → /d/foo/bar
to_bash_path() {
    echo "$1" | sed 's|^\([A-Za-z]\):|/\L\1|' | sed 's|\\|/|g'
}

VPS="${TFD_VPS_USER}@${TFD_VPS_HOST}"
VPS_DB="$TFD_VPS_DB_PATH"
LOCAL_DB="$(to_bash_path "$TFD_LOCAL_DB_PATH")"
BACKUP_DIR="$(to_bash_path "$TFD_LOCAL_BACKUP_DIR")"

# --- 驗證變數 ---
if [ -z "$TFD_VPS_HOST" ] || [ -z "$TFD_VPS_USER" ] || [ -z "$TFD_VPS_DB_PATH" ]; then
    echo "❌ .env 缺少必要變數（TFD_VPS_HOST / TFD_VPS_USER / TFD_VPS_DB_PATH）"
    exit 1
fi

# --- 建立備份目錄 ---
mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d_%H%M%S)
echo "[${TS}] 開始 TFD DB 拉取..."

# --- 備份本機現有 DB ---
if [ -f "$LOCAL_DB" ]; then
    BACKUP_FILE="$BACKUP_DIR/tfd_${TS}_before_pull.db"
    cp "$LOCAL_DB" "$BACKUP_FILE"
    echo "📁 本機舊版已備份：$BACKUP_FILE"
fi

# --- 在 VPS 建立安全副本 ---
# sqlite3 .backup 在 WAL 模式下也能安全使用，不需停止 bot
REMOTE_TMP="/tmp/tfd_pull_${TS}.db"
echo "📦 VPS 建立安全副本..."
ssh "$VPS" "sqlite3 '$VPS_DB' \".backup $REMOTE_TMP\""

# --- 下載 ---
echo "⬇️  下載中..."
scp -q "$VPS:$REMOTE_TMP" "$LOCAL_DB"

# --- 清理 VPS 暫存 ---
ssh "$VPS" "rm -f '$REMOTE_TMP'"

echo "✅ 完成：$(date '+%Y-%m-%d %H:%M:%S')"
echo "   本機 DB：$LOCAL_DB"
