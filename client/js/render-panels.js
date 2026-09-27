// 面板：个人中心 / 战绩 / 回放列表 / 回放播放
import { drawCard, fmt } from './cards.js';
import { button, slider, POINTER } from './ui.js';
import { drawPixelText, ease } from './fx.js';
import { getTheme } from './theme.js';
import { drawAvatar, AVATAR_COUNT, AVATAR_COLORS, defaultAvatar } from './avatar.js';
import { W, H } from './render-core.js';

function panelFrame(ctx, title, w, h) {
  const th = getTheme();
  const x = W / 2 - w / 2, y = H / 2 - h / 2;
  ctx.fillStyle = 'rgba(10, 8, 22, 0.92)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = th.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = th.panelBorder;
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
    drawPixelText(ctx, '还没有对局记录', sx, f.y + 70, 13, '#8b85ad');
  } else {
    const rows = [
      ['局数', String(st.hands)],
      ['胜场', String(st.wins)],
      ['胜率', st.winRate + '%'],
      ['净盈亏', (st.net >= 0 ? '+' : '') + fmt(st.net)],
      ['VPIP', st.vpip + '%'],
      ['PFR', st.pfr + '%'],
      ['被注弃牌', st.foldToBet + '%'],
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
    // 近 40 手净盈亏趋势（绿上红下的小柱状）
    const rec2 = st.recent || [];
    if (rec2.length >= 2) {
      const ty = f.y + 70 + rows.length * 24 + 48;
      const maxAbs = Math.max(1, ...rec2.map(v => Math.abs(v)));
      const bw2 = 216 / rec2.length;
      const base = ty + 16;
      drawPixelText(ctx, `近${rec2.length}手盈亏`, sx, ty - 4, 10, '#9a92c2');
      for (let i = 0; i < rec2.length; i++) {
        const h = Math.max(1, Math.abs(rec2[i]) / maxAbs * 14);
        ctx.fillStyle = rec2[i] >= 0 ? '#66bb6a' : '#ef5350';
        ctx.fillRect(sx + i * bw2, rec2[i] >= 0 ? base - h : base, Math.max(1, bw2 - 1), h);
      }
    }
  }
  drawPixelText(ctx, '统计跨房间累计 · 每 20 局解锁风格分析', f.x + 130, f.y + f.h - 26, 11, '#8b85ad');
}

function inRectHover(x, y, w, h) {
  return POINTER.x >= x && POINTER.x <= x + w && POINTER.y >= y && POINTER.y <= y + h;
}

function drawStatsPanel(ctx, S, act) {
  const f = panelFrame(ctx, '战绩（本房间）', 560, 380);
  if (!f) { act.closePanel(); return; }
  const rows = [...(S.stats || [])].sort((a, b) => b[1].net - a[1].net);
  if (!rows.length) drawPixelText(ctx, '还没有完成的手牌', W / 2, H / 2, 14, '#8b85ad', 'center');
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
  if (!hands.length) drawPixelText(ctx, '还没有完成的手牌', W / 2, H / 2, 14, '#8b85ad', 'center');
  hands.slice().reverse().forEach((h, i) => {
    const y = f.y + 48 + i * 30;
    if (y > f.y + f.h - 44) return;
    const winner = h.results && h.results[0];
    const wname = winner ? (h.seats.find(s => s.seat === winner.seat) || {}).name || '?' : '?';
    const label = `#${h.handNo} · ${h.sb}/${h.bb} · 底池${fmt((h.pots || []).reduce((s, x) => s + x.amount, 0))} · ${wname} 赢`;
    if (button(ctx, 'replay' + h.handNo, f.x + 24, y, f.w - 48, 26, label, { size: 13, fill: '#241f42' })) act.openReplay(h);
  });
  if (hands.length) drawPixelText(ctx, '点击一手牌开始回放', W / 2, f.y + f.h - 26, 12, '#8b85ad', 'center');
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
  const th = getTheme();
  const cur = steps[Math.min(rp.i, steps.length - 1)];
  // 面板
  ctx.fillStyle = 'rgba(10, 8, 22, 0.95)';
  ctx.fillRect(0, 0, W, H);
  const f = { x: 30, y: 40, w: W - 60, h: H - 80 };
  ctx.fillStyle = th.panel;
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
