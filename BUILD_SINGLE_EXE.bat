@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo [1/2] Installing dependencies for the first time only...
  call npm install
  if errorlevel 1 goto :error
)

echo [2/2] Building single Portable EXE...
call npm run build:portable
if errorlevel 1 goto :error

echo.
echo DONE.
echo Portable EXE is inside the release folder.
pause
exit /b 0

:error
echo.
echo Build failed. Copy the error shown above.
pause
exit /b 1
