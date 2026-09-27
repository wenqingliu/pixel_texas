// 房间设置校验 + 大厅档案/会话清理（数据目录隔离到临时目录，不碰真实 data/）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 必须在任何 storage 相关模块加载前设置
process.env.PT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-lobby-test-'));

const { Room, DEFAULT_SETTINGS } = await import('../server/room.js');

let fails = 0;
function assert(cond, msg) {
  if (!cond) { fails++; console.error('  ✗ ' + msg); }
}

// ── updateSettings 参数校验 ──────────────────────────
{
  const room = new Room({ onRoomsChanged() {}, sendTo() {} }, 'TST1', 'host');
  room.addPlayer('host', '房主', '');
  const r = room.updateSettings('host', {
    sb: 'x', bb: NaN, buyIn: -5, maxSeats: 99, actionTime: 0,
    blindsEvery: 'zz', botLevel: 'hack', mode: 'bogus', botsFill: 'yes',
  });
  assert(r.ok, '非法设置不报错（回落安全值）');
  assert(room.settings.sb === DEFAULT_SETTINGS.sb, `非法 sb 回落默认（实际 ${room.settings.sb}）`);
  assert(room.settings.bb === DEFAULT_SETTINGS.bb, `非法 bb 回落默认（实际 ${room.settings.bb}）`);
  assert(room.settings.buyIn === 100, `负买入钳到下限 100（实际 ${room.settings.buyIn}）`);
  assert(room.settings.maxSeats === 9, 'maxSeats 越界钳到 9');
  assert(room.settings.actionTime === 30, 'actionTime 0 回落 30');
  assert(room.settings.blindsEvery === 8, 'blindsEvery 非法回落 8');
  assert(room.settings.botLevel === 'normal', 'botLevel 非法回落 normal');
  assert(room.settings.mode === 'cash', 'mode 非法回落 cash');
  assert(room.settings.botsFill === true, 'botsFill 归一化为布尔');

  const r2 = room.updateSettings('host', { sb: 25, bb: 50, buyIn: 5000 });
  assert(r2.ok && room.settings.sb === 25 && room.settings.bb === 50 && room.settings.buyIn === 5000, '合法设置原样生效');
  room.updateSettings('host', { bb: 10 }); // bb < sb → 强制抬升
  assert(room.settings.bb === 50, `bb ≤ sb 时抬升为 2×sb（实际 ${room.settings.bb}）`);

  const r3 = room.updateSettings('guest', { sb: 1 });
  assert(!r3.ok && r3.err === 'not_host', '非房主改设置被拒');
}

// ── 档案/会话过期清理 ────────────────────────────────
{
  class FakeWS { constructor() { this.readyState = 1; this.inbox = []; } send() {} close() { this.readyState = 3; } }
  const { Lobby } = await import('../server/lobby.js');
  const now = Date.now();
  const lobby = new Lobby();
  const mk = (name, seenDaysAgo) => ({ name, avatar: '', createdAt: now - seenDaysAgo * 86400e3, lastSeen: now - seenDaysAgo * 86400e3 });
  lobby.profiles['stale'] = mk('老玩家', 91);                 // 90 天未活跃 → 清除
  lobby.profiles['fresh'] = mk('常客', 10);                   // 活跃 → 保留
  lobby.profiles['tok-old'] = mk('回归者', 30);               // 档案活跃 → 保留
  lobby.tokens.set('tok-old', { token: 'tok-old', name: '回归者', ws: null, roomId: null, connected: false, disconnectedAt: now - 25 * 3600e3 }); // 断线超 24h → 清除

  const changed = lobby.prune(now);
  assert(changed, '清理发生变更');
  assert(!Object.prototype.hasOwnProperty.call(lobby.profiles, 'stale'), '90 天未活跃档案已清除');
  assert(lobby.profiles['fresh'] && lobby.profiles['fresh'].name === '常客', '活跃档案保留');
  assert(!lobby.tokens.has('tok-old'), '断线超 24h 会话已清除');
  assert(lobby.profiles['tok-old'], '会话清除但档案保留');
  assert(!lobby.prune(now), '再次清理无变更');

  // 携带被清理的 token 重登 → 凭档案复活，token 不换发、数据不丢
  const ws = new FakeWS();
  const t = lobby.login(ws, '回归者', 'tok-old');
  assert(t === 'tok-old', '被清理的 token 凭档案复活');
  assert(lobby.profileOf('tok-old').name === '回归者', '复活后档案数据保留');
  assert(lobby.tokens.get('tok-old').connected === true, '复活会话标记在线');

  // 无档案的陌生 token → 换发新 token（维持原语义）
  const t2 = lobby.login(new FakeWS(), '新人', 'deadbeef');
  assert(t2 !== 'deadbeef', '无档案的旧 token 换发新 token');
}

// ── 两局之间：休息倒计时 + 全员就绪提前开局 ──────────
{
  const fakeLobby = {
    onRoomsChanged() {}, sendTo() {}, removeRoom() {},
    profileOf: () => ({ stats: { hands: 0, vpip: 0 } }),
  };
  const room = new Room(fakeLobby, 'TST2', 'host');
  room.addPlayer('host', '房主', '');
  room.settings.botsFill = true;
  room.phase = 'playing';
  room.trySit('host');
  room.fillBots();
  assert(room.eligibleSeats().length >= 2, '参战座位就绪');

  room.startBreak();
  assert(room.breakDeadline > Date.now(), '进入休息倒计时');
  const snap = room.snapshot('host');
  assert(snap.break && snap.break.need === 1 && snap.break.deadline > Date.now(), '快照带倒计时与就绪需求');

  // 倒计时期间 sitIn/rebuy 触发的自动开局不得抢跑
  room.maybeAutoNext();
  assert(room.breakDeadline > 0 && !room.hand, '倒计时期间不被自动开局');

  // 非参战/陌生 token 点继续无效
  room.readyNext('nobody');
  assert(room.breakDeadline > 0 && !room.hand, '陌生 token 不推进就绪');

  // 唯一参战真人就绪 → 立即开局
  const r = room.readyNext('host');
  assert(r.ok && room.hand && room.breakDeadline === 0, '全员就绪提前开局');
  room.close();
  assert(room.closed, '房间关闭清理计时器');

  // 房主可关闭休息：breakWait=0 直接开局
  const room2 = new Room(fakeLobby, 'TST3', 'host');
  room2.addPlayer('host', '房主', '');
  room2.settings.botsFill = true;
  room2.phase = 'playing';
  room2.trySit('host');
  room2.fillBots();
  const su = room2.updateSettings('host', { breakWait: 0 });
  assert(su.ok && room2.settings.breakWait === 0, '休息时长设置生效');
  room2.startBreak();
  assert(room2.hand && room2.breakDeadline === 0, 'breakWait=0 关闭休息直接开局');
  room2.close();
}

// ── storage：原子写 + .bak 回退 ──────────────────────
{
  const { saveNow, load } = await import('../server/storage.js');
  const fsvc = await import('node:fs');
  const file = path.join(process.env.PT_DATA_DIR, 'probe.json');
  saveNow('probe', { v: 1 });
  assert(load('probe', null) && load('probe', null).v === 1, '原子写后可读回');
  fsvc.renameSync(file, file + '.bak');
  fsvc.writeFileSync(file, '{broken');
  assert(load('probe', null) && load('probe', null).v === 1, '主文件损坏回退 .bak');
  fsvc.writeFileSync(file + '.bak', '{also-broken');
  assert(load('probe', 'def') === 'def', '两份全损坏返回默认值');
}

console.log(fails === 0 ? 'lobby 校验全部通过 ✓' : `lobby 校验有 ${fails} 项失败 ✗`);
process.exit(fails === 0 ? 0 : 1);
