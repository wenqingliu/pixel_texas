// 统一测试入口：node test/run_all.js
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tests = ['evaluator.test.js', 'hand.test.js', 'server.test.js'];

let failed = 0;
for (const t of tests) {
  console.log(`\n▶ ${t}`);
  const r = spawnSync(process.execPath, [path.join(here, t)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed === 0 ? '\n全部测试通过 ✓' : `\n${failed} 个测试文件失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
