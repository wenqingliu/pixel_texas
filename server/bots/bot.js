// 机器人 AI：休闲 / 普通 / 大师 三档
// 核心：蒙特卡洛胜率（复用 eval7），按档位加不同风格的决策逻辑
import { eval7 } from '../evaluator.js';

export const BOT_LEVELS = ['easy', 'normal', 'hard'];
export const LEVEL_NAMES = { easy: '休闲', normal: '普通', hard: '大师' };

export const BOT_NAMES = [
  '像素老K', '赛博拖鞋', '霓虹蛙', '土豆矿工', '磁场浪人', '8比特', '咖啡因子',
  '番茄酱', '弹簧腿', '老歪', '芯片侠', '暴走像素', '低频闪电', '翻牌侠',
  '德州小丑', '泡面头', '火箭龟', '像素猫', '噪声鼓手', '橡皮鸭',
];

const SIMS = { easy: 150, normal: 500, hard: 1200 };

// 蒙特卡洛：对 nOpp 个随机对手的胜率
export function equity(hole, board, nOpp, sims) {
  const known = new Set([...hole, ...board]);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) deck.push(c);
  const need = 5 - board.length;
  const full = board.slice();
  let win = 0, tieShare = 0;

  for (let s = 0; s < sims; s++) {
    const m = need + nOpp * 2;
    for (let i = 0; i < m; i++) {
      const j = i + ((Math.random() * (deck.length - i)) | 0);
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    full.length = board.length;
    for (let i = 0; i < need; i++) full.push(deck[i]);
    const my = eval7([hole[0], hole[1], full[0], full[1], full[2], full[3], full[4]]);
    let best = -1, ties = 1;
    for (let o = 0; o < nOpp; o++) {
      const sc = eval7([deck[need + o * 2], deck[need + o * 2 + 1], full[0], full[1], full[2], full[3], full[4]]);
      if (sc > best) { best = sc; ties = 1; }
      else if (sc === best) ties++;
    }
    if (my > best) win++;
    else if (my === best) tieShare += 1 / (ties + 1); // ties 为平分对手数，份额含自己
  }
  return (win + tieShare) / sims;
}

// 翻牌前粗糙牌力（0-1 归一），休闲档专用
function chen(hole) {
  const r = c => c >> 2;
  const [a, b] = [Math.max(r(hole[0]), r(hole[1])), Math.min(r(hole[0]), r(hole[1]))];
  const pts = [10, 8, 7, 6]; // A K Q J
  let v = a >= 12 ? 10 : a >= 9 ? pts[12 - a] : (a + 2) / 2;
  if (a === b) return Math.min(1, Math.max(v * 2, 5) / 15);
  const suited = (hole[0] & 3) === (hole[1] & 3);
  const gap = a - b - 1;
  const pen = gap === 0 ? 0 : gap === 1 ? -1 : gap === 2 ? -2 : gap === 3 ? -4 : -5;
  if (gap <= 1 && a < 11) v += 1;
  if (suited) v += 2;
  v = Math.max(0, v + pen);
  return Math.min(1, v / 15);
}

// 公共牌纹理：0 干燥 ~ 1 湿润（同花/连牌潜力）
function boardWetness(board) {
  if (board.length === 0) return 0.5;
  const ranks = board.map(c => c >> 2);
  const suits = board.map(c => c & 3);
  let wet = 0;
  const suitCnt = [0, 0, 0, 0];
  for (const s of suits) suitCnt[s]++;
  if (Math.max(...suitCnt) >= 3) wet += 0.4;
  const sr = [...new Set(ranks)].sort((x, y) => x - y);
  for (let i = 0; i < sr.length - 1; i++) if (sr[i + 1] - sr[i] === 1) { wet += 0.25; break; }
  if (new Set(ranks).size < ranks.length) wet += 0.15; // 有对子面
  if (Math.max(...ranks) >= 10) wet += 0.1; // 高牌面
  return Math.min(1, wet);
}

/**
 * 机器人决策入口
 * @param p 参与者（含 cards/chips/level）
 * @param hand Hand 实例
 * @returns {type, amount?}
 */
export function botDecide(p, hand) {
  const o = hand.options(p);
  const street = hand.street;
  const nAlive = hand.alive().length;
  const toCall = o.canCall ? o.callAmount : 0;
  const pot = o.pot;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const level = p.level || 'normal';
  const bb = hand.bb;
  const stackBB = p.chips / bb;
  const r = Math.random();

  const sims = SIMS[level];
  const nOpp = Math.max(1, nAlive - 1);
  let eq;

  if (street === 'preflop' && level === 'easy') {
    eq = chen(p.cards) * 0.6 + 0.2; // 粗略映射到 0.2-0.8 区间
  } else {
    eq = equity(p.cards, hand.board, nOpp, sims);
  }
  // 期望份额：eq * nAlive > 1 即高于平均水平
  const edge = eq * nAlive;

  // 所有档位通用：免费牌永远看
  if (toCall === 0 && !o.canRaise) return { type: 'check' };

  const raiseTo = (x) => {
    let to = Math.round(x);
    to = Math.max(to, o.minRaiseTo);
    to = Math.min(to, o.maxRaiseTo);
    if (to >= o.maxRaiseTo * 0.9) return { type: 'raise', amount: o.maxRaiseTo }; // 接近全下就直接推
    return { type: 'raise', amount: to };
  };

  // ── 休闲：松且被动，爱跟注，几乎不弃大牌 ───────────
  if (level === 'easy') {
    if (toCall === 0) {
      if (eq > 0.62 && r < 0.5) return raiseTo(Math.max(bb * 2, pot * 0.5));
      if (r < 0.06) return raiseTo(Math.max(bb * 2, pot * 0.45)); // 无脑小诈唬
      return { type: 'check' };
    }
    if (eq > 0.72 && r < 0.25) return raiseTo(pot * 0.7);
    if (eq > 0.4) return { type: 'call' };
    if (toCall <= bb * 2 && r < 0.55) return { type: 'call' }; // 跟注站
    if (r < 0.08) return { type: 'call' };                     // 偶尔迷之跟注
    return { type: 'fold' };
  }

  // ── 普通：胜率 + 底池赔率 + 位置，偶尔诈唬 ─────────
  if (level === 'normal') {
    const latePos = isLate(p, hand);
    const adj = latePos ? 0.08 : 0;
    if (toCall === 0) {
      if (edge > 1.5 && r < 0.75) return raiseTo(Math.max(bb * 2.5, pot * (0.5 + eq * 0.35)));
      if (edge < 0.85 && r < 0.1 && nAlive <= 4) return raiseTo(Math.max(bb * 2.5, pot * 0.55)); // 诈唬
      return { type: 'check' };
    }
    if (stackBB < 12 && edge > 1.45) return raiseTo(o.maxRaiseTo); // 短码全下
    if (edge > 1.9 && r < 0.6) return raiseTo(Math.max(o.minRaiseTo * 1.2, pot * 0.7));
    if (edge > 1 + potOdds * 0.9) return { type: 'call' };
    if (r < 0.04 && toCall <= bb * 3) return { type: 'call' }; // 偶尔飘浮跟注
    return { type: 'fold' };
  }

  // ── 大师：尺度随胜率、牌面纹理诈唬、反被动、短码推弃 ──
  // 短码推弃模式
  if (stackBB < 14 && (street === 'preflop' || eq > 0.45)) {
    const shoveThresh = street === 'preflop' ? 1.38 + (stackBB > 8 ? 0.12 : 0) : 1.3;
    if (edge > shoveThresh) return raiseTo(o.maxRaiseTo);
    if (toCall === 0 && edge > 1.15 && r < 0.5) return raiseTo(o.maxRaiseTo);
    if (toCall > 0) {
      if (edge > 1 + potOdds + 0.05) return { type: 'call' };
      return { type: 'fold' };
    }
    return { type: 'check' };
  }

  const wet = boardWetness(hand.board);
  const multiway = nAlive >= 4;

  if (toCall === 0) {
    // 价值下注
    if (edge > 2.4 && r < 0.8) return raiseTo(Math.max(bb * 3, pot * (eq > 0.85 && r < 0.4 ? 0.5 : 0.75))); // 大牌偶尔慢打半池
    if (edge > 1.6 && r < 0.72) return raiseTo(Math.max(bb * 2.5, pot * 0.66));
    // 半诈唬 / 诈唬：少人池 + 干燥牌面更容易成功
    const bluffFreq = (wet < 0.35 ? 0.2 : 0.1) * (multiway ? 0.4 : 1);
    if (edge < 1.1 && r < bluffFreq) return raiseTo(Math.max(bb * 2.5, pot * 0.6));
    if (eq > 0.42 && eq < 0.55 && r < 0.5 && !multiway) return raiseTo(Math.max(bb * 2.5, pot * 0.55)); // 半诈唬
    return { type: 'check' };
  }

  // 面对下注
  if (edge > 2.3 && r < 0.55) return raiseTo(Math.max(o.minRaiseTo, pot * 0.8)); // 强牌再加注
  // 底池赔率（大师加一点隐含赔率余量）
  const implied = wet > 0.5 && eq > 0.35 && eq < 0.55 ? 0.85 : 1.05; // 听牌给隐含赔率
  if (edge > 1 + potOdds * implied) {
    if (r < 0.12 && eq > 0.6 && o.canRaise) return raiseTo(Math.max(o.minRaiseTo, pot * 0.6)); // 偶尔加注保护
    return { type: 'call' };
  }
  if (toCall <= bb && r < 0.5) return { type: 'call' }; // 便宜就跟到底
  return { type: 'fold' };
}

function isLate(p, hand) {
  const seats = hand._order.map(x => x.seat);
  const i = seats.indexOf(p.seat);
  const b = seats.indexOf(hand.button);
  const dist = (i - b + seats.length) % seats.length;
  return dist >= seats.length - 3; // 按钮及其前两位
}
