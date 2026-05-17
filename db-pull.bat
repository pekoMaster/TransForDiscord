@echo off
set SCRIPT_DIR=%~dp0
call "%SCRIPT_DIR%scripts\ops\db-pull.bat" %*
