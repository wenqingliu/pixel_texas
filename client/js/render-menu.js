// 主菜单 + 房间等待界面
import { fmt } from './cards.js';
import { button, checkbox, cycle, slider, textButton } from './ui.js';
import { drawPixelText, FX } from './fx.js';
import { getTheme, THEMES, themeIndex } from './theme.js';
import { drawAvatar } from './avatar.js';
import { W, H, drawBackdrop } from './render-core.js';

const LEVEL_NAMES = { easy: '休闲', normal: '普通', hard: '大师' };

// 菜单入场动画：按延迟错落滑入
function menuK(S, delay) {
  if (S.menuEnterAt == null) return 1;
  const k = Math.max(0, Math.min(1, (performance.now() / 1000 - S.menuEnterAt - delay) / 0.4));
  return k * k * (3 - 2 * k);
}

// 半透明面板卡片（设置区 / 列表容器用）
function panelRect(ctx, x, y, w, h) {
  const th = getTheme();
  ctx.fillStyle = 'rgba(12, 9, 26, 0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = th.panelBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
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

  // 个人中心入口：左上角头像 + 昵称
  const av = S.avatar || S.defaultAv || 'p1.c1';
  if (button(ctx, 'avatarBtn', 16, 14, 46, 42, '', { fill: '#181334' })) act.openProfile();
  drawAvatar(ctx, 21, 17, 36, av, { border: th.accent });
  drawPixelText(ctx, S.nameInput || '玩家', 72, 20, 14, th.text);
  drawPixelText(ctx, '[个人中心]', 72, 38, 10, th.textFaint);

  // 主按钮列
  const bx = W / 2 - 120, bw = 240, bh = 42;
  const menuBtns = [
    ['levels', 236, '挑战关卡', { fill: '#5c4a1a', border: '#ffd76e', color: '#fff3c4', size: 16 }, () => act.openLevels()],
    ['practice', 282, '单机练习', { fill: '#7a3b12', border: th.accent, color: '#ffe3b3', size: 16 }, () => act.practice()],
    ['quick', 328, '快速匹配', { size: 16 }, () => act.quickMatch()],
    ['tourney', 374, '快速锦标赛', { fill: '#4a1f5c', border: '#c07bee', color: '#ecd1ff', size: 16 }, () => act.quickTournament()],
    ['create', 420, '创建房间', { size: 16 }, () => act.createRoom()],
    ['rooms', 466, '房间大厅', { size: 16 }, () => act.openRooms()],
  ];
  menuBtns.forEach(([id, by, label, opts, fn], i) => {
    const k = menuK(S, 0.12 + i * 0.06);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(-(1 - k) * 46, 0);
    if (button(ctx, id, bx, by, bw, bh, label, opts)) fn();
    ctx.restore();
  });

  // 菜单上不显示昵称输入框（编辑入口在个人中心）
  S.dom.name.w = 0;

  // 右上：设置卡片（主题 / 音效 / 音乐 / 曲目），不再贴着屏幕顶边
  panelRect(ctx, 778, 12, 168, 174);
  drawPixelText(ctx, '主题', 790, 20, 11, th.textDim);
  const ti = cycle(ctx, 'theme', 790, 32, 146, '', THEMES.map(t => t.name), themeIndex());
  if (THEMES[ti] && THEMES[ti].id !== th.id) act.setTheme(THEMES[ti].id);
  drawPixelText(ctx, '音效', 790, 62, 11, th.textDim);
  const v = slider(ctx, 'vol', 790, 74, 146, S.volume, 0, 1);
  if (v !== S.volume) act.setVolume(v);
  drawPixelText(ctx, '音乐', 790, 104, 11, th.textDim);
  const mv = slider(ctx, 'mvol', 790, 116, 146, S.musicVol, 0, 1);
  if (mv !== S.musicVol) act.setMusicVolume(mv);
  drawPixelText(ctx, '曲目', 790, 146, 11, th.textDim);
  const trackIds = ['auto', 'neon', 'table', 'tense', 'off'];
  const trackNames = ['自动', '霓虹夜晚', '绿桌风云', '暗流涌动', '关'];
  const tci = cycle(ctx, 'track', 790, 158, 146, '', trackNames, Math.max(0, trackIds.indexOf(S.track)));
  if (trackIds[tci] !== S.track) act.setTrack(trackIds[tci]);

  // 公开房间在「房间大厅」二级界面浏览（房间列表按钮进入）
  drawPixelText(ctx, '和朋友局域网联机：把页面顶部地址发给对方即可', W / 2, 522, 12, '#8b85ad', 'center');
}

// ── 房间等待界面 ────────────────────────────────────
export function drawRoomLobby(ctx, S, act) {
  drawBackdrop(ctx);
  const th = getTheme();
  const snap = S.snap;
  const st = snap.settings;

  // 顶栏
  if (button(ctx, 'leave', 16, 16, 96, 34, '← 退出房间', { size: 13 })) act.leave();
  drawPixelText(ctx, `房间码  ${snap.code}`, W / 2, 22, 26, th.gold, 'center', '#0c0a18');
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
    ctx2.fillStyle = filled ? th.panel : th.panelDim;
    ctx2.fillRect(cx, cy, cellW, cellH);
    ctx2.strokeStyle = filled ? th.panelBorder : th.panelDim;
    ctx2.lineWidth = 2;
    ctx2.strokeRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      if (filled) {
        drawAvatar(ctx2, cx + 8, cy + 14, 36, s.avatar || '', { border: snap.you.seat === s.seat ? th.ok : th.panelBorder });
        drawPixelText(ctx2, s.name.slice(0, 8), cx + 52, cy + 8, 14, th.text);
        drawPixelText(ctx2, fmt(s.chips), cx + 52, cy + 34, 14, th.gold);
      if (s.isBot) drawPixelText(ctx2, `机器人·${LEVEL_NAMES[s.level] || ''}`, cx + cellW - 10, cy + 10, 12, th.info, 'right');
      else if (snap.you.seat === s.seat) drawPixelText(ctx2, '（你）', cx + cellW - 10, cy + 10, 12, th.ok, 'right');
      if (!s.connected) drawPixelText(ctx2, '断线', cx + cellW - 10, cy + 34, 12, th.danger, 'right');
      else if (s.sittingOut) drawPixelText(ctx2, '休战', cx + cellW - 10, cy + 34, 12, th.danger, 'right');
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
    // 断线托管：掉线玩家的手牌由 AI 普通档代打，重连自动交还
    const aiStandIn = checkbox(ctx, 'aiStandIn', px + 290, py + 26, '断线托管（AI 代打）', st.aiStandIn);
    if (aiStandIn !== st.aiStandIn) act.updateSettings({ aiStandIn });
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
    // 局间休息
    const bwVals = [0, 5, 8, 12, 20];
    const bwIdx = bwVals.indexOf(st.breakWait | 0);
    const bwi = cycle(ctx, 'breakWait', px + 290, py + 152, 220, '局间休息', ['关', '5秒', '8秒', '12秒', '20秒'], Math.max(0, bwIdx));
    if (bwi !== bwIdx && bwi >= 0) act.updateSettings({ breakWait: bwVals[bwi] });
  } else {
    drawPixelText(ctx, '等待房主开始对局…', px, py + 10, 16, th.textDim);
  }

  // 开始按钮
  if (snap.isHost) {
    if (button(ctx, 'start', W - 216, H - 76, 200, 56, '开始对局', { fill: '#7a3b12', border: '#ff9f43', color: '#ffe3b3', size: 22 })) act.start();
  }
  drawPixelText(ctx, '机器人会在开局时自动坐进空位；真人加入将顶替机器人', W / 2, H - 30, 12, '#8b85ad', 'center');
}
