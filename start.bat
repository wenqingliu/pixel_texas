@echo off
REM ============================================================
REM  PIXEL TEXAS · One-click launcher (Windows)
REM  Double-click to start server and open browser
REM ============================================================
chcp 65001 >nul
setlocal

REM 切到脚本所在目录（从任意位置双击都生效）
cd /d "%~dp0"

REM ---- 端口 3000 占用检查（不强制 kill，避免误杀别人进程） ----
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
  set "PORT_PID=%%P"
)
if defined PORT_PID (
  echo.
  echo [WARN] Port 3000 is already in use (pid=%PORT_PID%)
  echo        To free it:  taskkill /PID %PORT_PID% /F
  echo.
  set /p "DUMMY=Press Enter to start anyway (may conflict), or Ctrl+C to abort: "
)

REM ---- 装依赖（首次或缺包时才跑；npm install 本身幂等） ----
if not exist "node_modules\ws" (
  echo [INFO] Installing dependencies (npm install) ...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
)

REM ---- 异步打开浏览器（1.5s 后用 ping 模拟延时，避免阻塞主进程） ----
start "" /b cmd /c "ping 127.0.0.1 -n 3 >nul && start "" http://localhost:3000"

echo.
echo ============================================================
echo   PIXEL TEXAS starting...
echo ============================================================
echo   Local:    http://localhost:3000
echo   LAN URL:  will be printed by server
echo   Ctrl+C to stop
echo.

node server/index.js

endlocal
