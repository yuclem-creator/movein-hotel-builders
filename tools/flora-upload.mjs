// flora-upload.mjs — put a local file's bytes where flora_create_asset reserved them.
//
// flora_create_asset(source:"signed-url") returns an upload descriptor, and the bytes have to
// be sent by a client that can read the local file: the MCP server never sees it. The
// descriptor's shape is the storage backend's business, not ours, so this script follows
// `method` and `headers` exactly as given and does not hardcode an endpoint or a field name.
// Per the asset contract: a POST descriptor takes the multipart form fields verbatim with the
// file bytes LAST; a PUT descriptor takes the raw bytes.
//
// Usage: node tools/flora-upload.mjs <file> <descriptor.json|-> [--dry]
// '-' reads FLORA_UPLOAD_DESCRIPTOR from the environment; signed credentials need not touch disk.
//   descriptor.json is the `upload` object from the create response, e.g.
//   { "method": "POST", "url": "https://…", "headers": {…}, "fields": {…}, "fileField": "file" }
// Exit code 0 only on a 2xx. Nothing is printed from the descriptor's headers: a signed POST
// policy is a credential for the length of its life, not something to paste into a transcript.
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

const [file, descPath] = process.argv.slice(2);
const dry = process.argv.includes('--dry');

if (!file || !descPath) {
  console.log('usage: node tools/flora-upload.mjs <file> <descriptor.json> [--dry]');
  process.exitCode = 2;
} else {
  // Signed upload credentials stay in memory; '-' reads an environment variable, never a file.
  const raw = JSON.parse(descPath === '-' ? process.env.FLORA_UPLOAD_DESCRIPTOR : await readFile(descPath, 'utf8'));
  // Tolerate the descriptor arriving wrapped, and the field map under any of its usual names.
  const desc = raw.upload && typeof raw.upload === 'object' ? raw.upload : raw;
  const method = String(desc.method || desc.httpMethod || 'PUT').toUpperCase();
  const url = desc.url || desc.uploadUrl || desc.href;
  const headers = desc.headers || {};
  const fields = desc.fields || desc.form_fields || desc.form || desc.formFields || desc.fields_map || null;
  const fileField = desc.fileField || desc.file_field || 'file';
  const bytes = await readFile(file);
  const size = (await stat(file)).size;

  console.log(`file        ${basename(file)} (${size} bytes)`);
  console.log(`method      ${method}`);
  console.log(`descriptor  keys: ${Object.keys(desc).join(', ')}`);
  if (fields) console.log(`form fields ${Object.keys(fields).join(', ')} (file field "${fileField}")`);

  if (!url) {
    console.log('FAIL the descriptor carries no url');
    process.exitCode = 1;
  } else if (dry) {
    console.log('dry run: nothing sent');
  } else {
    let res;
    if (method === 'POST') {
      // Fields verbatim, bytes last: the order matters for a signed multipart policy.
      const form = new FormData();
      for (const [k, v] of Object.entries(fields || {})) form.append(k, String(v));
      form.append(fileField, new Blob([bytes]), basename(file));
      res = await fetch(url, { method, headers, body: form });
    } else {
      res = await fetch(url, { method, headers, body: bytes });
    }
    const text = (await res.text().catch(() => '')).slice(0, 300);
    console.log(`response    ${res.status} ${res.statusText} ${text}`);
    if (!res.ok) {
      console.log('FAIL upload rejected — do not retry the same signed URL; call '
        + 'flora_create_asset again for a fresh reservation');
      process.exitCode = 1;
    } else {
      console.log('UPLOAD OK — now call flora_complete_asset with the asset id');
    }
  }
}
