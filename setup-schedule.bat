@echo off
:: =============================================================================
:: setup-schedule.bat — 建立 Windows 工作排程（每 12 小時自動備份 DB）
:: =============================================================================
::
:: 【用途】
::   在 Windows 工作排程器中建立兩個定期任務：
::     TFD_DB_Backup_0000 — 每天 00:00 執行 db-pull.bat
::     TFD_DB_Backup_1200 — 每天 12:00 執行 db-pull.bat
::   合計每 12 小時自動將 VPS 資料庫備份到本機一次。
::
:: 【執行方式】
::   用系統管理員身份執行（右鍵 → 以系統管理員身份執行）：
::     setup-schedule.bat
::
:: 【執行後確認】
::   工作排程器（taskschd.msc）中應出現兩筆「TFD_DB_Backup_*」任務。
::   或用指令確認：
::     schtasks /Query /TN "TFD_DB_Backup_0000"
::     schtasks /Query /TN "TFD_DB_Backup_1200"
::
:: 【移除排程】
::   schtasks /Delete /TN "TFD_DB_Backup_0000" /F
::   schtasks /Delete /TN "TFD_DB_Backup_1200" /F
::
:: 【備份記錄】
::   執行結果會附加到：data\db_backups\pull.log
::
:: =============================================================================

set SCRIPT_DIR=%~dp0
set BAT_FILE=%SCRIPT_DIR%db-pull.bat

echo 建立 TFD DB 自動備份排程...
echo 備份腳本：%BAT_FILE%
echo.

:: 建立 00:00 任務
schtasks /Create /TN "TFD_DB_Backup_0000" /TR "\"%BAT_FILE%\"" /SC DAILY /ST 00:00 /F
if %errorlevel% neq 0 (
    echo [ERROR] 建立 00:00 任務失敗，請確認以系統管理員身份執行
    pause
    exit /b 1
)
echo [OK] TFD_DB_Backup_0000 已建立 ^(每天 00:00^)

:: 建立 12:00 任務
schtasks /Create /TN "TFD_DB_Backup_1200" /TR "\"%BAT_FILE%\"" /SC DAILY /ST 12:00 /F
if %errorlevel% neq 0 (
    echo [ERROR] 建立 12:00 任務失敗
    pause
    exit /b 1
)
echo [OK] TFD_DB_Backup_1200 已建立 ^(每天 12:00^)

echo.
echo ✅ 完成！每 12 小時將自動備份一次 TFD 資料庫。
echo    備份路徑：%SCRIPT_DIR%data\db_backups\
echo    執行記錄：%SCRIPT_DIR%data\db_backups\pull.log
echo.
pause
