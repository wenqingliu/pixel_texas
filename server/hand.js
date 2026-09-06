// 牌局状态机：一手牌的完整生命周期
// 盲注 → 发底牌 → 翻牌前 → 翻牌 → 转牌 → 河牌 → 摊牌/派池
// Hand 不管理计时，节奏由 Room 驱动：
//   - hand.awaitingSeat() 非空 → Room 安排机器人决策或人类超时自动行动
//   - hand.phase === 'runout' → Room 定时调用 hand.advanceRunout()（全下跑完公共牌）

import { newDeck, shuffle, eval7, scoreName, evaluate7, best5of7 } from './evaluator.js';

const STREET_BY_BOARD = { 0: 'preflop', 3: 'flop', 4: 'turn', 5: 'river' };

export class Hand {
  /**
   * @param players 参与本手的座位对象数组 [{seat, name, chips, token, isBot, level}]
   *                Hand 直接读写 chips 字段（结算回填）
   * @param opts {sb, bb, button, handNo}
   * @param emit (event) => void  事件回调（Room 决定广播还是私发）
   */
  constructor(players, opts, emit) {
    this.players = players;
    this.sb = opts.sb;
    this.bb = opts.bb;
    this.button = opts.button;
    this.handNo = opts.handNo;
    this.emit = emit;
    this.board = [];
    this.street = 'preflop';
    this.phase = 'idle';            // idle | betting | runout | done
    this.pots = [];
    this.actor = null;
    this.currentBet = 0;
    this.minIncrement = opts.bb;
    this._deck = shuffle(newDeck());
    this._order = [...players].sort((a, b) => a.seat - b.seat); // 座位号升序，环形推进
    for (const p of players) {
      p.cards = [this._deck.pop(), this._deck.pop()];
      p.commitTotal = 0;
      p.streetCommit = 0;
      p.folded = false;
      p.allIn = false;
      p.acted = false;
      p.revealed = false;
      p.lastAction = null;
      p._awaiting = false;
      // 统计采集（VPIP / PFR / 激进度）
      p.vpip = false;       // 翻牌前主动投钱
      p.pfr = false;        // 翻牌前加注
      p.aggr = 0;           // 下注+加注次数
      p.calls = 0;          // 跟注次数
      p.showdown = false;   // 见摊牌
    }
  }

  bySeat(seat) { return this.players.find(p => p.seat === seat); }
  alive() { return this.players.filter(p => !p.folded); }
  canAct() { return this.alive().filter(p => !p.allIn); }
  commitTotalSum() { return this.players.reduce((s, p) => s + p.commitTotal, 0); }

  // 从 fromSeat 起顺时针找下一个满足条件的座位玩家
  _next(fromSeat, filter = () => true) {
    const n = this._order.length;
    const start = this._order.findIndex(p => p.seat === fromSeat);
    if (start < 0) return null;
    for (let i = 1; i <= n; i++) {
      const p = this._order[(start + i) % n];
      if (filter(p)) return p;
    }
    return null;
  }

  // ── 开局 ────────────────────────────────────────────
  start() {
    const n = this.players.length;
    this.phase = 'betting';
    this.emit({ kind: 'hand_start', handNo: this.handNo, button: this.button, sb: this.sb, bb: this.bb });

    // 单挑：按钮位小盲；多人：按钮左一小盲、左二大盲
    const sbP = n === 2 ? this.bySeat(this.button) : this._next(this.button);
    const bbP = this._next(sbP.seat);
    this.sbP = sbP;
    this.bbP = bbP;
    this._postBlind(sbP, Math.min(this.sb, sbP.chips));
    this._postBlind(bbP, Math.min(this.bb, bbP.chips));

    this.currentBet = Math.max(sbP.streetCommit, bbP.streetCommit);
    this.minIncrement = this.bb;

    this.emit({ kind: 'hole' }); // Room 据此向各玩家私发底牌
    this._startBettingRound(true);
  }

  _postBlind(p, amount) {
    p.chips -= amount;
    p.streetCommit += amount;
    p.commitTotal += amount;
    if (p.chips === 0) p.allIn = true;
    this.emit({ kind: 'blind', seat: p.seat, amount });
  }

  toCall(p) { return Math.min(this.currentBet - p.streetCommit, p.chips); }

  // ── 一街的开场（仅在下注阶段使用）────────────────────
  _startBettingRound(isPreflop) {
    if (!isPreflop) {
      const need = this.board.length < 3 ? 3 : this.board.length + 1;
      this.street = STREET_BY_BOARD[need];
      while (this.board.length < need) this.board.push(this._deck.pop());
      for (const p of this.players) { p.acted = false; p.streetCommit = 0; }
      this.currentBet = 0;
      this.minIncrement = this.bb;
      this.emit({ kind: 'street', street: this.street, cards: [...this.board] });
    }

    const filter = p => !p.folded && !p.allIn;
    const first = isPreflop
      ? this._next(this.bbP.seat, filter)
      : this._next(this.button, filter);

    if (!first || this.canAct().length <= 1) {
      this._enterRunout();
      return;
    }
    this._setActor(first);
  }

  _setActor(p) {
    this.actor = p;
    p._awaiting = true;
    this.emit({
      kind: 'action_required', seat: p.seat,
      toCall: this.toCall(p),
      pot: this.commitTotalSum(),
    });
  }

  options(p) {
    const toCall = this.toCall(p);
    return {
      canFold: true,
      canCheck: toCall === 0,
      canCall: toCall > 0 && p.chips >= toCall,
      callAmount: toCall,
      canRaise: p.chips > toCall,
      minRaiseTo: Math.min(this.currentBet + this.minIncrement, p.streetCommit + p.chips),
      maxRaiseTo: p.streetCommit + p.chips,
      pot: this.commitTotalSum(),
      currentBet: this.currentBet,
    };
  }

  // ── 行动处理 ────────────────────────────────────────
  applyAction(seat, type, amount) {
    const p = this.bySeat(seat);
    if (!p || this.phase !== 'betting' || !this.actor || this.actor.seat !== seat || !p._awaiting) {
      return { ok: false, err: 'not_your_turn' };
    }
    p._awaiting = false;
    const toCall = this.toCall(p);
    const ev = { kind: 'action', seat, type };

    if (type === 'fold') {
      p.folded = true;
    } else if (type === 'check') {
      if (toCall > 0) { p._awaiting = true; return { ok: false, err: 'cannot_check' }; }
    } else if (type === 'call') {
      if (toCall <= 0) { p._awaiting = true; return { ok: false, err: 'nothing_to_call' }; }
      this._commit(p, toCall);
      if (p.chips === 0) p.allIn = true;
      ev.amount = toCall;
      ev.put = toCall;
      p.calls++;
      if (this.street === 'preflop') p.vpip = true; // 翻牌前 call 即主动投入（盲注非 call 动作）
    } else if (type === 'raise') {
      const maxTo = p.streetCommit + p.chips;
      let raiseTo = Math.floor(Number(amount));
      if (!Number.isFinite(raiseTo)) { p._awaiting = true; return { ok: false, err: 'bad_amount' }; }
      const minTo = Math.min(this.currentBet + this.minIncrement, maxTo);
      raiseTo = Math.max(raiseTo, Math.min(this.currentBet + 1, maxTo));
      raiseTo = Math.min(raiseTo, maxTo);
      const isFullRaise = raiseTo >= this.currentBet + this.minIncrement || this.currentBet === 0;
      ev.put = raiseTo - p.streetCommit; // 本次净投入（回放流水）
      p.aggr++;
      if (this.street === 'preflop') { p.vpip = true; p.pfr = true; }
      this._commit(p, raiseTo - p.streetCommit);
      const wentAllIn = p.chips === 0;
      if (wentAllIn) p.allIn = true;
      if (raiseTo > this.currentBet) {
        const prevBet = this.currentBet;
        this.currentBet = raiseTo;
        if (isFullRaise) {
          this.minIncrement = Math.max(this.bb, raiseTo - prevBet);
          for (const q of this.players) {
            if (q !== p && !q.folded && !q.allIn) q.acted = false;
          }
        }
        // 不足额的全下加注不重开行动权：已行动玩家只能跟注/弃牌
      }
      ev.amount = raiseTo;
      ev.allIn = wentAllIn;
    } else {
      p._awaiting = true;
      return { ok: false, err: 'bad_type' };
    }

    p.acted = true;
    p.lastAction = { type, amount: ev.amount || 0, allIn: !!ev.allIn };
    this.actor = null;
    this.emit(ev);

    const alive = this.alive();
    if (alive.length === 1) {
      this._awardUncontested(alive[0]);
      return { ok: true };
    }
    if (this._roundComplete()) {
      this._onRoundEnd();
    } else {
      this._advanceActor(seat);
    }
    return { ok: true };
  }

  _commit(p, amount) {
    if (amount <= 0) return;
    p.chips -= amount;
    p.streetCommit += amount;
    p.commitTotal += amount;
  }

  _roundComplete() {
    const active = this.canAct();
    for (const p of active) {
      if (p._awaiting || !p.acted || p.streetCommit !== this.currentBet) return false;
    }
    return true;
  }

  _advanceActor(fromSeat) {
    let s = fromSeat;
    for (let i = 0; i < this._order.length; i++) {
      const q = this._next(s, p => !p.folded && !p.allIn);
      if (!q) break;
      if (!q.acted || q.streetCommit !== this.currentBet) { this._setActor(q); return; }
      s = q.seat;
    }
    this._onRoundEnd();
  }

  _onRoundEnd() {
    this.actor = null;
    if (this.street === 'river') { this._enterRunout(); return; } // 河牌圈结束 → 摊牌节奏
    if (this.canAct().length <= 1 && this.alive().length >= 2) {
      this._enterRunout(); // 其余人全下，跑完公共牌
      return;
    }
    this._startBettingRound(false);
  }

  // ── 全下跑牌（Room 定时调用）────────────────────────
  _enterRunout() {
    this.phase = 'runout';
    this.actor = null;
    for (const p of this.alive()) p._awaiting = false;
    this._revealAll('runout');
    this.emit({ kind: 'runout', street: this.street, board: [...this.board] });
  }

  advanceRunout() {
    if (this.phase !== 'runout') return false;
    if (this.board.length < 5) {
      const need = this.board.length < 3 ? 3 : this.board.length + 1;
      while (this.board.length < need) this.board.push(this._deck.pop());
      this.street = STREET_BY_BOARD[this.board.length];
      this.emit({ kind: 'street', street: this.street, cards: [...this.board] });
      return true;
    }
    this._showdown();
    return true;
  }

  _revealAll(reason) {
    for (const p of this.alive()) {
      if (!p.revealed) {
        p.revealed = true;
        const evl = evaluate7([...p.cards, ...this.board]);
        this.emit({ kind: 'reveal', seat: p.seat, cards: p.cards, name: evl.name, phase: reason });
      }
    }
  }

  // ── 结算 ────────────────────────────────────────────
  // 汇总本手统计数据（个人档案用）
  _emitHandStats() {
    this.emit({
      kind: 'hand_stats',
      players: this.players.map(p => {
        let bestScore = null;
        if (this.board.length === 5 && !p.folded) bestScore = eval7([...p.cards, ...this.board]);
        return {
          seat: p.seat, token: p.token || null, isBot: !!p.isBot,
          net: p.lastDelta || 0, won: (p.lastDelta || 0) > 0,
          vpip: p.vpip, pfr: p.pfr, aggr: p.aggr, calls: p.calls,
          showdown: p.showdown, bestScore,
        };
      }),
    });
  }

  _awardUncontested(winner) {
    const total = this.commitTotalSum();
    winner.chips += total;
    this.phase = 'done';
    this.actor = null;
    // 全员净盈亏（弃牌者亏损也要入账，否则战绩不为零和）
    for (const p of this.players) {
      p.lastDelta = (p === winner ? total : 0) - p.commitTotal;
      p.streetCommit = 0;
      p._awaiting = false;
    }
    this.pots = [{ amount: total, eligible: [winner.seat] }];
    this.emit({
      kind: 'showdown', uncontested: true, board: [...this.board],
      pots: this.pots, results: [{ seat: winner.seat, win: total, name: null }],
    });
    this._emitHandStats();
  }

  // 按投入分层建池；弃牌者的钱进池但无权赢池
  computePots() {
    const levels = [...new Set(this.players.filter(p => p.commitTotal > 0).map(p => p.commitTotal))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lv of levels) {
      let amount = 0;
      const eligible = [];
      for (const p of this.players) {
        amount += Math.max(0, Math.min(p.commitTotal, lv) - Math.min(p.commitTotal, prev));
        if (!p.folded && p.commitTotal >= lv) eligible.push(p.seat);
      }
      if (amount > 0) pots.push({ amount, eligible });
      prev = lv;
    }
    for (let i = pots.length - 1; i > 0; i--) {
      if (JSON.stringify(pots[i].eligible) === JSON.stringify(pots[i - 1].eligible)) {
        pots[i - 1].amount += pots[i].amount;
        pots.splice(i, 1);
      }
    }
    // 该层无人有资格赢（投入者全部弃牌的死钱）→ 滚入下一层
    for (let i = pots.length - 1; i > 0; i--) {
      if (pots[i].eligible.length === 0) {
        pots[i - 1].amount += pots[i].amount;
        pots.splice(i, 1);
      }
    }
    return pots;
  }

  _showdown() {
    this.phase = 'done';
    this.actor = null;
    for (const p of this.alive()) p.showdown = true; // 见摊牌
    this._revealAll('showdown');
    const pots = this.computePots();
    const results = new Map();
    for (const pot of pots) {
      const contenders = pot.eligible.map(s => this.bySeat(s));
      let best = -1, winners = [];
      for (const p of contenders) {
        const sc = eval7([...p.cards, ...this.board]);
        if (sc > best) { best = sc; winners = [p]; }
        else if (sc === best) winners.push(p);
      }
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      const ordered = [...winners].sort((x, y) => this._distFromButton(x.seat) - this._distFromButton(y.seat));
      for (const w of ordered) {
        let gain = share;
        if (odd > 0) { gain += 1; odd--; }
        results.set(w.seat, (results.get(w.seat) || 0) + gain);
      }
    }
    this.pots = pots;
    const resArr = [];
    for (const [seat, win] of results) {
      const p = this.bySeat(seat);
      p.chips += win;
      resArr.push({ seat, win, name: scoreName(eval7([...p.cards, ...this.board])), best5: best5of7([...p.cards, ...this.board]).cards });
    }
    // 全员净盈亏（战绩与展示用）
    for (const p of this.players) {
      p.lastDelta = (results.get(p.seat) || 0) - p.commitTotal;
      p.streetCommit = 0;
      p._awaiting = false;
    }
    this.emit({
      kind: 'showdown', uncontested: false, board: [...this.board],
      pots: pots.map(x => ({ amount: x.amount, eligible: x.eligible })),
      results: resArr,
    });
    this._emitHandStats();
  }

  _distFromButton(seat) {
    const seats = this._order.map(p => p.seat);
    const i = seats.indexOf(seat), b = seats.indexOf(this.button);
    return (i - b + seats.length) % seats.length;
  }

  awaitingSeat() { return (this.phase === 'betting' && this.actor) ? this.actor.seat : null; }

  // 快捷弃牌：非自己行动窗口内预弃牌（Ignition 式 quick fold）
  quickFold(seat) {
    if (this.phase !== 'betting') return { ok: false, err: 'not_in_hand' };
    const p = this.bySeat(seat);
    if (!p || p.folded || p.allIn) return { ok: false, err: 'not_in_hand' };
    if (this.actor && this.actor.seat === seat) return { ok: false, err: 'is_your_turn' };
    p.folded = true;
    p.acted = true;
    p.lastAction = { type: 'fold', amount: 0, allIn: false };
    p._awaiting = false;
    this.emit({ kind: 'action', seat, type: 'fold', put: 0 });
    const alive = this.alive();
    if (alive.length === 1) {
      this._awardUncontested(alive[0]);
    }
    return { ok: true };
  }

  // 超时托管：能看则看，否则弃
  autoAction(seat) {
    const p = this.bySeat(seat);
    if (!p || !this.actor || this.actor.seat !== seat) return;
    this.applyAction(seat, this.toCall(p) === 0 ? 'check' : 'fold');
  }

  publicState() {
    return {
      handNo: this.handNo,
      street: this.street,
      phase: this.phase,
      board: [...this.board],
      button: this.button,
      pot: this.commitTotalSum(),
      currentBet: this.currentBet || 0,
      pots: this.pots,
      actorSeat: this.awaitingSeat(),
      seats: this.players.map(p => ({
        seat: p.seat,
        commitTotal: p.commitTotal,
        streetCommit: p.streetCommit,
        folded: p.folded,
        allIn: p.allIn,
        revealed: p.revealed,
        lastDelta: p.lastDelta || 0,
      })),
    };
  }
}

// 供单测：对任意的伪玩家数组直接算边池
export function computePotsFor(players) {
  return Hand.prototype.computePots.call({ players });
}
