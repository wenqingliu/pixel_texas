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

  // 房间列表：条目两行（行1 房间码 + 模式；行2 人数/座位/状态/盲注）
  drawPixelText(ctx, '▸ 房间列表', 640, 170, 16, '#f4efe3');
  if (!S.rooms.length) drawPixelText(ctx, '暂无公开房间，创建一个吧', 640, 196, 13, '#8b85ad');
  const listK = menuK(S, 0.3);
  ctx.save();
  ctx.globalAlpha = listK;
  ctx.translate((1 - listK) * 40, 0);
  S.rooms.slice(0, 5).forEach((r, i) => {
    const y = 196 + i * 46;
    const tour = r.mode === 'tournament';
    if (button(ctx, 'room' + r.code, 640, y, 300, 40, '', { fill: '#241f42', border: tour ? '#c07bee' : undefined })) act.joinCode(r.code);
    drawPixelText(ctx, r.code, 652, y + 6, 14, '#ffd76e');
    drawPixelText(ctx, tour ? '锦标赛' : '现金桌', 932, y + 7, 11, tour ? '#c07bee' : '#8b85ad', 'right');
    drawPixelText(ctx, `${r.humans}人 · ${r.seated}/${r.maxSeats}座${r.playing ? ' · 对局中' : ''} · ${r.sb}/${r.bb}`, 652, y + 23, 10, '#8b85ad');
  });

  ctx.restore();
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
    drawPixelText(ctx, '等待房主开始对局…', px, py + 10, 16, th.textDim);
  }

  // 开始按钮
  if (snap.isHost) {
    if (button(ctx, 'start', W - 216, H - 76, 200, 56, '开始对局', { fill: '#7a3b12', border: '#ff9f43', color: '#ffe3b3', size: 22 })) act.start();
  }
  drawPixelText(ctx, '机器人会在开局时自动坐进空位；真人加入将顶替机器人', W / 2, H - 30, 12, '#8b85ad', 'center');
}
