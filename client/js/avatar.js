// 像素头像：12 个 16×16 精绘角色 × 8 主色，编码 "p<图案>.c<颜色>"
// 字符图例：X=主色 L=主色亮部 D=主色暗部 W=白 K=深线 R=红 G=金
// 渲染时自动生成主色明暗两档，并给图案整体加一圈深色外描边（贴纸质感）
const PATTERNS = [
  // 1 国王
  [
    '...G...GG...G...',
    '...GG..GG..GG...',
    '...GGG.GG.GGG...',
    '...GGGGGGGGGG...',
    '...GGGRRRRGGG...',
    '...GGGGGGGGGG...',
    '....WWWWWWWW....',
    '....WKWWWWKW....',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '..XXXXXXXXXXXX..',
    '..XXLXXXXXXDXX..',
    '..XXXXXXXXXXXX..',
    '..DDDDDDDDDDDD..',
  ],
  // 2 猫
  [
    '..X..........X..',
    '..XX........XX..',
    '..XDX......XDX..',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XLXXXXXXXXXXDX.',
    '.XWWKXXXXXXKWWX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXRRXXXXX..',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XX.XX.XX.XX.XX.',
  ],
  // 3 青蛙
  [
    '..XXX......XXX..',
    '.XWWKX....XKWWX.',
    '.XWWKX....XKWWX.',
    '.XXXXXXXXXXXXXX.',
    'XWLXXXXXXXXXXDWX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '.XX.XXXXXXXX.XX.',
    'XX...XXXXXX...XX',
  ],
  // 4 机器人
  [
    '.......RR.......',
    '.......XX.......',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XLWWXXXXWWDX..',
    '..XLWKXXXXWKDX..',
    '..XXXXXXXXXXXX..',
    '..XXXKKKKKKXXX..',
    '.....XDXXDX.....',
    '..XXXXXXXXXXXX..',
    '..XXLXXXXXXDXX..',
    '..XXLXXXXXXDXX..',
    '...XX......XX...',
  ],
  // 5 幽灵
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXWWXXXWWXXX..',
    '..XXWKXXXWKXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XLXXXXXXXXDX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '.XX..XX..XX..XX.',
  ],
  // 6 外星人
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXWWKXXKWWXXXX.',
    '.XXWKKXXKKWXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XLXXXXXXXXXXDX.',
    '..XXXXXXXXXXXX..',
    '..XXXKKXXKKXXX..',
    '...XX.XXXX.XX...',
  ],
  // 7 王冠
  [
    '..G....GG....G..',
    '..GG...GG...GG..',
    '..GGG..GG..GGG..',
    '..GGGG.GG.GGGG..',
    '..GGGGGGGGGGGG..',
    '..GLGGGGGGGGDG..',
    '..GGGGGGGGGGGG..',
    '..GGRGGGGGGRGG..',
    '..GGGGGRRGGGGG..',
    '..GGGGGGGGGGGG..',
  ],
  // 8 骷髅
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XLXXXXXXXXXXDX.',
    '.XXKKKXXXXKKKXX.',
    '.XXKKKXXXXKKKXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXKKXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '....XX.XX.XX....',
  ],
  // 9 恶魔
  [
    '.XX..........XX.',
    '.XDX........XDX.',
    '..XDX......XDX..',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XLXXXXXXXXXXDX.',
    '.XXKKXXXXXXKKXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '..XXXKKKKKKXXX..',
    '..XXWWXXXXWWXX..',
    '...XX......XX...',
  ],
  // 10 独眼怪
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXWWWWWWWWWWXX.',
    '.XXWWWWKKWWWWXX.',
    '.XXWWWWKKWWWWXX.',
    '.XXWWWWWWWWWWXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '.XX..XX..XX..XX.',
  ],
  // 11 蘑菇
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXWWXXXWWXXX..',
    '.XXWWWWXXWWXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XLXXXXXXXXXXDX.',
    '....XXXXXXXX....',
    '....XWWWWWWX....',
    '....XWWWWWWX....',
    '....XXXXXXXX....',
  ],
  // 12 忍者
  [
    '......XXXX......',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXWWWWWWWWXX..',
    '..XWWKXXXXKWWX..',
    '..XXRRRRRRRRXX..',
    '..XXXXXXXXXXXX..',
    '..XLXXXXXXXXDX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
  ],
];

export const AVATAR_COUNT = PATTERNS.length;
export const AVATAR_COLORS = ['#e85050', '#ff9f43', '#ffd76e', '#5cbf60', '#4dd6c4', '#5c8dff', '#b57bee', '#f06292'];

// 主色明暗两档（亮部/暗部），渲染 L/D 字符用
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// 字符 → 颜色映射（主色动态传入）
function glyphColor(ch, main) {
  switch (ch) {
    case 'X': return main;
    case 'L': return shade(main, 1.34);
    case 'D': return shade(main, 0.62);
    case 'W': return '#f2ead8';
    case 'K': return '#1b1826';
    case 'R': return '#e04848';
    case 'G': return '#ffd76e';
    default: return main;
  }
}

export function validAvatar(av) {
  return typeof av === 'string' && /^p(\d+)\.c(\d+)$/.test(av);
}

export function drawAvatar(ctx, x, y, size, av, opts = {}) {
  let pi = 0, ci = 0;
  if (validAvatar(av)) {
    pi = ((parseInt(av.slice(1).split('.')[0], 10) - 1) % PATTERNS.length + PATTERNS.length) % PATTERNS.length;
    ci = (parseInt(av.split('.c')[1], 10) - 1) % AVATAR_COLORS.length;
  }
  const main = AVATAR_COLORS[(ci + AVATAR_COLORS.length) % AVATAR_COLORS.length];
  const rows = PATTERNS[pi];
  const px = size / 16;
  const solid = (r, c) => r >= 0 && r < rows.length && c >= 0 && c < 16 && rows[r][c] !== '.';
  ctx.save();
  // 底板：暗底 + 底部落地阴影
  ctx.fillStyle = opts.bg || '#14102b';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x, y + size * 0.74, size, size * 0.26);
  // 自动外描边：空位且四邻有实体 → 深色，勾出贴纸轮廓
  ctx.fillStyle = '#0d0b18';
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 16; c++) {
      if (solid(r, c)) continue;
      if (solid(r - 1, c) || solid(r + 1, c) || solid(r, c - 1) || solid(r, c + 1)) {
        ctx.fillRect(x + c * px, y + r * px, px + 0.4, px + 0.4);
      }
    }
  }
  // 图案
  rows.forEach((row, y2) => {
    for (let x2 = 0; x2 < row.length; x2++) {
      const ch = row[x2];
      if (ch === '.') continue;
      ctx.fillStyle = glyphColor(ch, main);
      ctx.fillRect(x + x2 * px, y + y2 * px, px + 0.4, px + 0.4);
    }
  });
  ctx.strokeStyle = opts.border || main;
  ctx.lineWidth = Math.max(1, size / 24);
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.restore();
}

// 默认头像（昵称哈希）
export function defaultAvatar(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'p' + (1 + h % AVATAR_COUNT) + '.c' + (1 + (h >> 4) % AVATAR_COLORS.length);
}
