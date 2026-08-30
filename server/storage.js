// 轻量 JSON 落盘：data/<name>.json，防抖保存
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export function load(name, def) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name + '.json'), 'utf8'));
  } catch {
    return def;
  }
}

const pending = new Map();
export function saveSoon(name, data, delay = 1500) {
  pending.set(name, data);
  if (pending.size === 1) {
    setTimeout(() => {
      for (const [n, d] of pending) {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(path.join(DATA_DIR, n + '.json'), JSON.stringify(d));
        } catch (e) {
          console.error('[storage]', n, e.message);
        }
      }
      pending.clear();
    }, delay);
  }
}

export function saveNow(name, data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, name + '.json'), JSON.stringify(data));
  } catch (e) {
    console.error('[storage]', name, e.message);
  }
}
