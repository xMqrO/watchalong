@echo off
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c','npm run dev' -WorkingDirectory '%cd%' -WindowStyle Hidden"
:wait
timeout /t 1 /nobreak >nul
netstat -ano | findstr "LISTENING" | findstr /c:":5173 " >nul
if errorlevel 1 goto wait
start "" http://localhost:5173/
