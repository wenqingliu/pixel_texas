// 像素风德州扑克卡牌：传统样式白底牌面 + 矢量花色（任意尺寸清晰）+ 宫廷人像
import { drawPixelText } from './fx.js';

export const RANK_CHARS = '23456789TJQKA';
export const SUITS = ['♠', '♥', '♦', '♣'];
// 传统双色：黑桃/梅花墨黑，红桃/方块正红
const INK_BLACK = '#1e1e2a';
const INK_RED = '#d0342c';
const FACE = '#fefefa';
const FACE_EDGE = '#e2dccb';
const BORDER = '#262238';

// 宫廷人像点阵（14×16）：X=花色色 W=白 K=暗 R=红 G=金
const COURT_MAPS = [
  // J（侍从，红帽）
  [
    '.....RRRR.....',
    '....RRRRRR....',
    '...RRRRRRRR...',
    '..XXXXXXXXXX..',
    '..XKKXXXXKKX..',
    '..XXXXXXXXXX..',
    '..XXXXXXXXXX..',
    '.XXXXXXXXXXXX.',
    '.XXWXXXXXXWXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXRXXRXXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '..XXXXXXXXXX..',
    '...XXXXXXXX...',
  ],
  // Q（王后，金饰长发）
  [
    '...G......G...',
    '...GG....GG...',
    '...GGG..GGG...',
    '..XXXXXXXXXX..',
    '.XXWWWWWWWWXX.',
    '.XWXXXXXXXXWX.',
    '.XWKKXXXXKKWX.',
    '.XWXXXXXXXXWX.',
    '..XXXXXXXXXX..',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXWXXXXWXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '..XXXXXXXXXX..',
  ],
  // K（国王，金冠 + 胡须）
  [
    '..G...GG...G..',
    '..G..GGGG..G..',
    '..GG.GGGG.GG..',
    '..GGGGGGGGGG..',
    '...GGRGGRGG...',
    '...XXXXXXXX...',
    '...XKKXXKKX...',
    '...XXXXXXXX...',
    '...XXXXXXXX...',
    '..XXXXXXXXXX..',
    '.XXXXWWWWXXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '.XXXXXXXXXXXX.',
    '..XXXXXXXXXX..',
  ],
];

// 传统点数点阵布局 [x比例, y比例, 是否倒置]（rank 索引 0='2' ... 8='10'）
const PIP_LAYOUTS = {
  0: [[0.5, 0.13, 0], [0.5, 0.87, 1]],
  1: [[0.5, 0.13, 0], [0.5, 0.5, 0], [0.5, 0.87, 1]],
  2: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  3: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.5, 0.5, 0], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  4: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.27, 0.5, 0], [0.73, 0.5, 0], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  5: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.5, 0.315, 0], [0.27, 0.5, 0], [0.73, 0.5, 0], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  6: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.27, 0.5, 0], [0.73, 0.5, 0], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  7: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.5, 0.315, 0], [0.27, 0.5, 0], [0.73, 0.5, 0], [0.5, 0.685, 1], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  8: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.5, 0.315, 0], [0.27, 0.5, 0], [0.73, 0.5, 0], [0.5, 0.685, 1], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  9: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.27, 0.38, 0], [0.73, 0.38, 0], [0.5, 0.5, 0], [0.27, 0.62, 1], [0.73, 0.62, 1], [0.27, 0.87, 1], [0.73, 0.87, 1]],
  10: [[0.27, 0.13, 0], [0.73, 0.13, 0], [0.5, 0.255, 0], [0.27, 0.38, 0], [0.73, 0.38, 0], [0.27, 0.62, 1], [0.73, 0.62, 1], [0.5, 0.745, 1], [0.27, 0.87, 1], [0.73, 0.87, 1]],
};

export function suitColor(suit) { return suit === 1 || suit === 2 ? INK_RED : INK_BLACK; }
export function rankText(card) {
  const r = RANK_CHARS[card >> 2];
  return r === 'T' ? '10' : r;
}

const spriteCache = new Map();
// 宫廷人像精灵（14×16 点阵，按物理像素粒度缓存）
function courtSprite(kind, phys, color) {
  const key = 'C' + kind + '_' + phys + '_' + color;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const map = COURT_MAPS[kind];
  const c = document.createElement('canvas');
  c.width = 14 * phys;
  c.height = map.length * phys;
  const g = c.getContext('2d');
  map.forEach((row, yy) => {
    for (let xx = 0; xx < row.length; xx++) {
      const ch = row[xx];
      if (ch === '.') continue;
      g.fillStyle = ch === 'X' ? color : ch === 'W' ? '#f2ead8' : ch === 'K' ? '#1b1826' : ch === 'R' ? '#e04848' : '#ffd76e';
      g.fillRect(xx * phys, yy * phys, phys, phys);
    }
  });
  spriteCache.set(key, c);
  return c;
}

function drawCourt(ctx, kind, cx, cy, hgt, color) {
  const map = COURT_MAPS[kind];
  if (!map) return; // A/未映射的牌型不画公仔
  const phys = Math.max(2, Math.round((hgt * 2) / map.length));
  const sp = courtSprite(kind, phys, color);
  const lw = sp.width / 2, lh = sp.height / 2;
  ctx.drawImage(sp, cx - lw / 2, cy - lh / 2, lw, lh);
}

// 传统花色矢量绘制（♠ ♥ ♦ ♣，任意尺寸清晰）
function drawSuit(ctx, suit, cx, cy, targetH, color) {
  const h = targetH;        // 全高
  const w = h * 0.66;       // 半宽
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  if (suit === 0) {
    // 黑桃：单路径轮廓（尖锋 + 双侧圆瓣 + 外撇底脚 + 中央茎）
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.bezierCurveTo(w * 0.14, -h * 0.26, w * 0.6, -h * 0.16, w * 0.78, h * 0.02);
    ctx.bezierCurveTo(w * 0.92, h * 0.2, w * 0.56, h * 0.34, w * 0.32, h * 0.3);
    ctx.bezierCurveTo(w * 0.17, h * 0.28, w * 0.07, h * 0.22, w * 0.05, h * 0.13);
    ctx.lineTo(w * 0.27, h * 0.5);
    ctx.lineTo(-w * 0.27, h * 0.5);
    ctx.lineTo(-w * 0.05, h * 0.13);
    ctx.bezierCurveTo(-w * 0.07, h * 0.22, -w * 0.17, h * 0.28, -w * 0.32, h * 0.3);
    ctx.bezierCurveTo(-w * 0.56, h * 0.34, -w * 0.92, h * 0.2, -w * 0.78, h * 0.02);
    ctx.bezierCurveTo(-w * 0.6, -h * 0.16, -w * 0.14, -h * 0.26, 0, -h * 0.5);
    ctx.fill();
  } else if (suit === 1) {
    // 红桃：双圆弧瓣 + 底尖
    ctx.beginPath();
    ctx.moveTo(0, h * 0.48);
    ctx.bezierCurveTo(-w * 0.28, h * 0.22, -w * 0.98, h * 0.0, -w * 0.98, -h * 0.22);
    ctx.bezierCurveTo(-w * 0.98, -h * 0.45, -w * 0.38, -h * 0.55, 0, -h * 0.18);
    ctx.bezierCurveTo(w * 0.38, -h * 0.55, w * 0.98, -h * 0.45, w * 0.98, -h * 0.22);
    ctx.bezierCurveTo(w * 0.98, h * 0.0, w * 0.28, h * 0.22, 0, h * 0.48);
    ctx.fill();
  } else if (suit === 2) {
    // 方块：四边微曲菱形
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.quadraticCurveTo(w * 0.45, -h * 0.25, w, 0);
    ctx.quadraticCurveTo(w * 0.45, h * 0.25, 0, h * 0.5);
    ctx.quadraticCurveTo(-w * 0.45, h * 0.25, -w, 0);
    ctx.quadraticCurveTo(-w * 0.45, -h * 0.24, 0, -h * 0.5);
    ctx.fill();
  } else {
    // 梅花：三圆叶 + 外撇茎
    const r = h * 0.27;
    ctx.beginPath();
    ctx.arc(0, -h * 0.5 + r * 1.05, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-r * 0.98, -h * 0.5 + r * 2.0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.98, -h * 0.5 + r * 2.0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, h * 0.5);
    ctx.quadraticCurveTo(-w * 0.04, h * 0.14, 0, h * 0.05);
    ctx.quadraticCurveTo(w * 0.04, h * 0.14, w * 0.28, h * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 绘制一张牌
 * @param card 牌编码 0-51；faceUp=false 绘制背面
 * @param opts {rot, glow, alpha, dim, scale, flip}
 */
export function drawCard(ctx, x, y, w, h, card, faceUp, opts = {}) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.scale) ctx.scale(opts.scale, opts.scale);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  // 翻面动画：flip 0=背面 → 0.5 侧立 → 1 正面（水平压缩模拟翻转）
  let up = faceUp;
  if (opts.flip != null && opts.flip < 1) {
    const p = Math.max(0, Math.min(1, opts.flip));
    ctx.scale(Math.max(0.03, Math.abs(Math.cos(Math.PI * p))), 1);
    up = p >= 0.5;
  }
  const hw = w / 2, hh = h / 2;

  if (opts.glow) {
    ctx.fillStyle = opts.glow;
    ctx.fillRect(-hw - 3, -hh - 3, w + 6, h + 6);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  rr(ctx, -hw + 2, -hh + 3, w, h, 3);
  ctx.fill();

  if (up && card != null) {
    const suit = card & 3;
    const color = suitColor(suit);
    const rank = rankText(card);
    const big = w >= 40;

    // 外框 + 纯白卡面
    ctx.fillStyle = BORDER;
    rr(ctx, -hw, -hh, w, h, 3);
    ctx.fill();
    ctx.fillStyle = FACE;
    rr(ctx, -hw + 1.5, -hh + 1.5, w - 3, h - 3, 2);
    ctx.fill();

    if (big) {
      // ── 极简牌面：左上角标（数字+小花色）+ 右下大花色/公仔，中央留白 ──
      const m = 6;
      const rankSize = Math.floor(h * 0.22);
      const smallPipH = h * 0.15;  // 小花色放大约 50%，角标区更醒目
      const bigPipH = h * 0.42;
      const ri = card >> 2; // 0='2' ... 8='10' 9='J' 10='Q' 11='K' 12='A'

      // 左上：数字
      drawPixelText(ctx, rank, -hw + m, -hh + m, rankSize, color);
      // 数字正下方：小花色（水平居中对齐数字）
      ctx.font = `${rankSize}px 'FusionPixel','Microsoft YaHei',sans-serif`;
      const rankW = ctx.measureText(rank).width;
      drawSuit(ctx, suit, -hw + m + rankW / 2, -hh + m + rankSize + 8, smallPipH, color);

      // 右下：大花色 +（JQK 加公仔）
      const bigCx = hw - m - bigPipH / 2;
      const bigCy = hh - m - bigPipH / 2;
      if (ri >= 9 && ri < 12) {
        // J/Q/K：先画半透明大花色做底色（watermark），再画公仔
        ctx.save();
        ctx.globalAlpha = 0.32;
        drawSuit(ctx, suit, bigCx, bigCy, bigPipH, color);
        ctx.restore();
        drawCourt(ctx, ri - 9, bigCx, bigCy, bigPipH, color);
      } else {
        // A / 数字牌：仅大花色
        drawSuit(ctx, suit, bigCx, bigCy, bigPipH, color);
      }
    } else {
      // 迷你牌：居中点数 + 下方花色
      const rankSize = Math.floor(h * 0.3);
      drawPixelText(ctx, rank, 0, -hh + 4, rankSize, color, 'center');
      drawSuit(ctx, suit, 0, hh - 4 - h * 0.26, h * 0.24, color);
    }
  } else {
    // 牌背：深蓝底 + 斜纹 + 双细框 + 中心徽章
    ctx.fillStyle = BORDER;
    rr(ctx, -hw, -hh, w, h, 3);
    ctx.fill();
    ctx.fillStyle = '#3c4c9c';
    rr(ctx, -hw + 1.5, -hh + 1.5, w - 3, h - 3, 2);
    ctx.fill();
    ctx.save();
    rr(ctx, -hw + 4.5, -hh + 4.5, w - 9, h - 9, 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(148,163,230,0.35)';
    ctx.lineWidth = 0.5;
    for (let d = -h; d < w + h; d += 5) {
      ctx.beginPath();
      ctx.moveTo(-hw + d, -hh);
      ctx.lineTo(-hw + d - h, hh);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#8b9be0';
    ctx.lineWidth = 0.5;
    rr(ctx, -hw + 4.5, -hh + 4.5, w - 9, h - 9, 2);
    ctx.stroke();
    rr(ctx, -hw + 6.5, -hh + 6.5, w - 13, h - 13, 1.5);
    ctx.stroke();
    const bw = Math.min(w, h) * 0.16;
    ctx.fillStyle = '#ffd76e';
    ctx.beginPath();
    ctx.moveTo(0, -bw); ctx.lineTo(bw, 0); ctx.lineTo(0, bw); ctx.lineTo(-bw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#26225c';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  if (opts.dim) {
    ctx.fillStyle = 'rgba(20, 16, 43, 0.55)';
    rr(ctx, -hw, -hh, w, h, 3);
    ctx.fill();
  }
  ctx.restore();
}

export function drawCardBack(ctx, x, y, w, h, opts = {}) {
  drawCard(ctx, x, y, w, h, null, false, opts);
}

// 筹码堆
export function drawChipStack(ctx, x, y, amount, labelColor = '#f4efe3') {
  if (amount <= 0) return;
  drawChipPile(ctx, x, y, amount);
  drawPixelText(ctx, fmt(amount), x, y - chipCount(amount) * 3 - 14, 12, labelColor, 'center', '#14102b');
}

function chipCount(amount) {
  return Math.max(1, Math.min(7, Math.ceil(Math.log10(amount + 1) * 2)));
}

// 无标签筹码堆（底池可视化）
export function drawChipPile(ctx, x, y, amount) {
  if (amount <= 0) return;
  const n = chipCount(amount);
  for (let i = 0; i < n; i++) {
    const cy = y - i * 3.2;
    ctx.fillStyle = '#1c1a2e';
    ctx.beginPath(); ctx.arc(x, cy, 9, 0, 7); ctx.fill();
    ctx.fillStyle = i % 2 ? '#d95050' : '#4f7bd9';
    ctx.beginPath(); ctx.arc(x, cy - 1, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2ead8';
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + i * 0.5;
      ctx.save();
      ctx.translate(x, cy - 1);
      ctx.rotate(a);
      ctx.fillRect(5.6, -1.6, 2.2, 3.2);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(x, cy - 1, 3.4, 0, 7); ctx.stroke();
  }
}

export function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}
