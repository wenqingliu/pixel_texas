// 渲染共享核心：动画状态、下注显示模型、背景、Toast、连接遮罩
// 菜单（render-menu）/ 牌桌（render-table）/ 面板（render-panels）都从这里取共享状态
import { drawPixelText, FX, ease } from './fx.js';
import { getTheme } from './theme.js';
import { SUITS } from './cards.js';

export const W = 960, H = 540;

// main.js → render 单向数据桥（胜率 / 行动倒计时）
export const renderState = { winRate: null, remain: 0, total: 0, handName: null };

// 渲染模块内部动画状态
export const anim = {
  handStartT: -99,    // 本手发牌动画起始时间
  lastHandNo: 0,
  holeAnimT: 0,
  holeFlipStart: 0,   // 手牌翻面起始时间
  boardPrev: 0,       // 上次已见公共牌张数
  boardSeen: 0,       // 当前已见公共牌张数
  boardAnimT: 1,
  boardFlip: [],      // 公共牌逐张翻面起始时间
  seatFlip: {},       // 座位摊牌翻面起始时间
  seatTags: {},       // 座位牌型标签 {name, t}
  emotes: {},         // 座位表情气泡 {emoji, t}
  rabbitBoard: null,  // 兔猎展示的公牌
  winTag: null,       // 赢家标签飞行 {seat, name, flyAt}
  displayPot: 0,
  potPulse: 0,
  panelShown: false,
  panelAt: 0,
  resultsAt: 0,
  results: null,
  raiseVal: null,
  promptKey: '',
  bets: {},            // seat → 显示中的本街下注额
  boardHoldFrom: 0,
};

export function notifyDeal() { anim.handStartT = FX.t; }
export function notifyHole() { anim.holeAnimT = 0; anim.holeFlipStart = FX.t + 0.3; }
export function notifyBoard(count) {
  const from = anim.boardHoldFrom || 0;
  for (let i = from; i < count; i++) {
    anim.boardFlip[i] = FX.t + 0.1 + (i - from) * 0.13; // 逐张节奏翻开
  }
  anim.boardHoldFrom = count;
  anim.boardSeen = Math.max(anim.boardSeen, count);
  anim.boardAnimT = 0;
}
export function addBet(seat, v) {
  anim.bets[seat] = (anim.bets[seat] || 0) + v;
  if (anim.bets[seat] <= 0) delete anim.bets[seat];
}
export function clearBets() { anim.bets = {}; }
export function syncBets(snap) {
  anim.bets = {};
  if (snap && snap.seats) for (const s2 of snap.seats) if (!s2.empty && s2.bet > 0) anim.bets[s2.seat] = s2.bet;
}
export function displayBets() {
  return Object.entries(anim.bets).map(([k, v]) => ({ seat: Number(k), amount: v }));
}
export function notifyBoardHold(count) {
  for (let i = anim.boardSeen; i < count; i++) anim.boardFlip[i] = Number.POSITIVE_INFINITY;
  anim.boardHoldFrom = anim.boardSeen;
  anim.boardSeen = count;
}
export function notifyEmote(seat, emoji) { anim.emotes[seat] = { emoji, t: FX.t }; }
export function notifyRabbit(cards) {
  anim.rabbitBoard = cards;
  for (let i = anim.boardSeen; i < cards.length; i++) {
    anim.boardFlip[i] = FX.t + 0.1 + (i - anim.boardSeen) * 0.13;
  }
  anim.boardSeen = Math.max(anim.boardSeen, cards.length);
}
export function notifyReveal(seat, name) {
  anim.seatFlip[seat] = FX.t;
  if (name) anim.seatTags[seat] = { name, t: FX.t + 0.15 };
}
export function notifyShowdown(results) {
  anim.results = results;
  anim.resultsAt = FX.t;
  // 赢家标签：先在座位弹出，稍后飞往公共牌下方与公牌协同展示
  const win = (results.results || []).filter(r => r.name).sort((a, b) => b.win - a.win)[0];
  anim.winTag = win ? { seat: win.seat, name: win.name, flyAt: FX.t + 1.35 } : null;
}
export function resetHandAnim() {
  anim.handStartT = -99;
  anim.boardPrev = 0;
  anim.boardSeen = 0;
  anim.boardAnimT = 1;
  anim.boardFlip = [];
  anim.seatFlip = {};
  anim.seatTags = {};
  anim.winTag = null;
  anim.bets = {};
  anim.boardHoldFrom = 0;
  anim.holeAnimT = 1;
  anim.holeFlipStart = 0;
  anim.results = null;
  anim.displayPot = 0;
}

// ── 背景 ────────────────────────────────────────────
let bgPattern = null;
let bgPatternId = '';
// 漂浮花色粒子
const floaters = [];
function initFloaters() {
  if (floaters.length) return;
  for (let i = 0; i < 26; i++) {
    floaters.push({
      x: Math.random() * 960, y: Math.random() * 540,
      vy: -6 - Math.random() * 12, vx: (Math.random() - 0.5) * 6,
      suit: (Math.random() * 4) | 0,
      size: 10 + Math.random() * 14,
      alpha: 0.04 + Math.random() * 0.06,
      ph: Math.random() * 7,
    });
  }
}

export function drawBackdrop(ctx) {
  const th = getTheme();
  initFloaters();
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, W, H);  if (bgPatternId !== th.id) {
    bgPatternId = th.id;
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const g = c.getContext('2d');
    g.fillStyle = th.bgDot2;
    g.fillRect(0, 0, 24, 24);
    g.fillStyle = th.bgDot;
    g.fillRect(0, 0, 2, 2);
    g.fillRect(12, 12, 2, 2);
    bgPattern = ctx.createPattern(c, 'repeat');
  }
  ctx.fillStyle = bgPattern;
  ctx.fillRect(0, 0, W, H);
  // 漂浮花色（缓缓上升 + 左右摆动）
  for (const f of floaters) {
    f.y += f.vy * 0.016;
    f.x += (f.vx + Math.sin(FX.t * 0.7 + f.ph) * 8) * 0.016;
    if (f.y < -20) { f.y = H + 20; f.x = Math.random() * W; }
    if (f.x < -20) f.x = W + 20;
    if (f.x > W + 20) f.x = -20;
    ctx.globalAlpha = f.alpha * (0.75 + 0.25 * Math.sin(FX.t * 1.3 + f.ph));
    drawPixelText(ctx, SUITS[f.suit], f.x, f.y, f.size, getTheme().accent2, 'center');
  }
  ctx.globalAlpha = 1;
}

// ── Toast 弹窗（顶部滑入）──
export function drawToast(ctx, S) {
  if (!S.toast || S.toastAt == null) return;
  const t = performance.now() / 1000 - S.toastAt;
  if (t > 2.6) return;
  const kIn = Math.min(1, t / 0.28);
  const y = -46 + ease.outBack(kIn) * 52;
  let alpha = 1;
  if (t > 2.2) alpha = Math.max(0, 1 - (t - 2.2) / 0.4);
  const w = S.toast.length * 13 + 40;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(12, 9, 26, 0.94)';
  ctx.fillRect(W / 2 - w / 2, y - 15, w, 30);
  ctx.strokeStyle = '#ffd76e';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(W / 2 - w / 2 + 1, y - 14, w - 2, 28);
  drawPixelText(ctx, S.toast, W / 2, y - 6, 13, '#ffd76e', 'center');
  ctx.globalAlpha = 1;
}

// ── 连接遮罩 ────────────────────────────────────────
export function drawConnectOverlay(ctx, msg) {
  ctx.fillStyle = 'rgba(10, 8, 22, 0.78)';
  ctx.fillRect(0, 0, W, H);
  drawPixelText(ctx, msg || '连接服务器中…', W / 2, H / 2 - 10, 20, '#ffd76e', 'center');
}
