// 大厅：房间注册、快速匹配、房间码、房间列表广播、个人档案
import crypto from 'node:crypto';
import { Room, DEFAULT_SETTINGS } from './room.js';
import { load, saveSoon } from './storage.js';

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function emptyStats() {
  return { hands: 0, wins: 0, net: 0, vpip: 0, pfr: 0, aggr: 0, calls: 0, showdowns: 0, showdownWins: 0, bestScore: 0, bestHand: '' };
}

// 风格标签：VPIP/PFR 双维 + 激进度
export function styleLabel(st) {
  if (!st || st.hands < 20) return { label: '样本不足', desc: '再打 20 局解锁风格分析' };
  const vpip = st.vpip / st.hands, pfr = st.pfr / st.hands;
  const af = st.calls > 0 ? (st.aggr / st.calls) : (st.aggr > 0 ? 9 : 0);
  const tight = vpip < 0.24, aggressive = pfr >= 0.16 || af >= 2;
  let label;
  if (tight && aggressive) label = '紧凶型 · 岩石';
  else if (tight) label = '紧弱型 · 稳健派';
  else if (aggressive) label = '松凶型 · 进攻机器';
  else label = '松弱型 · 跟注站';
  return { label, desc: `VPIP ${(vpip * 100).toFixed(0)}% · PFR ${(pfr * 100).toFixed(0)}% · 激进度 ${af.toFixed(1)}` };
}

export class Lobby {
  constructor() {
    this.rooms = new Map();     // code → Room
    this.tokens = new Map();    // token → {token, name, ws, roomId|null}
    this.profiles = load('profiles', {}); // token → {name, avatar, stats, createdAt}
    this.nameSeq = 0;
  }

  profileOf(token) {
    if (!this.profiles[token]) {
      this.profiles[token] = { name: '', avatar: '', stats: emptyStats(), createdAt: Date.now() };
    }
    if (!this.profiles[token].stats) this.profiles[token].stats = emptyStats();
    return this.profiles[token];
  }

  // hand_stats → 个人档案（按 token，跨房间累计）
  recordPlayerStats(token, d) {
    const p = this.profileOf(token);
    const st = p.stats;
    st.hands++;
    if (d.won) st.wins++;
    st.net += d.net || 0;
    if (d.vpip) st.vpip++;
    if (d.pfr) st.pfr++;
    st.aggr += d.aggr || 0;
    st.calls += d.calls || 0;
    if (d.showdown) {
      st.showdowns++;
      if (d.won) st.showdownWins++;
    }
    if (d.bestScore && d.bestScore > st.bestScore) {
      st.bestScore = d.bestScore;
      st.bestHand = d.bestHand || '';
    }
    saveSoon('profiles', this.profiles);
  }

  setAvatar(token, avatar) {
    const p = this.profileOf(token);
    if (typeof avatar === 'string' && (/^p\d+\.c\d+$/.test(avatar) || avatar === '')) {
      p.avatar = avatar;
    }
    const t = this.tokens.get(token);
    if (t) t.avatar = p.avatar;
    saveSoon('profiles', this.profiles);
    // 房内座位同步
    if (t && t.roomId) {
      const room = this.rooms.get(t.roomId);
      if (room) room.setAvatar(token, p.avatar);
    }
    this.onRoomsChanged();
  }

  // 派生指标（profile 协议）
  profileView(token) {
    const p = this.profileOf(token);
    const st = p.stats;
    const pc = (a, b) => (b > 0 ? Math.round(a / b * 1000) / 10 : 0);
    return {
      name: p.name, avatar: p.avatar || '',
      hands: st.hands,
      wins: st.wins,
      winRate: pc(st.wins, st.hands),
      net: st.net,
      vpip: pc(st.vpip, st.hands),
      pfr: pc(st.pfr, st.hands),
      agression: st.calls > 0 ? Math.round(st.aggr / st.calls * 100) / 100 : 0,
      wsd: pc(st.showdownWins, st.showdowns),       // 摊牌胜率
      showdownRate: pc(st.showdowns, st.hands),     // 见摊率
      bestHand: st.bestHand || '',
      style: styleLabel(st),
    };
  }

  sendTo(token, msg) {
    const p = this.tokens.get(token);
    if (p && p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  // ── 玩家 ───────────────────────────────────────────
  login(ws, name, oldToken) {
    let token = oldToken;
    if (!token || !this.tokens.has(token)) {
      token = crypto.randomBytes(16).toString('hex');
    }
    const prev = this.tokens.get(token);
    if (prev && prev.ws && prev.ws !== ws) {
      // 同一 token 在别处登录：通知旧连接停止重连，避免互相踢
      try {
        prev.ws.send(JSON.stringify({ t: 'replaced' }));
        prev.ws.close();
      } catch { /* 忽略旧连接 */ }
    }
    const profile = this.profileOf(token);
    if (!profile.name && !name) profile.name = '玩家' + (++this.nameSeq);
    const cleanName = String(name || '').trim().slice(0, 12) || profile.name || ('玩家' + (++this.nameSeq));
    profile.name = cleanName;
    this.tokens.set(token, { token, name: cleanName, avatar: profile.avatar || '', ws, roomId: prev ? prev.roomId : null });
    ws._token = token;
    // 断线重连回房
    if (prev && prev.roomId) {
      const room = this.rooms.get(prev.roomId);
      if (room && room.players.has(token)) {
        room.reconnect(token, ws);
        this.sendTo(token, room.snapshot(token));
      } else {
        this.tokens.get(token).roomId = null;
      }
    }
    saveSoon('profiles', this.profiles);
    this.sendTo(token, { t: 'welcome', token, name: cleanName, avatar: profile.avatar || '' });
    this.sendRooms(token);
    return token;
  }

  setName(token, name) {
    const p = this.tokens.get(token);
    if (!p) return;
    const clean = String(name || '').trim().slice(0, 12) || p.name;
    p.name = clean;
    this.profileOf(token).name = clean;
    saveSoon('profiles', this.profiles);
    if (p.roomId) {
      const room = this.rooms.get(p.roomId);
      if (room) {
        const pl = room.players.get(token);
        if (pl) pl.name = clean;
        if (pl && pl.seat >= 0 && room.seats[pl.seat]) room.seats[pl.seat].name = clean;
        this.sendTo(token, room.snapshot(token));
      }
    }
  }

  logout(token) {
    const p = this.tokens.get(token);
    if (!p) return;
    p.connected = false;
    if (p.roomId) {
      const room = this.rooms.get(p.roomId);
      if (room && room.players.has(token)) room.markDisconnected(token);
    }
  }

  drop(token) {
    this.tokens.delete(token);
  }

  // ── 房间 ───────────────────────────────────────────
  genCode() {
    for (let tries = 0; tries < 100; tries++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
    return 'R' + Date.now().toString(36).toUpperCase().slice(-3);
  }

  createRoom(token, settings, opts = {}) {
    const p = this.tokens.get(token);
    if (!p) return null;
    if (p.roomId) this.leaveRoom(token);
    const room = new Room(this, this.genCode(), token);
    this.rooms.set(room.code, room);
    room.addPlayer(token, p.name, p.avatar);
    if (settings) room.updateSettings(token, settings); // 先设置再入座，买入吃新配置
    room.trySit(token);
    p.roomId = room.code;
    this.onRoomsChanged();
    return room;
  }

  joinRoom(token, code) {
    const p = this.tokens.get(token);
    if (!p) return { ok: false, err: 'no_login' };
    code = String(code || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room || room.closed) return { ok: false, err: 'room_not_found' };
    if (p.roomId === code) return { ok: true, room };
    if (p.roomId) this.leaveRoom(token);
    if (!room.players.has(token)) {
      room.addPlayer(token, p.name, p.avatar);
      room.trySit(token);
    }
    p.roomId = code;
    this.onRoomsChanged();
    return { ok: true, room };
  }

  quickMatch(token) {
    const p = this.tokens.get(token);
    if (!p) return { ok: false, err: 'no_login' };
    // 优先：有人且坐得下的房间（按真人数降序）；其次任何有座位的；否则建房
    const candidates = [...this.rooms.values()].filter(r => !r.closed);
    candidates.sort((a, b) => {
      const h = b.humanPlayers().length - a.humanPlayers().length;
      return h !== 0 ? h : b.seatedCount() - a.seatedCount();
    });
    for (const r of candidates) {
      const canSeat = r.seatedCount() < r.settings.maxSeats ||
        (r.settings.botsFill && r.seats.some(s => s && s.isBot));
      if (canSeat && r.humanPlayers().length < r.settings.maxSeats) {
        return this.joinRoom(token, r.code);
      }
    }
    const room = this.createRoom(token, null);
    return room ? { ok: true, room } : { ok: false, err: 'create_failed' };
  }

  practice(token) {
    const room = this.createRoom(token, { botsFill: true, botLevel: 'normal' });
    if (!room) return { ok: false, err: 'create_failed' };
    room.startGame();
    return { ok: true, room };
  }

  // 快速锦标赛：一键建房（锦标赛模式）+ 机器人开局
  quickTournament(token) {
    const room = this.createRoom(token, { mode: 'tournament', botsFill: true, botLevel: 'normal' });
    if (!room) return { ok: false, err: 'create_failed' };
    const res = room.startGame();
    if (!res.ok) return { ok: false, err: res.err };
    return { ok: true, room };
  }

  leaveRoom(token) {
    const p = this.tokens.get(token);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (room) room.removePlayer(token);
    p.roomId = null;
    this.onRoomsChanged();
  }

  removeRoom(code) {
    this.rooms.delete(code);
    for (const p of this.tokens.values()) {
      if (p.roomId === code) p.roomId = null;
    }
    this.onRoomsChanged();
  }

  // ── 房间列表广播 ───────────────────────────────────
  listRooms() {
    return [...this.rooms.values()]
      .filter(r => !r.closed)
      .map(r => ({
        code: r.code,
        humans: r.humanPlayers().length,
        seated: r.seatedCount(),
        maxSeats: r.settings.maxSeats,
        playing: r.phase === 'playing',
        mode: r.settings.mode,
        sb: r.settings.sb,
        bb: r.settings.bb,
        botsFill: r.settings.botsFill,
        botLevel: r.settings.botLevel,
      }));
  }

  sendRooms(token) { this.sendTo(token, { t: 'rooms', rooms: this.listRooms() }); }

  onRoomsChanged() {
    const list = this.listRooms();
    for (const p of this.tokens.values()) {
      if (!p.roomId) this.sendTo(p.token, { t: 'rooms', rooms: list });
    }
    for (const r of this.rooms.values()) {
      if (r.players.size > 0) {
        for (const tok of r.players.keys()) this.sendTo(tok, r.snapshot(tok));
      }
    }
  }

  shutdown() {
    saveSoon('profiles', this.profiles, 0);
    for (const r of this.rooms.values()) r.close();
    for (const p of this.tokens.values()) {
      if (p.ws && p.ws.readyState === 1) p.ws.close();
    }
  }
}

void DEFAULT_SETTINGS;
