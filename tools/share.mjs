// share.mjs — a public HTTPS address for the join cards, for rooms whose Wi-Fi will not let
// two devices talk to each other.
//
// Guest and corporate networks routinely isolate clients: a phone can scan a perfectly good
// QR that carries the laptop's own address and still reach nothing, because the access point
// drops phone-to-laptop traffic. This opens an SSH reverse tunnel (no account, no install,
// OpenSSH ships with Windows) and records the public address in share-url.txt. The board
// reads it through /__lan and prints cards that work on any network.
//
// The address lasts as long as this process. Ctrl-C closes the tunnel and removes the file.
import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'share-url.txt');
const PORT = Number(process.env.PORT || 5173);
// Free tunnels always land on *.lhr.life. The banner also carries admin.localhost.run and
// docs links, so anything matching `localhost.run` alone would publish the wrong address.
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.lhr\.life/i;

const ssh = spawn('ssh', [
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'UserKnownHostsFile=NUL',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ExitOnForwardFailure=yes',
  '-R', `80:localhost:${PORT}`,
  'nokey@localhost.run',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let announced = false;
let buffered = '';

async function announce(url) {
  if (announced) return;
  announced = true;
  const origin = url.replace(/\/$/, '');
  await writeFile(FILE, `${origin}\n`, 'utf8');
  console.log(`sharing http://localhost:${PORT} as ${origin}`);
  console.log(`  open the board and press "Make join cards" — the cards now carry ${origin}`);
  console.log('  this address lasts while this window is open; Ctrl-C closes it');
}

ssh.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  buffered = (buffered + text).slice(-8192);
  const match = buffered.match(URL_PATTERN);
  if (match) announce(match[0]);
});

ssh.stderr.on('data', (chunk) => {
  // localhost.run prints its banner on stderr and the address on stdout when a terminal is
  // attached, but the reverse when the child is spawned with pipes. Scan both streams.
  const text = chunk.toString();
  buffered = (buffered + text).slice(-8192);
  const match = buffered.match(URL_PATTERN);
  if (match) announce(match[0]);
});

ssh.on('error', (err) => {
  console.error(`cannot start ssh: ${err.message}`);
  console.error('OpenSSH should ship with Windows; if it is missing, enable the optional feature.');
  process.exitCode = 1;
});

ssh.on('close', async (code) => {
  await unlink(FILE).catch(() => {});
  if (!announced) {
    console.error(`the tunnel closed before it published an address (ssh exit ${code}).`);
    console.error('Outbound SSH may be blocked on this network; a phone hotspot or a hosted copy may be the only route.');
    process.exitCode = 1;
  }
});

const stop = async () => {
  ssh.kill();
  await unlink(FILE).catch(() => {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
