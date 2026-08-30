// 主题系统：背景 / 牌桌呢绒 / 强调色 / 按钮基调
export const THEMES = [
  {
    id: 'classic', name: '经典绿桌',
    bg: '#1b1638', bgDot: '#2a2355', bgDot2: '#221c48',
    feltOuter: '#12281f', feltMid: '#1c4a34', feltInner: '#2f7a54', feltHi: 'rgba(255,255,255,0.05)',
    accent: '#ff9f43', accent2: '#ffd76e',
    btn: '#2b2f4a', btnBorder: '#f4efe3',
  },
  {
    id: 'neon', name: '霓虹夜',
    bg: '#120f2e', bgDot: '#251d55', bgDot2: '#1c1745',
    feltOuter: '#0d0a26', feltMid: '#2a2170', feltInner: '#4033a8', feltHi: 'rgba(180,160,255,0.08)',
    accent: '#ff4fa3', accent2: '#7ef9ff',
    btn: '#241d52', btnBorder: '#b9a6ff',
  },
  {
    id: 'casino', name: '赌场红绒',
    bg: '#240d13', bgDot: '#3d1620', bgDot2: '#33121b',
    feltOuter: '#33101a', feltMid: '#6d2333', feltInner: '#96304a', feltHi: 'rgba(255,220,150,0.06)',
    accent: '#ffd76e', accent2: '#ffb84d',
    btn: '#3d1a2a', btnBorder: '#ffd76e',
  },
  {
    id: 'mono', name: '暗夜石墨',
    bg: '#0f1014', bgDot: '#1d1f27', bgDot2: '#171920',
    feltOuter: '#101216', feltMid: '#2b303b', feltInner: '#3d4453', feltHi: 'rgba(255,255,255,0.05)',
    accent: '#4dd6c4', accent2: '#9be8dd',
    btn: '#1e2129', btnBorder: '#9aa3b2',
  },
];

const KEY = 'pt_theme';
let current = null;

export function getTheme() {
  if (current) return current;
  const id = localStorage.getItem(KEY);
  current = THEMES.find(t => t.id === id) || THEMES[0];
  return current;
}

export function setThemeId(id) {
  current = THEMES.find(t => t.id === id) || THEMES[0];
  localStorage.setItem(KEY, current.id);
  return current;
}

export function themeIndex() {
  return THEMES.indexOf(getTheme());
}
