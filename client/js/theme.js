// 主题系统：背景 / 牌桌呢绒 / 强调色 / 按钮基调 / UI 语义色板
// UI 语义色（panel/text/gold...）供 render 层统一引用，替代零散硬编码，
// 让面板、名牌、文字随主题整体切换而不是只有背景和呢绒。
const UI_BASE = {
  panel: '#241f42',        // 面板 / 名牌底
  panelDim: '#1d1936',     // 更暗一档（弃牌 / 禁用底）
  panelBorder: '#3a3560',  // 面板描边
  text: '#f4efe3',         // 主文字
  textDim: '#9a92c2',      // 次文字
  textFaint: '#8b85ad',    // 弱文字 / 提示（已提亮，保证可读）
  gold: '#ffd76e',         // 金额 / 金色强调
  danger: '#ef5350',       // 危险 / 弃牌 / 超时
  ok: '#66bb6a',           // 成功 / 跟注 / 通过
  info: '#5c8dff',         // 信息 / 机器人 / 链接
};

export const THEMES = [
  {
    id: 'classic', name: '经典绿桌',
    bg: '#1b1638', bgDot: '#2a2355', bgDot2: '#221c48',
    feltOuter: '#12281f', feltMid: '#1c4a34', feltInner: '#2f7a54', feltHi: 'rgba(255,255,255,0.05)',
    accent: '#ff9f43', accent2: '#ffd76e',
    btn: '#2b2f4a', btnBorder: '#f4efe3',
    ...UI_BASE,
  },
  {
    id: 'neon', name: '霓虹夜',
    bg: '#120f2e', bgDot: '#251d55', bgDot2: '#1c1745',
    feltOuter: '#0d0a26', feltMid: '#2a2170', feltInner: '#4033a8', feltHi: 'rgba(180,160,255,0.08)',
    accent: '#ff4fa3', accent2: '#7ef9ff',
    btn: '#241d52', btnBorder: '#b9a6ff',
    ...UI_BASE,
    panel: '#1e1846', panelBorder: '#453a7a', panelDim: '#161236',
    text: '#f2eaff', textDim: '#a89ed4',
    gold: '#7ef9ff', info: '#9d8bff',
  },
  {
    id: 'casino', name: '赌场红绒',
    bg: '#240d13', bgDot: '#3d1620', bgDot2: '#33121b',
    feltOuter: '#33101a', feltMid: '#6d2333', feltInner: '#96304a', feltHi: 'rgba(255,220,150,0.06)',
    accent: '#ffd76e', accent2: '#ffb84d',
    btn: '#3d1a2a', btnBorder: '#ffd76e',
    ...UI_BASE,
    panel: '#2e1620', panelBorder: '#52283a', panelDim: '#241018',
    text: '#f7ecdd', textDim: '#c9a9b2',
    info: '#e08bb0',
  },
  {
    id: 'mono', name: '暗夜石墨',
    bg: '#0f1014', bgDot: '#1d1f27', bgDot2: '#171920',
    feltOuter: '#101216', feltMid: '#2b303b', feltInner: '#3d4453', feltHi: 'rgba(255,255,255,0.05)',
    accent: '#4dd6c4', accent2: '#9be8dd',
    btn: '#1e2129', btnBorder: '#9aa3b2',
    ...UI_BASE,
    panel: '#1a1c23', panelBorder: '#343a4a', panelDim: '#14161c',
    text: '#e9ecf2', textDim: '#9aa3b2',
    gold: '#9be8dd', ok: '#4dd6c4', info: '#7ea2ff',
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
