@echo off
cd /d "%~dp0"
rem Start a small local web server for the app, then open it in the browser.
start "my-notes server" /min python -m http.server 5180 --bind 127.0.0.1
timeout /t 1 /nobreak >nul
start "" http://localhost:5180
