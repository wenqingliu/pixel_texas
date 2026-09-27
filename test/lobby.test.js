// 房间设置校验 + 大厅档案/会话清理（数据目录隔离到临时目录，不碰真实 data/）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 必须在任何 storage 相关模块加载前设置
process.env.PT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-lobby-test-'));

const { Room, DEFAULT_SETTINGS } = await import('../server/room.js');

let fails = 0;
function assert(cond, msg) {
  if (!cond) { fails++; console.error('  ✗ ' + msg); }
}

// ── updateSettings 参数校验 ──────────────────────────
{
  const room = new Room({ onRoomsChanged() {}, sendTo() {} }, 'TST1', 'host');
  room.addPlayer('host', '房主', '');
  const r = room.updateSettings('host', {
    sb: 'x', bb: NaN, buyIn: -5, maxSeats: 99, actionTime: 0,
    blindsEvery: 'zz', botLevel: 'hack', mode: 'bogus', botsFill: 'yes',
  });
  assert(r.ok, '非法设置不报错（回落安全值）');
  assert(room.settings.sb === DEFAULT_SETTINGS.sb, `非法 sb 回落默认（实际 ${room.settings.sb}）`);
  assert(room.settings.bb === DEFAULT_SETTINGS.bb, `非法 bb 回落默认（实际 ${room.settings.bb}）`);
  assert(room.settings.buyIn === 100, `负买入钳到下限 100（实际 ${room.settings.buyIn}）`);
  assert(room.settings.maxSeats === 9, 'maxSeats 越界钳到 9');
  assert(room.settings.actionTime === 30, 'actionTime 0 回落 30');
  assert(room.settings.blindsEvery === 8, 'blindsEvery 非法回落 8');
  assert(room.settings.botLevel === 'normal', 'botLevel 非法回落 normal');
  assert(room.settings.mode === 'cash', 'mode 非法回落 cash');
  assert(room.settings.botsFill === true, 'botsFill 归一化为布尔');

  const r2 = room.updateSettings('host', { sb: 25, bb: 50, buyIn: 5000 });
  assert(r2.ok && room.settings.sb === 25 && room.settings.bb === 50 && room.settings.buyIn === 5000, '合法设置原样生效');
  room.updateSettings('host', { bb: 10 }); // bb < sb → 强制抬升
  assert(room.settings.bb === 50, `bb ≤ sb 时抬升为 2×sb（实际 ${room.settings.bb}）`);

  const r3 = room.updateSettings('guest', { sb: 1 });
  assert(!r3.ok && r3.err === 'not_host', '非房主改设置被拒');
}

console.log(fails === 0 ? 'lobby 校验全部通过 ✓' : `lobby 校验有 ${fails} 项失败 ✗`);
process.exit(fails === 0 ? 0 : 1);
