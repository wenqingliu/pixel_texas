// 场景渲染：主菜单 / 房间等待 / 牌桌 / 面板（即时模式 UI）
import { drawCard, drawCardBack, drawChipStack, drawChipPile, fmt, SUITS } from './cards.js';
import { button, checkbox, cycle, slider, textButton, POINTER } from './ui.js';
import { drawPixelText, drawFX, shakeOffset, FX, ease } from './fx.js';
import { Music } from './music.js';
import { getTheme, THEMES, themeIndex, setThemeId } from './theme.js';
import { drawAvatar, AVATAR_COUNT, AVATAR_COLORS, defaultAvatar } from './avatar.js';

// main.js → render.js 单向数据桥（胜率 / 行动倒计时）
export const renderState = { winRate: null, remain: 0, total: 0, handName: null };
const S_winRate = () => renderState.winRate;
const S_Avatar = (snap) => (snap && snap.you && snap.you.avatar) || defaultAvatar(snap && snap.you && snap.you.name);

const W = 960, H = 540;
const LEVEL_NAMES = { easy: '休闲', normal: '普通', hard: '大师' };

// 渲染模块内部动画状态
const anim = {
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
// ── 下注显示模型（序列器驱动：筹码落地后数字才出现）──
anim.bets = {};        // seat → 显示中的本街下注额
anim.boardHoldFrom = 0;
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


// 菜单入场动画：按延迟错落滑入
function menuK(S, delay) {
  if (S.menuEnterAt == null) return 1;
  const k = Math.max(0, Math.min(1, (performance.now() / 1000 - S.menuEnterAt - delay) / 0.4));
  return k * k * (3 - 2 * k);
}

// ── 主菜单 ──────────────────────────────────────────
function titleWobble(t) { return Math.sin(t * 2.2) * 3; }

export function drawMenu(ctx, S, act) {
  drawBackdrop(ctx);
  const th = getTheme();

  // 标题（逐字弹跳）
  const title = 'PIXEL TEXAS';
  const size = 52;
  ctx.font = `${size}px 'FusionPixel','Microsoft YaHei',sans-serif`;
  let totalW = 0;
  const widths = [...title].map(ch => { const w = ctx.measureText(ch).width; totalW += w; return w; });
  let x = W / 2 - totalW / 2;
  [...title].forEach((ch, i) => {
    const dy = Math.sin(FX.t * 3 + i * 0.55) * 4 + titleWobble(i);
    drawPixelText(ctx, ch, x, 44 + dy, size, i % 2 ? th.accent2 : '#f4efe3', 'left', '#0c0a18');
    x += widths[i];
  });
  drawPixelText(ctx, '～ 德州像素扑克 ～', W / 2, 114, 20, th.accent, 'center');

  // 个人入口：头像 + 昵称
  const av = S.avatar || S.defaultAv || 'p1.c1';
  if (button(ctx, 'avatarBtn', 262, 186, 46, 42, '', { fill: '#181334' })) act.openProfile();
  drawAvatar(ctx, 267, 189, 36, av, { border: th.accent });
  if (textButton(ctx, 'editProfile', 316, 172, 12, '[个人中心]')) act.openProfile();

  // 主按钮列
  const bx = W / 2 - 120, bw = 240, bh = 42;
  const menuBtns = [
    ['practice', 246, '单机练习', { fill: '#7a3b12', border: th.accent, color: '#ffe3b3', size: 16 }, () => act.practice()],
    ['quick', 294, '快速匹配', { size: 16 }, () => act.quickMatch()],
    ['tourney', 342, '快速锦标赛', { fill: '#4a1f5c', border: '#c07bee', color: '#ecd1ff', size: 16 }, () => act.quickTournament()],
    ['create', 390, '创建房间', { size: 16 }, () => act.createRoom()],
    ['join', 438, '输入房间码加入', { size: 16 }, () => act.toggleJoin()],
  ];
  menuBtns.forEach(([id, by, label, opts, fn], i) => {
    const k = menuK(S, 0.12 + i * 0.06);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(-(1 - k) * 46, 0);
    if (button(ctx, id, bx, by, bw, bh, label, opts)) fn();
    ctx.restore();
  });

  if (S.joinOpen) {
    drawPixelText(ctx, '房间码', W / 2 - 150, 492, 13, '#9a92c2');
    S.dom.join.x = W / 2 - 150; S.dom.join.y = 506; S.dom.join.w = 200; S.dom.join.h = 30;
    if (button(ctx, 'joingo', W / 2 + 65, 506, 85, 30, '加入', { fill: '#1e4433', border: '#66bb6a', size: 13 })) act.joinConfirm();
  }
  // 昵称输入框位置（个人中心未开时显示）
  if (S.panel !== 'profile') {
    S.dom.name.x = 316; S.dom.name.y = 186; S.dom.name.w = 190; S.dom.name.h = 40;
  }

  // 右上：主题 + 音量 + 音乐
  drawPixelText(ctx, '主题', 810, 0, 13, '#9a92c2');
  const ti = cycle(ctx, 'theme', 810, 14, 130, '', THEMES.map(t => t.name), themeIndex());
  if (THEMES[ti] && THEMES[ti].id !== th.id) act.setTheme(THEMES[ti].id);
  drawPixelText(ctx, '音效', 810, 48, 13, '#9a92c2');
  const v = slider(ctx, 'vol', 810, 64, 130, S.volume, 0, 1);
  if (v !== S.volume) act.setVolume(v);
  drawPixelText(ctx, '音乐', 810, 88, 13, '#9a92c2');
  const mv = slider(ctx, 'mvol', 810, 104, 130, S.musicVol, 0, 1);
  if (mv !== S.musicVol) act.setMusicVolume(mv);
  drawPixelText(ctx, '曲目', 810, 128, 13, '#9a92c2');
  const trackIds = ['auto', 'neon', 'table', 'tense', 'off'];
  const trackNames = ['自动', '霓虹夜晚', '绿桌风云', '暗流涌动', '关'];
  const tci = cycle(ctx, 'track', 810, 142, 130, '', trackNames, Math.max(0, trackIds.indexOf(S.track)));
  if (trackIds[tci] !== S.track) act.setTrack(trackIds[tci]);

  // 房间列表
  drawPixelText(ctx, '▸ 房间列表', 640, 170, 16, '#f4efe3');
  if (!S.rooms.length) drawPixelText(ctx, '暂无公开房间，创建一个吧', 640, 196, 13, '#6a6484');
  const listK = menuK(S, 0.3);
  ctx.save();
  ctx.globalAlpha = listK;
  ctx.translate((1 - listK) * 40, 0);
  S.rooms.slice(0, 7).forEach((r, i) => {
    const y = 196 + i * 36;
    const tag = r.mode === 'tournament' ? '[锦标赛] ' : '';
    const label = `${tag}${r.code} · ${r.humans}人${r.playing ? ' · 对局中' : ''} · ${r.sb}/${r.bb}`;
    if (button(ctx, 'room' + r.code, 640, y, 300, 30, label, {
      size: 13, fill: '#241f42',
      border: r.mode === 'tournament' ? '#c07bee' : undefined,
    })) act.joinCode(r.code);
  });

  ctx.restore();
  drawPixelText(ctx, '和朋友局域网联机：把页面顶部地址发给对方即可', W / 2, 522, 12, '#6a6484', 'center');
}

// ── 房间等待界面 ────────────────────────────────────
export function drawRoomLobby(ctx, S, act) {
  drawBackdrop(ctx);
  const snap = S.snap;
  const st = snap.settings;

  // 顶栏
  if (button(ctx, 'leave', 16, 16, 96, 34, '← 退出房间', { size: 13 })) act.leave();
  drawPixelText(ctx, `房间码  ${snap.code}`, W / 2, 22, 26, '#ffd76e', 'center', '#0c0a18');
  if (textButton(ctx, 'copy', W / 2 + 110, 30, 13, '[复制]')) { act.copyCode(snap.code); }
  drawPixelText(ctx, `盲注 ${st.sb}/${st.bb} · 买入 ${fmt(st.buyIn)}`, W / 2, 56, 13, '#9a92c2', 'center');

  // 座位格
  const cols = Math.min(3, st.maxSeats);
  const cellW = 190, cellH = 64;
  const gx = W / 2 - (cols * (cellW + 14) - 14) / 2;
  const gy = 96;
  snap.seats.forEach((s, i) => {
    const cx = gx + (i % cols) * (cellW + 14);
    const cy = gy + Math.floor(i / cols) * (cellH + 12);
    const filled = !s.empty;
    const ctx2 = ctx;
    ctx2.save();
    ctx2.fillStyle = filled ? '#241f42' : '#1a1636';
    ctx2.fillRect(cx, cy, cellW, cellH);
    ctx2.strokeStyle = filled ? '#3a3560' : '#2a2548';
    ctx2.lineWidth = 2;
    ctx2.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      if (filled) {
        drawAvatar(ctx2, cx + 8, cy + 14, 36, s.avatar || '', { border: snap.you.seat === s.seat ? '#66bb6a' : '#3a3560' });
        drawPixelText(ctx2, s.name.slice(0, 8), cx + 52, cy + 8, 14, '#f4efe3');
        drawPixelText(ctx2, fmt(s.chips), cx + 52, cy + 34, 14, '#ffd76e');
      if (s.isBot) drawPixelText(ctx2, `机器人·${LEVEL_NAMES[s.level] || ''}`, cx + cellW - 10, cy + 10, 12, '#5c8dff', 'right');
      else if (snap.you.seat === s.seat) drawPixelText(ctx2, '（你）', cx + cellW - 10, cy + 10, 12, '#66bb6a', 'right');
      if (!s.connected) drawPixelText(ctx2, '断线', cx + cellW - 10, cy + 34, 12, '#ef5350', 'right');
      else if (s.sittingOut) drawPixelText(ctx2, '休战', cx + cellW - 10, cy + 34, 12, '#ef5350', 'right');
    } else {
      drawPixelText(ctx2, `空位 ${i + 1}`, cx + cellW / 2, cy + 22, 13, '#4a4470', 'center');
    }
    ctx2.restore();
  });

  // 房主设置面板
  const px = 24, py = gy + Math.ceil(st.maxSeats / cols) * (cellH + 12) + 8;
  if (snap.isHost) {
    drawPixelText(ctx, '▸ 房间设置（房主）', px, py, 15, '#f4efe3');
    const botsFill = checkbox(ctx, 'botsFill', px, py + 26, '机器人自动补位', st.botsFill);
    if (botsFill !== st.botsFill) act.updateSettings({ botsFill });
    const lv = cycle(ctx, 'botLevel', px, py + 56, 260, '机器人水平', ['休闲', '普通', '大师'], ['easy', 'normal', 'hard'].indexOf(st.botLevel));
    if (lv !== ['easy', 'normal', 'hard'].indexOf(st.botLevel)) act.updateSettings({ botLevel: ['easy', 'normal', 'hard'][lv] });
    const seats = cycle(ctx, 'maxSeats', px + 290, py + 56, 220, '人数上限', ['2', '3', '4', '5', '6', '7', '8', '9'], st.maxSeats - 2);
    if (seats !== st.maxSeats - 2) act.updateSettings({ maxSeats: seats + 2 });
    const blindIdx = [[5, 10], [10, 20], [25, 50], [50, 100]].findIndex(b => b[0] === st.sb && b[1] === st.bb);
    const bi = cycle(ctx, 'blinds', px, py + 88, 260, '盲注级别', ['5/10', '10/20', '25/50', '50/100'], Math.max(0, blindIdx));
    if (bi !== blindIdx && bi >= 0) { const b = [[5, 10], [10, 20], [25, 50], [50, 100]][bi]; act.updateSettings({ sb: b[0], bb: b[1] }); }
    const buyIdx = [1000, 2000, 5000, 10000].indexOf(st.buyIn);
    const bui = cycle(ctx, 'buyin', px + 290, py + 88, 220, '初始买入', ['1000', '2000', '5000', '10000'], Math.max(0, buyIdx));
    if (bui !== buyIdx && bui >= 0) act.updateSettings({ buyIn: [1000, 2000, 5000, 10000][bui] });
    // 模式与升盲间隔
    const modeIdx = st.mode === 'tournament' ? 1 : 0;
    const mi = cycle(ctx, 'mode', px, py + 120, 260, '模式', ['现金桌', '锦标赛'], modeIdx);
    if (mi !== modeIdx) act.updateSettings({ mode: mi === 1 ? 'tournament' : 'cash' });
    if (st.mode === 'tournament') {
      const beIdx = [4, 6, 8, 12].indexOf(st.blindsEvery);
      const bei = cycle(ctx, 'blindsEvery', px + 290, py + 120, 220, '升盲间隔', ['4手', '6手', '8手', '12手'], Math.max(0, beIdx));
      if (bei !== beIdx && bei >= 0) act.updateSettings({ blindsEvery: [4, 6, 8, 12][bei] });
    }
    // 行动时限
    const atIdx = [15, 30, 60].indexOf(st.actionTime || 30);
    const ati = cycle(ctx, 'actionTime', px, py + 152, 260, '行动时限', ['15秒', '30秒', '60秒'], Math.max(0, atIdx));
    if (ati !== atIdx && ati >= 0) act.updateSettings({ actionTime: [15, 30, 60][ati] });
  } else {
    drawPixelText(ctx, '等待房主开始对局…', px, py + 10, 16, '#9a92c2');
  }

  // 开始按钮
  if (snap.isHost) {
    if (button(ctx, 'start', W - 216, H - 76, 200, 56, '开始对局', { fill: '#7a3b12', border: '#ff9f43', color: '#ffe3b3', size: 22 })) act.start();
  }
  drawPixelText(ctx, '机器人会在开局时自动坐进空位；真人加入将顶替机器人', W / 2, H - 30, 12, '#6a6484', 'center');
}

// ── 牌桌 ────────────────────────────────────────────
// 座位显示位（main.js 的 seatDisplayPos 同一套几何）
// 英雄特殊：名牌紧贴牌桌下沿（cx=400, y=415, plateW=130），手牌整体在名牌右侧（cx=560）
// 行动面板在右侧 640-948 不动
const HERO_BASE = { x: 400, y: 415 };
// 自己下注位：牌桌椭圆内（桌 y=102..378），名牌正前方
const HERO_BET = { x: 400, y: 350 };
export function seatDisplayPos(snap, seat) {
  if (!snap || !snap.you || seat == null || seat < 0) return null;
  if (snap.you.seat >= 0 && seat === snap.you.seat) return { ...HERO_BASE };
  const st = snap.settings;
  const n = Math.max(2, Math.min(9, st.maxSeats));
  const seatCount = snap.seats.length;
  const dIdx = seat % seatCount;
  const a = Math.PI / 2 + dIdx * (Math.PI * 2 / n);
  return { x: 480 + 340 * 1.06 * Math.cos(a), y: 240 + 138 * 1.22 * Math.sin(a) };
}

// 下注位：朝桌心方向，避让底池文字/筹码堆区域（防止上方座位下注与底池重叠）
const POT_RECT = { l: 405, r: 555, t: 112, b: 190 }; // 底池文字+筹码堆的占用范围
export function betSpotFor(snap, seat) {
  if (snap && snap.you && snap.you.seat >= 0 && seat === snap.you.seat) {
    return { ...HERO_BET }; // 英雄下注位：手牌右侧、牌桌外
  }
  const p = seatDisplayPos(snap, seat) || { x: 480, y: 240 };
  let x = p.x + (480 - p.x) * 0.42;
  let y = p.y + (240 - p.y) * 0.42;
  if (x > POT_RECT.l && x < POT_RECT.r && y > POT_RECT.t && y < POT_RECT.b) {
    x = x < 480 ? POT_RECT.l - 26 : POT_RECT.r + 26; // 横向推到底池区域外
  }
  return { x, y };
}
export const POT_POS = { x: 480, y: 174 }; // 底池筹码堆基点（与绘制一致）

function seatPos(displayIdx, n, heroSpecial) {
  const cx = 480, cy = 240;
  const rx = 340, ry = 138;
  const a = Math.PI / 2 + displayIdx * (Math.PI * 2 / n);
  const x = cx + rx * 1.06 * Math.cos(a);
  const y = cy + ry * 1.22 * Math.sin(a);
  void heroSpecial;
  return { x, y, a };
}

export function drawTable(ctx, S, act) {
  const snap = S.snap;
  drawBackdrop(ctx);
  const sh = shakeOffset();
  ctx.save();
  ctx.translate(sh.x, sh.y);

  const st = snap.settings;
  const n = Math.max(2, Math.min(9, st.maxSeats));
  const mySeat = snap.you.seat;
  const hand = snap.hand;

  // 赢家成牌高亮集合（结算横幅期间有效）
  const highlight = new Set();
  if (anim.results && FX.t - anim.resultsAt < 4.5) {
    for (const r of anim.results.results) {
      if (r.best5) for (const c of r.best5) highlight.add(c);
    }
  }

  // 桌面（主题配色）
  const cx = 480, cy = 240, rx = 340, ry = 138;
  const th = getTheme();
  ctx.fillStyle = th.feltOuter;
  ctx.beginPath(); ctx.ellipse(cx, cy + 6, rx + 14, ry + 14, 0, 0, 7); ctx.fill();
  ctx.fillStyle = th.feltMid;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx + 10, ry + 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = th.feltInner;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fill();
  ctx.fillStyle = th.feltHi;
  ctx.beginPath(); ctx.ellipse(cx, cy - 8, rx - 20, ry - 18, 0, 0, 7); ctx.fill();
  // 中央 logo 呼吸
  ctx.globalAlpha = 0.22 + 0.12 * Math.sin(FX.t * 1.1);
  drawPixelText(ctx, 'PIXEL TEXAS', cx, cy + 58, 22, th.feltMid, 'center');
  ctx.globalAlpha = 1;

  // 像素筹码 icon（金面 + 暗边 + 中心环 + 4 方向凹槽，呼应底池筹码堆）
  function drawChipIcon(ctx, cx, cy, r) {
    ctx.save();
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.arc(cx + 1, cy + 1.5, r, 0, 7); ctx.fill();
    // 金面
    ctx.fillStyle = '#ffd76e';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    // 暗边
    ctx.strokeStyle = '#9a7726';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 中心环
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, 7); ctx.stroke();
    // 4 方向小条
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const x1 = cx + Math.cos(a) * r * 0.55;
      const y1 = cy + Math.sin(a) * r * 0.55;
      const x2 = cx + Math.cos(a) * r * 0.88;
      const y2 = cy + Math.sin(a) * r * 0.88;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.18, 0, 7); ctx.fill();
    ctx.restore();
  }

  // 底池
  const pot = hand ? hand.pot : 0;
  if (pot > anim.displayPot + 0.5) anim.potPulse = 1;
  anim.displayPot += (pot - anim.displayPot) * 0.15;
  if (Math.abs(pot - anim.displayPot) < 1) anim.displayPot = pot;
  anim.potPulse = Math.max(0, (anim.potPulse || 0) - 0.035);
  if (pot > 0) {
    const ps = 1 + (anim.potPulse || 0) * 0.22;
    ctx.save();
    ctx.translate(cx, cy - 122);
    ctx.scale(ps, ps);
    // 像素筹码 icon + "底池 X"（左 icon 右文字，整体居中；用 measureText 精准测宽）
    const potStr = fmt(Math.round(anim.displayPot));
    const textStr = `底池 ${potStr}`;
    const fs = 18, iconR = 8, gap = 6;
    // 临时设字体测文字实际宽度（与 drawPixelText 同字体）
    ctx.font = `${fs}px 'FusionPixel','Microsoft YaHei',sans-serif`;
    const textW = ctx.measureText(textStr).width;
    const totalW = textW + iconR * 2 + gap;
    const iconCx = -totalW / 2 + iconR;
    const textX = iconCx + iconR + gap;
    // 垂直对齐：文字 top baseline y=0，占 0..fs；芯片中心 y=fs/2 居中对齐
    drawChipIcon(ctx, iconCx, fs / 2, iconR);
    drawPixelText(ctx, textStr, textX, 0, fs, (anim.potPulse || 0) > 0.4 ? '#fff3c4' : '#ffd76e', 'left', '#0c0a18');
    ctx.restore();
    drawChipPile(ctx, POT_POS.x, POT_POS.y, Math.round(anim.displayPot));
  }

  // 公共牌（兔猎时手牌已结束，展示兔猎板）
  const board = (hand && hand.board.length > 0) ? hand.board : (anim.rabbitBoard || []);
  const bw = 46, bh = 64, gap = 8;
  const boardW0 = cx - (5 * bw + 4 * gap) / 2;
  anim.boardAnimT = Math.min(1, anim.boardAnimT + 0.06);
  for (let i = 0; i < 5; i++) {
    const bx = boardW0 + i * (bw + gap), by = cy - bh / 2 - 6;
    if (i < board.length) {
      // 逐张节奏翻面：从背面转到正面，伴随轻微落桌
      const fs = anim.boardFlip[i];
      let flip = 1, drop = 0;
      if (fs != null) {
        const k = Math.max(0, Math.min(1, (FX.t - fs) / 0.38));
        flip = k;
        drop = (1 - k) * -22;
      }
      const isHot = highlight.has(board[i]);
      drawCard(ctx, bx, by + drop - (isHot ? 4 : 0), bw, bh, board[i], true,
        { flip, glow: isHot ? '#ffd76e' : null });
    } else {
      ctx.strokeStyle = '#276245';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    }
  }

  // 座位
  const names = snap.seats.filter(s => !s.empty);
  const seatCount = snap.seats.length;
  const mini = seatCount >= 8;
  const plateW = mini ? 96 : 112, plateH = mini ? 40 : 46;
  const winners = winnersMap(snap);

  for (const s of snap.seats) {
    if (s.empty) continue;
    const dIdx = mySeat >= 0 ? (s.seat - mySeat + seatCount) % seatCount : s.seat % seatCount;
    if (mySeat >= 0 && dIdx === 0) continue; // 自己单独绘制
    drawSeat(ctx, s, seatPos(dIdx, n, false), { plateW, plateH, snap, hand, isWinner: winners.has(s.seat), cx, cy, act, mini, highlight });
  }

  // 底部区：自己（sittingOut 或无筹码时走 spectator，不再画名牌/手牌）
  const hero = snap.seats.find(s2 => !s2.empty && s2.seat === mySeat);
  if (hero && mySeat >= 0 && !hero.sittingOut && hero.chips > 0) {
    drawHero(ctx, hero, snap, hand, winners.has(mySeat), act, highlight);
  } else {
    drawSpectator(ctx, snap, act);
  }

  // 顶栏信息
  const bl = snap.blinds;
  const leftInfo = bl
    ? `${snap.code} · 锦标赛Lv${bl.level} ${bl.sb}/${bl.bb} · 升盲${bl.handsLeft}手 · 第${snap.handNo || 0}手`
    : `${snap.code} · ${st.sb}/${st.bb} · 第${snap.handNo || 0}手`;
  drawPixelText(ctx, leftInfo, 16, 14, 14, '#9a92c2');
  const mx = W - 16;
  if (textButton(ctx, 'leave2', mx - 52, 16, 13, '退出房间')) act.leave();
  if (textButton(ctx, 'music', mx - 122, 16, 13, Music.enabled ? '音乐:开' : '音乐:关')) act.toggleMusic();
  if (textButton(ctx, 'snd', mx - 192, 16, 13, S.volume > 0 ? '音效:开' : '音效:关')) act.setVolume(S.volume > 0 ? 0 : 0.7);
  if (textButton(ctx, 'hist', mx - 242, 16, 13, '回放')) act.openHistory();
  if (textButton(ctx, 'stats', mx - 284, 16, 13, '战绩')) act.openStats();

  // 顶栏按钮可能已离开房间（S.snap 被清空），本帧剩余部分直接收尾
  if (!S.snap) {
    ctx.restore();
    drawFX(ctx);
    return;
  }

  // 兔猎按钮（无人跟注后可看剩余公牌）
  if (snap.rabbitAvail && !hand) {
    if (button(ctx, 'rabbit', 410, 318, 140, 30, '兔猎 · 看看剩牌', { fill: '#1f3a2e', border: '#66bb6a', color: '#c8f5d0', size: 12 })) act.rabbit();
  }

  // 快捷表情按钮（自己名牌右侧）
  const EMOTES = ['👍', '😂', '😭', '🤔', '🔥', '👏'];
  EMOTES.forEach((e, i) => {
    const ex = 268 + i * 34, ey = H - 40;
    const hov = POINTER.x >= ex && POINTER.x <= ex + 30 && POINTER.y >= ey && POINTER.y <= ey + 22;
    ctx.fillStyle = hov ? '#2b2547' : 'rgba(20, 16, 43, 0.85)';
    ctx.fillRect(ex, ey, 30, 22);
    ctx.strokeStyle = hov ? th.accent : '#3a3560';
    ctx.lineWidth = 1;
    ctx.strokeRect(ex + 0.5, ey + 0.5, 29, 21);
    ctx.font = '14px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, ex + 15, ey + 12);
    if (hov && POINTER.clicked) act.emote(e);
  });

  // 行动面板
  drawActionPanel(ctx, S, act);

  // 表情气泡
  for (const key of Object.keys(anim.emotes)) {
    const seat = Number(key);
    const info = snap.seats.find(s2 => !s2.empty && s2.seat === seat);
    if (!info) continue;
    const em = anim.emotes[key];
    const age = FX.t - em.t;
    if (age > 2.6) continue;
    let bx2, by2;
    if (snap.you.seat >= 0 && seat === snap.you.seat) { bx2 = 150; by2 = 380; }
    else {
      const p2 = seatDisplayPos(snap, seat);
      bx2 = p2.y < 200 ? p2.x + 74 : p2.x;
      by2 = p2.y < 200 ? p2.y + 10 : p2.y - 84;
    }
    const pop = ease.outBack(Math.min(1, age / 0.25));
    const fade = age > 2.1 ? Math.max(0, 1 - (age - 2.1) / 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(bx2, by2);
    ctx.scale(pop, pop);
    ctx.fillStyle = '#f7f2e4';
    ctx.fillRect(-17, -16, 34, 30);
    ctx.strokeStyle = '#262238';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-16.5, -15.5, 33, 29);
    ctx.fillStyle = '#f7f2e4';
    ctx.beginPath();
    ctx.moveTo(-5, 13); ctx.lineTo(5, 13); ctx.lineTo(0, 20); ctx.closePath();
    ctx.fill();
    ctx.font = '20px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(em.emoji, 0, 1);
    ctx.restore();
  }

  // 摊牌牌型标签（自己 + 亮牌玩家，弹出在各自手牌旁）
  drawRevealTags(ctx, snap);

  // 结算横幅
  if (anim.results && FX.t - anim.resultsAt < 4.2) {
    drawResultsBanner(ctx, snap, anim.results);
  }

  // 赢家牌型标签飞往公共牌下方（与公牌协同展示，绘制在横幅之上）
  drawWinnerTagFlight(ctx, snap);

  // 锦标赛冠军横幅
  if (snap.tournamentOver) {
    drawTournamentOver(ctx, snap, act);
  }

  // 等待下一局
  if (!hand && snap.phase === 'playing' && !snap.tournamentOver) {
    if (FX.t - (anim.resultsAt || 0) > 1.5) {
      drawPixelText(ctx, '下一局即将开始…', cx, cy - 20, 18, '#f4efe3', 'center', '#0c0a18');
    }
  }

  ctx.restore();
  drawFX(ctx);
}

function winnersMap(snap) {
  const m = new Map();
  if (snap.lastResults && FX.t - anim.resultsAt < 4.2) {
    for (const r of snap.lastResults.results) m.set(r.seat, r);
  }
  return m;
}

function drawSeat(ctx, s, pos, o) {
  const { plateW, plateH, snap, hand, isWinner, cx, cy, mini, highlight } = o;
  const th = getTheme();
  const x = pos.x - plateW / 2, y = pos.y - plateH / 2;
  const avSize = mini ? 22 : 28;
  const avX = x + 4, avY = y + (mini ? 9 : 10);
  const nameX = x + avSize + 10;

  // 行动高亮
  const isActor = hand && hand.actorSeat === s.seat;
  ctx.save();
  if (isActor) {
    const pulse = 0.5 + 0.5 * Math.sin(FX.t * 7);
    // 外层呼吸光晕（金黄，亮起时更亮）
    ctx.strokeStyle = `rgba(255,215,110,${0.35 + pulse * 0.55})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(x - 6, y - 6, plateW + 12, plateH + 12);
    // 内层常亮橙框
    ctx.strokeStyle = `rgba(255,159,67,${0.75 + pulse * 0.25})`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x - 2, y - 2, plateW + 4, plateH + 4);
  }
  if (isWinner) {
    ctx.fillStyle = 'rgba(255,215,110,0.22)';
    ctx.fillRect(x - 4, y - 4, plateW + 8, plateH + 8);
    ctx.strokeStyle = '#ffd76e';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 4, y - 4, plateW + 8, plateH + 8);
    // 扫光带
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, plateW, plateH);
    ctx.clip();
    const sweep = (FX.t * 0.85 + s.seat * 0.37) % 1.5;
    const bx = x + sweep * (plateW + 70) - 35;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx + 12, y);
    ctx.lineTo(bx - 8, y + plateH);
    ctx.lineTo(bx - 20, y + plateH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = s.folded ? '#1d1936' : '#241f42';
  ctx.fillRect(x, y, plateW, plateH);
  ctx.strokeStyle = s.folded ? '#2a2548' : '#3a3560';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, plateW - 2, plateH - 2);
  ctx.globalAlpha = s.folded ? 0.55 : 1;
  // 头像
  drawAvatar(ctx, avX, avY, avSize, s.avatar || '', { border: isActor ? th.accent : '#3a3560' });
  // 状态条：名牌下方紧贴 5 像素(限条之上)，9 像素行
  // 优先级：弃牌 > 全下 > 行动中(脉冲) > 最近一次动作 > 等待(隐藏)
  // 持续到手牌结束(不随街切换)
  {
    let stLabel = null, stColor = null, stPulse = false;
    if (s.folded) { stLabel = '已弃牌'; stColor = '#6a6484'; }
    else if (s.allIn) { stLabel = '全下'; stColor = '#ef5350'; }
    else if (isActor) {
      if (s.isBot) { stLabel = '思考中…'; stColor = '#5c8dff'; stPulse = true; }
      else { stLabel = '行动中…'; stColor = '#ffd76e'; stPulse = true; }
    } else if (s.lastAction) {
      const la = s.lastAction;
      if (la.type === 'check') { stLabel = '看牌'; stColor = '#ffd76e'; }
      else if (la.type === 'call') { stLabel = `跟注 ${fmt(la.amount)}`; stColor = '#ffd76e'; }
      else if (la.type === 'raise') {
        stLabel = la.allIn ? `全下 ${fmt(la.amount)}` : `加注到 ${fmt(la.amount)}`;
        stColor = la.allIn ? '#ef5350' : '#ffd76e';
      } else if (la.type === 'fold') { stLabel = '已弃牌'; stColor = '#6a6484'; }
    }
    if (stLabel) {
      const stY = y + plateH + 5;
      const stFs = mini ? 8 : 9;
      if (stPulse) ctx.globalAlpha = 0.75 + 0.25 * Math.sin(FX.t * 7);
      drawPixelText(ctx, stLabel, x + plateW / 2, stY, stFs, stColor, 'center', '#0c0a18');
      ctx.globalAlpha = s.folded ? 0.55 : 1;
    }
  }
  // 行动时限条（人类：像素分段倒计时 / 机器人：扫描思考条）
  // 位置：状态条之下（状态条无显示时空出来贴近名牌）
  if (isActor && !s.folded) {
    const barX = x + 8, barY = y + plateH + 15, barW = plateW - 16;
    if (!s.isBot && hand && hand.deadline) {
      const total = Math.max(1, (snap.settings.actionTime || 30) * 1000);
      const remain = Math.max(0, hand.deadline - Date.now());
      drawTimeBar(ctx, barX, barY, barW, remain / total);
      const low = remain / total < 0.25;
      drawPixelText(ctx, Math.ceil(remain / 1000) + 's', barX + barW + 5, barY - 2, 11,
        low ? '#ef5350' : '#f4efe3', 'left', '#0c0a18');
    } else {
      drawThinkBar(ctx, barX, barY, barW);
    }
  }
  drawPixelText(ctx, s.name.slice(0, mini ? 4 : 6), nameX, y + 5, mini ? 12 : 13, '#f4efe3');
  drawPixelText(ctx, fmt(s.chips), nameX, y + (mini ? 22 : 25), mini ? 12 : 14, '#ffd76e');
  if (s.allIn && !s.folded) drawPixelText(ctx, 'ALL IN', x + plateW - 6, y + (mini ? 22 : 25), 11, '#ef5350', 'right');
  if (s.eliminated) drawPixelText(ctx, '出局', x + plateW - 6, y + (mini ? 22 : 25), 11, '#ef5350', 'right');
  // 真人 HUD：VPIP 标签（GG 式数据，10 手起）
  if (!s.isBot && s.hud) {
    drawPixelText(ctx, 'V' + s.hud.vpip + '%' , x + plateW - 6, y + (mini ? 36 : 39), 9, '#7a92c2', 'right');
  }
  // 机器人徽章（头像左上角外延，蓝底 "AI" 字，少遮挡头像）
  if (s.isBot) {
    const bSize = Math.round(avSize * 0.45);
    const bx = avX - 3, by = avY - 3;
    ctx.fillStyle = '#5c8dff';
    ctx.fillRect(bx, by, bSize, bSize);
    ctx.strokeStyle = '#0c0a18';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bSize - 1, bSize - 1);
    // 字号按 bSize 自适应，居中
    const fs = bSize >= 12 ? 9 : 8;
    drawPixelText(ctx, 'AI', bx + bSize / 2, by + Math.round((bSize - fs) / 2), fs, '#ffffff', 'center', '#0c0a18');
  }
  // 本街已行动标识（绿色小勾徽章）
  if (s.inHand && !s.folded && s.acted && !isActor) {
    const bx = x + plateW - 10, by = y - 6;
    ctx.fillStyle = '#66bb6a';
    ctx.beginPath(); ctx.arc(bx, by, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1b1638'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#0d2013';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 3, by); ctx.lineTo(bx - 1, by + 2.5); ctx.lineTo(bx + 3, by - 2.5);
    ctx.stroke();
  }
  ctx.restore();

  // 迷你手牌（斜靠名牌上方）：摊牌翻面动画
  if (s.inHand) {
    const cw = mini ? 22 : 27, ch = mini ? 31 : 38;
    const cardY = y - ch - 6;
    const fs = anim.seatFlip[s.seat] || 0;
    // 发牌飞入：从牌堆位置按座位序错开
    const seatCount2 = snap.seats.length;
    const dIdx2 = snap.you.seat >= 0 ? (s.seat - snap.you.seat + seatCount2) % seatCount2 : s.seat % seatCount2;
    const dk = Math.max(0, Math.min(1, (FX.t - anim.handStartT - dIdx2 * 0.09) / 0.45));
    const de = 1 - Math.pow(1 - dk, 3);
    const deckX = 480, deckY = 180;
    // 牌 1 / 牌 2 中心对称于名牌中心(总间距 cw,无额外偏移)
    const c1cx = x + plateW / 2 - cw / 2, c2cx = x + plateW / 2 + cw / 2;
    const ccy = cardY + ch / 2;
    const c1x = deckX + (c1cx - deckX) * de, c1y = deckY + (ccy - deckY) * de;
    const c2x = deckX + (c2cx - deckX) * de, c2y = deckY + (ccy - deckY) * de;
    const dealRot = (1 - de) * 0.7;
    if (s.cards) {
      const f0 = Math.max(0, Math.min(1, (FX.t - fs) / 0.35));
      const f1 = Math.max(0, Math.min(1, (FX.t - fs - 0.09) / 0.35));
      drawCard(ctx, c1x - cw / 2, c1y - ch / 2, cw, ch, s.cards[0], true, { rot: -0.08 - dealRot, dim: s.folded, flip: f0, glow: highlight && highlight.has(s.cards[0]) ? '#ffd76e' : null });
      drawCard(ctx, c2x - cw / 2, c2y - ch / 2, cw, ch, s.cards[1], true, { rot: 0.08 + dealRot, dim: s.folded, flip: f1, glow: highlight && highlight.has(s.cards[1]) ? '#ffd76e' : null });
    } else {
      drawCardBack(ctx, c1x - cw / 2, c1y - ch / 2, cw, ch, { rot: -0.08 - dealRot, dim: s.folded });
      drawCardBack(ctx, c2x - cw / 2, c2y - ch / 2, cw, ch, { rot: 0.08 + dealRot, dim: s.folded });
    }
  }

  // 下注筹码（朝桌心）
  if (hand && s.bet > 0) {
    const shownBet = (anim.bets && anim.bets[s.seat]) || 0;
    if (shownBet > 0) {
      const bs = betSpotFor(snap, s.seat);
      drawChipStack(ctx, bs.x, bs.y, shownBet);
    }
  }

  // 庄家按钮：顶部玩家用小系数避免与底池文字重叠，其他方向保持 0.24
  if (snap.button === s.seat) {
    const r = pos.y < cy - 60 ? 0.08 : 0.24;
    const dx = pos.x + (cx - pos.x) * r, dy = pos.y + (cy - pos.y) * r;
    ctx.fillStyle = '#f4efe3';
    ctx.beginPath(); ctx.arc(dx, dy, 10, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1b1638'; ctx.lineWidth = 2; ctx.stroke();
    drawPixelText(ctx, 'D', dx, dy - 6, 12, '#1b1638', 'center');
  }
}

function drawHero(ctx, s, snap, hand, isWinner, act, highlight) {
  ctx.save();
  const th = getTheme();
  // 名牌紧贴牌桌下沿（cy=415, plateW=130），手牌整体在名牌右侧（cx=560）
  // 头像名牌左外侧；筹码堆(HERO_BET y=350)牌桌内
  const plateW = 130, plateH = 52;
  const plateX = HERO_BASE.x - plateW / 2;  // 335
  const plateY = HERO_BASE.y - plateH / 2;  // 389
  const avSize = 44;
  const avCx = plateX - 18 - avSize / 2;     // 260
  const avCy = HERO_BASE.y;                  // 415
  // 头像
  drawAvatar(ctx, avCx - avSize / 2, avCy - avSize / 2, avSize, snap.you.avatar || S_Avatar(snap), { border: isWinner ? '#ffd76e' : th.accent });

  // 名牌
  ctx.fillStyle = s.folded ? '#1d1936' : '#241f42';
  ctx.fillRect(plateX, plateY, plateW, plateH);
  ctx.strokeStyle = '#3a3560';
  ctx.lineWidth = 2;
  ctx.strokeRect(plateX + 1, plateY + 1, plateW - 2, plateH - 2);
  drawPixelText(ctx, s.name.slice(0, 6), plateX + 8, plateY + 4, 13, '#66bb6a');
  drawPixelText(ctx, fmt(s.chips), plateX + 8, plateY + 20, 14, '#ffd76e');
  // 胜率/手牌名 挤进名牌下半部（y+36, 9px 字号居中）
  const wr = S_winRate();
  if (wr != null && snap.you.cards && !s.folded) {
    const wrPct = Math.round(wr * 100);
    const col = wrPct >= 60 ? '#66bb6a' : wrPct >= 40 ? '#ffd76e' : '#ef5350';
    const label = `胜率 ${wrPct}%${renderState.handName ? ' · ' + renderState.handName : ''}`;
    drawPixelText(ctx, label, plateX + plateW / 2, plateY + 36, 9, col, 'center', '#0c0a18');
  }
  if (s.allIn && !s.folded) drawPixelText(ctx, 'ALL IN', plateX + plateW - 8, plateY + 20, 12, '#ef5350', 'right');
  if (s.sittingOut) drawPixelText(ctx, '休息中', plateX + plateW - 8, plateY + 4, 11, '#9a92c2', 'right');
  if (isWinner) {
    ctx.strokeStyle = '#ffd76e';
    ctx.lineWidth = 3;
    ctx.strokeRect(plateX - 3, plateY - 3, plateW + 6, plateH + 6);
  }

  // 大手牌（发牌滑入 + 节奏翻面）— 高瘦比例 0.66，牌间距 40（重叠 22px）
  anim.holeAnimT = Math.min(1, anim.holeAnimT + 0.05);
  const cards = snap.you.cards;
  const cyy = 421;  // chh=94 时牌顶 374（牌桌内 4px），牌底 468
  const handCx = 560;
  if (cards && cards.length === 2) {
    const cw = 62, chh = 94;  // 比例 62:94≈0.66，比标准 5:7(0.72)更高瘦
    const dk = Math.max(0, Math.min(1, (FX.t - anim.handStartT - 0.05) / 0.5));
    const de = 1 - Math.pow(1 - dk, 3);
    const deckX = 480, deckY = 180;
    const wob0 = Math.sin(FX.t * 2.4) * 0.015, wob1 = Math.sin(FX.t * 2.4 + 1) * 0.015;
    // 牌 0/1 中心间距 40（重叠 22px，标准德州客户端风）
    const cx0 = handCx - 20, cx1 = handCx + 20;
    const x0 = deckX + (cx0 - deckX) * de, y0 = deckY + (cyy - deckY) * de;
    const x1 = deckX + (cx1 - deckX) * de, y1 = deckY + (cyy + 7 - deckY) * de;
    const f0 = Math.max(0, Math.min(1, (FX.t - anim.holeFlipStart) / 0.42));
    const f1 = Math.max(0, Math.min(1, (FX.t - anim.holeFlipStart - 0.16) / 0.42));
    const g0 = highlight && highlight.has(cards[0]) ? '#ffd76e' : null;
    const g1 = highlight && highlight.has(cards[1]) ? '#ffd76e' : null;
    const sc = 0.72 + 0.28 * de;
    drawCard(ctx, x0 - cw / 2, y0 - chh / 2, cw, chh, cards[0], true, { rot: -0.5 + (0.07 + wob0) * de, scale: sc, flip: f0, glow: g0 });
    drawCard(ctx, x1 - cw / 2, y1 - chh / 2, cw, chh, cards[1], true, { rot: 0.45 - (0.06 + wob1) * de, scale: sc, flip: f1, glow: g1 });
  }

  // 自己的下注筹码（HERO_BET 牌桌内）
  const shownBet = (anim.bets && anim.bets[snap.you.seat]) || 0;
  if (shownBet > 0) {
    const bs = betSpotFor(snap, s.seat);
    drawChipStack(ctx, bs.x, bs.y, shownBet);
  }
  // 庄家按钮（名牌上沿上方 12 像素，中心对齐）
  if (snap.button === s.seat) {
    const dx = plateX + plateW / 2, dy = plateY - 12;
    ctx.fillStyle = '#f4efe3';
    ctx.beginPath(); ctx.arc(dx, dy, 10, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1b1638'; ctx.lineWidth = 2; ctx.stroke();
    drawPixelText(ctx, 'D', dx, dy - 6, 12, '#1b1638', 'center');
  }
  void act;
  ctx.restore();
}

function drawSpectator(ctx, snap, act) {
  drawPixelText(ctx, '观战中 — 等待空位…', 40, H - 70, 15, '#9a92c2');
  if (button(ctx, 'takeseat', 40, H - 52, 150, 34, '尝试入座', { size: 13 })) act.takeSeat();
  void snap;
}

// ── 行动面板 ────────────────────────────────────────
function drawActionPanel(ctx, S, act) {
  const snap = S.snap;
  const hand = snap.hand;
  const me = snap.seats.find(s => !s.empty && s.seat === snap.you.seat);
  if (!me) return;

  if (me.sittingOut || (me.chips <= 0 && !me.inHand)) {
    if (snap.settings.mode === 'tournament') {
      drawPixelText(ctx, '你已出局，等待本届结束', 720, H - 82, 15, '#ef5350');
      return;
    }
    if (me.sittingOut && me.chips > 0) {
      if (button(ctx, 'sitin', 720, H - 96, 216, 44, '回到牌局', { fill: '#1e4433', border: '#66bb6a', color: '#c8f5d0', size: 15 })) act.sitIn();
    } else if (button(ctx, 'rebuy', 720, H - 96, 216, 44, `补充筹码 ${fmt(snap.settings.buyIn)}`, { fill: '#1e4433', border: '#66bb6a', color: '#c8f5d0', size: 15 })) act.rebuy();
    return;
  }

  // 现金桌：非待行动时提供「休息一手」入口
  if (snap.settings.mode !== 'tournament' && !(hand && hand.actorSeat === snap.you.seat)) {
    if (button(ctx, 'sitout', 108, H - 56, 100, 28, '休息一手', { size: 12, fill: '#1f1b38' })) act.sitOut();
  }

  if (!S.prompt || !hand || hand.actorSeat !== snap.you.seat) {
    anim.panelShown = false;
    if (me.inHand && !me.folded) {
      drawPixelText(ctx, '等待其他玩家行动…', 790, H - 40, 13, '#6a6484', 'center');
      // 预操作快捷（未轮到自己时）：check_fold / call_any + 当前已预设状态
      const pa = S.preAction || null;
      const px2 = 640, py2 = H - 110;
      // 面板底（与主面板同款，但只一行）
      ctx.fillStyle = 'rgba(16, 12, 34, 0.78)';
      ctx.fillRect(px2 - 12, py2 - 12, 320, 60);
      ctx.strokeStyle = pa ? '#ffd76e' : '#3a3560';
      ctx.lineWidth = 2;
      ctx.strokeRect(px2 - 12, py2 - 12, 320, 60);
      drawPixelText(ctx, '预操作', px2, py2 - 4, 11, '#9ad0ff', 'left', '#0c0a18');
      // 状态标签
      const stateText = pa === 'check_fold' ? '已设:看牌/弃牌' : pa === 'call_any' ? '已设:跟到底' : '未预设';
      drawPixelText(ctx, stateText, px2 + 308, py2 - 4, 11, pa ? '#ffd76e' : '#6a6484', 'right', '#0c0a18');
      // 三个按钮
      const cfActive = pa === 'check_fold', caActive = pa === 'call_any';
      if (button(ctx, 'pre_cf', px2, py2 + 8, 96, 32, '看牌/弃牌', {
        size: 12, fill: cfActive ? '#5c4a1a' : '#1f1b38', border: cfActive ? '#ffd76e' : '#3a3560', color: cfActive ? '#fff3c4' : '#cfe1ff',
      })) act.setPreAction(cfActive ? 'clear' : 'check_fold');
      if (button(ctx, 'pre_ca', px2 + 100, py2 + 8, 96, 32, '跟到底', {
        size: 12, fill: caActive ? '#5c4a1a' : '#1f1b38', border: caActive ? '#ffd76e' : '#3a3560', color: caActive ? '#fff3c4' : '#cfe1ff',
      })) act.setPreAction(caActive ? 'clear' : 'call_any');
      if (pa && button(ctx, 'pre_clear', px2 + 200, py2 + 8, 96, 32, '清除', {
        size: 12, fill: '#2b1a2e', border: '#5c8dff', color: '#cfe1ff',
      })) act.setPreAction('clear');
    }
    return;
  }
  // 面板弹入动画
  if (!anim.panelShown) { anim.panelShown = true; anim.panelAt = FX.t; }
  const panelK = Math.min(1, (FX.t - (anim.panelAt || 0)) / 0.34);
  const panelSlide = (1 - ease.outBack(panelK)) * 150;

  const o = S.prompt.options;
  const px = 640, py = H - 118;
  ctx.save();
  ctx.translate(0, panelSlide);
  ctx.globalAlpha = Math.max(0, Math.min(1, panelK * 1.6));
  // 面板底
  ctx.fillStyle = 'rgba(16, 12, 34, 0.86)';
  ctx.fillRect(px - 12, py - 12, 320, 108);
  ctx.strokeStyle = '#3a3560';
  ctx.lineWidth = 2;
  ctx.strokeRect(px - 12, py - 12, 320, 108);

  // 行动时限条 + 大号秒数（面板顶部）
  const totalMs = Math.max(1, renderState.total || 30000);
  const remainMs = Math.max(0, renderState.remain || 0);
  drawTimeBar(ctx, px - 12, py - 30, 246, remainMs / totalMs);
  const lowTime = remainMs / totalMs < 0.25;
  drawPixelText(ctx, Math.ceil(remainMs / 1000) + 's', px + 308, py - 36, 17,
    lowTime ? (Math.sin(FX.t * 10) > 0 ? '#ef5350' : '#b73a3a') : '#f4efe3', 'right', '#0c0a18');

  // 加注滑条
  const key = `${o.minRaiseTo}|${o.maxRaiseTo}|${o.pot}`;
  if (anim.promptKey !== key) {
    anim.promptKey = key;
    anim.raiseVal = Math.min(o.maxRaiseTo, Math.max(o.minRaiseTo, snap.settings.bb * 2.5));
  }
  let rv = slider(ctx, 'raise', px + 8, py + 4, 232, anim.raiseVal, o.minRaiseTo, o.maxRaiseTo, { integer: true });
  rv = Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, rv));
  anim.raiseVal = rv;
  drawPixelText(ctx, fmt(rv), px + 250, py + 3, 12, '#ffd76e');
  // 快捷
  const quick = [
    ['2.5BB', Math.min(o.maxRaiseTo, snap.settings.bb * 2.5)],
    ['½池', Math.min(o.maxRaiseTo, Math.round(o.pot * 0.5) + (o.callAmount || 0))],
    ['满池', Math.min(o.maxRaiseTo, o.pot + (o.callAmount || 0))],
    ['全下', o.maxRaiseTo],
  ];
  quick.forEach((q, i) => {
    if (button(ctx, 'q' + i, px + 8 + i * 60, py + 24, 54, 20, q[0], { size: 11, fill: '#1f1b38' })) anim.raiseVal = Math.max(o.minRaiseTo, q[1]);
  });

  // 主按钮行
  const callLabel = !o.canCall ? '看牌' : (o.callAmount >= (me.chips || 0) ? `全下跟注 ${fmt(o.callAmount)}` : `跟注 ${fmt(o.callAmount)}`);
  if (button(ctx, 'fold', px, py + 52, 84, 44, '弃牌', { fill: '#4a1f24', border: '#ef5350', color: '#ffc9c7', size: 15 })) act.action('fold');
  if (button(ctx, 'call', px + 92, py + 52, 106, 44, callLabel, { fill: '#1e3a5f', border: '#5c8dff', color: '#cfe1ff', size: 14 })) act.action(o.canCall ? 'call' : 'check');
  const raiseDisabled = !o.canRaise;
  const isShove = rv >= o.maxRaiseTo;
  const raiseLabel = isShove ? `全下 ${fmt(o.maxRaiseTo)}` : `加注到 ${fmt(rv)}`;
  if (button(ctx, 'raise', px + 206, py + 52, 102, 44, raiseLabel, {
    fill: '#7a3b12', border: '#ff9f43', color: '#ffe3b3', size: 13, disabled: raiseDisabled,
  })) act.action('raise', rv);

  // 底池赔率提示
  if (o.canCall && o.callAmount > 0) {
    const odds = Math.round(o.callAmount / Math.max(1, o.pot + o.callAmount) * 100);
    drawPixelText(ctx, `赔率${odds}%`, px + 250, py + 20, 10, '#6a6484');
  }
  ctx.restore();
}

function drawSoundToggle(ctx, vol) {
  void ctx; void vol;
  return null; // 已并入顶栏 textButton
}

// ── 锦标赛冠军横幅 ──────────────────────────────────
function drawTournamentOver(ctx, snap, act) {
  const rank = snap.tournamentOver;
  const cx = 480, y = 96;
  const lines = ['🏆 冠军：' + (rank[0] || '-')];
  rank.slice(1, 5).forEach((n, i) => lines.push(`第${i + 2}名  ${n}`));
  const wmax = 420;
  ctx.fillStyle = 'rgba(12, 9, 26, 0.92)';
  ctx.fillRect(cx - wmax / 2, y - 16, wmax, 44 + lines.length * 24);
  ctx.strokeStyle = '#ffd76e';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - wmax / 2 + 2, y - 14, wmax - 4, 40 + lines.length * 24);
  lines.forEach((l, i) => {
    drawPixelText(ctx, l, cx, y + i * 24, i === 0 ? 20 : 14, i === 0 ? '#ffd76e' : '#f4efe3', 'center', '#0c0a18');
  });
  if (snap.isHost) {
    if (button(ctx, 'restart', cx - 100, y + 30 + lines.length * 24, 200, 46, '重新开赛', { fill: '#7a3b12', border: '#ff9f43', color: '#ffe3b3', size: 17 })) act.start();
  }
}

// ── 面板：战绩 / 回放列表 / 回放播放 ────────────────
function panelFrame(ctx, title, w, h) {
  const th = getTheme();
  const x = W / 2 - w / 2, y = H / 2 - h / 2;
  ctx.fillStyle = 'rgba(10, 8, 22, 0.92)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#181334';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3a3560';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = th.accent;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  drawPixelText(ctx, title, x + 16, y + 14, 18, th.accent2);
  if (button(ctx, 'panelClose', x + w - 76, y + 10, 60, 28, '关闭', { size: 12, fill: '#2b1a2e' })) return null;
  return { x, y, w, h };
}

export function drawPanels(ctx, S, act) {
  if (S.panel === 'stats') drawStatsPanel(ctx, S, act);
  else if (S.panel === 'history') drawHistoryPanel(ctx, S, act);
  else if (S.panel === 'replay' && S.replay) drawReplayPanel(ctx, S, act);
  else if (S.panel === 'profile') drawProfilePanel(ctx, S, act);
}

// ── 个人中心 ────────────────────────────────────────
function drawProfilePanel(ctx, S, act) {
  const f = panelFrame(ctx, '个人中心', 660, 430);
  if (!f) { act.closePanel(); return; }
  const p = S.profile || { name: S.nameInput, avatar: S.avatar, hands: 0 };
  const av = S.avatarDraft != null ? S.avatarDraft : (p.avatar || S.avatar || defaultAvatar(p.name));
  const colorPart = av.includes('.c') ? 'c' + av.split('.c')[1] : 'c1';
  const patNum = Math.max(1, parseInt(String(av).slice(1), 10) || 1);

  // 左：大头像预览
  drawAvatar(ctx, f.x + 24, f.y + 48, 88, av, { border: getTheme().accent });

  // 中：图案选择 6×2
  drawPixelText(ctx, '选择图案', f.x + 130, f.y + 44, 13, '#9a92c2');
  for (let i = 0; i < AVATAR_COUNT; i++) {
    const gx = f.x + 130 + (i % 6) * 46, gy = f.y + 62 + Math.floor(i / 6) * 46;
    const cur = patNum === i + 1;
    ctx.globalAlpha = cur ? 1 : 0.55;
    drawAvatar(ctx, gx, gy, 40, 'p' + (i + 1) + '.' + colorPart, {});
    ctx.globalAlpha = 1;
    if (cur) {
      ctx.strokeStyle = getTheme().accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(gx - 2.5, gy - 2.5, 45, 45);
    }
    if (inRectHover(gx, gy, 40, 40) && POINTER.clicked) { act.setAvatarDraft('p' + (i + 1) + '.' + colorPart); }
  }

  // 颜色行
  drawPixelText(ctx, '颜色', f.x + 130, f.y + 164, 13, '#9a92c2');
  for (let ci = 0; ci < AVATAR_COLORS.length; ci++) {
    const cx2 = f.x + 130 + ci * 30, cy2 = f.y + 182;
    ctx.fillStyle = AVATAR_COLORS[ci];
    ctx.fillRect(cx2, cy2, 22, 22);
    ctx.strokeStyle = colorPart === 'c' + (ci + 1) ? '#f4efe3' : '#3a3560';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx2 + 1, cy2 + 1, 20, 20);
    if (inRectHover(cx2, cy2, 22, 22) && POINTER.clicked) {
      act.setAvatarDraft('p' + patNum + '.c' + (ci + 1));
    }
  }

  // 昵称（DOM 输入框定位到面板内）
  drawPixelText(ctx, '昵称', f.x + 24, f.y + 168, 13, '#9a92c2');
  S.dom.name.x = f.x + 24; S.dom.name.y = f.y + 186; S.dom.name.w = 88; S.dom.name.h = 30;
  if (button(ctx, 'profileSave', f.x + 24, f.y + 228, 88, 30, '保存', { size: 13, fill: '#1e4433', border: '#66bb6a' })) act.saveProfile();

  // 统计
  const st = S.profile;
  const sx = f.x + 424;
  drawPixelText(ctx, '生涯统计', sx, f.y + 44, 15, '#ffd76e');
  if (!st || st.hands === 0) {
    drawPixelText(ctx, '还没有对局记录', sx, f.y + 70, 13, '#6a6484');
  } else {
    const rows = [
      ['局数', String(st.hands)],
      ['胜场', String(st.wins)],
      ['胜率', st.winRate + '%'],
      ['净盈亏', (st.net >= 0 ? '+' : '') + fmt(st.net)],
      ['VPIP', st.vpip + '%'],
      ['PFR', st.pfr + '%'],
      ['激进度', String(st.agression)],
      ['摊牌胜率', st.wsd + '%'],
      ['最佳牌型', st.bestHand || '—'],
    ];
    rows.forEach((r, i) => {
      const ry = f.y + 70 + i * 24;
      drawPixelText(ctx, r[0], sx, ry, 13, '#9a92c2');
      drawPixelText(ctx, r[1], sx + 96, ry, 13, r[0] === '净盈亏' ? (st.net >= 0 ? '#66bb6a' : '#ef5350') : '#f4efe3');
    });
    // 风格标签
    if (st.style) {
      const sy = f.y + 70 + rows.length * 24 + 6;
      ctx.fillStyle = 'rgba(255,159,67,0.15)';
      ctx.fillRect(sx, sy, 216, 34);
      ctx.strokeStyle = getTheme().accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, 216, 34);
      drawPixelText(ctx, st.style.label, sx + 10, sy + 4, 14, '#ffd76e');
      drawPixelText(ctx, st.style.desc, sx + 10, sy + 19, 10, '#9a92c2');
    }
  }
  drawPixelText(ctx, '统计跨房间累计 · 每 20 局解锁风格分析', f.x + 130, f.y + f.h - 26, 11, '#6a6484');
}

function inRectHover(x, y, w, h) {
  return POINTER.x >= x && POINTER.x <= x + w && POINTER.y >= y && POINTER.y <= y + h;
}

function drawStatsPanel(ctx, S, act) {
  const f = panelFrame(ctx, '战绩（本房间）', 560, 380);
  if (!f) { act.closePanel(); return; }
  const rows = [...(S.stats || [])].sort((a, b) => b[1].net - a[1].net);
  if (!rows.length) drawPixelText(ctx, '还没有完成的手牌', W / 2, H / 2, 14, '#6a6484', 'center');
  drawPixelText(ctx, '玩家', f.x + 40, f.y + 52, 13, '#9a92c2');
  drawPixelText(ctx, '局数', f.x + 240, f.y + 52, 13, '#9a92c2');
  drawPixelText(ctx, '胜场', f.x + 320, f.y + 52, 13, '#9a92c2');
  drawPixelText(ctx, '净盈亏', f.x + 400, f.y + 52, 13, '#9a92c2');
  rows.slice(0, 12).forEach(([name, st], i) => {
    const y = f.y + 78 + i * 26;
    drawPixelText(ctx, String(name).slice(0, 10), f.x + 40, y, 14, '#f4efe3');
    drawPixelText(ctx, String(st.hands), f.x + 240, y, 14, '#f4efe3');
    drawPixelText(ctx, String(st.wins), f.x + 320, y, 14, '#ffd76e');
    const netStr = st.net > 0 ? '+' + fmt(st.net) : st.net < 0 ? fmt(st.net) : '0';
    drawPixelText(ctx, netStr, f.x + 400, y, 14, st.net >= 0 ? '#66bb6a' : '#ef5350');
  });
}

function drawHistoryPanel(ctx, S, act) {
  const f = panelFrame(ctx, '牌局回放（最近 30 手）', 560, 380);
  if (!f) { act.closePanel(); return; }
  const hands = S.history || [];
  if (!hands.length) drawPixelText(ctx, '还没有完成的手牌', W / 2, H / 2, 14, '#6a6484', 'center');
  hands.slice().reverse().forEach((h, i) => {
    const y = f.y + 48 + i * 30;
    if (y > f.y + f.h - 44) return;
    const winner = h.results && h.results[0];
    const wname = winner ? (h.seats.find(s => s.seat === winner.seat) || {}).name || '?' : '?';
    const label = `#${h.handNo} · ${h.sb}/${h.bb} · 底池${fmt((h.pots || []).reduce((s, x) => s + x.amount, 0))} · ${wname} 赢`;
    if (button(ctx, 'replay' + h.handNo, f.x + 24, y, f.w - 48, 26, label, { size: 13, fill: '#241f42' })) act.openReplay(h);
  });
  if (hands.length) drawPixelText(ctx, '点击一手牌开始回放', W / 2, f.y + f.h - 26, 12, '#6a6484', 'center');
}

function actionLabel(a) {
  if (a.type === 'fold') return '弃牌';
  if (a.type === 'check') return '看牌';
  if (a.type === 'call') return `跟注 ${a.amount ?? a.put}`;
  return `加注到 ${a.amount}`;
}

function drawReplayPanel(ctx, S, act) {
  const rp = S.replay;
  const rec = rp.rec;
  const steps = rp.steps;
  const cur = steps[Math.min(rp.i, steps.length - 1)];
  // 面板
  ctx.fillStyle = 'rgba(10, 8, 22, 0.95)';
  ctx.fillRect(0, 0, W, H);
  const f = { x: 30, y: 40, w: W - 60, h: H - 80 };
  ctx.fillStyle = '#181334';
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.strokeStyle = '#ff9f43';
  ctx.lineWidth = 2;
  ctx.strokeRect(f.x + 2, f.y + 2, f.w - 4, f.h - 4);
  drawPixelText(ctx, `回放 · 第${rec.handNo}手 · 盲注 ${rec.sb}/${rec.bb}`, f.x + 16, f.y + 12, 16, '#ffd76e');
  if (button(ctx, 'rpClose', f.x + f.w - 76, f.y + 8, 60, 26, '关闭', { size: 12, fill: '#2b1a2e' })) { act.closePanel(); return; }

  // 公共牌（沿步骤携带：act 步骤沿用最近一次 street 的牌面）
  const bw = 44, bh = 62, gap = 8;
  let board = [];
  for (let k = 0; k <= rp.i; k++) {
    const st = steps[k];
    if (st.type === 'street' && st.cards) board = st.cards;
    else if (st.type === 'showdown' && st.board) board = st.board;
  }
  const bx0 = W / 2 - (5 * bw + 4 * gap) / 2, by = f.y + 44;
  for (let i = 0; i < 5; i++) {
    if (i < board.length) drawCard(ctx, bx0 + i * (bw + gap), by, bw, bh, board[i], true);
    else {
      ctx.strokeStyle = '#276245';
      ctx.strokeRect(bx0 + i * (bw + gap) + 1, by + 1, bw - 2, bh - 2);
    }
  }
  drawPixelText(ctx, `底池 ${cur.pot}`, W / 2, by + bh + 8, 16, '#ffd76e', 'center');

  // 座位格（网格）
  const cols = Math.min(3, rec.seats.length);
  const cellW = 176, cellH = 58;
  const gx = W / 2 - (Math.min(cols, rec.seats.length) * (cellW + 10) - 10) / 2;
  const gy = by + bh + 34;
  // 当前街每人已投入
  const bets = new Map();
  for (let k = 0; k <= rp.i; k++) {
    const st = steps[k];
    if (st.type === 'street') bets.clear();
    else if (st.seat != null) bets.set(st.seat, (bets.get(st.seat) || 0) + (st.put || 0));
  }
  rec.seats.forEach((s, i) => {
    const x = gx + (i % cols) * (cellW + 10);
    const y = gy + Math.floor(i / cols) * (cellH + 8);
    ctx.fillStyle = rec.button === s.seat ? '#2c2547' : '#221d40';
    ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeStyle = rec.button === s.seat ? '#ffd76e' : '#3a3560';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    drawPixelText(ctx, String(s.name).slice(0, 8) + (rec.button === s.seat ? ' (D)' : ''), x + 8, y + 6, 12, '#f4efe3');
    drawPixelText(ctx, `筹码 ${fmt(s.chips)}`, x + 8, y + 22, 12, '#ffd76e');
    drawPixelText(ctx, `本街 ${bets.get(s.seat) || 0}`, x + 8, y + 38, 12, '#9a92c2');
    // 摊牌后亮底牌
    const hc = rec.holeCards && rec.holeCards[s.seat];
    if (hc && cur.type === 'showdown') {
      drawCard(ctx, x + cellW - 50, y + 8, 20, 28, hc[0], true, { rot: -0.06 });
      drawCard(ctx, x + cellW - 28, y + 8, 20, 28, hc[1], true, { rot: 0.06 });
    }
  });

  // 当前步骤描述
  const seatNameOf = (seat) => (rec.seats.find(s => s.seat === seat) || {}).name || '?';
  let desc = '开牌';
  if (cur.type === 'blind') desc = `${seatNameOf(cur.seat)} 下盲注 ${cur.put}`;
  else if (cur.type === 'act') {
    const tag = cur.type === 'act' ? actionLabel(cur) : '';
    desc = `${streetName(cur.street)} · ${seatNameOf(cur.seat)} ${tag}`;
  } else if (cur.type === 'street') desc = `${streetName(cur.street)}：${cur.cards.length} 张公共牌`;
  else if (cur.type === 'showdown') {
    desc = (rec.results || []).map(r => {
      const n = seatNameOf(r.seat);
      return r.name ? `${n} 以【${r.name}】+${fmt(r.win)}` : `${n} +${fmt(r.win)}`;
    }).join('  ');
  }
  drawPixelText(ctx, desc, W / 2, f.y + f.h - 64, 14, '#f4efe3', 'center');

  // 控制条
  const cy = f.y + f.h - 38;
  if (button(ctx, 'rpPrev', f.x + 20, cy, 60, 28, '◀', { size: 13 })) act.replaySeek(rp.i - 1);
  if (button(ctx, 'rpNext', f.x + 88, cy, 60, 28, '▶', { size: 13 })) act.replaySeek(rp.i + 1);
  if (button(ctx, 'rpAuto', f.x + 156, cy, 90, 28, rp.auto ? '暂停' : '自动', { size: 13 })) act.replayToggleAuto();
  drawPixelText(ctx, `${Math.min(rp.i + 1, steps.length)}/${steps.length}`, f.x + 260, cy + 7, 13, '#9a92c2');
  // 进度滑条
  const sv = slider(ctx, 'rpSeek', f.x + 320, cy + 6, f.w - 350, rp.i, 0, steps.length - 1, { integer: true });
  if (sv !== rp.i) act.replaySeek(sv);
}

function streetName(s) {
  return { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌' }[s] || s;
}

// ── Toast 弹窗（顶部滑入）──
function drawToast(ctx, S) {
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

// ── 摊牌牌型标签与赢家飞行动画 ──────────────────────
// 行动时限条：像素分段进度条，随剩余时间由主题色→橙→红（低时脉冲）
// 计时条：单条动态进度，按 t 由绿到红渐变（绿 #66bb6a → 黄 #ffd76e → 红 #ef5350）
function timeBarColor(t) {
  let r, g, b;
  if (t > 0.5) {
    // 绿→黄，k: 0 (t=0.5) → 1 (t=1)
    const k = (t - 0.5) * 2;
    r = Math.round(102 + (255 - 102) * k);
    g = Math.round(187 + (215 - 187) * k);
    b = Math.round(106 + (110 - 106) * k);
  } else {
    // 黄→红，k: 0 (t=0) → 1 (t=0.5)
    const k = t * 2;
    r = Math.round(239 + (255 - 239) * k);
    g = Math.round(83 + (215 - 83) * k);
    b = Math.round(80 + (110 - 80) * k);
  }
  return `rgb(${r},${g},${b})`;
}

function drawTimeBar(ctx, x, y, w, frac) {
  const f = Math.max(0, Math.min(1, frac));
  const H = 8;
  // 背景框
  ctx.fillStyle = 'rgba(10, 8, 22, 0.85)';
  ctx.fillRect(x - 2, y - 2, w + 4, H + 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, w + 3, H + 2);
  // 动态进度条（整条颜色随 t 变化，不分段）
  const fillW = Math.max(0, w * f);
  if (fillW > 0) {
    ctx.fillStyle = timeBarColor(f);
    ctx.fillRect(x, y, fillW, H);
  }
  // 低时间闪烁提示（红色边框呼吸）
  if (f < 0.25) {
    const alpha = 0.35 + 0.4 * Math.abs(Math.sin(FX.t * 10));
    ctx.strokeStyle = `rgba(239,83,80,${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, H + 5);
  }
}

// 机器人思考条：蓝色扫描光段来回移动
function drawThinkBar(ctx, x, y, w) {
  const segs = 14;
  const segW = (w - (segs - 1) * 2) / segs;
  ctx.fillStyle = 'rgba(10, 8, 22, 0.85)';
  ctx.fillRect(x - 2, y - 2, w + 4, 9);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, w + 3, 8);
  const span = segs + 6;
  const head = (FX.t * 14) % span - 3; // 扫描头来回移动
  for (let i = 0; i < segs; i++) {
    const d = Math.abs(i - head);
    ctx.globalAlpha = d < 3 ? 1 - d / 3 : 0.1;
    ctx.fillStyle = '#7ea2ff';
    ctx.fillRect(x + i * (segW + 2), y, segW, 5);
  }
  ctx.globalAlpha = 1;
}

function seatTagPos(snap, seat) {
  if (snap.you && snap.you.seat >= 0 && seat === snap.you.seat) return { x: 440, y: 436 }; // 自己手牌右侧
  const p = seatDisplayPos(snap, seat);
  return { x: p.x, y: p.y + 34 }; // 名牌下缘
}

function drawHandTag(ctx, x, y, name, opts = {}) {
  const sc = opts.scale || 1;
  const w = name.length * 15 + 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  ctx.fillStyle = opts.bg || 'rgba(12, 9, 26, 0.92)';
  ctx.fillRect(-w / 2, -12, w, 24);
  ctx.strokeStyle = opts.border || '#9a92c2';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-w / 2 + 1, -11, w - 2, 22);
  drawPixelText(ctx, name, 0, -6, 13, opts.color || '#f4efe3', 'center');
  ctx.restore();
}

function drawRevealTags(ctx, snap) {
  if (!snap || !snap.seats) return;
  for (const key of Object.keys(anim.seatTags)) {
    const seat = Number(key);
    const info = snap.seats.find(s => !s.empty && s.seat === seat);
    if (!info || !info.cards) continue; // 未亮牌不显示
    // 赢家标签起飞后不再原地绘制
    if (anim.winTag && anim.winTag.seat === seat && FX.t >= anim.winTag.flyAt) continue;
    const tag = anim.seatTags[key];
    const pos = seatTagPos(snap, seat);
    const k = Math.max(0, Math.min(1, (FX.t - tag.t) / 0.32));
    drawHandTag(ctx, pos.x, pos.y, tag.name, { scale: ease.outBack(k) });
  }
}

export { drawToast };

function drawWinnerTagFlight(ctx, snap) {
  const w = anim.winTag;
  if (!w || !w.name) return;
  const from = seatTagPos(snap, w.seat);
  const target = { x: 480, y: 296 }; // 公共牌正下方
  if (FX.t < w.flyAt) {
    drawHandTag(ctx, from.x, from.y, w.name, { border: '#ffd76e', color: '#ffd76e' });
    return;
  }
  const k = Math.min(1, (FX.t - w.flyAt) / 0.8);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const x = from.x + (target.x - from.x) * e;
  const y = from.y + (target.y - from.y) * e - Math.sin(e * Math.PI) * 46;
  const sc = 1 + Math.sin(e * Math.PI) * 0.16;
  drawHandTag(ctx, x, y, w.name, { scale: sc, border: '#ffd76e', color: '#ffd76e', bg: 'rgba(26, 18, 6, 0.94)' });
  if (k >= 1) {
    // 到位：金框脉冲，与亮起的公牌协同展示
    const pulse = 0.55 + 0.45 * Math.sin(FX.t * 4);
    const tw = w.name.length * 15 + 24;
    ctx.strokeStyle = `rgba(255,215,110,${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(target.x - tw / 2 - 6, target.y - 18, tw + 12, 36);
  }
}

// ── 结算横幅 ────────────────────────────────────────
function drawResultsBanner(ctx, snap, results) {
  const lines = [];
  for (const r of results.results) {
    const seat = snap.seats.find(s => !s.empty && s.seat === r.seat);
    const name = seat ? seat.name : '?';
    lines.push(results.uncontested
      ? `${name} 收下底池 +${fmt(r.win)}`
      : `${name} 以【${r.name}】赢得 +${fmt(r.win)}`);
  }
  // 顶部名牌 y≈50..95（6+ 人桌更靠上），横幅 y=64 会和顶部名牌叠加。
  // 改放到顶部更靠上的位置（y=18）+ 自身 save/restore 兜底，
  // 万一上层漏了变换也不会把整条横幅画歪。
  const y = 18;
  const wmax = Math.max(...lines.map(l => l.length)) * 17 + 60;
  const bx = W / 2 - wmax / 2, bh = 24 + lines.length * 22;
  ctx.save();
  ctx.setTransform(2, 0, 0, 2, 0, 0); // 抵消调用方可能漏的 transform
  ctx.fillStyle = 'rgba(12, 9, 26, 0.92)';
  ctx.fillRect(bx, y - 12, wmax, bh);
  ctx.strokeStyle = '#ffd76e';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 1, y - 11, wmax - 2, bh - 2);
  lines.forEach((l, i) => {
    drawPixelText(ctx, l, W / 2, y + i * 22, 15, i === 0 ? '#ffd76e' : '#f4efe3', 'center', '#0c0a18');
  });
  ctx.restore();
}

// ── 连接遮罩 ────────────────────────────────────────
export function drawConnectOverlay(ctx, msg) {
  ctx.fillStyle = 'rgba(10, 8, 22, 0.78)';
  ctx.fillRect(0, 0, W, H);
  drawPixelText(ctx, msg || '连接服务器中…', W / 2, H / 2 - 10, 20, '#ffd76e', 'center');
}
