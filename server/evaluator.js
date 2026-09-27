// 服务端评估器：打分核心与浏览器共用 shared/evaluator.js（单一实现，两端同源）
// 本文件只补上服务端专属的加密安全洗牌
import crypto from 'node:crypto';

export * from '../shared/evaluator.js';

// 加密安全洗牌（Fisher-Yates）
export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
