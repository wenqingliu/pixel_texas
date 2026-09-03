#!/bin/bash
# PIXEL TEXAS · 一键启动
# 双击本文件即可启动服务并自动打开浏览器

# 切到脚本所在目录（不管从哪儿双击都生效）
cd "$(dirname "$0")"

# 把本地装的 node 放进 PATH（brew / nvm / 官方安装都覆盖）
for p in "$HOME/.local/node/bin" "$HOME/.nvm/versions/node"/*/bin "/opt/homebrew/bin" "/usr/local/bin"; do
  [ -d "$p" ] && PATH="$p:$PATH"
done
export PATH

# 端口被占用就提示一下（不强制 kill，避免误杀别人进程）
if lsof -nP -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo ""
  echo "⚠️  端口 3000 已被占用（pid=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t)）"
  echo "   想覆盖先 kill：  kill \$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t)"
  echo ""
  read -rp "按回车直接占用启动（会冲突），或 Ctrl+C 退出: "
fi

# 装依赖（首次/有变化时才跑）
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "→ npm install ..."
  npm install || { echo "❌ 依赖装失败"; read -rp "按回车退出"; exit 1; }
fi

# 自动开浏览器（macOS）
URL="http://localhost:3000"
(sleep 1.5 && command -v open >/dev/null && open "$URL") &

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   PIXEL TEXAS 启动中...                    ║"
echo "╚══════════════════════════════════════════╝"
echo "  本机:  $URL"
echo "  局域网: 会在启动后自动打印"
echo "  Ctrl+C 停止"
echo ""

# 前台跑 server（Terminal 窗口关掉即停）
node server/index.js
