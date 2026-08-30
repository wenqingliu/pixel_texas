// 8-bit 风格背景音乐：程序化步进音序器（无外部素材）
// 三首循环曲目 + 自动模式（菜单/牌桌各配一首）
import { audioCtx } from './fx.js';

// midi 音号 → 频率
const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 64 步（4 小节 × 16 步）模式，0 = 休止
const TRACKS = {
  neon: {
    name: '霓虹夜晚', bpm: 88,
    bass: [
      36, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0,
      45, 0, 0, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 0, 0,
      36, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0,
      38, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0,
    ],
    lead: [
      0, 0, 0, 64, 0, 0, 67, 0, 69, 0, 0, 0, 67, 0, 64, 0,
      0, 0, 62, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 64, 0, 0, 67, 0, 72, 0, 0, 0, 69, 0, 67, 0,
      69, 0, 0, 62, 0, 0, 60, 0, 62, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
  table: {
    name: '绿桌风云', bpm: 106,
    bass: [
      33, 0, 36, 0, 40, 0, 36, 0, 33, 0, 36, 0, 40, 0, 43, 0,
      31, 0, 35, 0, 38, 0, 35, 0, 33, 0, 36, 0, 40, 0, 36, 0,
      33, 0, 36, 0, 40, 0, 36, 0, 33, 0, 36, 0, 40, 0, 43, 0,
      45, 0, 43, 0, 40, 0, 36, 0, 38, 0, 35, 0, 33, 0, 0, 0,
    ],
    lead: [
      0, 0, 57, 0, 0, 0, 60, 0, 64, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 55, 0, 0, 0, 59, 0, 62, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 57, 0, 0, 0, 60, 0, 64, 0, 0, 0, 0, 0, 67, 0,
      0, 0, 65, 0, 0, 0, 64, 0, 60, 0, 0, 0, 57, 0, 0, 0,
    ],
  },
  tense: {
    name: '暗流涌动', bpm: 126,
    bass: [
      38, 38, 0, 38, 38, 0, 38, 38, 0, 38, 0, 38, 38, 0, 45, 0,
      38, 38, 0, 38, 38, 0, 38, 38, 0, 38, 0, 38, 36, 0, 38, 0,
      38, 38, 0, 38, 38, 0, 38, 38, 0, 38, 0, 38, 38, 0, 45, 0,
      41, 41, 0, 41, 40, 0, 38, 0, 36, 0, 38, 0, 38, 0, 0, 0,
    ],
    lead: [
      0, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 71, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 72, 0,
      0, 0, 71, 0, 0, 0, 69, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
};

export const TRACK_LIST = [
  { id: 'auto', name: '自动' },
  { id: 'neon', name: '霓虹夜晚' },
  { id: 'table', name: '绿桌风云' },
  { id: 'tense', name: '暗流涌动' },
  { id: 'off', name: '关' },
];

const state = {
  volume: Math.min(1, Math.max(0, Number(localStorage.getItem('pt_music') ?? 0.5))),
  trackId: localStorage.getItem('pt_track') || 'auto',
  enabled: localStorage.getItem('pt_music_on') !== '0',
  scene: 'menu',
  step: 0,
  nextTime: 0,
  timer: null,
};

function resolveTrack() {
  if (!state.enabled || state.volume <= 0) return null;
  if (state.trackId === 'off') return null;
  if (state.trackId !== 'auto' && TRACKS[state.trackId]) return TRACKS[state.trackId];
  return state.scene === 'menu' ? TRACKS.neon : TRACKS.table; // 自动
}

function playNote(a, freq, t, dur, type, gain) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function playHat(a, t) {
  const len = (0.03 * a.sampleRate) | 0;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 6000;
  const g = a.createGain();
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(t);
}

function playKick(a, t) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
  g.gain.setValueAtTime(0.24, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + 0.14);
}

function schedule() {
  const a = audioCtx();
  const track = resolveTrack();
  if (!a || !track) { stop(); return; }
  const stepDur = 60 / track.bpm / 4;
  while (state.nextTime < a.currentTime + 0.3) {
    const s = state.step % 64;
    const t = Math.max(state.nextTime, a.currentTime + 0.02);
    if (track.bass[s]) playNote(a, N(track.bass[s]), t, stepDur * 2.2, 'triangle', 0.17);
    if (track.lead[s]) playNote(a, N(track.lead[s]), t, stepDur * 1.4, 'square', 0.085);
    if (s % 8 === 0) playKick(a, t);
    if (s % 4 === 2) playHat(a, t);
    state.nextTime += stepDur;
    state.step++;
  }
}

function stop() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}

function ensureStarted() {
  const track = resolveTrack();
  if (!track) { stop(); return; }
  if (!state.timer) {
    const a = audioCtx();
    if (!a) return;
    state.nextTime = a.currentTime + 0.1;
    state.timer = setInterval(schedule, 80);
  }
}

export const Music = {
  get volume() { return state.volume; },
  get trackId() { return state.trackId; },
  get enabled() { return state.enabled; },

  unlock() {
    const a = audioCtx();
    if (a && a.state === 'suspended') a.resume();
    ensureStarted();
  },

  setVolume(v) {
    state.volume = v;
    localStorage.setItem('pt_music', String(v));
    ensureStarted();
    if (v <= 0) stop();
  },

  setTrack(id) {
    state.trackId = id;
    localStorage.setItem('pt_track', id);
    stop();
    ensureStarted();
  },

  toggleEnabled() {
    state.enabled = !state.enabled;
    localStorage.setItem('pt_music_on', state.enabled ? '1' : '0');
    if (!state.enabled) stop();
    else ensureStarted();
    return state.enabled;
  },

  // 场景切换（menu | table），auto 曲目跟随
  setScene(scene) {
    if (state.scene === scene) return;
    state.scene = scene;
    const cur = resolveTrack();
    stop();
    if (cur) ensureStarted();
  },
};

// 后台标签页定时器被节流，音序器会出空拍 —— 切后台自动暂停，回来恢复
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop();
  } else {
    ensureStarted();
  }
});
