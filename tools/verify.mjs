// Run the canonical package.json verify chain without npm.cmd (blocked on this host).
// No duplicate gate list: a new package gate is automatically included here.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const gates = pkg.scripts.verify.split(' && ').map((s) => {
  const match = /^node (tools\/[\w-]+\.mjs)$/.exec(s);
  if (!match) throw new Error(`Unsupported verify command: ${s}`);
  return match[1];
});
const only = process.argv.slice(2);
for (const name of only) if (!gates.some((g) => g === `tools/${name}.mjs`)) throw new Error(`Unknown gate: ${name}`);
for (const gate of gates.filter((g) => !only.length || only.includes(g.slice(6, -4)))) {
  const start = Date.now();
  const r = spawnSync(process.execPath, [gate], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  console.log(`\n##### ${gate} exit=${r.status} ${((Date.now() - start) / 1000).toFixed(0)}s\n${r.stdout || ''}${r.stderr || ''}`);
  if (r.error || r.status !== 0) { console.error(r.error || `CHAIN-STOP at ${gate}`); process.exit(1); }
}
console.log('CHAIN-GREEN');
