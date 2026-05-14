@echo off
:: =============================================================================
:: db-pull.bat — Windows 排程觸發器
:: =============================================================================
::
:: 【用途】
::   由 Windows 工作排程器呼叫，透過 Git Bash 執行 db-pull.sh。
::   每 12 小時自動觸發一次（00:00 / 12:00），不需手動執行。
::
:: 【手動執行】
::   直接雙擊此 .bat 檔案，或在 cmd 中執行：
::     db-pull.bat
::
:: 【執行記錄】
::   輸出會附加到 data\db_backups\pull.log，可用記事本查看。
::
:: 【排程設定】
::   此檔案由 setup-schedule.bat 自動建立排程，無需手動設定。
::   若要移除排程：
::     schtasks /Delete /TN "TFD_DB_Backup_0000" /F
::     schtasks /Delete /TN "TFD_DB_Backup_1200" /F
::
:: =============================================================================

set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%data\db_backups\pull.log
set BASH="C:\Program Files\Git\bin\bash.exe"

:: 確認 Git Bash 存在
if not exist %BASH% (
    echo [ERROR] Git Bash 不存在：%BASH% >> "%LOG_FILE%"
    exit /b 1
)

:: 執行 db-pull.sh，輸出記錄到 pull.log
%BASH% -c "bash '%SCRIPT_DIR:\=/%db-pull.sh'" >> "%LOG_FILE%" 2>&1
