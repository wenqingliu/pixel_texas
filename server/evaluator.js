// 牌型评估器
// 牌的编码：整数 0..51。rank = c >> 2 (0=2 ... 12=A)，suit = c & 3 (0=♠ 1=♥ 2=♦ 3=♣)

import crypto from 'node:crypto';

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = '♠♥♦♣';
export const SUIT_NAMES = ['黑桃', '红桃', '方块', '梅花'];

export function cardStr(c) { return RANK_CHARS[c >> 2] + SUIT_CHARS[c & 3]; }
export function rankChar(c) { return RANK_CHARS[c >> 2]; }
export function rankOf(c) { return c >> 2; }
export function suitOf(c) { return c & 3; }

export function newDeck() {
  const d = new Array(52);
  for (let i = 0; i < 52; i++) d[i] = i;
  return d;
}

// 加密安全洗牌（Fisher-Yates）
export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ── 牌型分数 ─────────────────────────────────────────────
// 类别: 8同花顺(含皇家) 7四条 6葫芦 5同花 4顺子 3三条 2两对 1一对 0高牌
// 打包: (cat<<20) | (k1<<16) | (k2<<12) | (k3<<8) | (k4<<4) | k5，可直接比较大小
const pack = (cat, k1 = 0, k2 = 0, k3 = 0, k4 = 0, k5 = 0) =>
  (cat << 20) | (k1 << 16) | (k2 << 12) | (k3 << 8) | (k4 << 4) | k5;

export const CATEGORIES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

// mask 中是否存在顺子，返回最高牌 rank（A 高顺子=12，A2345=3），无则 -1
function straightHi(mask) {
  for (let hi = 12; hi >= 4; hi--) {
    if (((mask >> (hi - 4)) & 0b11111) === 0b11111) return hi;
  }
  // A2345: A(12) 5(3) 4(2) 3(1) 2(0)
  if ((mask & 0b1000000001111) === 0b1000000001111) return 3;
  return -1;
}

// 5 张牌评分（参考实现，测试用）
export function eval5(cards) {
  const cnt = new Array(13).fill(0);
  const suitCnt = [0, 0, 0, 0];
  for (const c of cards) { cnt[c >> 2]++; suitCnt[c & 3]++; }
  const isFlush = suitCnt.some(n => n === 5);
  // 按 (数量降序, rank 降序) 排列的 rank 列表
  const byRank = [];
  for (let r = 12; r >= 0; r--) if (cnt[r] > 0) byRank.push({ r, n: cnt[r] });
  byRank.sort((a, b) => b.n - a.n || b.r - a.r);
  const ranks = byRank.map(x => x.r);

  const mask = cnt.reduce((m, n, r) => n > 0 ? m | (1 << r) : m, 0);
  const sh = straightHi(mask);

  if (isFlush && sh >= 0) return pack(8, sh);
  if (byRank[0].n === 4) return pack(7, byRank[0].r, byRank[1].r);
  if (byRank[0].n === 3 && byRank[1].n === 2) return pack(6, byRank[0].r, byRank[1].r);
  if (isFlush) return pack(5, ...ranks);
  if (sh >= 0) return pack(4, sh);
  if (byRank[0].n === 3) return pack(3, byRank[0].r, byRank[1].r, byRank[2].r);
  if (byRank[0].n === 2 && byRank[1].n === 2) return pack(2, byRank[0].r, byRank[1].r, byRank[2].r);
  if (byRank[0].n === 2) return pack(1, byRank[0].r, byRank[1].r, byRank[2].r, byRank[3].r);
  return pack(0, ...ranks);
}

// 7 张牌直接评估（性能路径，机器人蒙卡也用它）
const _cnt = new Array(13);
export function eval7(cards) {
  _cnt.fill(0);
  const suitCnt = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i], r = c >> 2, s = c & 3;
    _cnt[r]++; suitCnt[s]++; mask |= (1 << r); suitMask[s] |= (1 << r);
  }
  // 同花（7 张里若出现同花则不可能有四条/葫芦，可提前返回）
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const sfHi = straightHi(suitMask[s]);
      if (sfHi >= 0) return pack(8, sfHi);
      // 取该花色最大的 5 张
      const ks = [];
      for (let r = 12; r >= 0 && ks.length < 5; r--) if (suitMask[s] & (1 << r)) ks.push(r);
      return pack(5, ks[0], ks[1], ks[2], ks[3], ks[4]);
    }
  }
  let quad = -1, trip = -1;
  const pairs = [];
  let high0 = -1, high1 = -1; // 最大的两个不成对 rank
  for (let r = 12; r >= 0; r--) {
    const n = _cnt[r];
    if (n === 0) continue;
    if (n === 4) quad = r;
    else if (n === 3) { if (trip < 0) trip = r; else pairs.push(r); }
    else if (n === 2) pairs.push(r);
    else { if (high0 < 0) high0 = r; else if (high1 < 0) high1 = r; }
  }
  if (quad >= 0) {
    for (let r = 12; r >= 0; r--) if (_cnt[r] > 0 && r !== quad) return pack(7, quad, r);
  }
  if (trip >= 0 && pairs.length > 0) return pack(6, trip, pairs[0]);
  const sh = straightHi(mask);
  if (sh >= 0) return pack(4, sh);
  if (trip >= 0) {
    const ks = [];
    for (let r = 12; r >= 0 && ks.length < 2; r--) if (_cnt[r] > 0 && r !== trip) ks.push(r);
    return pack(3, trip, ks[0], ks[1]);
  }
  if (pairs.length >= 2) {
    let k = -1;
    for (let r = 12; r >= 0; r--) if (_cnt[r] > 0 && r !== pairs[0] && r !== pairs[1]) { k = r; break; }
    return pack(2, pairs[0], pairs[1], k);
  }
  if (pairs.length === 1) {
    const ks = [];
    for (let r = 12; r >= 0 && ks.length < 3; r--) if (_cnt[r] === 1) ks.push(r);
    return pack(1, pairs[0], ks[0], ks[1], ks[2]);
  }
  // 纯高牌
  const ks = [];
  for (let r = 12; r >= 0 && ks.length < 5; r--) if (_cnt[r] > 0) ks.push(r);
  return pack(0, ks[0], ks[1], ks[2], ks[3], ks[4]);
}

// 中文牌型名（含关键牌信息，用于结算展示）
export function scoreName(score) {
  const cat = score >> 20;
  const k1 = (score >> 16) & 15, k2 = (score >> 12) & 15;
  const R = r => RANK_CHARS[r] === 'T' ? '10' : RANK_CHARS[r];
  switch (cat) {
    case 8: return k1 === 12 ? '皇家同花顺' : `${R(k1)} 高同花顺`;
    case 7: return `四条 ${R(k1)}`;
    case 6: return `葫芦（${R(k1)} 带 ${R(k2)}）`;
    case 5: return '同花';
    case 4: return `${R(k1)} 高顺子`;
    case 3: return `三条 ${R(k1)}`;
    case 2: return `两对（${R(k1)} 与 ${R(k2)}）`;
    case 1: return `一对 ${R(k1)}`;
    default: return `${R(k1)} 高牌`;
  }
}

// 便捷：7 张牌的 {score, name}
export function evaluate7(cards7) {
  const score = eval7(cards7);
  return { score, name: scoreName(score) };
}

// 7 张中选出成牌的 5 张（摊牌高亮用，一次调用开销可忽略）
export function best5of7(cards7) {
  let best = -1, combo = null;
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++) {
            const cs = [cards7[a], cards7[b], cards7[c], cards7[d], cards7[e]];
            const s = eval5(cs);
            if (s > best) { best = s; combo = cs; }
          }
  return { score: best, cards: combo };
}
