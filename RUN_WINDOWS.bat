@echo off
cd /d "%~dp0"
echo Dehaze Media Lab - http://localhost:8080
start "" "http://localhost:8080"
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3 -m http.server 8080
) else (
  python -m http.server 8080
)
pause
