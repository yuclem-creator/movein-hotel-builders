// qr.js — a minimal QR Code encoder: byte mode, ECC L/M, versions 1-10.
//
// Why hand-written instead of vendored: the app ships with no CDN and no npm install,
// and this is only ever imported by the facilitator page — never by the game — so it
// costs nothing on a player's first load. It is deliberately small enough to audit:
// the tables below are ISO/IEC 18004 Table 9, and `tools/qr-check.mjs` decodes the
// output with an independent decoder (jsQR) before a pilot, so a wrong table cannot
// reach a classroom.

const ECC_BITS = { L: 1, M: 0 };

/**
 * [totalCodewords, eccPerBlock, blocksG1, dataG1, blocksG2, dataG2] per version.
 * Group 2 blocks always carry exactly one data codeword more than group 1.
 */
const BLOCKS = {
  L: {
    1: [26, 7, 1, 19, 0, 0],
    2: [44, 10, 1, 34, 0, 0],
    3: [70, 15, 1, 55, 0, 0],
    4: [100, 20, 1, 80, 0, 0],
    5: [134, 26, 1, 108, 0, 0],
    6: [172, 18, 2, 68, 0, 0],
    7: [196, 20, 2, 78, 0, 0],
    8: [242, 24, 2, 97, 0, 0],
    9: [292, 30, 2, 116, 0, 0],
    10: [346, 18, 2, 68, 2, 69],
  },
  M: {
    1: [26, 10, 1, 16, 0, 0],
    2: [44, 16, 1, 28, 0, 0],
    3: [70, 26, 1, 44, 0, 0],
    4: [100, 18, 2, 32, 0, 0],
    5: [134, 24, 2, 43, 0, 0],
    6: [172, 16, 4, 27, 0, 0],
    7: [196, 18, 4, 31, 0, 0],
    8: [242, 22, 2, 38, 2, 39],
    9: [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44],
  },
};

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/* --------------------------------------------------------------- GF(256) */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;   // primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Generator polynomial of degree n, highest coefficient first, leading 1. */
function genPoly(n) {
  let p = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) {
      next[j] ^= p[j];
      next[j + 1] ^= mul(p[j], EXP[i]);
    }
    p = next;
  }
  return p;
}

/** Reed-Solomon remainder: the n error-correction codewords for one block. */
function rsEncode(data, n) {
  const gen = genPoly(n);
  const res = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < n; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

/* ------------------------------------------------------------- bit stream */

class Bits {
  constructor() { this.bits = []; }
  push(value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() { return this.bits.length; }
  toBytes() {
    const out = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] || 0);
      out.push(b);
    }
    return out;
  }
}

/* --------------------------------------------------------------- encoding */

function chooseVersion(byteLength, ecc) {
  for (let v = 1; v <= 10; v++) {
    const [, , g1, d1, g2, d2] = BLOCKS[ecc][v];
    const dataCodewords = g1 * d1 + g2 * d2;
    // Byte mode: 4-bit mode indicator + 8-bit character count (versions 1-9) + data.
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= dataCodewords * 8) return v;
  }
  throw new Error(`QR: text too long for versions 1-10 at ECC ${ecc} (${byteLength} bytes)`);
}

function encodeBytes(text, version, ecc) {
  const [, eccPerBlock, g1, d1, g2, d2] = BLOCKS[ecc][version];
  const dataCodewords = g1 * d1 + g2 * d2;
  const bytes = [...new TextEncoder().encode(text)];

  const bits = new Bits();
  bits.push(0b0100, 4);
  bits.push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) bits.push(b, 8);

  const capacity = dataCodewords * 8;
  if (bits.length > capacity) throw new Error('QR: payload overflow');
  // Terminator, then pad to a byte boundary, then the standard 0xEC/0x11 pattern.
  bits.push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0, 1);
  const data = bits.toBytes();
  for (let pad = 0; data.length < dataCodewords; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);

  // Slice into blocks, error-correct each, then interleave data, then ECC.
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1; i++) { const d = data.slice(offset, offset + d1); offset += d1; blocks.push({ d, e: rsEncode(d, eccPerBlock) }); }
  for (let i = 0; i < g2; i++) { const d = data.slice(offset, offset + d2); offset += d2; blocks.push({ d, e: rsEncode(d, eccPerBlock) }); }

  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < eccPerBlock; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

/* ---------------------------------------------------------------- matrix */

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function bitLength(n) { let i = 0; while (n !== 0) { i++; n >>>= 1; } return i; }

function remainder(value, gen) {
  let d = value;
  while (bitLength(d) - bitLength(gen) >= 0) d ^= gen << (bitLength(d) - bitLength(gen));
  return d;
}

/** Format information: 5 data bits, BCH(15,5), masked with 0x5412. */
const bchTypeInfo = (data) => (((data << 10) | remainder(data << 10, 0x537)) ^ 0x5412) & 0x7fff;

/** Version information: 6 data bits, BCH(18,6). Versions 7 and up only. */
const bchTypeNumber = (version) => (version << 12) | remainder(version << 12, 0x1f25);

/** Build the module grid with everything except data and format bits in place. */
function blankMatrix(version) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));

  const put = (r, c, v) => {
    if (r >= 0 && c >= 0 && r < size && c < size) { m[r][c] = v; fixed[r][c] = true; }
  };

  // Finder patterns plus their light separators.
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r < 8; r++) {
      for (let c = -1; c < 8; c++) {
        const inside = r >= 0 && c >= 0 && r < 7 && c < 7;
        const ring = inside && (r === 0 || r === 6 || c === 0 || c === 6);
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        put(r0 + r, c0 + c, inside ? (ring || core ? 1 : 0) : 0);
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) { const v = i % 2 === 0 ? 1 : 0; put(6, i, v); put(i, 6, v); }

  // Alignment patterns, skipping any that would land on a finder.
  const pos = ALIGN[version];
  for (const r of pos) for (const c of pos) {
    if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      put(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? 0 : 1);
    }
  }

  // Reserve the format areas (values written after masking) and the dark module.
  // Row 6 and column 6 are timing, not format: overwriting them with 0 puts a hole in
  // the timing pattern at (6,8) and (8,6), which is exactly the kind of defect a decoder
  // may still tolerate on a perfect screen and a phone camera may not.
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { put(8, i, 0); put(i, 8, 0); }
  }
  for (let i = 0; i < 8; i++) { put(8, size - 1 - i, 0); put(size - 1 - i, 8, 0); }
  put(size - 8, 8, 1);

  // Version information block, versions 7 and up.
  if (version >= 7) {
    const bits = bchTypeNumber(version);
    for (let i = 0; i < 18; i++) {
      const v = (bits >> i) & 1;
      put(Math.floor(i / 3), size - 11 + (i % 3), v);
      put(size - 11 + (i % 3), Math.floor(i / 3), v);
    }
  }

  return { size, m, fixed };
}

function placeData(grid, codewords, mask) {
  const { size, m } = grid;
  let row = size - 1;
  let inc = -1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (grid.fixed[row][cc]) continue;
        let dark = 0;
        if (byteIndex < codewords.length) dark = (codewords[byteIndex] >>> bitIndex) & 1;
        if (MASKS[mask](row, cc)) dark ^= 1;
        m[row][cc] = dark;
        bitIndex--;
        if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
      }
      row += inc;
      if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
    }
  }
}

function placeFormat(grid, ecc, mask) {
  const { size, m } = grid;
  const bits = bchTypeInfo((ECC_BITS[ecc] << 3) | mask);
  for (let i = 0; i < 15; i++) {
    const v = (bits >> i) & 1;
    if (i < 6) m[i][8] = v;
    else if (i < 8) m[i + 1][8] = v;
    else m[size - 15 + i][8] = v;

    if (i < 8) m[8][size - 1 - i] = v;
    else if (i < 9) m[8][15 - i] = v;
    else m[8][15 - i - 1] = v;
  }
  m[size - 8][8] = 1;
}

/** The four standard penalty rules; used only to pick the least noisy mask. */
function penalty(m, size) {
  let score = 0;

  const scan = (get) => {
    for (let i = 0; i < size; i++) {
      let run = 1;
      for (let j = 1; j <= size; j++) {
        if (j < size && get(i, j) === get(i, j - 1)) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
    }
  };
  scan((i, j) => m[i][j]);
  scan((i, j) => m[j][i]);

  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }

  // Finder-like 1:1:3:1:1 runs with four light modules beside them.
  const run = [1, 0, 1, 1, 1, 0, 1];
  const finderLike = (get, i, j) => {
    for (let k = 0; k < 7; k++) if (get(i, j + k) !== run[k]) return false;
    let before = true, after = true;
    for (let k = 1; k <= 4; k++) {
      if (j - k >= 0 && get(i, j - k) !== 0) before = false;
      if (j + 6 + k < size && get(i, j + 6 + k) !== 0) after = false;
    }
    return before || after;
  };
  for (let i = 0; i < size; i++) for (let j = 0; j + 7 <= size; j++) {
    if (finderLike((a, b) => m[a][b], i, j)) score += 40;
    if (finderLike((a, b) => m[b][a], i, j)) score += 40;
  }

  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/**
 * Encode `text` and return the module grid.
 * @returns {{version:number, mask:number, size:number, modules:number[][]}}
 */
export function qrMatrix(text, { ecc = 'M' } = {}) {
  if (!BLOCKS[ecc]) throw new Error(`QR: unknown ECC level ${ecc}`);
  const bytes = new TextEncoder().encode(text).length;
  const version = chooseVersion(bytes, ecc);
  const codewords = encodeBytes(text, version, ecc);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const grid = blankMatrix(version);
    placeData(grid, codewords, mask);
    placeFormat(grid, ecc, mask);
    const score = penalty(grid.m, grid.size);
    if (!best || score < best.score) best = { score, mask, modules: grid.m };
  }
  return { version, mask: best.mask, size: best.modules.length, modules: best.modules };
}

/**
 * SVG for printing or projecting. One path keeps the markup small and crisp at any
 * scale; the quiet zone is four modules, as the spec requires, not a CSS margin.
 */
export function qrSvg(text, {
  ecc = 'M', module: px = 6, margin = 4, dark = '#232323', light = '#F6F2EA', label = '',
} = {}) {
  const { size, modules } = qrMatrix(text, { ecc });
  const total = (size + margin * 2) * px;
  let d = '';
  for (let r = 0; r < size; r++) {
    let run = 0;
    for (let c = 0; c <= size; c++) {
      if (c < size && modules[r][c] === 1) run++;
      else if (run) {
        d += `M${(c - run + margin) * px} ${(r + margin) * px}h${run * px}v${px}h${-run * px}z`;
        run = 0;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" ` +
    `viewBox="0 0 ${total} ${total}" role="img" aria-label="${label || 'QR code'}">` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<path d="${d}" fill="${dark}"/></svg>`;
}
