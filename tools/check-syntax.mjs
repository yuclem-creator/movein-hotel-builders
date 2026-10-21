// check-syntax.mjs — parse every JS file with `node --check`. Parse-only, so the
// renderer's bare `three` import (resolved by the browser importmap) does not need
// node_modules. A syntax error must fail the gate before a browser ever sees it.
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'vendor' || e.name === '.git' || e.name === 'review') continue;
      out.push(...await walk(p));
    } else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [...await walk(join(ROOT, 'js')), ...await walk(join(ROOT, 'tools')), join(ROOT, 'serve.js')];
let fails = 0;
for (const f of files.sort()) {
  try {
    await run(process.execPath, ['--check', f]);
    console.log(`  ok   ${relative(ROOT, f)}`);
  } catch (err) {
    fails++;
    console.log(`  FAIL ${relative(ROOT, f)}`);
    console.log(String(err.stderr || err.message).split('\n').slice(0, 6).map((l) => `       ${l}`).join('\n'));
  }
}
console.log(fails ? `\n${fails} FILE(S) FAILED SYNTAX CHECK` : `\nALL ${files.length} FILES PARSE`);
// exitCode, not exit(): process.exit() can truncate piped stdout and hide the report.
process.exitCode = fails ? 1 : 0;
