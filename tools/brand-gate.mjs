// brand-gate.mjs — every colour in the shipped CSS and HTML must trace to the brand
// canon declared in tokens.css (or to a guest-selectable palette accent from the
// catalogue). A stray hex is how an off-brand deck ships; this fails the build first.
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTES } from '../js/sim/catalogue.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CANON = new Set(['#B59060', '#B7CDC2', '#232323']); // MO gold, sage, near-black

const tokens = await readFile(join(ROOT, 'css/tokens.css'), 'utf8');
const declared = new Set([...tokens.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase()));
for (const c of CANON) {
  if (!declared.has(c)) { console.log(`FAIL tokens.css does not declare canon ${c}`); process.exitCode = 1; }
}
const allowed = new Set([...declared, ...PALETTES.map((p) => p.accent.toUpperCase())]);

const targets = [join(ROOT, 'index.html'), join(ROOT, 'board.html'), join(ROOT, 'js/main.js')];
for (const f of await readdir(join(ROOT, 'css'))) targets.push(join(ROOT, 'css', f));

let fails = 0;
for (const f of [...new Set(targets)].sort()) {
  const txt = await readFile(f, 'utf8');
  const found = [...txt.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
  const bad = [...new Set(found.filter((h) => !allowed.has(h)))];
  if (bad.length) {
    fails++;
    console.log(`  FAIL ${relative(ROOT, f)}: off-canon colours ${bad.join(', ')}`);
  } else {
    console.log(`  ok   ${relative(ROOT, f)} (${new Set(found).size} colour literals, all canonical)`);
  }
}

// Type lock: headings use MO Exceptional at Regular weight only; never synthesise weight.
// The value is captured and compared, not lookahead-matched: a lookahead after \s*
// backtracks to zero-width and passes on "font-weight: 400", which is a false alarm.
const app = await readFile(join(ROOT, 'css/app.css'), 'utf8');
const headingBlocks = [...app.matchAll(/h1[^{]*\{[^}]*\}|h2[^{]*\{[^}]*\}|h3[^{]*\{[^}]*\}/g)].map((m) => m[0]);
for (const b of headingBlocks) {
  for (const m of b.matchAll(/font-weight:\s*([^;}]+)/g)) {
    if (!/^(400|normal)$/.test(m[1].trim())) {
      fails++;
      console.log(`  FAIL heading rule synthesises weight "${m[1].trim()}": ${b.replace(/\s+/g, ' ').slice(0, 80)}`);
    }
  }
}
if (!/--font-display:\s*'MO Exceptional'/.test(tokens)) { fails++; console.log('  FAIL display font is not MO Exceptional'); }
if (!/--font-body:\s*'Avenir Next LT Pro'/.test(tokens)) { fails++; console.log('  FAIL body font is not Avenir Next LT Pro'); }
if (!headingBlocks.length) { fails++; console.log('  FAIL no heading rules found to check'); }
console.log(`  ok   type lock: ${headingBlocks.length} heading rules, display = MO Exceptional, body = Avenir Next LT Pro`);

console.log(fails ? `\n${fails} BRAND GATE FAILURE(S)` : '\nBRAND GATE PASSED');
// exitCode, not exit(): process.exit() can truncate piped stdout and hide the report.
process.exitCode = fails ? 1 : 0;
