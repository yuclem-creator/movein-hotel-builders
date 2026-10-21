// apply-schema.mjs — run supabase/schema.sql against a project through the Management API.
//
// The API executes ONE statement per call, so the file is split here rather than by hand:
// semicolons inside `$$ … $$` function bodies and inside string literals are not boundaries.
//
//   HB_SB_PAT=sbp_… node tools/apply-schema.mjs [project-ref]
//
// The ref is read from net.json when not given. The token is never written anywhere.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.HB_SB_PAT;
if (!token) {
  console.error('set HB_SB_PAT to a Supabase personal access token (Account → Access Tokens)');
  process.exit(2);
}

const net = JSON.parse(await readFile(join(ROOT, 'net.json'), 'utf8').catch(() => '{}'));
const ref = process.argv[2] || String(net.url || '').replace(/^https?:\/\//, '').split('.')[0];
if (!ref) {
  console.error('no project ref: pass it as an argument or put the url in net.json');
  process.exit(2);
}

/** Split SQL on statement boundaries, ignoring comments, `$$ … $$` bodies and quoted strings. */
export function splitStatements(sql) {
  const out = [];
  let buf = '';
  let dollar = null;
  let quote = false;
  let line = false;
  let block = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    if (line) {                       // -- … to end of line: a `;` inside is just text
      buf += c;
      if (c === '\n') line = false;
      continue;
    }
    if (block) {                      // /* … */
      buf += c;
      if (c === '*' && sql[i + 1] === '/') { buf += '/'; i++; block = false; }
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) { buf += dollar; i += dollar.length - 1; dollar = null; continue; }
      buf += c;
      continue;
    }
    if (quote) {
      buf += c;
      if (c === "'") {
        if (sql[i + 1] === "'") { buf += "'"; i++; } else quote = false;
      }
      continue;
    }

    if (c === '-' && sql[i + 1] === '-') { line = true; buf += '--'; i++; continue; }
    if (c === '/' && sql[i + 1] === '*') { block = true; buf += '/*'; i++; continue; }
    if (c === "'") { quote = true; buf += c; continue; }
    if (c === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) { dollar = tag[0]; buf += dollar; i += dollar.length - 1; continue; }
    }
    if (c === ';') { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((statement) => statement.replace(/--[^\n]*/g, '').trim().length > 0);
}

const sql = await readFile(join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const statements = splitStatements(sql);
console.log(`== ${ref}: ${statements.length} statements ==`);

let fails = 0;
for (const [i, statement] of statements.entries()) {
  const label = statement.replace(/\s+/g, ' ').slice(0, 72);
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: statement }),
    });
    if (res.ok) {
      console.log(`  ok   ${i + 1}/${statements.length}  ${label}`);
    } else {
      const body = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
      console.log(`  FAIL ${i + 1}/${statements.length}  ${label}`);
      console.log(`       HTTP ${res.status}: ${body}`);
      fails++;
    }
  } catch (err) {
    console.log(`  FAIL ${i + 1}/${statements.length}  ${label}`);
    console.log(`       ${err.message}`);
    fails++;
  }
}

console.log(fails ? `\n${fails} STATEMENT(S) FAILED` : '\nSCHEMA APPLIED');
process.exitCode = fails ? 1 : 0;
