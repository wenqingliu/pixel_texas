// 成就定义 —— 服务端与浏览器共用
// 服务端：每手 hand_stats 后用 check(d, st, bb) 判定新解锁（d = 本手数据，st = 档案统计，bb = 本手大盲注）
// 客户端：个人中心成就墙用 icon/name/desc 渲染，未解锁灰显
export const ACHIEVEMENTS = [
  { id: 'first_hand', icon: '🎴', name: '初出茅庐', desc: '完成第一手牌', check: (d, st) => st.hands >= 1 },
  { id: 'royal_flush', icon: '👑', name: '皇家时刻', desc: '摊出皇家同花顺', check: (d) => d.bestScore != null && (d.bestScore >> 20) === 8 && ((d.bestScore >> 16) & 15) === 12 },
  { id: 'straight_flush', icon: '🌊', name: '顺水行舟', desc: '摊出同花顺', check: (d) => d.bestScore != null && (d.bestScore >> 20) === 8 },
  { id: 'quads', icon: '💎', name: '四条真身', desc: '摊出四条', check: (d) => d.bestScore != null && (d.bestScore >> 20) === 7 },
  { id: 'winner_100bb', icon: '🐋', name: '大口吃鱼', desc: '单手净赢 ≥100BB', check: (d, st, bb) => !!bb && d.net >= 100 * bb },
  { id: 'aggr_win', icon: '🔥', name: '烈焰攻势', desc: '一手 4+ 次加注并赢到摊牌', check: (d) => d.aggr >= 4 && d.won && d.showdown },
  { id: 'hands_100', icon: '💯', name: '百手老将', desc: '累计 100 手', check: (d, st) => st.hands >= 100 },
  { id: 'sd_wins_20', icon: '🎯', name: '摊牌猎手', desc: '摊牌获胜 20 次', check: (d, st) => st.showdownWins >= 20 },
  { id: 'profit_100k', icon: '🏦', name: '落袋为安', desc: '累计净盈利 ≥10 万', check: (d, st) => st.net >= 100000 },
  { id: 'rock', icon: '🪨', name: '超紧岩石', desc: '连续 10 手未主动入池', check: (d, st) => (st.foldStreak || 0) >= 10 },
];

// 返回本手新解锁的成就 id 列表（调用方负责写入档案并广播）
export function newlyUnlocked(owned, d, st, bb) {
  return ACHIEVEMENTS.filter(a => !owned[a.id] && a.check(d, st, bb)).map(a => a.id);
}
