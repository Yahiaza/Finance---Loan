@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo Missing .env. Copy .env.example to .env and configure it first.
  pause
  exit /b 1
)
npm start
pause
