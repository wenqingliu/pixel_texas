// 牌桌：桌面、座位、英雄手牌、行动面板、摊牌与结算展示
import { drawCard, drawCardBack, drawChipStack, drawChipPile, fmt } from './cards.js';
import { button, slider, textButton, POINTER } from './ui.js';
import { drawPixelText, drawFX, shakeOffset, FX, ease } from './fx.js';
import { Music } from './music.js';
import { getTheme } from './theme.js';
import { drawAvatar, defaultAvatar } from './avatar.js';
import { W, H, renderState, anim, drawBackdrop } from './render-core.js';

const S_winRate = () => renderState.winRate;
const S_Avatar = (snap) => (snap && snap.you && snap.you.avatar) || defaultAvatar(snap && snap.you && snap.you.name);

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
export const POT_POS = { x: 480, y: 168 }; // 底池筹码堆基点（与绘制一致，与公牌区保持间距）

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
  ctx.fillStyle = s.folded ? th.panelDim : th.panel;
  ctx.fillRect(x, y, plateW, plateH);
  ctx.strokeStyle = th.panelBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, plateW - 2, plateH - 2);
  ctx.globalAlpha = s.folded ? 0.55 : 1;
  // 头像
  drawAvatar(ctx, avX, avY, avSize, s.avatar || '', { border: isActor ? th.accent : th.panelBorder });
  // 状态行 + 行动时限条合并为一行（名牌下方）：状态文字居左、条占右侧余宽。
  // 不再向下叠两行，避免顶部座位的状态/倒计时挤进桌面区域。
  // 优先级：出局 > 全下 > 已弃牌 > 行动中(脉冲) > 最近一次动作 > 等待(隐藏)
  {
    let stLabel = null, stColor = null, stPulse = false;
    if (s.eliminated) { stLabel = '出局'; stColor = th.danger; }
    else if (s.allIn && !s.folded) { stLabel = '全下'; stColor = th.danger; }
    else if (s.folded) { stLabel = '已弃牌'; stColor = th.textFaint; }
    else if (isActor) {
      if (s.isBot) { stLabel = '思考中…'; stColor = th.info; stPulse = true; }
      else { stLabel = '行动中…'; stColor = th.gold; stPulse = true; }
    } else if (s.lastAction) {
      const la = s.lastAction;
      if (la.type === 'check') { stLabel = '看牌'; stColor = th.gold; }
      else if (la.type === 'call') { stLabel = `跟注 ${fmt(la.amount)}`; stColor = th.gold; }
      else if (la.type === 'raise') {
        stLabel = la.allIn ? `全下 ${fmt(la.amount)}` : `加注到 ${fmt(la.amount)}`;
        stColor = la.allIn ? th.danger : th.gold;
      } else if (la.type === 'fold') { stLabel = '已弃牌'; stColor = th.textFaint; }
    }
    const stFs = mini ? 9 : 10;
    const stY = y + plateH + 4;
    const barY = y + plateH + 7;
    const showBar = isActor && !s.folded;
    let stW = 0;
    if (stLabel) {
      if (stPulse) ctx.globalAlpha = 0.75 + 0.25 * Math.sin(FX.t * 7);
      drawPixelText(ctx, stLabel, showBar ? x + 4 : x + plateW / 2, stY, stFs, stColor,
        showBar ? 'left' : 'center', '#0c0a18');
      ctx.globalAlpha = s.folded ? 0.55 : 1;
      stW = stLabel.length * stFs + 2;
    }
    // 人类：动态时限条（绿→红渐变，低时红闪）；机器人：蓝色扫描条
    if (showBar) {
      const barX = stW > 0 ? x + 4 + stW + 6 : x + 4;
      const barW = plateW - 8 - (stW > 0 ? stW + 6 : 0);
      if (barW > 14) {
        if (!s.isBot && hand && hand.deadline) {
          const total = Math.max(1, (snap.settings.actionTime || 30) * 1000);
          const remain = Math.max(0, hand.deadline - Date.now());
          drawTimeBar(ctx, barX, barY, barW, remain / total);
        } else {
          drawThinkBar(ctx, barX, barY, barW);
        }
      }
    }
  }
  drawPixelText(ctx, s.name.slice(0, mini ? 4 : 6), nameX, y + 5, mini ? 12 : 13, th.text);
  drawPixelText(ctx, fmt(s.chips), nameX, y + (mini ? 22 : 25), mini ? 12 : 14, th.gold);
  // 真人 HUD：VPIP 标签（GG 式数据，10 手起）移入名牌，与筹码同行右对齐
  if (!s.isBot && s.hud) {
    drawPixelText(ctx, 'V' + s.hud.vpip + '%', x + plateW - 6, y + (mini ? 24 : 27), mini ? 9 : 10, th.textFaint, 'right');
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
  // 胜率/手牌名：暗底胶囊一行（与其它座位的"状态行"同一节奏），11px 可读；
  // 摊牌横幅期间让位给赢家牌型标签
  const wr = S_winRate();
  if (wr != null && snap.you.cards && !s.folded && !(anim.results && FX.t - anim.resultsAt < 4.5)) {
    const wrPct = Math.round(wr * 100);
    const col = wrPct >= 60 ? th.ok : wrPct >= 40 ? th.gold : th.danger;
    const label = `胜率 ${wrPct}%${renderState.handName ? ' · ' + renderState.handName : ''}`;
    const pw = Math.min(label.length * 11 + 14, 240);
    const pcx = plateX + plateW / 2;
    const py2 = plateY + plateH + 4;
    ctx.fillStyle = 'rgba(10, 8, 22, 0.72)';
    ctx.fillRect(pcx - pw / 2, py2, pw, 18);
    drawPixelText(ctx, label, pcx, py2 + 3, 11, col, 'center', '#0c0a18');
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
  const th = getTheme();

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
      drawPixelText(ctx, '等待其他玩家行动…', 790, H - 40, 13, '#8b85ad', 'center');
      // 预操作快捷（未轮到自己时）：check_fold / call_any + 当前已预设状态
      const pa = S.preAction || null;
      const px2 = 640, py2 = H - 110;
      // 面板底（与主面板同款，但只一行）
      ctx.fillStyle = 'rgba(16, 12, 34, 0.78)';
      ctx.fillRect(px2 - 12, py2 - 12, 320, 60);
      ctx.strokeStyle = pa ? '#ffd76e' : th.panelBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(px2 - 12, py2 - 12, 320, 60);
      drawPixelText(ctx, '预操作', px2, py2 - 4, 11, '#9ad0ff', 'left', '#0c0a18');
      // 状态标签
      const stateText = pa === 'check_fold' ? '已设:看牌/弃牌' : pa === 'call_any' ? '已设:跟到底' : '未预设';
      drawPixelText(ctx, stateText, px2 + 308, py2 - 4, 11, pa ? '#ffd76e' : '#8b85ad', 'right', '#0c0a18');
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
  ctx.strokeStyle = th.panelBorder;
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
    drawPixelText(ctx, `赔率${odds}%`, px + 250, py + 19, 11, th.textFaint);
  }
  ctx.restore();
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

// ── 计时条 ──────────────────────────────────────────
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

// ── 摊牌牌型标签与赢家飞行动画 ──────────────────────
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
