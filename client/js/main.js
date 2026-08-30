// 客户端入口：状态管理、网络事件、输入、场景调度
import { Net } from './net.js';
import { drawMenu, drawRoomLobby, drawTable, drawConnectOverlay, drawPanels, drawBackdrop, notifyHole, notifyBoard, notifyShowdown, notifyReveal, notifyDeal, resetHandAnim, renderState, betSpotFor, POT_POS, seatDisplayPos, drawToast, notifyEmote, notifyRabbit, addBet, clearBets, syncBets, displayBets, notifyBoardHold } from './render.js';
import { POINTER, resetFrame } from './ui.js';
import { FX, sfx, confetti, floatText, shake, updateFX, setVolume, flyChips, clickRing } from './fx.js';
import { Music } from './music.js';
import { equity, eval7, scoreName } from './equity.js';
import { defaultAvatar, validAvatar } from './avatar.js';
import { setThemeId } from './theme.js';

const W = 960, H = 540;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const domInput = document.getElementById('dom-input');

// ── 全局状态 ────────────────────────────────────────
const S = {
  screen: 'menu',
  snap: null,           // 服务器房间快照
  rooms: [],
  prompt: null,         // {options, deadline}
  myCards: null,
  volume: FX.volume,
  musicVol: Music.volume,
  track: Music.trackId,
  toast: null,
  toastUntil: 0,
  connected: false,
  joinOpen: false,
  panel: null,          // 'stats' | 'history' | 'replay' | 'profile'
  history: [],          // 手牌流水
  stats: [],            // 房间战绩 [name, {hands,wins,net}]
  replay: null,         // {rec, steps, i, auto, lastAdvance}
  avatar: localStorage.getItem('pt_avatar') || '',
  avatarDraft: null,    // 个人中心里未保存的头像
  profile: null,        // get_profile 响应
  winRate: null,        // 实时胜率 0-1
  _wrKey: '',           // 胜率缓存键（牌/公共牌/人数变化才重算）
  dom: {
    name: { x: 0, y: 0, w: 0, h: 0 },
    join: { x: 0, y: 0, w: 0, h: 0 },
  },
  nameInput: '',
  joinInput: '',
};

const net = new Net(onMsg);
S.nameInput = net.name;
if (!validAvatar(S.avatar)) S.avatar = defaultAvatar(S.nameInput);

// ── 缩放（像素完美：≥1 时按 0.5 步进取整，1080p/4K 恰好整数倍）──
function resize() {
  const raw = Math.min(window.innerWidth / W, window.innerHeight / H);
  const s = raw >= 1 ? Math.floor(raw * 2) / 2 : raw;
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
}
window.addEventListener('resize', resize);
resize();

// ── 输入 ────────────────────────────────────────────
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  POINTER.x = p.x; POINTER.y = p.y;
});
canvas.addEventListener('pointerdown', (e) => {
  const p = toLogical(e);
  POINTER.x = p.x; POINTER.y = p.y; POINTER.down = true;
  clickRing(p.x, p.y);
  Music.unlock(); // 首次交互解锁音频
});
window.addEventListener('pointerup', () => {
  POINTER.down = false;
  POINTER.clicked = true;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// DOM 输入框定位（逻辑坐标 → stage 内绝对定位）
function updateDomInput() {
  // 输入框只在菜单/个人中心出现；牌桌与连接遮罩时隐藏
  if (S.screen !== 'menu' || !S.connected) {
    domInput.style.display = 'none';
    return;
  }
  if (S.panel === 'profile') {
    // 个人中心：昵称输入框由面板定位
    const box = S.dom.name;
    if (!box.w) { domInput.style.display = 'none'; return; }
    domInput.style.display = 'block';
    domInput.style.left = box.x + 'px';
    domInput.style.top = box.y + 'px';
    domInput.style.width = box.w + 'px';
    domInput.style.height = box.h + 'px';
    domInput.style.fontSize = (box.h * 0.5) + 'px';
    if (domInput.dataset.mode !== 'name') syncDomMode('name');
    return;
  }
  const box = (S.joinOpen && domInput.dataset.mode === 'join') ? S.dom.join : S.dom.name;
  if (!box.w) { domInput.style.display = 'none'; return; }
  domInput.style.display = 'block';
  domInput.style.left = box.x + 'px';
  domInput.style.top = box.y + 'px';
  domInput.style.width = box.w + 'px';
  domInput.style.height = box.h + 'px';
  domInput.style.fontSize = (box.h * 0.5) + 'px';
}

domInput.addEventListener('input', () => {
  if (domInput.dataset.mode === 'join') S.joinInput = domInput.value;
  else { S.nameInput = domInput.value; net.setName(S.nameInput); }
});
domInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (domInput.dataset.mode === 'join') act.joinConfirm();
    domInput.blur();
  }
  if (e.key === 'Escape') { S.joinOpen = false; syncDomMode('name'); }
});
function syncDomMode(mode) {
  domInput.dataset.mode = mode;
  domInput.maxLength = mode === 'join' ? 6 : 12;
  domInput.value = mode === 'join' ? S.joinInput : S.nameInput;
}

// ── 网络消息 ────────────────────────────────────────
let lastHandNo = 0;
let shownResultsHandNo = 0;

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      S.connected = true;
      if (m.name) S.nameInput = m.name;
      if (m.avatar && validAvatar(m.avatar)) { S.avatar = m.avatar; localStorage.setItem('pt_avatar', m.avatar); }
      net.send({ t: 'set_avatar', avatar: S.avatar }); // 同步本地头像
      break;
    case 'profile':
      S.profile = m.profile;
      if (m.profile.name) S.nameInput = m.profile.name;
      break;
    case 'rooms':
      S.rooms = m.rooms || [];
      break;
    case 'room': {
      const prevPhase = S.snap && S.snap.phase;
      S.snap = m;
      S.screen = 'room';
      if (m.handNo && m.handNo !== lastHandNo) {
        lastHandNo = m.handNo;
        seqClear();
        resetHandAnim();
        syncBets(m);
      }
      if (m.phase === 'lobby' && prevPhase === 'playing') S.prompt = null;
      if (m.you && m.you.cards) S.myCards = m.you.cards;
      // 断线重连期间错过摊牌横幅 → 从快照恢复
      if (m.lastResults && !m.hand && m.lastResults.handNo && m.lastResults.handNo !== shownResultsHandNo) {
        shownResultsHandNo = m.lastResults.handNo;
        notifyShowdown(m.lastResults);
      }
      break;
    }
    case 'hole':
      S.myCards = m.cards;
      notifyHole();
      sfx.deal();
      setTimeout(() => sfx.deal(), 120);
      break;
    case 'prompt':
      S.prompt = m;
      sfx.turn();
      break;
    case 'history':
      S.history = m.hands || [];
      S.stats = m.stats || [];
      if (S.panel === 'replay' && !S.replay) S.panel = 'history';
      break;
    case 'ev':
      handleEv(m);
      break;    case 'error':
      toast(m.msg || '操作失败');
      break;
    case '_disconnected':
      S.connected = false;
      break;
  }
}

// ── 筹码动画辅助（下注位几何由 render.betSpotFor 统一提供，含底池避让）──
const POT = POT_POS;
function seatPosOf(snap, seat) { return seatDisplayPos(snap, seat) || { ...POT }; }
function chipN(amount, bb) {
  const b = Math.max(1, bb || 20);
  return Math.max(2, Math.min(8, Math.round(Math.log2(amount / b + 1) * 3)));
}

// ── 动画序列器：事件入队按节奏播放（筹码飞完才落数字，合池等前序动画完毕）──
const seq = { q: [], busy: false };
function seqPush(fn, wait = 0) {
  const st = { fn, wait };
  if (seq.q.length > 14) st.wait = Math.min(st.wait, 60); // 积压保护：快进
  seq.q.push(st);
  seqPump();
}
function seqPump() {
  if (seq.busy || !seq.q.length) return;
  seq.busy = true;
  const st = seq.q.shift();
  try { st.fn(); } catch (e) { console.error('[seq]', e); }
  setTimeout(() => { seq.busy = false; seqPump(); }, st.wait);
}
function seqClear() { seq.q.length = 0; }

function handleEv(ev) {
  const snap = S.snap;
  const seatPos = (seat) => seatDisplayPos(snap, seat);
  switch (ev.kind) {
    case 'hand_start':
      S.prompt = null;
      S.myCards = null;
      lastHandNo = ev.handNo;
      seqPush(() => { resetHandAnim(); clearBets(); notifyDeal(); sfx.deal(); }, 0);
      break;
    case 'blind': {
      const p = seatPos(ev.seat);
      const label = (ev.seat === (snap && snap.button) ? '小盲 ' : '盲注 ') + ev.amount;
      const to = betSpotFor(snap, ev.seat);
      seqPush(() => {
        if (p) flyChips(p.x, p.y - 10, to.x, to.y, { n: 3, kind: 'bet' });
        if (p) floatText(p.x, p.y - 30, label, '#9a92c2', 12);
      }, 620);
      seqPush(() => { addBet(ev.seat, ev.amount); sfx.chip(); }, 120);
      break;
    }
    case 'action': {
      const p = seatPos(ev.seat);
      const label = ev.type === 'fold' ? '弃牌'
        : ev.type === 'check' ? '看牌'
          : ev.type === 'call' ? `跟注 ${ev.amount}`
            : ev.allIn ? `全下 ${ev.amount}` : `加注到 ${ev.amount}`;
      // 1) 说话：行动浮字
      seqPush(() => {
        if (p) floatText(p.x, p.y - 30, label, ev.type === 'fold' ? '#9a92c2' : ev.allIn ? '#ef5350' : '#ffd76e', 14);
        if (ev.type === 'fold') sfx.fold();
        else if (ev.allIn) { sfx.allin(); shake(0.7); FX.flash = 0.55; }
        else if (ev.type === 'check') sfx.turn();
      }, ev.allIn ? 650 : 420);
      // 2) 筹码飞行
      if (ev.put > 0) {
        const to = betSpotFor(snap, ev.seat);
        seqPush(() => {
          if (p) flyChips(p.x, p.y - 10, to.x, to.y, { n: chipN(ev.put, snap.settings.bb), kind: 'bet' });
        }, 640);
        // 3) 筹码落定 → 显示下注额度数字
        seqPush(() => { addBet(ev.seat, ev.put); sfx.chip(); }, 160);
      }
      // 弃牌：座位上已有的下注筹码随之合入底池
      if (ev.type === 'fold') {
        const had = displayBets().find(b => b.seat === ev.seat);
        if (had) {
          seqPush(() => {
            const from = betSpotFor(snap, ev.seat);
            flyChips(from.x, from.y, POT.x, POT.y, { n: 3, kind: 'bet' });
          }, 640);
          seqPush(() => { addBet(ev.seat, -had.amount); }, 0);
        }
      }
      break;
    }
    case 'street': {
      // 公牌先扣住（背面朝上），等合池动画完毕再逐张翻开
      notifyBoardHold(ev.cards.length);
      const bets = displayBets();
      if (bets.length) {
        seqPush(() => {
          for (const b of bets) {
            const from = betSpotFor(snap, b.seat);
            flyChips(from.x, from.y, POT.x, POT.y, { n: 3, kind: 'bet' });
          }
        }, 680);
      }
      seqPush(() => { clearBets(); }, 0);
      seqPush(() => { notifyBoard(ev.cards.length); sfx.street(); }, 300);
      break;
    }
    case 'reveal':
      seqPush(() => { notifyReveal(ev.seat, ev.name); sfx.flip(); }, 260);
      break;
    case 'showdown': {
      // 等合池/亮牌动画完毕：底池筹码飞向赢家 → 横幅与标签随后
      const me = S.snap && S.snap.you ? S.snap.you.seat : -1;
      seqPush(() => {
        if (S.snap) {
          for (const r of ev.results) {
            const wp = seatPos(r.seat);
            if (wp) flyChips(POT.x, POT.y, wp.x, wp.y - 8, { n: Math.max(4, chipN(r.win, S.snap.settings.bb)), kind: 'collect' });
          }
        }
        shake(0.5);
      }, 750);
      seqPush(() => {
        notifyShowdown({ board: ev.board, pots: ev.pots, results: ev.results, uncontested: ev.uncontested });
        if (S.snap) S.snap.lastResults = { board: ev.board, pots: ev.pots, results: ev.results, uncontested: ev.uncontested };
        const myWin = ev.results.find(r => r.seat === me);
        const sp = seatPos(me >= 0 ? me : ev.results[0] && ev.results[0].seat);
        if (myWin) {
          sfx.win();
          if (sp) confetti(sp.x, sp.y, 34);
        } else if (me >= 0 && S.snap && S.snap.seats.some(s2 => !s2.empty && s2.seat === me && s2.inHand)) {
          sfx.lose();
        } else if (sp) {
          confetti(sp.x, sp.y, 18);
        }
      }, 450);
      break;
    }
    case 'seat':
      if (ev.sit) toast(`${ev.name} 入座`);
      else toast(`${ev.name} 离开了`);
      break;
    case 'rebuy':
      toast('补充筹码 ' + ev.amount);
      break;
    case 'blinds_up':
      toast(`盲注升级：Lv${ev.level} ${ev.sb}/${ev.bb}`);
      sfx.turn();
      break;
    case 'emote':
      notifyEmote(ev.seat, ev.emoji);
      break;
    case 'rabbit':
      seqPush(() => { notifyRabbit(ev.cards); sfx.street(); }, 500);
      break;
    case 'eliminated':
      toast(`${ev.name} 获得第 ${ev.rank} 名，出局`);
      break;
    case 'tournament_over':
      shake(0.8);
      sfx.win();
      break;
    case 'sitout':
      toast(ev.auto ? `${ev.name} 连续超时，已自动休息` : `${ev.name} 休息一手`);
      break;
    case 'sitin':
      toast(`${ev.name} 回到牌局`);
      break;
    case 'room_closed':
      toast('房间已关闭');
      S.snap = null;
      S.screen = 'menu';
      S.prompt = null;
      break;
  }
}

function toast(msg) {
  S.toast = msg;
  S.toastAt = performance.now() / 1000;
  S.toastUntil = S.toastAt + 2.6;
}

// ── 动作 ────────────────────────────────────────────
// 把服务端手牌流水转换成回放时间线
function buildTimeline(rec) {
  const steps = [];
  let pot = 0;
  let board = [];
  for (const a of rec.actions) {
    if (a.k === 'street') {
      board = a.cards;
      steps.push({ type: 'street', street: a.street, cards: a.cards, pot });
    } else {
      pot += a.put || 0;
      steps.push({ type: a.k === 'blind' ? 'blind' : 'act', seat: a.seat, type: a.type, amount: a.amount, put: a.put, street: a.street, pot });
    }
  }
  steps.push({ type: 'showdown', results: rec.results || [], board: rec.board || board, pot });
  return steps;
}

const act = {
  practice: () => { net.send({ t: 'practice' }); syncDomMode('name'); S.joinOpen = false; },
  quickMatch: () => net.send({ t: 'quick_match' }),
  createRoom: () => net.send({ t: 'create_room' }),
  toggleJoin: () => {
    S.joinOpen = !S.joinOpen;
    syncDomMode(S.joinOpen ? 'join' : 'name');
    if (S.joinOpen) domInput.focus();
  },
  joinConfirm: () => {
    const code = S.joinInput.trim();
    if (!code) { toast('请输入房间码'); return; }
    net.send({ t: 'join_room', code });
    S.joinOpen = false;
    syncDomMode('name');
  },
  joinCode: (code) => net.send({ t: 'join_room', code }),
  leave: () => {
    net.send({ t: 'leave' });
    S.snap = null;
    S.screen = 'menu';
    S.prompt = null;
    S.myCards = null;
    S.panel = null;
    S.replay = null;
  },
  start: () => net.send({ t: 'start' }),
  updateSettings: (patch) => net.send({ t: 'update_settings', settings: patch }),
  action: (type, amount) => {
    net.send({ t: 'action', type, amount });
    S.prompt = null;
  },
  rebuy: () => net.send({ t: 'rebuy' }),
  takeSeat: () => net.send({ t: 'take_seat' }),
  setVolume: (v) => { S.volume = v; setVolume(v); },
  setMusicVolume: (v) => { S.musicVol = v; Music.setVolume(v); },
  setTrack: (id) => { S.track = id; Music.setTrack(id); },
  toggleMusic: () => { Music.toggleEnabled(); },
  setTheme: (id) => { setThemeId(id); },
  openStats: () => { S.panel = 'stats'; net.send({ t: 'get_history' }); },
  openHistory: () => { S.panel = 'history'; net.send({ t: 'get_history' }); },
  openProfile: () => { S.panel = 'profile'; S.avatarDraft = null; net.send({ t: 'get_profile' }); },
  closePanel: () => { S.panel = null; S.replay = null; S.avatarDraft = null; },
  setAvatarDraft: (av) => { S.avatarDraft = av; },
  saveProfile: () => {
    if (S.avatarDraft) {
      S.avatar = S.avatarDraft;
      localStorage.setItem('pt_avatar', S.avatar);
      net.send({ t: 'set_avatar', avatar: S.avatar });
      S.avatarDraft = null;
    }
    if (S.nameInput) net.setName(S.nameInput);
    toast('已保存');
    net.send({ t: 'get_profile' });
  },
  sitOut: () => net.send({ t: 'sit_out' }),
  sitIn: () => net.send({ t: 'sit_in' }),
  quickTournament: () => net.send({ t: 'quick_tournament' }),
  emote: (e) => net.send({ t: 'emote', emoji: e }),
  rabbit: () => net.send({ t: 'rabbit' }),
  openReplay: (rec) => {
    S.replay = { rec, steps: buildTimeline(rec), i: 0, auto: false, lastAdvance: 0 };
    S.panel = 'replay';
  },
  replaySeek: (i) => {
    if (!S.replay) return;
    S.replay.i = Math.max(0, Math.min(S.replay.steps.length - 1, Math.round(i)));
  },
  replayToggleAuto: () => {
    if (!S.replay) return;
    S.replay.auto = !S.replay.auto;
    S.replay.lastAdvance = performance.now();
  },
  copyCode: (code) => {
    const done = () => toast('房间码已复制：' + code);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => toast('房间码 ' + code));
    } else toast('房间码 ' + code);
  },
};

// ── 主循环 ──────────────────────────────────────────
// 实时胜率：牌面/人数变化时重算（本地蒙卡，600 次 ≈ 1ms）
function updateWinRate() {
  const snap = S.snap;
  if (!snap || !S.myCards || S.myCards.length !== 2 || !snap.hand) { S.winRate = null; return; }
  const me = snap.seats.find(s => !s.empty && s.seat === snap.you.seat);
  if (!me || me.folded) { S.winRate = null; return; }
  const alive = snap.seats.filter(s => !s.empty && s.inHand && !s.folded).length;
  if (alive < 2) { S.winRate = null; return; }
  const key = `${S.myCards.join(',')}|${snap.hand.board.join(',')}|${alive}|${snap.handNo}`;
  if (key === S._wrKey) return;
  S._wrKey = key;
  const nOpp = alive - 1;
  const sims = snap.hand.board.length >= 4 ? 800 : 500;
  S.winRate = equity(S.myCards, snap.hand.board, nOpp, sims);
}

let lastT = performance.now();
function tick(now) {
  try {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    updateFX(dt);
    if (S.toast && now / 1000 > S.toastUntil) S.toast = null;

    // 菜单入场动画计时
    if (S.screen === 'menu' && S.prevScreen !== 'menu') S.menuEnterAt = now / 1000;
    S.prevScreen = S.screen;

    // 音乐场景跟随
    Music.setScene(!S.connected || S.screen === 'menu' || !S.snap ? 'menu' : 'table');

    // 胜率与行动倒计时 → 渲染桥
    updateWinRate();
    // 胜率平滑滚动
    if (S.winRate != null) {
      S.wrDisp = S.wrDisp == null ? S.winRate : S.wrDisp + (S.winRate - S.wrDisp) * Math.min(1, dt * 7);
      renderState.winRate = S.wrDisp;
    } else {
      S.wrDisp = null;
      renderState.winRate = null;
    }
    // 当前成牌名（3 张公共牌起）
    renderState.handName = (S.winRate != null && S.snap && S.snap.hand && S.snap.hand.board.length >= 3 && S.myCards && S.myCards.length === 2)
      ? scoreName(eval7([...S.myCards, ...S.snap.hand.board]))
      : null;
    if (S.prompt && S.prompt.deadline) {
      // 服务器 deadline 是纪元毫秒，用 Date.now() 求真实剩余
      renderState.total = ((S.snap && S.snap.settings.actionTime) || 30) * 1000;
      renderState.remain = Math.max(0, S.prompt.deadline - Date.now());
    } else {
      renderState.total = 0;
      renderState.remain = 0;
    }

    // 回放自动播放
    if (S.replay && S.replay.auto && now - S.replay.lastAdvance > 900) {
      S.replay.lastAdvance = now;
      if (S.replay.i < S.replay.steps.length - 1) S.replay.i++;
      else S.replay.auto = false;
    }

    ctx.save();
    // 画布物理分辨率 2x（1920×1080），逻辑坐标系仍为 960×540 —— 格子感减半、绘制更细腻
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (!S.connected) {
      drawConnectOverlay(ctx, '正在连接服务器…');
    } else if (S.screen === 'menu' || !S.snap) {
      if (S.panel === 'profile') {
        drawBackdrop(ctx);
        drawPanels(ctx, S, act);
      } else {
        drawMenu(ctx, S, act);
      }
    } else if (S.snap.phase === 'lobby' && !S.snap.hand) {
      drawRoomLobby(ctx, S, act);
    } else {
      drawTable(ctx, S, act);
      drawPanels(ctx, S, act);
    }

    // All-in 全屏闪光
    if (FX.flash > 0.01) {
      ctx.globalAlpha = FX.flash * 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawToast(ctx, S);
    ctx.restore();

    updateDomInput();
  } catch (err) {
    console.error('[frame]', err);
    window.__frameErr = String(err && err.stack || err);
  }
  resetFrame();
  window.__frames = (window.__frames || 0) + 1;
}
function frame(now) {
  tick(now);
  requestAnimationFrame(frame);
}
window.__S = S; // 调试用
window.__act = act; // 调试：直接触发动作
window.__tick = () => tick(performance.now()); // 后台调试：手动驱动一帧

syncDomMode('name');
net.connect();
requestAnimationFrame(frame);
