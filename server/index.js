// 服务器入口：HTTP 静态资源 + WebSocket 大厅/房间协议
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Lobby } from './lobby.js';

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SHARED_DIR = path.join(ROOT, 'shared'); // 客户端/服务端共用模块（评估器）

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname);
  // /shared/* 映射到项目根 shared/（两端同源评估器），其余走 client/
  let file, baseDir;
  if (pathname.startsWith('/shared/')) { baseDir = SHARED_DIR; file = path.normalize(path.join(SHARED_DIR, pathname.slice('/shared'.length))); }
  else { baseDir = CLIENT_DIR; file = path.normalize(path.join(CLIENT_DIR, pathname === '/' || pathname === '' ? 'index.html' : pathname)); }
  // 前缀检查须带路径分隔符，防同级目录（如 client2）绕过
  if (file !== baseDir && !file.startsWith(baseDir + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }
    // 字体等静态资源内容稳定，允许长缓存；代码文件保持协商缓存
    const cache = pathname.startsWith('/assets/') ? 'public, max-age=86400, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server });
const lobby = new Lobby();

const ERR_TEXT = {
  no_login: '请先进入游戏',
  room_not_found: '房间不存在或已关闭',
  create_failed: '创建房间失败',
  not_host: '只有房主可以操作',
  need_two_players: '至少需要两名玩家才能开始',
  already_started: '对局已开始',
};

function roomOf(token) {
  const p = lobby.tokens.get(token);
  if (!p || !p.roomId) return null;
  const r = lobby.rooms.get(p.roomId);
  return r && !r.closed ? r : null;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // 每连接消息限流：令牌桶（容量 40，每秒回填 20），超频直接断开，防失控客户端刷房间/行动
  const rate = { tokens: 40, at: Date.now() };
  ws.on('message', (data) => {
    const now = Date.now();
    rate.tokens = Math.min(40, rate.tokens + (now - rate.at) / 1000 * 20);
    rate.at = now;
    if (rate.tokens < 1) {
      console.warn('[rate] 断开超频连接');
      ws.terminate();
      return;
    }
    rate.tokens -= 1;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const token = ws._token;

    try {
      switch (msg.t) {
        case 'hello': {
          lobby.login(ws, msg.name, msg.token);
          return;
        }
        case 'list': lobby.sendRooms(token); return;
        case 'set_name': {
          const p = lobby.tokens.get(token);
          if (p && msg.name) {
            lobby.setName(token, msg.name);
            lobby.sendTo(token, { t: 'welcome', token, name: lobby.tokens.get(token).name, avatar: lobby.tokens.get(token).avatar });
            lobby.onRoomsChanged();
          }
          return;
        }
        case 'set_avatar': {
          if (token) lobby.setAvatar(token, String(msg.avatar || ''));
          return;
        }
        case 'get_profile': {
          if (token) lobby.sendTo(token, { t: 'profile', profile: lobby.profileView(token) });
          return;
        }
        case 'quick_match': {
          const r = lobby.quickMatch(token);
          if (!r.ok) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT[r.err] || r.err });
          return;
        }
        case 'create_room': {
          const r = lobby.createRoom(token, msg.settings || null);
          if (!r) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT.create_failed });
          return;
        }
        case 'join_room': {
          const res = lobby.joinRoom(token, msg.code);
          if (!res.ok) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT[res.err] || res.err });
          return;
        }
        case 'practice': {
          const r = lobby.practice(token);
          if (!r.ok) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT[r.err] || r.err });
          return;
        }
        case 'get_levels': {
          if (token) lobby.sendLevels(token);
          return;
        }
        case 'start_level': {
          const r = lobby.startLevel(token, msg.id);
          if (!r.ok) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT[r.err] || (r.err === 'locked' ? '先通过前一关才能解锁' : '无法开始关卡') });
          return;
        }
        case 'quick_tournament': {
          const r = lobby.quickTournament(token);
          if (!r.ok) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT[r.err] || r.err });
          return;
        }
        case 'leave': {
          lobby.leaveRoom(token);
          lobby.sendRooms(token);
          return;
        }
      }

      // 以下消息需要已在房间
      const room = roomOf(token);
      if (!room) { lobby.sendTo(token, { t: 'error', msg: '你不在任何房间里' }); return; }

      switch (msg.t) {
        case 'update_settings': {
          const res = room.updateSettings(token, msg.settings || {});
          if (!res.ok) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT[res.err] || res.err });
          return;
        }
        case 'start': {
          const res = room.startGame();
          if (!res.ok) lobby.sendTo(token, { t: 'error', msg: ERR_TEXT[res.err] || res.err });
          return;
        }
        case 'action': {
          const res = room.action(token, msg.type, msg.amount);
          if (!res.ok) {
            lobby.sendTo(token, { t: 'error', msg: res.err === 'not_your_turn' ? '还没轮到你' : '无法执行该操作' });
            room.resendPrompt(token); // 客户端面板已乐观清空，重发行动请求
          }
          return;
        }
        case 'rebuy': {
          const res = room.rebuy(token);
          if (!res.ok) lobby.sendTo(token, { t: 'error', msg: '现在不能补充筹码' });
          return;
        }
        case 'sit_out': {
          const res = room.sitOut(token);
          if (!res.ok) lobby.sendTo(token, { t: 'error', msg: res.err === 'tournament' ? '锦标赛中不能休息' : '现在不能休息' });
          return;
        }
        case 'sit_in': {
          const res = room.sitIn(token);
          if (!res.ok) lobby.sendTo(token, { t: 'error', msg: '现在不能回到牌局' });
          return;
        }
        case 'ready_next': {
          // 两局之间点「继续」：全员就绪提前开局；不在休息期则静默忽略
          room.readyNext(token);
          return;
        }
        case 'challenge_free': {
          room.challengeFree();
          return;
        }
        case 'pick_skill': {
          const r = room.pickSkill(token, msg.id);
          if (!r.ok) lobby.sendTo(token, { t: 'error', msg: '无法选择技能牌' });
          return;
        }
        case 'runout_fast': {
          room.fastRunout(token);
          return;
        }
        case 'take_seat': {
          const r = room.trySit(token);
          if (r === false) lobby.sendTo(token, { t: 'error', msg: '暂时没有空位（满员且无可顶替的机器人）' });
          return;
        }
        case 'emote': {
          const room = roomOf(token);
          if (room) room.emote(token, String(msg.emoji || ''));
          return;
        }
        case 'rabbit': {
          const room = roomOf(token);
          if (room) room.rabbit(token);
          return;
        }
        case 'get_history': {
          lobby.sendTo(token, {
            t: 'history',
            hands: room.handLog,
            stats: [...room.stats.entries()],
            ranking: room.tournamentOver,
          });
          return;
        }
      }
    } catch (err) {
      console.error('[msg error]', msg && msg.t, err);
    }
  });

  ws.on('close', () => {
    const token = ws._token;
    if (token) lobby.logout(token);
  });
});

// 心跳清理死连接
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
wss.on('close', () => clearInterval(heartbeat));

// Ctrl+C / kill 前把防抖中的档案写入同步落盘
let exiting = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (exiting) { process.exit(1); } // 二次信号强制退出
    exiting = true;
    console.log('\n正在保存档案并退出…');
    lobby.shutdown();
    process.exit(0);
  });
}

server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   PIXEL TEXAS · 像素德州扑克  已启动      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  本机游玩:   http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  局域网联机: http://${net.address}:${PORT}  (${name})`);
      }
    }
  }
  console.log('  Ctrl+C 停止服务器');
});
