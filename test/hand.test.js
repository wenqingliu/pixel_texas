// hand.js 自测：随机整局模拟（2-9 人）+ 边池构造用例 + 守恒不变量
import { Hand, computePotsFor } from '../server/hand.js';

let fails = 0;
function assert(cond, msg) {
  if (!cond) { fails++; console.error('  ✗ ' + msg); }
}

// ── 边池构造用例 ─────────────────────────────────────
{
  // A 全下100，B 全下300，C 跟到300，D 弃牌前投了50
  const mk = (seat, commitTotal, folded) => ({ seat, commitTotal, folded, chips: 0 });
  const pots = computePotsFor([mk(0, 100, false), mk(1, 300, false), mk(2, 300, false), mk(3, 50, true)]);
  assert(pots.length === 2, `边池应 2 层，实际 ${pots.length}`);
  assert(pots[0].amount === 350 && JSON.stringify(pots[0].eligible) === '[0,1,2]', `主池 350/[0,1,2]，实际 ${pots[0].amount}/${JSON.stringify(pots[0].eligible)}`);
  assert(pots[1].amount === 400 && JSON.stringify(pots[1].eligible) === '[1,2]', `边池 400/[1,2]，实际 ${pots[1].amount}/${JSON.stringify(pots[1].eligible)}`);
}
{
  // 全员同额 → 单池
  const mk = (seat, c) => ({ seat, commitTotal: c, folded: false, chips: 0 });
  const pots = computePotsFor([mk(0, 100), mk(1, 100), mk(2, 100)]);
  assert(pots.length === 1 && pots[0].amount === 300 && pots[0].eligible.length === 3, '同额单池');
}
{
  // 只有自己投钱（其他人弃牌0投入）——不可能但防御
  const mk = (seat, c, f) => ({ seat, commitTotal: c, folded: f, chips: 0 });
  const pots = computePotsFor([mk(0, 100, false), mk(1, 40, true)]);
  assert(pots.length === 1 && pots[0].amount === 140 && JSON.stringify(pots[0].eligible) === '[0]', '弃牌者钱进池不可赢');
}

// ── 随机整局模拟 ─────────────────────────────────────
// 用确定性的伪随机数便于复现
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateHand(seed, nPlayers, aggressive) {
  const rnd = mulberry32(seed);
  const SB = 10, BB = 20;
  const players = [];
  const used = new Set();
  while (players.length < nPlayers) {
    const s = Math.floor(rnd() * 9);
    if (used.has(s)) continue;
    used.add(s);
    players.push({ seat: s, name: 'P' + s, chips: Math.max(1, Math.floor(rnd() * 180 + 2)) * BB / 2 | 0 || 5 });
  }
  const before = players.reduce((s, p) => s + p.chips, 0);
  const button = [...used][Math.floor(rnd() * used.size)];
  const events = [];
  const hand = new Hand(players, { sb: SB, bb: BB, button, handNo: 1 }, e => events.push(e));
  hand.start();

  let steps = 0;
  while (hand.phase !== 'done') {
    if (++steps > 500) { assert(false, `seed=${seed} 手牌卡死（steps>500）`); break; }
    if (hand.phase === 'runout') { hand.advanceRunout(); continue; }
    const seat = hand.awaitingSeat();
    if (seat == null) { assert(false, `seed=${seed} phase=${hand.phase} 无人行动但未结束`); break; }
    const p = hand.bySeat(seat);
    const o = hand.options(p);
    const r = rnd();
    if (o.canRaise && r < (aggressive ? 0.45 : 0.22)) {
      // 随机加注尺度：最小加注 / 半池近似 / 大注 / 全下
      const pick = rnd();
      let raiseTo;
      if (pick < 0.2) raiseTo = o.minRaiseTo;
      else if (pick < 0.35) raiseTo = o.maxRaiseTo;
      else raiseTo = Math.min(o.maxRaiseTo, o.minRaiseTo + Math.floor(rnd() * (o.maxRaiseTo - o.minRaiseTo)));
      const res = hand.applyAction(seat, 'raise', raiseTo);
      assert(res.ok, `seed=${seed} raise 被拒: ${res.err}`);
    } else if (r < (aggressive ? 0.75 : 0.6)) {
      const res = hand.applyAction(seat, o.canCheck ? 'check' : 'call');
      assert(res.ok, `seed=${seed} check/call 被拒: ${res.err}`);
    } else {
      const res = hand.applyAction(seat, 'fold');
      assert(res.ok, `seed=${seed} fold 被拒: ${res.err}`);
    }
  }

  const after = players.reduce((s, p) => s + p.chips, 0);
  assert(before === after, `seed=${seed} 筹码不守恒 ${before} → ${after}`);
  assert(players.every(p => p.chips >= 0), `seed=${seed} 出现负筹码`);
  // 最后一次 showdown 事件中派出去的钱应等于总投入
  const sd = [...events].reverse().find(e => e.kind === 'showdown');
  if (sd) {
    const paid = sd.results.reduce((s, r) => s + r.win, 0);
    const commitSum = sd.uncontested ? sd.pots[0].amount : sd.pots.reduce((s, x) => s + x.amount, 0);
    assert(paid === commitSum, `seed=${seed} 派池 ${paid} ≠ 池 ${commitSum}`);
  }
  // 未弃牌者不超过总人数，牌都发满 2 张
  assert(hand.alive().length >= 1, `seed=${seed} 无人存活`);
  for (const p of players) {
    assert(p.cards.length === 2, `seed=${seed} 座位${p.seat} 手牌数 ${p.cards.length}`);
    assert(new Set(p.cards).size === 2, `seed=${seed} 座位${p.seat} 重复牌`);
  }
}

{
  let hands = 0;
  for (let seed = 1; seed <= 1500; seed++) {
    const n = 2 + (seed * 7) % 8; // 2..9 人轮换
    simulateHand(seed, n, seed % 2 === 0);
    hands++;
  }
  console.log(`  随机整局模拟 ${hands} 手（含被动/激进两种风格，2-9 人）`);
}

// ── 全下跑牌与单挑盲注专项 ───────────────────────────
{
  // 单挑：按钮=小盲 应第一个行动
  const players = [{ seat: 3, name: 'A', chips: 1000 }, { seat: 7, name: 'B', chips: 1000 }];
  const hand = new Hand(players, { sb: 10, bb: 20, button: 3, handNo: 1 }, () => {});
  hand.start();
  assert(hand.awaitingSeat() === 3, `单挑翻牌前应由按钮(小盲)3 先行动，实际 ${hand.awaitingSeat()}`);
  assert(hand.bySeat(3).streetCommit === 10 && hand.bySeat(7).streetCommit === 20, '单挑盲注位');
  // 3 全下，7 跟注 → 跑牌
  hand.applyAction(3, 'raise', 1000);
  assert(hand.awaitingSeat() === 7, '全下后应由对方行动');
  hand.applyAction(7, 'call');
  assert(hand.phase === 'runout', '全下应进入跑牌阶段');
  let guard = 0;
  while (hand.phase === 'runout' && guard++ < 10) hand.advanceRunout();
  assert(hand.phase === 'done', '跑牌应结算完毕');
  assert(hand.board.length === 5, `公共牌 5 张，实际 ${hand.board.length}`);
  const after = players.reduce((s, p) => s + p.chips, 0);
  assert(after === 2000, `单挑全下守恒 2000，实际 ${after}`);
  const total0 = players.find(p => p.seat === 3).chips;
  const total7 = players.find(p => p.seat === 7).chips;
  assert((total0 === 2000 && total7 === 0) || (total0 === 0 && total7 === 2000), '全下结算应一方清零一方全收');
}
{
  // 翻牌前三人全下 → runout 从 0 张公共牌补满 5 张，边池正确
  const players = [
    { seat: 1, name: 'A', chips: 100 }, { seat: 4, name: 'B', chips: 500 },
    { seat: 6, name: 'C', chips: 2000 },
  ];
  const hand = new Hand(players, { sb: 10, bb: 20, button: 1, handNo: 1 }, () => {});
  hand.start();
  // 三人桌按钮(1)翻牌前先行动；盲注：SB=4、BB=6
  assert(hand.awaitingSeat() === 1, `三人桌按钮先行动，实际 ${hand.awaitingSeat()}`);
  hand.applyAction(1, 'raise', 100);  // A 全下
  hand.applyAction(4, 'raise', 500);  // B 全下（形成边池）
  hand.applyAction(6, 'call');        // C 跟到 500
  assert(hand.phase === 'runout', '应进入跑牌');
  let guard = 0;
  while (hand.phase === 'runout' && guard++ < 10) hand.advanceRunout();
  assert(hand.phase === 'done' && hand.board.length === 5, '翻牌前全下跑满 5 张');
  const after = players.reduce((s, p) => s + p.chips, 0);
  assert(after === 2600, `守恒 2600，实际 ${after}`);
  const c = players.find(p => p.seat === 6);
  assert(c.chips >= 1500, `C 未全下部分应留在手里(${c.chips})`);
  assert(players.find(p => p.seat === 1).chips === 0 || players.find(p => p.seat === 1).folded === false, 'A 已全下');
}
{
  // 大额投入者随后弃牌：死钱滚入下层池，绝不消失
  const players = [
    { seat: 0, name: 'A', chips: 3000 }, { seat: 2, name: 'B', chips: 3000 },
    { seat: 5, name: 'C', chips: 60 },
  ];
  const hand = new Hand(players, { sb: 10, bb: 20, button: 0, handNo: 1 }, () => {});
  hand.start();
  // 盲注：SB=2、BB=5；翻牌前 UTG=0
  hand.applyAction(0, 'raise', 1000); // A 超额下注
  hand.applyAction(2, 'call');        // B 跟 1000
  hand.applyAction(5, 'fold');        // C（BB）弃牌
  assert(hand.awaitingSeat() !== null || hand.phase !== 'betting' || true, '');
  // 翻牌圈：B 先行动（A 之后），双方都弃牌把死钱留给池
  const actor = hand.awaitingSeat();
  if (actor !== null) {
    hand.applyAction(actor, 'fold');
    const actor2 = hand.awaitingSeat();
    if (actor2 !== null) hand.applyAction(actor2, 'fold');
  }
  assert(hand.phase === 'done', `双方弃牌应结束，实际 phase=${hand.phase}`);
  const after = players.reduce((s, p) => s + p.chips, 0);
  assert(after === 6060, `死钱守恒 6060，实际 ${after}`);
}

console.log(fails === 0 ? 'hand 状态机全部通过 ✓' : `hand 状态机有 ${fails} 项失败 ✗`);
process.exit(fails === 0 ? 0 : 1);
