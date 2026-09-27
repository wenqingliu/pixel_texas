// 像素头像：12 个 32×32 精绘角色 × 8 主色，编码 "p<图案>.c<颜色>"
// 绘制采用"半幅镜像"：每个图案只手绘左半 16 列，渲染时镜像补全右半 —— 天然对称、必然居中。
// 字符图例：X=主色 L=主色亮部 D=主色暗部 W=白 K=深线 R=红 G=金
// 渲染：主色自动生成明暗两档；图案整体自动外描边（贴纸轮廓）；垂直居中；底板带落地阴影。
const PATTERNS = [
  // 1 国王：金冠红宝石 + 白脸长须 + 主色王袍
  [
    '.....GGGG....GGG',
    '....GGGGGG...GGG',
    '....GGGGGGGGGGGG',
    '....GGGRRRGGGGGG',
    '....GGGGGGGGGGGG',
    '......WWWWWWWWWW',
    '......WWKKWWWWWW',
    '......WWKKWWWWWW',
    '......WWWWWWWWWW',
    '......WWWWWWWWWW',
    '.....WWWWWWWWWWW',
    '.....WWWWWWWWWWW',
    '.....WWWWWWWWWWW',
    '....WWWWWWWWWWWW',
    '....WWWWWWWWWWWW',
    '....WWWWWWWWWWWW',
    '....XXXXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '....DDDDDDDDDDDD',
  ],
  // 2 猫：尖耳竖瞳 + 红鼻
  [
    '.....XXX........',
    '....XXXXX.......',
    '....XXDXX.......',
    '...XXXXXXXXXXXXX',
    '...XXXXXXXXXXXXX',
    '...XLXXXXXXXXXXX',
    '...XXXXXXXXWWKXX',
    '...XXXXXXXXWWKXX',
    '...XXXXXXXXXXXXX',
    '...XXXXXXXXXXXXR',
    '...XXXXXXXXXXXXK',
    '...XXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
  ],
  // 3 青蛙：头顶大眼 + 宽嘴
  [
    '.....XXXXX......',
    '....XXXXXXX.....',
    '....XWWKXXX.....',
    '....XWWKXXX.....',
    '..XXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXLXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXKKKKK',
    'XXXXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '.XXX..XXXX..XXX.',
  ],
  // 4 机器人：天线红灯 + 屏幕眼 + 格栅嘴 + 胸灯
  [
    '...............R',
    '..............XX',
    '..............XX',
    '....XXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXWWWWXXXWWWWX',
    '..XXWWKKXXXKKWWX',
    '..XXXXXXXXXXXXXX',
    '..XXXKKKKKKXXXXX',
    '..........XXXXXX',
    '...XXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXRXXXXRXXXX',
    '..XXXXXXXXXXXXXX',
    '..DDDDDDDDDDDDDD',
    '....XXXXXX......',
    '....XXXXXX......',
    '...XXXXXXX......',
  ],
  // 5 幽灵：白瞳 + 波浪裙摆
  [
    '.........XXXXXXX',
    '.......XXXXXXXXX',
    '.....XXXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXWWKXXXXXXXX',
    '..XXXWWKXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XLXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXX..XXXXXX',
    '..XXX..XXXX..XXX',
  ],
  // 6 外星人：大头斜眼
  [
    '.........XXXXXXX',
    '.......XXXXXXXXX',
    '.....XXXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXKKKKXXXXXXX',
    'XXXXKKKKKXXXXXXX',
    'XXXXXKKKKXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXKK',
    'XXXXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '......XXXXXXXXXX',
  ],
  // 7 王冠：三尖金冠 + 红宝石
  [
    '....GGG.......GG',
    '....GGGG......GG',
    '....GGGGG.....GG',
    '....GGGGGG....GG',
    '....GGGGGGG...GG',
    '....GGGGGGGG..GG',
    '....GGGGGGGGGGGG',
    '....GGGGGGGGGGGG',
    '....GGRGGGGGGRGG',
    '....GGGGGGGGGGRG',
    '....GGGGGGGGGGGG',
  ],
  // 8 骷髅：眼洞 + 鼻孔 + 牙缝
  [
    '.........WWWWWWW',
    '.......WWWWWWWWW',
    '.....WWWWWWWWWWW',
    '....WWWWWWWWWWWW',
    '..WWWWWWWWWWWWWW',
    '..WWWWWWWWWWWWWW',
    '..WKKKKWWWWWWWWW',
    '..WKKKKWWWWWWWWW',
    '..WKKKKWWWWWWWWW',
    '..WWWWWKKKWWWWWW',
    '..WWWWWWWWWWWWWW',
    '..WWWWWWWWWWWWWW',
    '..WWWWWWWWWWWWWW',
    '...WWWWWWWWWWWWW',
    '...WWKWWKWWKWWWW',
    '...WWKWWKWWKWWWW',
    '....WWWWWWWWWWWW',
  ],
  // 9 恶魔：弯角 + 白牙
  [
    '..XXX...........',
    '.XXXX...........',
    '..XXXX..........',
    '...XXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXLXXXXXXXXXXXXX',
    'XXXXXXXXXKKKXXXX',
    'XXXXXXXXXKKKXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXKKKKKXXX',
    'XXXXXXXXWWXXWWXX',
    'XXXXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '....XXXXXXXXXXXX',
  ],
  // 10 独眼怪：大眼珠
  [
    '........XXXXXXXX',
    '......XXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXWWWWWWWWXXXX',
    'XXXWWWWWWWWWWXXX',
    'XXXWWWWWWWWWWKKX',
    'XXXWWWWWWWWWWKKX',
    'XXXWWWWWWWWWWXXX',
    'XXXXWWWWWWWWXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXLXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '.XXX..XXXX..XXXX',
  ],
  // 11 蘑菇：斑点伞盖 + 白柄
  [
    '........XXXXXXXX',
    '......XXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '..XXWWXXXXWWXXXX',
    '.XXWWWWXXWWWWXXX',
    '.XXWWWWXXWWWWXXX',
    '.XXXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXXX',
    '...XXXXXXXXXXXXX',
    '......WWWWWWWWWW',
    '......WWKKWWWWWW',
    '......WWWWWWWWWW',
    '......WWWWWWWWWW',
    '......WWWWWWWWWW',
  ],
  // 12 忍者：红额带 + 露眼缝
  [
    '......XXXXXXXXXX',
    '....XXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXRRRRRRRRXXXX',
    '..XXWWWWWWWWXXXX',
    '..XXWWWWWKKWXXXX',
    '..XXXXXXXXXXXXXX',
    '..XLXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '..XXXXXXXXXXXXXX',
    '...XXXXXXXXXXXXX',
    '....XXXXXXXXXXXX',
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
  // 半幅镜像补全（左半 16 列 → 全幅 32 列），天然左右对称、必然水平居中
  const rows = PATTERNS[pi].map(r => r + [...r].reverse().join(''));
  const H = rows.length;
  const oy = Math.floor((32 - H) / 2); // 垂直居中
  const px = size / 32;
  const solid = (r, c) => r >= 0 && r < H && c >= 0 && c < 32 && rows[r][c] !== '.';
  ctx.save();
  // 底板：暗底 + 底部落地阴影
  ctx.fillStyle = opts.bg || '#14102b';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x, y + size * 0.74, size, size * 0.26);
  // 自动外描边：空位且四邻有实体 → 深色，勾出贴纸轮廓
  ctx.fillStyle = '#0d0b18';
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < 32; c++) {
      if (solid(r, c)) continue;
      if (solid(r - 1, c) || solid(r + 1, c) || solid(r, c - 1) || solid(r, c + 1)) {
        ctx.fillRect(x + c * px, y + (r + oy) * px, px + 0.4, px + 0.4);
      }
    }
  }
  // 图案
  rows.forEach((row, r) => {
    for (let c = 0; c < 32; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = glyphColor(ch, main);
      ctx.fillRect(x + c * px, y + (r + oy) * px, px + 0.4, px + 0.4);
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
