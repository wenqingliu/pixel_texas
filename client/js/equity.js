// 浏览器端蒙特卡洛胜率。打分与服务端共用 shared/evaluator.js（由服务器托管在 /shared/）
// 牌编码：rank = c >> 2 (0=2..12=A)，suit = c & 3 (0=♠ 1=♥ 2=♦ 3=♣)
import { eval7 } from '../../shared/evaluator.js';

export { eval7, scoreName } from '../../shared/evaluator.js';

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
