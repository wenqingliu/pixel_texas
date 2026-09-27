// 多房间压测：N 个房间 × 满桌机器人连续对局，验证快照节流/限流改造后的服务端余量
// 用法：node scripts/stress.js [房间数=3] [每房间手数=100]
// 只统计进程内 Lobby/Room（不打真实网络），观察者只做计数不攒信箱，测的是节奏/广播量/内存
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 档案写入隔离到临时目录（必须在加载 lobby 前设置）
process.env.PT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-stress-'));

const { Lobby } = await import('../server/lobby.js');
const { TIMING, DEFAULT_SETTINGS } = await import('../server/room.js');

const ROOMS = Number(process.argv[2] || 3);
const HANDS = Number(process.argv[3] || 100);

// 提速：压缩等待但保留节奏结构（思考/发牌/结算比例不变）
TIMING.ACTION_TIME = 120;
TIMING.BOT_THINK = [5, 25];
TIMING.HAND_BREAK = 30;
TIMING.RUNOUT_STEP = 20;
TIMING.ROOM_IDLE_CLOSE = 1e9;
DEFAULT_SETTINGS.breakWait = 0;

class CountWS {
  constructor() { this.readyState = 1; this.msgs = 0; this.bytes = 0; }
  send(data) { this.msgs++; this.bytes += data.length; }
  close() { this.readyState = 3; }
}

const lobby = new Lobby();
const entries = [];
for (let i = 0; i < ROOMS; i++) {
  const ws = new CountWS();
  const token = lobby.login(ws, '观察者' + i, null);
  const room = lobby.createRoom(token, { botsFill: true, maxSeats: 9, botLevel: ['easy', 'normal', 'hard'][i % 3] });
  room.startGame();
  entries.push({ room, ws });
  console.log(`房 ${room.code} 已开局（${['easy', 'normal', 'hard'][i % 3]} 档，9 人桌）`);
}
console.log(`\n目标：每房间 ${HANDS} 手，压测中…\n`);

const t0 = Date.now();
const mem0 = process.memoryUsage();
let doneCount = 0;
await new Promise((resolve) => {
  const iv = setInterval(() => {
    doneCount = entries.filter(e => e.room.handNo >= HANDS).length;
    if (doneCount === entries.length || Date.now() - t0 > 10 * 60 * 1000) {
      clearInterval(iv);
      resolve();
    }
  }, 200);
});
const elapsed = (Date.now() - t0) / 1000;
const mem1 = process.memoryUsage();

console.log(`完成 ${doneCount}/${entries.length} 个房间达标，总耗时 ${elapsed.toFixed(1)}s`);
for (const { room, ws } of entries) {
  const perHand = room.handNo > 0 ? (ws.msgs / room.handNo).toFixed(0) : '0';
  console.log(`  房 ${room.code}: ${room.handNo} 手 | 观察者收 ${ws.msgs} 条 / ${(ws.bytes / 1024).toFixed(0)} KB（≈${perHand} 条/手）`);
}
console.log(`内存: RSS ${(mem1.rss / 1048576).toFixed(0)}MB（Δ${((mem1.rss - mem0.rss) / 1048576).toFixed(1)}MB）  Heap ${(mem1.heapUsed / 1048576).toFixed(0)}MB`);
const failed = doneCount < entries.length;
console.log(failed ? '\n压测未全部达标 ✗（超时 10 分钟）' : '\n压测通过 ✓');
for (const { room } of entries) room.close();
process.exit(failed ? 1 : 0);
