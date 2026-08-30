// evaluator 自测：eval7 与 eval5 暴力 21 组合互相验证 + 已知牌断言
import { eval5, eval7, newDeck, shuffle, scoreName, cardStr, evaluate7 } from '../server/evaluator.js';

let fails = 0;
function assert(cond, msg) {
  if (!cond) { fails++; console.error('  ✗ ' + msg); }
}

// 已知牌型（"AS" 形式：rank + suit，s=♠ h=♥ d=♦ c=♣）
const C = (s) => {
  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc';
  return (RANKS.indexOf(s[0]) << 2) | SUITS.indexOf(s[1].toLowerCase());
};

{
  // 皇家同花顺 = 8<<20 | A(12)<<16
  const royal = eval7(['AS', 'KS', 'QS', 'JS', 'TS', '2H', '3D'].map(C));
  assert(royal === (8 << 20 | 12 << 16), '皇家同花顺');

  const sf = eval7(['9H', '8H', '7H', '6H', '5H', 'AS', 'KD'].map(C));
  assert(sf === (8 << 20 | 7 << 16), '9 高同花顺');

  const wheelFlush = eval7(['AH', '2H', '3H', '4H', '5H', '2S', 'KD'].map(C));
  assert(wheelFlush === (8 << 20 | 3 << 16), 'A2345 同花顺');

  const quads = eval7(['AC', 'AD', 'AH', 'AS', 'KD', 'KC', '2H'].map(C));
  assert(quads === (7 << 20 | 12 << 16 | 11 << 12), '四条A带K');

  const boat = eval7(['AC', 'AD', 'AH', 'KS', 'KD', '2C', '2H'].map(C));
  assert(boat === (6 << 20 | 12 << 16 | 11 << 12), '葫芦 A 带 K');

  // 7张 AA QQ QQ→ 三条Q + 对A → 葫芦 Q 带 A
  const boat2 = eval7(['AC', 'AD', 'QH', 'QS', 'QC', 'KD', 'KC'].map(C));
  assert(boat2 === (6 << 20 | 10 << 16 | 12 << 12), '葫芦 Q 带 A');

  const flush = eval7(['AH', 'JH', '9H', '5H', '3H', '2C', '2D'].map(C));
  assert(flush === (5 << 20 | 12 << 16 | 9 << 12 | 7 << 8 | 3 << 4 | 1), 'A 高同花');

  const straight = eval7(['9C', '8D', '7H', '6S', '5C', 'AD', 'AS'].map(C));
  assert(straight === (4 << 20 | 7 << 16), '9 高顺子');

  const wheel = eval7(['AC', '2D', '3H', '4S', '5C', 'KD', 'KS'].map(C));
  assert(wheel === (4 << 20 | 3 << 16), 'A2345 顺子');

  const trips = eval7(['7C', '7D', '7H', 'KS', '3C', '9D', '2S'].map(C));
  assert(trips === (3 << 20 | 5 << 16 | 11 << 12 | 7 << 8), '三条7 带K9');

  const twoPair = eval7(['AC', 'AD', 'KS', 'KC', '5H', '3D', '2S'].map(C));
  assert(twoPair === (2 << 20 | 12 << 16 | 11 << 12 | 3 << 8), '两对AK 踢5');

  // AA KK QQ → 两对 A K 踢脚 Q
  const tp3 = eval7(['AC', 'AD', 'KS', 'KC', 'QH', 'QS', '2C'].map(C));
  assert(tp3 === (2 << 20 | 12 << 16 | 11 << 12 | 10 << 8), 'AA KK QQ → 两对 AKQ');

  const pair = eval7(['9C', '9D', 'KS', '7C', '5H', '3D', '2S'].map(C));
  assert(pair === (1 << 20 | 7 << 16 | 11 << 12 | 5 << 8 | 3 << 4), '一对9 带K75');

  const high = eval7(['AC', 'KD', '9S', '7C', '5H', '3D', '2S'].map(C));
  assert(high === (12 << 16 | 11 << 12 | 7 << 8 | 5 << 4 | 3), 'A 高牌');

  const a = eval7(['AC', 'AD', 'KS', '7C', '5H', '3D', '2S'].map(C));
  const b = eval7(['KC', 'KD', 'AS', '9C', '7H', '3D', '2S'].map(C));
  assert(a > b, `踢脚比较 AAK>KKA (${a} vs ${b})`);

  assert((eval7(['2C', '3D', '5S', '4C', '6H', 'KD', 'AS'].map(C)) >> 16 & 15) === 4, '6 高顺子');
  assert((eval7(['AH', 'KH', 'QH', 'TH', '9H', '2C', '3D'].map(C)) >> 16 & 15) === 12, 'AKQT9 同花');
}

// 随机对拍：eval7 必须等于 21 组合中 eval5 的最大值
{
  const N = 60000;
  let bad = 0;
  for (let i = 0; i < N; i++) {
    const d = shuffle(newDeck());
    const cards = d.slice(0, 7);
    let best = -1;
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 4; b++)
        for (let c = b + 1; c < 5; c++)
          for (let e = c + 1; e < 6; e++)
            for (let f = e + 1; f < 7; f++) {
              const s = eval5([cards[a], cards[b], cards[c], cards[e], cards[f]]);
              if (s > best) best = s;
            }
    const got = eval7(cards);
    if (got !== best) {
      bad++;
      if (bad <= 3) console.error('  ✗ 不一致: ' + cards.map(cardStr).join(' ') + ' eval7=' + got + ' best5=' + best);
    }
  }
  assert(bad === 0, `随机对拍 ${N} 手中有 ${bad} 个不一致`);
}

// 中文牌名冒烟
{
  assert(evaluate7(['AS', 'KS', 'QS', 'JS', 'TS', '2H', '3D'].map(C)).name === '皇家同花顺', '牌名: 皇家同花顺');
  assert(evaluate7(['AC', 'AD', 'AH', 'KS', 'KD', '2C', '3D'].map(C)).name.includes('葫芦'), '牌名: 葫芦');
  console.log('  牌名示例: ' + evaluate7(['AC', 'AD', 'AH', 'KS', 'KD', '2C', '3D'].map(C)).name
    + ' / ' + evaluate7(['9C', '8D', '7H', '6S', '5C', 'AD', '2S'].map(C)).name);
}

// 性能粗测
{
  const d = shuffle(newDeck());
  const cards = d.slice(0, 7);
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < 500000; i++) acc += eval7(cards);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  eval7 性能: 50万次 ${ms.toFixed(0)}ms（消 acc=${acc > 0 ? 1 : 0}）`);
}

console.log(fails === 0 ? 'evaluator 全部通过 ✓' : `evaluator 有 ${fails} 项失败 ✗`);
process.exit(fails === 0 ? 0 : 1);
