// 即时模式 canvas UI 组件：按钮 / 复选框 / 循环选择 / 滑条
// 每帧构建，事件由 main 注入，命中检测在绘制时进行
import { drawPixelText, sfx } from './fx.js';
import { getTheme } from './theme.js';

export const POINTER = { x: -100, y: -100, down: false, clicked: false };

export function resetFrame() { POINTER.clicked = false; }

function inRect(px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; }

// 像素圆角矩形（小圆角，手动阶梯）
function pixelRect(ctx, x, y, w, h, fill, border, r = 3) {
  ctx.fillStyle = border;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
  ctx.fillRect(x + 1, y + 2, w - 2, h - 4);
  void r;
}

export function drawPixelTextSafe(ctx, text, x, y, size, color, align, outline) {
  drawPixelText(ctx, text, x, y, size, color, align, outline);
}

// ── 按钮 ────────────────────────────────────────────
const hoverWobble = new Map(); // id → wob time

export function button(ctx, id, x, y, w, h, label, opts = {}) {
  const hover = inRect(POINTER.x, POINTER.y, x, y, w, h);
  const pressed = hover && POINTER.down;
  const clicked = hover && POINTER.clicked;

  if (hover) {
    if (!hoverWobble.has(id)) sfx.hover();
    hoverWobble.set(id, (hoverWobble.get(id) || 0) + 0.016);
  } else {
    hoverWobble.delete(id);
  }
  const wobT = hoverWobble.get(id) || 0;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (hover) {
    ctx.rotate(Math.sin(wobT * 14) * 0.022);
    const s = pressed ? 0.94 : 1.05;
    ctx.scale(s, s);
  }
  const th = getTheme();
  const fill = opts.disabled ? '#262239' : (opts.fill || th.btn);
  const border = opts.disabled ? '#3a3552' : (hover && !opts.disabled ? th.accent : (opts.border || th.btnBorder));
  pixelRect(ctx, -w / 2, -h / 2, w, h, fill, border);
  if (!opts.disabled && hover) {
    const th2 = getTheme();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = th2.accent;
    ctx.fillRect(-w / 2 + 2, -h / 2 + 1, w - 4, h - 2);
    ctx.globalAlpha = 1;
  }
  const size = opts.size || 14;
  drawPixelText(ctx, label, 0, -size / 2 - 1, size, opts.disabled ? '#6a6484' : (opts.color || '#f4efe3'), 'center');
  ctx.restore();

  if (clicked && !opts.disabled) {
    sfx.click();
    return true;
  }
  return false;
}

// ── 复选框 ──────────────────────────────────────────
export function checkbox(ctx, id, x, y, label, checked, opts = {}) {
  const box = 18;
  const th = getTheme();
  const hover = inRect(POINTER.x, POINTER.y, x, y - 2, box + 8 + ctx.measureText(label).width + 40, box + 4);
  pixelRect(ctx, x, y, box, box, checked ? th.accent : '#14102b', hover ? th.accent : '#f4efe3');
  if (checked) {
    ctx.fillStyle = '#1b1638';
    ctx.fillRect(x + 4, y + 7, 3, 6);
    ctx.fillRect(x + 6, y + 9, 3, 6);
    ctx.fillRect(x + 8, y + 11, 3, 4);
    ctx.fillRect(x + 10, y + 5, 3, 6);
  }
  drawPixelText(ctx, label, x + box + 8, y + 3, opts.size || 13, '#f4efe3');
  if (inRect(POINTER.x, POINTER.y, x - 2, y - 2, box + 4, box + 4) && POINTER.clicked) {
    sfx.click();
    return !checked;
  }
  return checked;
}

// ── 循环选择（左右箭头 + 当前值）────────────────────
export function cycle(ctx, id, x, y, w, label, options, idx, opts = {}) {
  drawPixelText(ctx, label, x, y + 4, 13, '#9a92c2');
  const bw = 22, bh = 20, bx = x + w - bw * 2 - 6, by = y;
  const valW = w - bw * 2 - 10;
  drawPixelText(ctx, options[idx], x + valW / 2, by + 3, 13, opts.color || getTheme().accent2, 'center');
  // 左右按钮
  const hitL = button(ctx, id + '_l', bx, by, bw, bh, '<', { size: 12, fill: '#1f1b38' });
  const hitR = button(ctx, id + '_r', bx + bw + 6, by, bw, bh, '>', { size: 12, fill: '#1f1b38' });
  if (hitL) return (idx - 1 + options.length) % options.length;
  if (hitR) return (idx + 1) % options.length;
  return idx;
}

// ── 滑条 ────────────────────────────────────────────
export function slider(ctx, id, x, y, w, value, min, max, opts = {}) {
  const h = 14;
  const hover = inRect(POINTER.x, POINTER.y, x - 4, y - 6, w + 8, h + 12);
  // 槽
  pixelRect(ctx, x, y + 3, w, 6, '#14102b', '#3a3552');
  const k = (value - min) / Math.max(1, max - min);
  const kx = x + k * w;
  ctx.fillStyle = '#5c8dff';
  ctx.fillRect(x + 2, y + 5, Math.max(0, kx - x - 2), 2);
  // 把手
  const kw = 10;
  pixelRect(ctx, kx - kw / 2, y - 2, kw, h + 4, hover ? '#ff9f43' : '#f4efe3', '#1b1638');
  if (hover) {
    POINTER._sliderDrag = POINTER.down ? id : (POINTER.down ? POINTER._sliderDrag : null);
    if (POINTER.down) POINTER._sliderDrag = id;
  } else if (!POINTER.down && POINTER._sliderDrag === id) {
    POINTER._sliderDrag = null;
  }
  if (POINTER._sliderDrag === id) {
    const v = min + Math.max(0, Math.min(1, (POINTER.x - x) / w)) * (max - min);
    return opts.integer ? Math.round(v) : v;
  }
  return value;
}

// 文本按钮（无边框小字）
export function textButton(ctx, id, x, y, size, label, color = '#9a92c2') {
  ctx.font = `${size}px 'FusionPixel','Microsoft YaHei',sans-serif`;
  const w = ctx.measureText(label).width;
  const hover = inRect(POINTER.x, POINTER.y, x - 2, y - 2, w + 4, size + 4);
  drawPixelText(ctx, label, x, y, size, hover ? '#ffd76e' : color);
  if (hover && POINTER.clicked) { sfx.click(); return true; }
  return false;
}
