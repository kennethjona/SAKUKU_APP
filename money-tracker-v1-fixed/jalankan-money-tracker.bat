@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  set "PYTHON_CMD=py"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python tidak ditemukan. Install Python atau gunakan VS Code Live Server.
    pause
    exit /b 1
  )
  set "PYTHON_CMD=python"
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:5500/"
echo Membuka Money Tracker di http://127.0.0.1:5500/
echo Terminal ini hanya menyajikan file statis. Tekan Ctrl+C untuk menghentikan.
%PYTHON_CMD% -m http.server 5500 --bind 127.0.0.1
pause
