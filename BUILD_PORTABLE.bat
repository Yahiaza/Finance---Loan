@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo [1/2] Installing dependencies for the first time only...
  call npm install
  if errorlevel 1 goto :error
)
echo [2/2] Building FAST portable folder...
call npm run portable:folder
if errorlevel 1 goto :error
echo.
echo DONE.
echo Fast portable app is inside: release\win-unpacked\
echo Keep the whole win-unpacked folder together. No installation or admin rights required.
pause
exit /b 0
:error
echo.
echo Build failed. Copy the error shown above.
pause
exit /b 1
