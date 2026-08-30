// 特效：粒子、漂浮文字、屏幕震动、WebAudio 程序合成音效
export const FX = {
  particles: [],
  floats: [],
  rings: [],       // 点击涟漪
  shakeTrauma: 0,
  flash: 0,        // All-in 全屏闪光
  t: 0,
  now: 0,
  volume: Number(localStorage.getItem('pt_vol') ?? 0.7),
  _ac: null,
};

// 点击涟漪（main 在 pointerdown 时调用）
export function clickRing(x, y) {
  FX.rings.push({ x, y, age: 0 });
}

export function setVolume(v) {
  FX.volume = v;
  localStorage.setItem('pt_vol', String(v));
}

function ac() {
  if (!FX._ac) {
    try { FX._ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (FX._ac.state === 'suspended') FX._ac.resume();
  return FX._ac;
}

// 供音乐模块复用同一个音频上下文
export function audioCtx() { return ac(); }

function tone(freq, dur, { type = 'square', vol = 0.5, slide = 0, delay = 0 } = {}) {
  const a = ac();
  if (!a || FX.volume <= 0) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol * FX.volume, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.3, delay = 0, freq = 2400 } = {}) {
  const a = ac();
  if (!a || FX.volume <= 0) return;
  const t0 = a.currentTime + delay;
  const len = Math.max(1, (dur * a.sampleRate) | 0);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  const g = a.createGain();
  g.gain.setValueAtTime(vol * FX.volume, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(t0);
}

export const sfx = {
  click: () => tone(660, 0.06, { vol: 0.35 }),
  hover: () => tone(440, 0.03, { vol: 0.12 }),
  deal: () => noise(0.09, { vol: 0.25, freq: 3200 }),
  flip: () => { tone(520, 0.05, { vol: 0.25, slide: 300 }); noise(0.05, { vol: 0.12 }); },
  chip: () => { tone(1150, 0.04, { type: 'triangle', vol: 0.4 }); tone(880, 0.05, { type: 'triangle', vol: 0.3, delay: 0.045 }); },
  fold: () => tone(170, 0.09, { type: 'triangle', vol: 0.35, slide: -60 }),
  turn: () => { tone(880, 0.09, { type: 'sine', vol: 0.4 }); tone(1320, 0.12, { type: 'sine', vol: 0.25, delay: 0.07 }); },
  allin: () => { tone(220, 0.5, { type: 'sawtooth', vol: 0.35, slide: -120 }); tone(440, 0.4, { type: 'square', vol: 0.2, slide: -180 }); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, { vol: 0.32, delay: i * 0.09 })); },
  lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.25, delay: i * 0.11 })); },
  street: () => { tone(700, 0.05, { vol: 0.22, slide: 200 }); noise(0.06, { vol: 0.1, freq: 1800 }); },
};

// ── 粒子 ────────────────────────────────────────────
const CONFETTI_COLORS = ['#ffd76e', '#ef5350', '#66bb6a', '#5c8dff', '#ff9f43', '#f06292'];

export function confetti(x, y, n = 26) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 160;
    FX.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
      life: 0.9 + Math.random() * 0.8, age: 0,
      size: 2 + (Math.random() * 3 | 0),
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      g: 260,
    });
  }
}

// 筹码飞行：bet=下注/合池（红蓝绿），collect=赢家收池（金）
const CHIP_COLORS = [
  { face: '#d95050', edge: '#8f2f2f' },
  { face: '#4f7bd9', edge: '#2f4f8f' },
  { face: '#43a06a', edge: '#2a6a45' },
];
const CHIP_GOLD = { face: '#e6b84c', edge: '#9a7726' };

export function flyChips(x, y, tx, ty, opts = {}) {
  // 坐标越界或非数保护（防止任何一帧 NaN 让粒子飞到无穷远）
  const safe = v => (Number.isFinite(v) ? v : 480);
  x = safe(x); y = safe(y); tx = safe(tx); ty = safe(ty);
  if (Math.abs(tx) > 5000 || Math.abs(ty) > 5000) return;
  const n = opts.n || 5;
  const gold = opts.kind === 'collect';
  const size = gold ? 7 : 5.5;
  let sndDone = false;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const col = gold ? CHIP_GOLD : CHIP_COLORS[(Math.random() * CHIP_COLORS.length) | 0];
    FX.particles.push({
      x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 10,
      tx: tx + (Math.random() - 0.5) * 16, ty: ty + (Math.random() - 0.5) * 8,
      control: true, chip: true,
      age: -i * 0.045, dur: 0.42 + Math.random() * 0.18,
      life: 1,
      size, face: col.face, edge: col.edge,
      rot: Math.random() * 6.28, rotV: (Math.random() - 0.5) * 8,
      snd: last && !sndDone ? (sndDone = true) : false,
    });
  }
}

export function floatText(x, y, text, color = '#f4efe3', size = 14) {
  FX.floats.push({ x, y, text, color, size, age: 0, life: 1.1, vy: -34 });
}

export function shake(amount = 1) { FX.shakeTrauma = Math.min(1.2, FX.shakeTrauma + amount); }

export function updateFX(dt) {
  FX.t += dt;
  FX.now = performance.now();
  FX.flash = Math.max(0, FX.flash - dt * 1.8);
  FX.shakeTrauma = Math.max(0, FX.shakeTrauma - dt * 1.6);
  for (let i = FX.particles.length - 1; i >= 0; i--) {
    const p = FX.particles[i];
    p.age += dt;
    if (p.age < 0) continue;
    if (p.control) {
      const k = Math.min(1, p.age / p.dur);
      const e = k * k * (3 - 2 * k);
      p.cx = p.x + (p.tx - p.x) * e;
      p.cy = p.y + (p.ty - p.y) * e - Math.sin(e * Math.PI) * (p.chip ? 34 : 60);
      if (p.chip) p.rot += p.rotV * dt;
      if (k >= 1) {
        if (p.snd) tone(1050, 0.04, { type: 'triangle', vol: 0.22 });
        FX.particles.splice(i, 1);
      }
    } else {
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age >= p.life) FX.particles.splice(i, 1);
    }
  }
  for (let i = FX.rings.length - 1; i >= 0; i--) {
    FX.rings[i].age += dt;
    if (FX.rings[i].age > 0.32) FX.rings.splice(i, 1);
  }
  for (let i = FX.floats.length - 1; i >= 0; i--) {
    const f = FX.floats[i];
    f.age += dt;
    f.y += f.vy * dt;
    f.vy *= 0.94;
    if (f.age >= f.life) FX.floats.splice(i, 1);
  }
}

export function drawFX(ctx) {
  // 点击涟漪
  for (const r of FX.rings) {
    const k = r.age / 0.32;
    ctx.globalAlpha = (1 - k) * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 4 + k * 26, 0, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const p of FX.particles) {
    if (p.age < 0) continue;
    if (p.control) {
      if (p.chip) {
        // 真实筹码：投影 + 彩色本体 + 边缘白条纹 + 内环，飞行中旋转
        ctx.save();
        ctx.translate(p.cx, p.cy);
        ctx.rotate(p.rot);
        const r = p.size;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.arc(1, 1.4, r, 0, 7); ctx.fill();
        ctx.fillStyle = p.face;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.fillStyle = '#f2ead8';
        for (let k = 0; k < 6; k++) {
          ctx.save();
          ctx.rotate(k * Math.PI / 3);
          ctx.fillRect(r * 0.74, -r * 0.2, r * 0.3, r * 0.4);
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, 7); ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.size, 0, 7);
        ctx.fill();
        ctx.strokeStyle = '#1c4a34';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }
  for (const f of FX.floats) {
    const k = f.age / f.life;
    ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    drawPixelText(ctx, f.text, f.x, f.y, f.size, f.color, 'center');
    ctx.globalAlpha = 1;
  }
}

export function shakeOffset() {
  const t = FX.shakeTrauma * FX.shakeTrauma;
  return {
    x: (Math.random() * 2 - 1) * 7 * t,
    y: (Math.random() * 2 - 1) * 7 * t,
  };
}

// ── 像素字绘制 ──────────────────────────────────────
let fontReady = false;
document.fonts && document.fonts.load("12px 'FusionPixel'").then(() => { fontReady = true; });

export function drawPixelText(ctx, text, x, y, size, color, align = 'left', outline = null) {
  const fam = fontReady ? "'FusionPixel'" : "'FusionPixel','Microsoft YaHei',sans-serif";
  ctx.font = `${size}px ${fam}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (outline) {
    ctx.fillStyle = outline;
    ctx.fillText(text, x + 2, y + 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// 简单缓动
export const ease = {
  outBack: (k) => { const c = 1.70158; const x = k - 1; return x * x * ((c + 1) * x + c) + 1; },
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
};
