// 像素头像：12 个 16×16 精绘角色 × 8 主色，编码 "p<图案>.c<颜色>"
// 字符图例：X=主色 W=白 K=暗部 R=红 G=金
const PATTERNS = [
  // 1 国王
  [
    '...G...GG...G...',
    '...GG..GG..GG...',
    '...GGG.GG.GGG...',
    '...GGGGGGGGGG...',
    '...GGGRRRRGGG...',
    '...GGGGGGGGGG...',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '...XKKXXXXKKX...',
    '...XXXXXXXXXX...',
    '...XXWWXXWWXX...',
    '...XXXXXXXXXX...',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '..WWW.WWWW.WWW..',
    '...WWWWWWWWWW...',
  ],
  // 2 猫
  [
    '..X..........X..',
    '..XX........XX..',
    '..XXX......XXX..',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXKKXXXXXXKKXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXWWXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    'XXXXXXXXXXXXXXXX',
    '.XX.XX.XX.XX.XX.',
  ],
  // 3 青蛙
  [
    '..XXX......XXX..',
    '.XWKXX....XXKWX.',
    '.XXXXX....XXXXX.',
    '.XXXXXXXXXXXXXX.',
    'XXXXXXXXXXXXXXXX',
    'XWXXXXXXXXXXXXWX',
    'XXXXXXXXXXXXXXXX',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '.XX.XXXXXXXX.XX.',
    'XX...XXXXXX...XX',
  ],
  // 4 机器人
  [
    '.......XX.......',
    '.......XX.......',
    '....XXXXXXXX....',
    '..XXXXXXXXXXXX..',
    '..XWWXXXXXXWWX..',
    '..XXXXXXXXXXXX..',
    '..XXXRXXXXRXXX..',
    '..XXXXXXXXXXXX..',
    '.....XXXXXX.....',
    '..XXXXXXXXXXXX..',
    '..XXRKXXXXKRXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XX......XX...',
  ],
  // 5 幽灵
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXKKXXXXKKXX..',
    '..XXKKXXXXKKXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
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
    '.XXXKKXXXXKKXXX.',
    '.XXXXKKXXKKXXXX.',
    '.XXXXXKXXKXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XX.XXXX.XX...',
  ],
  // 7 王冠
  [
    '..G....GG....G..',
    '..GG...GG...GG..',
    '..GGG..GG..GGG..',
    '..GGGG.GG.GGGG..',
    '..GGGGGGGGGGGG..',
    '..GGGGGGGGGGGG..',
    '..GGRRGGGGRRGG..',
    '..GGGGGGGGGGGG..',
    '..GGGGGRRGGGGG..',
    '..GGGGGGGGGGGG..',
  ],
  // 8 骷髅
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXKKKXXXXKKKXX.',
    '.XXKKKXXXXKKKXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXKKXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
    '.....X.XX.X.....',
  ],
  // 9 恶魔
  [
    '.XX..........XX.',
    '.XXX........XXX.',
    '..XXX......XXX..',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXKKXXXXXXKKXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '...XWXX..XXWX...',
    '....XX....XX....',
  ],
  // 10 独眼怪
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '.XXXXXXXXXXXXXX.',
    '.XXXWWWWWWWWXXX.',
    '.XXXWWKKKKWWXXX.',
    '.XXXWWKKKKWWXXX.',
    '.XXXWWWWWWWWXXX.',
    '.XXXXXXXXXXXXXX.',
    '..XXXXXXXXXXXX..',
    '.XX..XX..XX..XX.',
  ],
  // 11 蘑菇
  [
    '.....XXXXXX.....',
    '...XXXXXXXXXX...',
    '..XXWWXXXXWWXX..',
    '.XXXWWXXXXWWXXX.',
    '.XXXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXXX.',
    '....XXXXXXXX....',
    '....XWXXXXWX....',
    '....XXXXXXXX....',
    '....XXXXXXXX....',
  ],
  // 12 忍者
  [
    '......XXXX......',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXXRRXXRRXXX..',
    '..XXKKXXXXKKXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXWWWWWWXXX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
  ],
];

export const AVATAR_COUNT = PATTERNS.length;
export const AVATAR_COLORS = ['#e85050', '#ff9f43', '#ffd76e', '#5cbf60', '#4dd6c4', '#5c8dff', '#b57bee', '#f06292'];

// 字符 → 颜色映射（主色动态传入）
function glyphColor(ch, main) {
  switch (ch) {
    case 'X': return main;
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
  ctx.save();
  // 底板
  ctx.fillStyle = opts.bg || '#14102b';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = opts.border || main;
  ctx.lineWidth = Math.max(1, size / 24);
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  // 图案
  rows.forEach((row, y2) => {
    for (let x2 = 0; x2 < row.length; x2++) {
      const ch = row[x2];
      if (ch === '.') continue;
      ctx.fillStyle = glyphColor(ch, main);
      ctx.fillRect(x + x2 * px, y + y2 * px, px + 0.4, px + 0.4);
    }
  });
  ctx.restore();
}

// 默认头像（昵称哈希）
export function defaultAvatar(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'p' + (1 + h % AVATAR_COUNT) + '.c' + (1 + (h >> 4) % AVATAR_COLORS.length);
}
