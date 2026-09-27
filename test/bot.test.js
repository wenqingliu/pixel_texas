// 机器人决策回归：画像(bluffMod)生效性 + 决策合法性的独立兜底
// 分布类断言用大样本+宽容差，避免统计抖动
import { botDecide } from '../server/bots/bot.js';
import { Hand } from '../server/hand.js';

let fails = 0;
function assert(cond, msg) {
  if (!cond) { fails++; console.error('  ✗ ' + msg); }
}

// 造一手"干燥牌面、无人下注、弱牌"的固定局面（大师档在此处的行为 ≈ 诈唬频率）
function dryCheckSpot(hole) {
  const players = [
    { seat: 0, name: '我方bot', chips: 10000, isBot: true, level: 'hard' },
    { seat: 1, name: '对手A', chips: 10000, isBot: true, level: 'hard' },
    { seat: 2, name: '对手B', chips: 10000, isBot: true, level: 'hard' },
  ];
  const hand = new Hand(players, { sb: 10, bb: 20, button: 0, handNo: 1 }, () => {});
  // 直接摆牌面（跳过发牌）：翻牌 2♠ 7♦ J♣（极干燥，无对无听牌）
  hand.phase = 'betting';
  hand.street = 'flop';
  hand.board = [(1 << 2) | 0, (5 << 2) | 3, (9 << 2) | 2]; // 3s 7d Jc
  hand.currentBet = 0;
  for (const p of hand.players) { p.cards = hole; p.acted = true; p.streetCommit = 0; }
  hand._setActor(hand.players[0]);
  return hand;
}

// 弱牌：8♠ 4♥（edge 必然 < 1.1，toCall=0 → 只会 check 或诈唬加注）
const WEAK = [(6 << 2) | 0, (2 << 2) | 1];

// ── 对手画像生效：跟注站在场时大师档诈唬率显著下降 ──
{
  const N = 600;
  const stationReads = new Map([
    ['对手A', { hands: 30, vpip: 27, aggr: 2, calls: 10 }], // VPIP 90%
    ['对手B', { hands: 30, vpip: 25, aggr: 3, calls: 12 }], // VPIP 83%
  ]);
  let baseRaises = 0, stationRaises = 0;
  for (let i = 0; i < N; i++) {
    const h1 = dryCheckSpot(WEAK);
    if (botDecide(h1.players[0], h1).type === 'raise') baseRaises++;
    const h2 = dryCheckSpot(WEAK);
    if (botDecide(h2.players[0], h2, stationReads).type === 'raise') stationRaises++;
  }
  const baseRate = baseRaises / N, stationRate = stationRaises / N;
  // 基线 bluffFreq=0.2，跟注站 ×0.3=0.06，放宽 50% 余量防统计抖动
  assert(stationRate < Math.max(0.02, baseRate * 0.55),
    `跟注站在场应大幅收敛诈唬（基线 ${(baseRate * 100).toFixed(1)}% vs 站 ${(stationRate * 100).toFixed(1)}%）`);
  assert(baseRate > 0.05 && baseRate < 0.4, `基线诈唬率应落在合理区间（实际 ${(baseRate * 100).toFixed(1)}%）`);
  console.log(`  画像生效: 诈唬率 基线 ${(baseRate * 100).toFixed(1)}% → 对跟注站 ${(stationRate * 100).toFixed(1)}%`);
}

// ── 传入画像时决策仍合法（不抛异常、不越界）──
{
  const reads = new Map([
    ['对手A', { hands: 12, vpip: 2, aggr: 6, calls: 1 }],   // 紧凶
    ['对手B', { hands: 12, vpip: 10, aggr: 1, calls: 8 }],  // 松弱
  ]);
  let bad = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const hole = [(i * 7) % 52, (i * 11 + 3) % 52];
    if (hole[0] === hole[1]) hole[1] = (hole[1] + 1) % 52;
    const hand = dryCheckSpot(hole);
    const o = hand.options(hand.players[0]);
    const d = botDecide(hand.players[0], hand, reads);
    n++;
    const okType = ['fold', 'check', 'call', 'raise'].includes(d.type);
    const okRaise = d.type !== 'raise' || (d.amount >= Math.min(o.minRaiseTo, o.maxRaiseTo) && d.amount <= o.maxRaiseTo);
    const okCheck = d.type !== 'check' || o.canCheck;
    if (!okType || !okRaise || !okCheck) { bad++; }
  }
  assert(bad === 0, `带画像决策 ${n} 次中 ${bad} 次非法`);
  console.log(`  带画像决策合法性: ${n} 次全部合法`);
}

console.log(fails === 0 ? 'bot 回归全部通过 ✓' : `bot 回归有 ${fails} 项失败 ✗`);
process.exit(fails === 0 ? 0 : 1);
