// 场景渲染门面：实现按 共享核心 / 菜单 / 牌桌 / 面板 拆分
// 本文件只做 re-export，保持 main.js 的既有导入面不变
//   render-core.js    动画状态、下注显示模型、背景、Toast、连接遮罩
//   render-menu.js    主菜单 + 房间等待界面
//   render-table.js   牌桌 + 座位 + 英雄 + 行动面板 + 结算展示
//   render-panels.js  个人中心 / 战绩 / 回放面板
export {
  W, H, renderState, anim,
  notifyDeal, notifyHole, notifyBoard, notifyBoardHold,
  notifyEmote, notifyRabbit, notifyReveal, notifyShowdown, resetHandAnim,
  addBet, clearBets, syncBets, displayBets,
  drawBackdrop, drawToast, drawConnectOverlay,
} from './render-core.js';
export { drawMenu, drawRoomLobby } from './render-menu.js';
export { drawTable, seatDisplayPos, betSpotFor, POT_POS } from './render-table.js';
export { drawPanels } from './render-panels.js';
