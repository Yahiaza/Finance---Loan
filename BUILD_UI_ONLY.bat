@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies for the first time only...
  call npm install
  if errorlevel 1 goto :error
)
call npm run build
if errorlevel 1 goto :error
echo.
echo UI build completed. Output: dist\
pause
exit /b 0
:error
echo.
echo Build failed. Copy the error shown above.
pause
exit /b 1
