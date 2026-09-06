// 房间：座位管理、机器人补位、牌局节奏、快照协议
import { Hand } from './hand.js';
import { scoreName, eval7 } from './evaluator.js';
import { botDecide, BOT_NAMES, LEVEL_NAMES } from './bots/bot.js';

export const DEFAULT_SETTINGS = { maxSeats: 6, sb: 10, bb: 20, buyIn: 2000, botsFill: true, botLevel: 'normal', mode: 'cash', blindsEvery: 8, actionTime: 30 };
export const BUYIN_OPTIONS = [1000, 2000, 5000, 10000];
export const BLIND_OPTIONS = [
  { sb: 5, bb: 10 }, { sb: 10, bb: 20 }, { sb: 25, bb: 50 }, { sb: 50, bb: 100 },
];
// 锦标赛盲注阶梯（从起始盲注起往上走）
export const BLIND_LEVELS = [
  [5, 10], [10, 20], [25, 50], [50, 100], [75, 150], [100, 200],
  [150, 300], [200, 400], [300, 600], [500, 1000],
];

const ACTION_TIME = 30000;        // 人类行动超时
const BOT_THINK = [800, 2600];    // 机器人思考延迟
const HAND_BREAK = 4200;          // 一手结束到下一手的间隔
const RUNOUT_STEP = 1300;         // 全下跑牌每条街间隔
const ROOM_IDLE_CLOSE = 45000;    // 无人房间关闭时间
// 真人行动节奏：等下注筹码飞行播完(客户端 flyChips dur 0.42~0.6s + seqPush 起飞延迟 ~640ms ≈ 1.24s)+ 0.2s 最小停顿
const ACTION_PACING = 1400;
export const TIMING = { ACTION_TIME, BOT_THINK, HAND_BREAK, RUNOUT_STEP, ROOM_IDLE_CLOSE, ACTION_PACING };

export class Room {
  constructor(lobby, code, hostToken) {
    this.lobby = lobby;
    this.code = code;
    this.settings = { ...DEFAULT_SETTINGS };
    this.hostToken = hostToken;
    this.players = new Map();   // token → {token, name, seat, connected}
    this.seats = new Array(9).fill(null); // 座位对象：{index, token|null, name, chips, isBot, level, sittingOut, leaving}
    this.hand = null;
    this.handNo = 0;
    this.button = 0;
    this.phase = 'lobby';       // lobby | playing | closed
    this.timers = new Set();
    this.lastResults = null;    // 上一手结算（供断线重连/进场展示）
    this.actorDeadline = 0;
    this.pendingSit = [];       // 等待顶替机器人座位的 token
    this.closed = false;
    this._idleTimer = null;     // 空房间闲置关闭计时器

    // 锦标赛 / 回放 / 战绩状态
    this.handLog = [];          // 最近手牌流水（回放用）
    this.stats = new Map();     // name → {hands, wins, net}
    this.eliminations = [];     // 锦标赛淘汰顺序（最新在前）
    this.tournamentOver = null; // 锦标赛排名（结束非空）
    this.tourLevel = 0;         // 盲注级别索引
    this.levelStartHand = 0;    // 当前级别起始手数
    this._rec = null;           // 当前手牌记录
  }

  // ── 计时器 ─────────────────────────────────────────
  addTimer(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.closed) fn(); }, ms);
    this.timers.add(t);
    return t;
  }
  clearTimers() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }

  // ── 玩家管理 ───────────────────────────────────────
  addPlayer(token, name, avatar) {
    this.players.set(token, { token, name, seat: -1, connected: true, avatar: avatar || null, timeouts: 0 });
    this._cancelIdleClose();
  }

  setAvatar(token, avatar) {
    const pl = this.players.get(token);
    if (!pl) return;
    pl.avatar = avatar;
    if (pl.seat >= 0 && this.seats[pl.seat]) this.seats[pl.seat].avatar = avatar;
  }

  _cancelIdleClose() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this.timers.delete(this._idleTimer);
      this._idleTimer = null;
    }
  }

  humanPlayers() { return [...this.players.values()]; }
  seatedCount() { return this.seats.filter(Boolean).length; }
  humanSeated() { return this.seats.filter(s => s && s.token).length; }
  eligibleSeats() { return this.seats.filter(s => s && s.chips > 0 && !s.sittingOut); }

  trySit(token, force = false) {
    const pl = this.players.get(token);
    if (!pl || this.closed) return false;
    if (pl.seat >= 0) {
      const s = this.seats[pl.seat];
      if (s) s.sittingOut = false;
      return true;
    }
    // 锦标赛开赛后不得入座（观战）
    if (this.settings.mode === 'tournament' && this.phase === 'playing') return false;
    for (let i = 0; i < this.settings.maxSeats; i++) {
      if (!this.seats[i]) { this._sitDown(token, i); return true; }
    }
    // 满员：顶替机器人（本手结束后生效）
    if (this.settings.botsFill) {
      const bots = this.seats.filter(s => s && s.isBot);
      if (bots.length) {
        if (this.hand && this.hand.phase !== 'done') {
          if (!this.pendingSit.includes(token)) this.pendingSit.push(token);
          return 'queued';
        }
        const victim = bots[bots.length - 1];
        this.seats[victim.seat] = null;
        this._sitDown(token, victim.seat);
        return true;
      }
    }
    return false;
  }

  _sitDown(token, idx) {
    const pl = this.players.get(token);
    this.seats[idx] = { seat: idx, token, name: pl.name, chips: this.settings.buyIn, isBot: false, level: null, sittingOut: false, avatar: pl.avatar || null };
    pl.seat = idx;
    this.broadcast({ t: 'ev', kind: 'seat', seat: idx, name: pl.name, sit: true });
    this.maybeAutoNext();
  }

  removePlayer(token) {
    const pl = this.players.get(token);
    if (!pl) return;
    this.players.delete(token);
    const i = pl.seat;
    if (i >= 0 && this.seats[i]) {
      const s = this.seats[i];
      const inHand = this.hand && this.hand.phase !== 'done' && this.hand.bySeat(i);
      if (inHand) s.leaving = true; // 本手结束后再撤座（避免结算资金悬空）
      else this.seats[i] = null;
    }
    if (this.hostToken === token) {
      const next = [...this.players.keys()][0];
      this.hostToken = next || null;
    }
    if (this.players.size === 0) {
      this._idleTimer = this.addTimer(() => this.close(), TIMING.ROOM_IDLE_CLOSE);
    }
    this.broadcast({ t: 'ev', kind: 'seat', seat: i, name: pl.name, sit: false });
    this.lobby.onRoomsChanged();
  }

  reconnect(token, ws) {
    const pl = this.players.get(token);
    if (!pl) return false;
    pl.connected = true;
    this.broadcast({ t: 'ev', kind: 'reconnect', name: pl.name });
    return true;
  }

  markDisconnected(token) {
    const pl = this.players.get(token);
    if (pl) pl.connected = false;
  }

  // ── 机器人 ─────────────────────────────────────────
  fillBots() {
    if (!this.settings.botsFill) return;
    // 锦标赛发牌后不再补机器人（开局首填不受影响）、不补买
    if (this.settings.mode === 'tournament' && (this.handNo > 0 || this.hand)) return;
    const used = new Set(this.seats.filter(Boolean).map(s => s.name));
    const pool = BOT_NAMES.filter(n => !used.has(n));
    let pi = 0;
    for (let i = 0; i < this.settings.maxSeats; i++) {
      if (!this.seats[i]) {
        this.seats[i] = {
          seat: i, token: null, name: pool[pi++ % pool.length] || ('机器人' + i),
          chips: this.settings.buyIn, isBot: true, level: this.settings.botLevel, sittingOut: false,
          avatar: 'p' + (1 + Math.floor(Math.random() * 12)) + '.c' + (1 + Math.floor(Math.random() * 8)),
        };
      } else if (this.seats[i].isBot) {
        const b = this.seats[i];
        if (this.settings.mode !== 'tournament' && b.chips < this.settings.bb) {
          b.chips = this.settings.buyIn; // 破产机器人自动补买（仅现金桌）
          this.broadcast({ t: 'ev', kind: 'rebuy', seat: b.seat, amount: this.settings.buyIn });
        }
        b.level = this.settings.botLevel;
      }
    }
  }

  // ── 开局流程 ───────────────────────────────────────
  startGame() {
    if (this.closed) return { ok: false, err: 'already_started' };
    if (this.phase === 'playing') {
      // 仅锦标赛结束后允许重新开赛
      if (!this.tournamentOver) return { ok: false, err: 'already_started' };
      this.tournamentOver = null;
      this.eliminations = [];
      this.stats.clear();
      this.handLog = [];
      this.tourLevel = 0;
      this.levelStartHand = 0;
      this.handNo = 0;
      this.hand = null;
      this.lastResults = null;
      for (const s of this.seats) {
        if (s) { s.chips = this.settings.buyIn; s.eliminated = false; s.sittingOut = false; }
      }
    }
    this.phase = 'playing';
    this.fillBots();
    if (this.eligibleSeats().length < 2) {
      this.phase = 'lobby';
      return { ok: false, err: 'need_two_players' };
    }
    this.startHand();
    return { ok: true };
  }

  // 锦标赛当前盲注
  currentBlinds() {
    if (this.settings.mode !== 'tournament') {
      return { sb: this.settings.sb, bb: this.settings.bb, level: 0, handsLeft: 0, totalLevels: 0 };
    }
    const lv = this._blindLevels();
    const i = Math.min(this.tourLevel, lv.length - 1);
    return {
      sb: lv[i][0], bb: lv[i][1], level: i + 1,
      handsLeft: Math.max(0, this.settings.blindsEvery - (this.handNo - this.levelStartHand)),
      totalLevels: lv.length,
    };
  }

  _blindLevels() {
    const i = BLIND_LEVELS.findIndex(b => b[0] >= this.settings.sb && b[1] >= this.settings.bb);
    return i >= 0 ? BLIND_LEVELS.slice(i) : BLIND_LEVELS;
  }

  maybeAutoNext() {
    if (this.phase !== 'playing' || this.closed) return;
    if (this.hand && this.hand.phase !== 'done') return;
    if (this.eligibleSeats().length >= 2) {
      this.addTimer(() => {
        if (!this.hand || this.hand.phase === 'done') this.startHand();
      }, 1500);
    }
  }

  startHand() {
    this.rabbitState = null;
    if (this.closed || this.phase !== 'playing') return;
    if (this.hand && this.hand.phase !== 'done') return;
    this.cleanupAfterHand();
    this.fillBots();
    const eligible = this.eligibleSeats();
    if (eligible.length < 2) return; // 人不够，等待

    // 锦标赛：按手数升级盲注
    if (this.settings.mode === 'tournament' && this.handNo > 0
        && this.handNo - this.levelStartHand >= this.settings.blindsEvery) {
      this.tourLevel++;
      this.levelStartHand = this.handNo;
      const b = this.currentBlinds();
      this.broadcast({ t: 'ev', kind: 'blinds_up', level: b.level, sb: b.sb, bb: b.bb });
    }
    const bl = this.currentBlinds();

    // 按钮轮转到下一个有筹码的座位
    this.button = this._nextEligibleSeat(this.button);
    this.handNo++;
    const hand = new Hand(eligible, { sb: bl.sb, bb: bl.bb, button: this.button, handNo: this.handNo }, ev => this._onHandEvent(ev));
    this.hand = hand;
    this.lastResults = null;
    hand.start();
  }

  _nextEligibleSeat(from) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      const s = this.seats[i];
      if (s && s.chips > 0 && !s.sittingOut) return i;
    }
    return from;
  }

  cleanupAfterHand() {
    // 破产处理：锦标赛淘汰出局，现金桌坐下轮休；离席者撤座
    for (const s of this.seats) {
      if (!s) continue;
      if (s.leaving) { this.seats[s.seat] = null; continue; }
      if (s.chips <= 0) {
        if (this.settings.mode === 'tournament') {
          if (!s.eliminated) {
            s.eliminated = true;
            s.sittingOut = true;
            this.eliminations.unshift(s.name);
            const rank = this.seats.filter(Boolean).length - this.eliminations.length + 1;
            this.broadcast({ t: 'ev', kind: 'eliminated', seat: s.seat, name: s.name, rank });
          }
        } else if (!s.isBot) {
          s.sittingOut = true;
        }
      }
    }
    for (const t of this.pendingSit) {
      const pl = this.players.get(t);
      if (pl && pl.seat < 0) this.trySit(t);
    }
    this.pendingSit = [];
  }

  // ── Hand 事件路由 ──────────────────────────────────
  _onHandEvent(ev) {
    if (ev.kind === 'hole') {
      for (const p of this.hand.players) {
        if (p.token) this.lobby.sendTo(p.token, { t: 'hole', cards: p.cards, handNo: this.handNo });
      }
    } else if (ev.kind === 'action_required') {
      const p = this.hand.bySeat(ev.seat);
      if (!p) return;
      if (p.isBot) {
        const [t0, t1] = TIMING.BOT_THINK;
        const delay = t0 + Math.random() * (t1 - t0);
        this.addTimer(() => this._botAct(p), delay);
      } else {
        // 真人：先等"行动节奏"(等下注筹码飞行动画播完 + 0.2s 最小停顿)，
        // 再开 prompt 与倒计时窗口。期间 _armHumanTimeout 不会被触发，actorDeadline = 0(广播显示无人倒计时)
        const at = Math.max(5, this.settings.actionTime || 30) * 1000 * (TIMING.ACTION_TIME / 30000);
        this.addTimer(() => {
          if (this.closed || !this.hand || this.hand.phase !== 'betting' || this.hand.awaitingSeat() !== p.seat) return;
          this.actorDeadline = Date.now() + at;
          this.lobby.sendTo(p.token, { t: 'prompt', options: this.hand.options(p), deadline: this.actorDeadline });
          this._armHumanTimeout(p.seat, this.actorDeadline, at);
        }, TIMING.ACTION_PACING * (TIMING.ACTION_TIME / 30000));
      }
    } else if (ev.kind === 'action') {
      this.actorDeadline = 0; // 行动已完成，关闭当前行动窗口（旧超时计时器随之失效）
    } else if (ev.kind === 'hand_stats') {
      // 全局个人档案（按 token）；补上最佳牌型中文名
      for (const d of ev.players) {
        if (d.token && !d.isBot) {
          if (d.bestScore) d.bestHand = scoreName(d.bestScore);
          this.lobby.recordPlayerStats(d.token, d);
        }
      }
    } else if (ev.kind === 'showdown') {
      this.lastResults = { board: ev.board, pots: ev.pots, results: ev.results, uncontested: ev.uncontested, handNo: this.handNo };
      // 兔猎：无人跟注且公牌未发满时，记录本会发出的剩余公牌
      if (ev.uncontested && this.hand && this.hand.board.length < 5) {
        const need = 5 - this.hand.board.length;
        this.rabbitState = { board: [...this.hand.board, ...this.hand._deck.slice(-need).reverse()], shown: false };
      }
      // 战绩统计
      for (const p of this.hand.players) {
        const st = this.stats.get(p.name) || { hands: 0, wins: 0, net: 0 };
        st.hands++;
        st.net += (p.lastDelta || 0);
        if (ev.results.some(r => r.seat === p.seat)) st.wins++;
        this.stats.set(p.name, st);
      }
      // 手牌流水归档（回放用）
      if (this._rec) {
        this._rec.results = ev.results;
        this._rec.pots = ev.pots;
        this._rec.board = ev.board;
        this._rec.holeCards = {};
        for (const p of this.hand.players) if (p.revealed) this._rec.holeCards[p.seat] = p.cards;
        this.handLog.push(this._rec);
        if (this.handLog.length > 30) this.handLog.shift();
        this._rec = null;
      }
      this.addTimer(() => this._afterHand(), TIMING.HAND_BREAK);
    } else if (ev.kind === 'runout') {
      this.addTimer(() => this._runoutStep(), TIMING.RUNOUT_STEP);
    }
    // 回放流水记录
    if (ev.kind === 'hand_start') {
      this._rec = {
        handNo: this.handNo, button: this.button, sb: ev.sb, bb: ev.bb,
        seats: this.hand.players.map(p => ({ seat: p.seat, name: p.name, chips: p.chips })),
        actions: [], board: [],
      };
    } else if (ev.kind === 'blind' && this._rec) {
      this._rec.actions.push({ k: 'blind', seat: ev.seat, put: ev.amount });
    } else if (ev.kind === 'action' && this._rec) {
      this._rec.actions.push({ k: 'act', seat: ev.seat, type: ev.type, amount: ev.amount, put: ev.put || 0, street: this.hand.street });
    } else if (ev.kind === 'street' && this._rec) {
      this._rec.actions.push({ k: 'street', street: ev.street, cards: ev.cards });
      this._rec.board = ev.cards;
    }
    if (ev.kind !== 'hole' && ev.kind !== 'action_required') {
      this.broadcast({ t: 'ev', ...ev });
    }
    this.lobby.onRoomsChanged();
  }

  _botAct(p) {
    if (this.closed) return;
    const hand = this.hand;
    if (!hand || hand.phase !== 'betting' || hand.awaitingSeat() !== p.seat) return;
    const d = botDecide(p, hand);
    const res = hand.applyAction(p.seat, d.type, d.amount);
    if (!res.ok) hand.autoAction(p.seat); // 决策异常时托管兜底
  }

  _runoutStep() {
    if (this.closed) return;
    const hand = this.hand;
    if (!hand || hand.phase !== 'runout') return;
    hand.advanceRunout();
    if (hand.phase === 'runout') this.addTimer(() => this._runoutStep(), TIMING.RUNOUT_STEP);
  }

  _afterHand() {
    if (this.closed) return;
    if (this.hand && this.hand.phase === 'done') this.hand = null;
    this.cleanupAfterHand();
    // 锦标赛：只剩一人 → 产生排名
    if (this.settings.mode === 'tournament' && this.eligibleSeats().length <= 1) {
      const champ = this.eligibleSeats()[0];
      this.tournamentOver = [champ && champ.name, ...this.eliminations].filter(Boolean);
      this.broadcast({ t: 'ev', kind: 'tournament_over', ranking: this.tournamentOver });
      this.lobby.onRoomsChanged();
      return;
    }
    if (this.eligibleSeats().length >= 2) this.startHand();
    this.lobby.onRoomsChanged();
  }

  // ── 客户端动作 ─────────────────────────────────────
  action(token, type, amount) {
    const pl = this.players.get(token);
    if (!pl || pl.seat < 0 || !this.hand) return { ok: false, err: 'not_in_hand' };
    const s = this.seats[pl.seat];
    if (s && s.isBot) return { ok: false, err: 'not_your_turn' };
    // 快捷弃牌：非自己行动窗口的预弃牌
    if (type === 'fold' && this.hand.phase === 'betting' && this.hand.awaitingSeat() !== pl.seat) {
      const r = this.hand.quickFold(pl.seat);
      if (r.ok) pl.timeouts = 0;
      return r;
    }
    const res = this.hand.applyAction(pl.seat, type, amount);
    if (res.ok) pl.timeouts = 0; // 正常行动清零超时计数
    return res;
  }

  // 行动被拒时重发行动请求（客户端面板已乐观清空）
  resendPrompt(token) {
    const pl = this.players.get(token);
    if (!pl || !this.hand || this.hand.phase !== 'betting') return;
    const p = this.hand.bySeat(pl.seat);
    if (!p || this.hand.awaitingSeat() !== pl.seat) return;
    const at = Math.max(5, this.settings.actionTime || 30) * 1000 * (TIMING.ACTION_TIME / 30000);
    this.actorDeadline = Date.now() + at;
    this.lobby.sendTo(token, { t: 'prompt', options: this.hand.options(p), deadline: this.actorDeadline });
    this._armHumanTimeout(p.seat, this.actorDeadline, at);
  }

  // 人类行动超时托管。计时器与其行动窗口绑定：窗口被新窗口取代后旧计时器自动失效，
  // 避免"上一窗口末尾行动 → 立刻又轮到行动"时被旧计时器误托管成弃牌
  _armHumanTimeout(seat, deadline, at) {
    this.addTimer(() => {
      if (this.closed || !this.hand) return;
      if (this.actorDeadline !== deadline) return;          // 窗口已更新/关闭
      if (this.hand.awaitingSeat() !== seat) return;        // 已不在等该座位
      this.hand.autoAction(seat);
      // 连续超时（仅现金桌）→ 自动坐下休息，避免断线者持续送盲注
      const pl = this.players.get(this.byTokenOfSeat(seat));
      if (pl) {
        pl.timeouts = (pl.timeouts || 0) + 1;
        const s = this.seats[seat];
        if (pl.timeouts >= 3 && this.settings.mode !== 'tournament' && s && !s.sittingOut) {
          s.sittingOut = true;
          this.broadcast({ t: 'ev', kind: 'sitout', seat, name: s.name, auto: true });
        }
      }
    }, at + 120);
  }

  byTokenOfSeat(seat) {
    const s = this.seats[seat];
    return s ? s.token : null;
  }

  // 主动坐下休息 / 回到牌局（仅现金桌）
  sitOut(token) {
    const pl = this.players.get(token);
    if (!pl || pl.seat < 0) return { ok: false, err: 'no_seat' };
    if (this.settings.mode === 'tournament') return { ok: false, err: 'tournament' };
    const s = this.seats[pl.seat];
    s.sittingOut = true;
    this.broadcast({ t: 'ev', kind: 'sitout', seat: pl.seat, name: pl.name, auto: false });
    return { ok: true };
  }

  // 表情互动（限流 + 白名单）
  emote(token, emoji) {
    const pl = this.players.get(token);
    if (!pl || pl.seat < 0 || !this.seats[pl.seat]) return { ok: false, err: 'no_seat' };
    const list = ['👍', '😂', '😭', '🤔', '🔥', '👏'];
    if (!list.includes(emoji)) return { ok: false, err: 'bad_emoji' };
    const now = Date.now();
    if (pl.lastEmoteAt && now - pl.lastEmoteAt < 1500) return { ok: false, err: 'too_fast' };
    pl.lastEmoteAt = now;
    this.broadcast({ t: 'ev', kind: 'emote', seat: pl.seat, emoji });
    return { ok: true };
  }

  // 兔猎：展示无人跟注时本会发出的剩余公牌
  rabbit(token) {
    if (!this.rabbitState || this.rabbitState.shown) return { ok: false, err: 'none' };
    this.rabbitState.shown = true;
    this.broadcast({ t: 'ev', kind: 'rabbit', cards: this.rabbitState.board });
    return { ok: true };
  }

  sitIn(token) {
    const pl = this.players.get(token);
    if (!pl || pl.seat < 0) return { ok: false, err: 'no_seat' };
    const s = this.seats[pl.seat];
    if (s.chips <= 0) return { ok: false, err: 'no_chips' };
    s.sittingOut = false;
    pl.timeouts = 0;
    this.broadcast({ t: 'ev', kind: 'sitin', seat: pl.seat, name: pl.name });
    this.maybeAutoNext();
    return { ok: true };
  }

  rebuy(token) {
    const pl = this.players.get(token);
    if (!pl || pl.seat < 0) return { ok: false, err: 'no_seat' };
    const s = this.seats[pl.seat];
    if (s.chips > 0 && !s.sittingOut) return { ok: false, err: 'not_needed' };
    s.chips = this.settings.buyIn;
    s.sittingOut = false;
    this.broadcast({ t: 'ev', kind: 'rebuy', seat: pl.seat, amount: this.settings.buyIn });
    this.maybeAutoNext();
    return { ok: true };
  }

  updateSettings(token, patch) {
    if (token !== this.hostToken) return { ok: false, err: 'not_host' };
    const prevMode = this.settings.mode;
    const allowed = ['maxSeats', 'sb', 'bb', 'buyIn', 'botsFill', 'botLevel', 'mode', 'blindsEvery', 'actionTime'];
    for (const k of allowed) {
      if (k in patch) this.settings[k] = patch[k];
    }
    // 模式对局中不可切换（开局前随便改）
    if (this.phase === 'playing') this.settings.mode = prevMode;
    if (this.settings.mode !== 'cash' && this.settings.mode !== 'tournament') this.settings.mode = 'cash';
    this.settings.maxSeats = Math.max(2, Math.min(9, this.settings.maxSeats | 0));
    this.settings.blindsEvery = Math.max(2, Math.min(20, this.settings.blindsEvery | 0 || 8));
    this.settings.actionTime = Math.max(10, Math.min(90, this.settings.actionTime | 0 || 30));
    if (!LEVEL_NAMES[this.settings.botLevel]) this.settings.botLevel = 'normal';
    this.broadcast({ t: 'ev', kind: 'settings', settings: this.settings });
    return { ok: true };
  }

  // ── 快照 ───────────────────────────────────────────
  snapshot(forToken) {
    const pl = this.players.get(forToken);
    const hand = this.hand;
    const hs = hand ? hand.publicState() : null;
    const handBySeat = new Map();
    if (hand) for (const p of hand.players) handBySeat.set(p.seat, p);

    const seats = this.seats.slice(0, Math.max(this.settings.maxSeats, this.seats.filter(Boolean).length)).map((s, i) => {
      if (!s) return { seat: i, empty: true };
      const part = handBySeat.get(i);
      const p = s.token ? this.players.get(s.token) : null;
      const out = {
        seat: i, name: s.name, chips: s.chips, isBot: s.isBot,
        level: s.isBot ? s.level : undefined,
        connected: s.token ? !!(p && p.connected) : true,
        sittingOut: !!s.sittingOut,
        eliminated: !!s.eliminated,
        avatar: s.avatar || null,
      };
      if (!s.isBot && s.token) {
        const prof = this.lobby.profileOf(s.token);
        if (prof.stats.hands >= 10) out.hud = { hands: prof.stats.hands, vpip: Math.round((prof.stats.vpip / prof.stats.hands) * 100) };
      }
      if (part) {
        out.inHand = true;
        out.folded = part.folded;
        out.allIn = part.allIn;
        out.bet = part.streetCommit;
        out.totalBet = part.commitTotal;
        out.lastDelta = part.lastDelta || 0;
        out.acted = !!part.acted; // 本街已行动标识
        out.lastAction = part.lastAction || null; // 最近一次动作 {type, amount, allIn}
        if (part.revealed) out.cards = part.cards;
      } else {
        out.inHand = false; out.bet = 0; out.folded = false; out.allIn = false; out.acted = false;
      }
      return out;
    });

    const me = pl && pl.seat >= 0 ? handBySeat.get(pl.seat) : null;
    const snap = {
      t: 'room',
      code: this.code,
      phase: this.phase,
      isHost: forToken === this.hostToken,
      settings: this.settings,
      seats,
      button: hs ? hs.button : this.button,
      handNo: hs ? hs.handNo : this.handNo,
      hand: hs ? {
        street: hs.street, phase: hs.phase, board: hs.board, pot: hs.pot,
        currentBet: hs.currentBet, pots: hs.pots, actorSeat: hs.actorSeat,
        deadline: this.actorDeadline || 0, // 当前行动窗口（人类），全桌可见
      } : null,
      lastResults: this.lastResults,
      blinds: this.settings.mode === 'tournament' ? this.currentBlinds() : null,
      tournamentOver: this.tournamentOver,
      hasHistory: this.handLog.length > 0,
      rabbitAvail: !!(this.rabbitState && !this.rabbitState.shown),
      you: {
        seat: pl ? pl.seat : -1,
        name: pl ? pl.name : '',
        avatar: pl ? (pl.avatar || '') : '',
        cards: me ? me.cards : undefined,
        sittingOut: me ? false : (pl && pl.seat >= 0 ? !!this.seats[pl.seat].sittingOut : false),
        deadline: this.actorDeadline,
      },
    };
    return snap;
  }

  broadcast(msg) {
    for (const p of this.players.values()) {
      if (p.connected) this.lobby.sendTo(p.token, msg);
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.phase = 'closed';
    this.clearTimers();
    this.broadcast({ t: 'ev', kind: 'room_closed' });
    this.lobby.removeRoom(this.code);
  }
}
