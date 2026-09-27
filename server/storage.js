// 轻量 JSON 落盘：data/<name>.json，防抖保存
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 数据目录：默认 <项目>/data，可用 PT_DATA_DIR 环境变量隔离（测试用）
const DATA_DIR = process.env.PT_DATA_DIR
  ? path.resolve(process.env.PT_DATA_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export function load(name, def) {
  // 主文件损坏时回退 .bak（原子写时留的上一份）
  for (const suffix of ['', '.bak']) {
    try {
      return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name + '.json' + suffix), 'utf8'));
    } catch { /* 尝试下一份 */ }
  }
  return def;
}

const pending = new Map();
export function saveSoon(name, data, delay = 1500) {
  pending.set(name, data);
  if (pending.size === 1) {
    setTimeout(() => {
      for (const [n, d] of pending) saveNow(n, d);
      pending.clear();
    }, delay);
  }
}

// 原子写：先写临时文件再 rename，绝不停留在"写了一半"的状态；
// 上一份留作 .bak，主文件损坏时 load() 可回退
export function saveNow(name, data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, name + '.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    try { fs.copyFileSync(file, file + '.bak'); } catch { /* 首次无旧文件 */ }
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('[storage]', name, e.message);
  }
}
