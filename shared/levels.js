// 单机挑战关卡定义 —— 服务端判定与客户端展示同源
// goal 类型: showdown_win_vs(对指定人格摊牌获胜 N 次) | chips(筹码达 N BB) | jackpot_win(赢下头奖手)
// rule 类型: river_preview(发牌亮河牌) | pot_lottery(底池头奖) | open_hand(周期全明手) | raise_quota(每街限一次加注)
export const LEVELS = [
  {
    id: 'l1_faces',
    chapter: '第一章 · 认清对手',
    name: '笑脸背后',
    desc: '每个机器人都会亮出性格。磐石和疯子好认，跟注站才是隐形杀手——别诈唬他，用大牌收价值。',
    settings: { maxSeats: 4, sb: 5, bb: 10, buyIn: 2000, botsFill: true, botLevel: 'easy', mode: 'cash' },
    personas: ['station'],
    rule: null,
    goal: { type: 'showdown_win_vs', persona: 'station', target: 3, text: '对跟注站赢下 3 次摊牌' },
  },
  {
    id: 'l2_river',
    chapter: '第二章 · 天眼',
    name: '河牌预览',
    desc: '每手牌发牌时，未来的河牌都会向你亮出。信息就是筹码，用它反推对手的听牌。',
    settings: { maxSeats: 4, sb: 10, bb: 20, buyIn: 2000, botsFill: true, botLevel: 'normal', mode: 'cash' },
    rule: 'river_preview',
    goal: { type: 'chips', bb: 300, text: '把筹码打到 300BB' },
  },
  {
    id: 'l3_lottery',
    chapter: '第二章 · 天眼',
    name: '底池彩票',
    desc: '开局埋了一个头奖手（10~20 手之间），每过一手头奖涨 2BB。赢下头奖手，通吃奖池。',
    settings: { maxSeats: 4, sb: 10, bb: 20, buyIn: 2000, botsFill: true, botLevel: 'normal', mode: 'cash' },
    rule: 'pot_lottery',
    goal: { type: 'jackpot_win', text: '赢下头奖手' },
  },
  {
    id: 'l4_open',
    chapter: '第三章 · 明牌局',
    name: '玻璃牌桌',
    desc: '每隔 4 手，全场底牌亮明打一手。没有偷盲，没有运气遮掩，比的是纯决策。',
    settings: { maxSeats: 4, sb: 10, bb: 20, buyIn: 2000, botsFill: true, botLevel: 'normal', mode: 'cash' },
    rule: 'open_hand',
    goal: { type: 'chips', bb: 250, text: '把筹码打到 250BB' },
  },
  {
    id: 'l5_boss',
    chapter: '第三章 · 明牌局',
    name: '巅峰对决',
    desc: '大师档登场，且每人每条街只能加注一次——加注成了稀缺武器。开局前三选一挑一张技能牌。',
    settings: { maxSeats: 3, sb: 25, bb: 50, buyIn: 5000, botsFill: true, botLevel: 'hard', mode: 'cash' },
    rule: 'raise_quota',
    skillOffer: true,
    goal: { type: 'chips', bb: 400, text: '把筹码打到 400BB' },
  },
];

// 技能牌（构筑层试点）
export const SKILL_CARDS = [
  { id: 'fold_refund', icon: '🛡️', name: '退款保险', desc: '翻牌前弃牌时，返还你本手已投入的盲注' },
  { id: 'split_bias', icon: '⚖️', name: '平分优势', desc: '摊牌平分底池时，奇数筹码归你' },
  { id: 'peek_card', icon: '👁️', name: '天眼窥牌', desc: '每手牌偷看一张对手的底牌' },
];

// bot 人格（挑战关卡里亮给玩家的性格卡）
export const PERSONA_META = {
  station: { tag: '跟注站', desc: '几乎从不弃牌——别诈唬，用大牌收价值' },
  maniac: { tag: '疯子', desc: '什么牌都加注——埋伏他一次收个够' },
  rock: { tag: '磐石', desc: '只玩顶级起手——他加注你就让路' },
  shark: { tag: '鲨鱼', desc: '会记牌的老手，小心' },
};

// 星级：过关 1 星；筹码/计数达到 1.5 倍与 2 倍再加一星
export function levelStars(def, ctx) {
  let ratio = 1;
  if (def.goal.type === 'chips') ratio = ctx.chipsBB / def.goal.bb;
  else if (def.goal.type === 'showdown_win_vs') ratio = ctx.count / def.goal.target;
  else if (def.goal.type === 'showdown_win') ratio = ctx.count / def.goal.target;
  return Math.min(3, 1 + (ratio >= 1.5 ? 1 : 0) + (ratio >= 2 ? 1 : 0));
}
