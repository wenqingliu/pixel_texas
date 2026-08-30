// 浏览器端牌型评估 + 蒙特卡洛胜率（与服务端 evaluator 同一套打分打包）
// 牌编码：rank = c >> 2 (0=2..12=A)，suit = c & 3 (0=♠ 1=♥ 2=♦ 3=♣)

const pack = (cat, k1 = 0, k2 = 0, k3 = 0, k4 = 0, k5 = 0) =>
  (cat << 20) | (k1 << 16) | (k2 << 12) | (k3 << 8) | (k4 << 4) | k5;

function straightHi(mask) {
  for (let hi = 12; hi >= 4; hi--) {
    if (((mask >> (hi - 4)) & 0b11111) === 0b11111) return hi;
  }
  if ((mask & 0b1000000001111) === 0b1000000001111) return 3;
  return -1;
}

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
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const sfHi = straightHi(suitMask[s]);
      if (sfHi >= 0) return pack(8, sfHi);
      const ks = [];
      for (let r = 12; r >= 0 && ks.length < 5; r--) if (suitMask[s] & (1 << r)) ks.push(r);
      return pack(5, ks[0], ks[1], ks[2], ks[3], ks[4]);
    }
  }
  let quad = -1, trip = -1;
  const pairs = [];
  let high0 = -1, high1 = -1;
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
  const ks = [];
  for (let r = 12; r >= 0 && ks.length < 5; r--) if (_cnt[r] > 0) ks.push(r);
  return pack(0, ks[0], ks[1], ks[2], ks[3], ks[4]);
}

// 我对 nOpp 个随机对手的蒙卡胜率（sims 次抽样）
export function equity(hole, board, nOpp, sims = 600) {
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
    else if (my === best) tieShare += 1 / (ties + 1);
  }
  return (win + tieShare) / sims;
}

// 牌型分数 → 中文名（与服务端 evaluator 同规则）
const RC = '23456789TJQKA';
export function scoreName(score) {
  const cat = score >> 20;
  const k1 = (score >> 16) & 15, k2 = (score >> 12) & 15;
  const R = r => RC[r] === 'T' ? '10' : RC[r];
  switch (cat) {
    case 8: return k1 === 12 ? '皇家同花顺' : R(k1) + ' 高同花顺';
    case 7: return '四条 ' + R(k1);
    case 6: return '葫芦（' + R(k1) + ' 带 ' + R(k2) + '）';
    case 5: return '同花';
    case 4: return R(k1) + ' 高顺子';
    case 3: return '三条 ' + R(k1);
    case 2: return '两对（' + R(k1) + ' 与 ' + R(k2) + '）';
    case 1: return '一对 ' + R(k1);
    default: return R(k1) + ' 高牌';
  }
}
