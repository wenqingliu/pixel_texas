// 服务器全链路自测：假 ws 客户端驱动 Lobby/Room + 真实机器人打完整手牌
import { Lobby } from '../server/lobby.js';
import { TIMING } from '../server/room.js';
import { botDecide, equity } from '../server/bots/bot.js';
import { newDeck, shuffle, eval7 } from '../server/evaluator.js';

let fails = 0;
function assert(cond, msg) {
  if (!cond) { fails++; console.error('  ✗ ' + msg); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 测试提速
TIMING.ACTION_TIME = 400;
TIMING.BOT_THINK = [10, 50];
TIMING.HAND_BREAK = 150;
TIMING.RUNOUT_STEP = 40;
TIMING.ROOM_IDLE_CLOSE = 100000;

class FakeWS {
  constructor() { this.readyState = 1; this.inbox = []; }
  send(data) { this.inbox.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
}
const last = (ws, t) => [...ws.inbox].reverse().find(m => m.t === t);

// ── 机器人决策合法性（随机局面、三档）────────────────
{
  const { Hand } = await import('../server/hand.js');
  let bad = 0, decisions = 0;
  for (let i = 0; i < 240; i++) {
    const n = 2 + (i % 8);
    const seats = new Set();
    while (seats.size < n) seats.add((i * 3 + seats.size * 5) % 9);
    const players = [...seats].map((s, k) => ({ seat: s, name: 'B' + k, chips: 2000, isBot: true, level: ['easy', 'normal', 'hard'][i % 3] }));
    const hand = new Hand(players, { sb: 10, bb: 20, button: [...seats][0], handNo: 1 }, () => {});
    hand.start();
    let guard = 0;
    while (hand.phase !== 'done' && guard++ < 400) {
      if (hand.phase === 'runout') { hand.advanceRunout(); continue; }
      const seat = hand.awaitingSeat();
      if (seat == null) break;
      const p = hand.bySeat(seat);
      const d = botDecide(p, hand);
      decisions++;
      const o = hand.options(p);
      const okType = ['fold', 'check', 'call', 'raise'].includes(d.type);
      const okRaise = d.type !== 'raise' || (d.amount >= Math.min(o.minRaiseTo, o.maxRaiseTo) && d.amount <= o.maxRaiseTo);
      const okCall = d.type !== 'call' || o.canCall;
      const okCheck = d.type !== 'check' || o.canCheck;
      if (!okType || !okRaise || !okCall || !okCheck) { bad++; if (bad <= 3) console.error(`  ✗ 非法决策 ${JSON.stringify(d)} vs options ${JSON.stringify(o)}`); break; }
      const res = hand.applyAction(seat, d.type, d.amount);
      if (!res.ok) { bad++; if (bad <= 3) console.error(`  ✗ applyAction 拒绝: ${res.err} ${JSON.stringify(d)}`); break; }
    }
  }
  assert(bad === 0, `机器人 ${decisions} 次决策中 ${bad} 次非法`);
  console.log(`  机器人决策合法性: ${decisions} 次`);
}

// ── equity 基本合理性 ────────────────────────────────
{
  const AA = [48, 49]; // A♠ A♥
  const eAA = equity(AA, [], 1, 4000);
  const T2 = [(8 << 2) | 0, (0 << 2) | 1]; // T♣? rank8=T suit0; rank0=2 suit1
  const e72 = equity([0, 1], [], 1, 4000); // 2♠2♥
  assert(eAA > 0.78 && eAA < 0.90, `AA 单挑胜率应在 0.78-0.90，实际 ${eAA}`);
  assert(e72 > 0.45 && e72 < 0.60, `22 单挑胜率应在 0.45-0.60，实际 ${e72}`);
  assert(eAA > e72, 'AA 应强于 22');

  // 平分份额回归：四条公共牌面上，无 K 底牌几乎必平分 → 胜率应≈0.44 而非≈0.87
  const quadBoard = [0, 1, 2, 3, 44]; // 四条A + K
  const eQuad = equity([8, 9], quadBoard, 1, 8000);
  assert(eQuad > 0.32 && eQuad < 0.56, `四条板平分份额应≈0.44，实际 ${eQuad}（平分记整赢的旧 bug 会得≈0.87）`);
}

// ── 全链路：登录 → 单机练习 → 机器人对局 ─────────────
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '测试侠', null);
  assert(typeof token === 'string' && last(ws, 'welcome'), '登录获得 welcome');

  lobby.practice(token);
  // 轮到自己时一定会收到 prompt（可能要先等机器人行动）
  let prompt = null;
  for (let i = 0; i < 100 && !prompt; i++) { await sleep(30); prompt = last(ws, 'prompt'); }
  assert(prompt, '收到行动请求');
  const room = lobby.rooms.get(ws.inbox.filter(m => m.t === 'room')[0].code);
  assert(room, '单机练习创建房间');
  assert(room.phase === 'playing', '练习房间自动开局');
  assert(room.seats.filter(s => s && s.isBot).length >= 1, '机器人已入场');
  assert(last(ws, 'hole') && last(ws, 'hole').cards.length === 2, '收到 2 张底牌');

  // 自动应答：有牌就跟/加注，模拟真人
  const seenShowdown = [];
  const timer = setInterval(() => {
    const prompt = last(ws, 'prompt');
    if (!prompt) return;
    const snap = last(ws, 'room');
    if (!snap || !snap.you || snap.you.seat < 0) return;
    const r = Math.random();
    if (prompt.options.canRaise && r < 0.3) {
      lobby.tokens.get(token).ws = ws; // 保持连接
      room.action(token, 'raise', Math.min(prompt.options.maxRaiseTo, prompt.options.minRaiseTo + 40));
    } else if (prompt.options.canCheck) room.action(token, 'check');
    else if (r < 0.85) room.action(token, 'call');
    else room.action(token, 'fold');
  }, 30);

  // 总量守恒：筹码 + 进行中底池 = 常数 + 补买注入
  const totalAt = () => room.seats.filter(Boolean).reduce((s, x) => s + x.chips, 0) + (room.hand ? room.hand.commitTotalSum() : 0);
  const countRebuys = () => ws.inbox.filter(m => m.t === 'ev' && m.kind === 'rebuy').length;
  const totalBefore = totalAt();

  // 等两手牌打完
  const firstHandNo = room.handNo;
  const t0 = Date.now();
  while (room.handNo < firstHandNo + 2 && Date.now() - t0 < 30000) {
    if (room.lastResults) seenShowdown.push(room.lastResults);
    await sleep(100);
  }
  clearInterval(timer);
  assert(room.handNo >= firstHandNo + 2, `应连续进行多手，实际 handNo=${room.handNo}`);
  const expected = totalBefore + countRebuys() * room.settings.buyIn;
  assert(totalAt() === expected, `房间筹码守恒 ${expected}，实际 ${totalAt()}`);
  assert(seenShowdown.length > 0, '收到过结算事件');
  assert(ws.inbox.some(m => m.t === 'ev' && m.kind === 'showdown'), '广播含 showdown');
  console.log(`  单机练习: ${room.handNo} 手完成，机器人 ${room.seats.filter(s => s && s.isBot).length} 名`);
  room.close();
}

// ── 多人：创建房间 / 加入 / 快速匹配 / 顶替机器人 ────
{
  const lobby = new Lobby();
  const wsA = new FakeWS(), wsB = new FakeWS(), wsC = new FakeWS();
  const tA = lobby.login(wsA, '房主', null);
  const tB = lobby.login(wsB, '朋友B', null);
  const tC = lobby.login(wsC, '朋友C', null);

  const room = lobby.createRoom(tA, { maxSeats: 4, botsFill: true, botLevel: 'hard' });
  assert(room, '建房成功');
  assert(room.settings.botLevel === 'hard', '设置机器人大师档');

  const resB = lobby.joinRoom(tB, room.code);
  assert(resB.ok, 'B 加入成功');
  assert(room.humanSeated() === 2, '两人已入座');

  // A 开始对局
  const sg = room.startGame();
  assert(sg.ok, '开局成功');
  await sleep(80);
  assert(room.hand && room.hand.phase !== 'done', '手牌进行中');
  assert(last(wsA, 'hole') && last(wsB, 'hole'), '双方收到底牌');

  // C 快速匹配应进 B 所在…匹配到同一房间（人多的房）
  lobby.quickMatch(tC);
  assert(last(wsC, 'room') && last(wsC, 'room').code === room.code, '快速匹配进入现有房间');
  assert(room.humanSeated() === 2 && room.players.size === 3, 'C 观战（手牌中不顶替）');

  // 断线重连
  lobby.logout(tB);
  assert(room.seats.some(s => s && s.token === tB), '断线后 B 保留座位');
  const wsB2 = new FakeWS();
  const tB2 = lobby.login(wsB2, '朋友B', tB);
  assert(tB2 === tB, 'token 复用');
  await sleep(30);
  const snapB2 = last(wsB2, 'room');
  assert(snapB2 && snapB2.code === room.code, '重连后收到房间快照');

  room.close();
}

// ── 人类破产 → sittingOut → 重新买入 ────────────────
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '穷光蛋', null);
  const room = lobby.createRoom(token, { botsFill: true, buyIn: 2000 });
  // 塞一个必输局面不现实，直接测 rebuy 状态机
  const seat = room.seats.find(s => s && s.token === token);
  seat.chips = 0;
  room.hand = null;
  room.cleanupAfterHand();
  assert(seat.sittingOut === true, '破产自动坐下轮休');
  const r1 = room.rebuy(token);
  assert(r1.ok && seat.chips === 2000 && !seat.sittingOut, '重新买入恢复');
  room.close();
}

// ── 空房间闲置关闭：有人重进应取消关闭计时器 ────────
{
  const prevIdle = TIMING.ROOM_IDLE_CLOSE;
  TIMING.ROOM_IDLE_CLOSE = 200;
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '回归者', null);
  const room = lobby.createRoom(token, null);
  lobby.leaveRoom(token); // 清空 → 启动闲置关闭
  await sleep(80);
  lobby.joinRoom(token, room.code); // 重进 → 应取消关闭
  await sleep(400);
  assert(!room.closed, '重进后房间不应被闲置关闭');
  assert(room.players.has(token), '玩家应在房间内');
  TIMING.ROOM_IDLE_CLOSE = prevIdle;
  room.close();
}

// ── 锦标赛：全机器人跑完整届 → 排名/淘汰/盲注升级/重新开赛 ──
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '锦标赛主持', null);
  const room = lobby.createRoom(token, {
    mode: 'tournament', botsFill: true, maxSeats: 4, buyIn: 500,
    sb: 25, bb: 50, blindsEvery: 2,
  });
  assert(room.settings.mode === 'tournament', '锦标赛模式设置生效');
  // 主持人自动弃牌（超时托管），机器人之间打完整届
  room.startGame();
  const t0 = Date.now();
  while (!room.tournamentOver && Date.now() - t0 < 90000) await sleep(150);
  assert(room.tournamentOver, `锦标赛应在 90s 内结束（handNo=${room.handNo}）`);
  assert(room.tournamentOver.length === 4, `排名应含全部 4 人，实际 ${JSON.stringify(room.tournamentOver)}`);
  assert(room.tournamentOver[0], '冠军名字存在');
  const evTypes = ws.inbox.filter(m => m.t === 'ev').map(m => m.kind);
  assert(evTypes.includes('eliminated'), '应广播淘汰事件');
  assert(evTypes.includes('blinds_up'), '应广播盲注升级事件');
  assert(evTypes.includes('tournament_over'), '应广播锦标赛结束事件');
  assert(room.handLog.length > 0, '手牌流水已归档');
  assert(room.handLog.some(h => h.actions.some(a => a.k === 'act' && a.put > 0))
    || room.handLog.every(h => h.actions.some(a => a.k === 'act' && typeof a.put === 'number')),
  '流水含下注增量 put');
  assert(room.handLog[0].seats.every(s => s.name && s.chips > 0), '流水含开局座位筹码');
  assert(room.stats.size > 0, '战绩统计已记录');
  const totalNet = [...room.stats.values()].reduce((s, x) => s + x.net, 0);
  assert(Math.abs(totalNet) <= room.settings.buyIn * 0.01, `全员净盈亏之和应≈0，实际 ${totalNet}`);
  // 重新开赛
  const rs = room.startGame();
  assert(rs.ok, '锦标赛结束后可重新开赛');
  assert(room.eligibleSeats().length === 4 && room.tournamentOver === null, '重开后座位筹码与状态重置');
  room.close();
}

// ── 手牌记录：get_history 协议字段 ──────────────────
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '记录员', null);
  const room = lobby.createRoom(token, { botsFill: true });
  room.startGame();
  await sleep(1200);
  assert(room.handLog.length > 0, 'cash 房间也有流水');
  assert(room.handLog.some(h => h.actions.some(a => a.k === 'act' && typeof a.put === 'number')), '流水 act 事件带 put 字段');
  assert(room.handLog.every(h => h.seats.every(s => s.name && s.chips > 0)), '流水座位筹码应为正');
  room.close();
}

// ── 个人档案：跨房间统计 / 头像 / 风格标签 ──────────
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '档案员', null);
  // 头像设置与校验
  lobby.setAvatar(token, 'p5.c3');
  assert(lobby.profileOf(token).avatar === 'p5.c3', '合法头像已保存');
  lobby.setAvatar(token, 'DROP TABLE');
  assert(lobby.profileOf(token).avatar === 'p5.c3', '非法头像被拒绝');
  // 打两手（全机器人陪练）
  const room = lobby.createRoom(token, { botsFill: true });
  room.startGame();
  await sleep(2500);
  const view = lobby.profileView(token);
  assert(view.hands >= 1, `档案局数应 ≥1，实际 ${view.hands}`);
  assert(typeof view.vpip === 'number' && typeof view.pfr === 'number', 'VPIP/PFR 指标存在');
  assert(view.style, '风格标签存在');
  assert(view.style.label.includes('样本不足') === (view.hands < 20), '样本不足时风格标签正确');
  // 快照座位带头像与 acted 字段
  const snap = room.snapshot(token);
  const mySeat = snap.seats.find(s => !s.empty && s.seat === snap.you.seat);
  assert(mySeat && mySeat.avatar === 'p5.c3', '座位快照带头像');
  assert(snap.seats.every(s => s.empty || typeof s.acted === 'boolean'), '座位快照带 acted 字段');
  room.close();
  // 持久化落盘
  const { saveNow } = await import('../server/storage.js');
  saveNow('profiles', lobby.profiles);
  const { load } = await import('../server/storage.js');
  const disk = load('profiles', {});
  assert(disk[token] && disk[token].avatar === 'p5.c3', '档案已写入磁盘');
}

// ── 休息 / 回到牌局（仅现金桌）─────────────────────
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '劳逸结合', null);
  const room = lobby.createRoom(token, { botsFill: true });
  const r1 = room.sitOut(token);
  assert(r1.ok && room.seats[0].sittingOut === true, '现金桌可主动休息');
  const r2 = room.sitIn(token);
  assert(r2.ok && room.seats[0].sittingOut === false, '回到牌局恢复');
  // 锦标赛禁止休息
  room.updateSettings(token, { mode: 'tournament' });
  room.hand = null;
  room.phase = 'lobby';
  const r3 = room.sitOut(token);
  assert(!r3.ok && r3.err === 'tournament', '锦标赛禁止休息');
  room.close();
}

// ── 行动被拒 → 重发行动请求 ─────────────────────────
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '重发侠', null);
  const room = lobby.createRoom(token, { botsFill: true });
  room.startGame();
  // 等到轮到人类
  let waited = 0;
  while (room.hand && room.hand.awaitingSeat() !== 0 && waited < 10000) { await sleep(50); waited += 50; }
  if (room.hand && room.hand.awaitingSeat() === 0) {
    const promptsBefore = ws.inbox.filter(m => m.t === 'prompt').length;
    const res = room.action(token, 'dance'); // 非法动作类型
    assert(!res.ok, '非法动作被拒绝');
    room.resendPrompt(token); // index.js 在 action 被拒时调用
    await sleep(50);
    const promptsAfter = ws.inbox.filter(m => m.t === 'prompt').length;
    assert(promptsAfter > promptsBefore, 'resendPrompt 重发了行动请求');
  } else {
    console.log('  （跳过重发测试：等待轮次超时）');
  }
  room.close();
}

// ── 超时托管计时器窗口守卫：旧窗口的计时器不得误伤新窗口 ──
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '窗口守卫', null);
  const room = lobby.createRoom(token, { botsFill: true });
  room.startGame();
  let waited = 0;
  while (room.hand && room.hand.awaitingSeat() !== 0 && waited < 10000) { await sleep(50); waited += 50; }
  if (room.hand && room.hand.awaitingSeat() === 0) {
    const myTurn = () => room.hand && room.hand.awaitingSeat() === 0;
    // 模拟一个"陈旧窗口"的计时器（deadline 与当前窗口不同）→ 不应托管
    room._armHumanTimeout(0, (room.actorDeadline || 0) - 9999, 30);
    await sleep(250);
    assert(myTurn(), '陈旧窗口计时器不应触发托管');
    // 当前窗口的正常计时器 → 到点应托管（轮询等待，避免固定 sleep 竞态）
    room._armHumanTimeout(0, room.actorDeadline, 30);
    let actedOut = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      if (!myTurn()) { actedOut = true; break; }
      await sleep(40);
    }
    assert(actedOut, '当前窗口计时器应正常托管');
    assert(room.hand.phase === 'betting' || room.hand.phase === 'runout' || room.hand.phase === 'done', '托管后牌局状态正常');
  } else {
    console.log('  （跳过窗口守卫测试：等待轮次超时）');
  }
  room.close();
}

// ── 快捷弃牌 / 表情 / 兔猎（借鉴 Ignition / Zynga / Bovada）──
{
  const lobby = new Lobby();
  const ws = new FakeWS();
  const token = lobby.login(ws, '快捷哥', null);
  const room = lobby.createRoom(token, { botsFill: true });
  room.startGame();
  let waited = 0;
  while (room.hand && room.hand.awaitingSeat() === 0 && waited < 5000) { await sleep(50); waited += 50; }
  if (room.hand && room.hand.phase === 'betting' && room.hand.awaitingSeat() !== 0) {
    const beforeHandNo = room.handNo;
    const r = room.action(token, 'fold');
    assert(r.ok, '快捷弃牌成功');
    assert(room.hand.bySeat(0).folded, '座位0 已预弃牌');
    await sleep(1500);
    assert(room.hand === null || room.hand.bySeat(0).folded || room.handNo > beforeHandNo, '快捷弃牌后本手不再等待 seat0');
  }
  const re1 = room.emote(token, '👍');
  assert(re1.ok, '表情发送成功');
  assert(ws.inbox.some(m => m.t === 'ev' && m.kind === 'emote' && m.emoji === '👍'), '表情已广播');
  const re2 = room.emote(token, '👍');
  assert(!re2.ok, '表情限流生效');
  const re3 = room.emote(token, '<script>');
  assert(!re3.ok, '非法表情被拒绝');
  await sleep(1600);
  const re4 = room.emote(token, '🔥');
  assert(re4.ok, '限流窗口后可再发');
  room.rabbitState = { board: [0, 5, 10, 15, 20], shown: false };
  const snap0 = room.snapshot(token);
  assert(snap0.rabbitAvail === true, '兔猎可用标记正确');
  const inboxBefore = ws.inbox.length;
  room.rabbit(token);
  assert(ws.inbox.length > inboxBefore, '兔猎已广播');
  const rabbitEv = ws.inbox.find(m => m.t === 'ev' && m.kind === 'rabbit');
  assert(rabbitEv && rabbitEv.cards.length === 5, '兔猎广播 5 张公牌');
  assert(room.snapshot(token).rabbitAvail === false, '兔猎后标记消失');
  room.close();
}


console.log(fails === 0 ? '服务器全链路全部通过 ✓' : `服务器有 ${fails} 项失败 ✗`);
process.exit(fails === 0 ? 0 : 1);
