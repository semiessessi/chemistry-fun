@echo off
start /B python -m http.server 8000
timeout /t 1 /nobreak >nul
start http://localhost:8000
