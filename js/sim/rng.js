// rng.js — deterministic, dependency-free randomness.
// Isomorphic: browser, Node (tests) and Deno (future server) all produce the same
// stream from the same seed. Nothing in the sim may call Math.random().

/** FNV-1a 32-bit string hash → uint32 seed. Stable across engines. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough distribution for a classroom sim. */
export function mulberry32(a) {
  let s = a >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded RNG with the only operations the sim is allowed to use. Keeping the
 * surface tiny is what makes results reproducible: no floating-point ordering
 * surprises, no engine-specific extras.
 */
export function makeRng(seed) {
  const next = mulberry32(typeof seed === 'number' ? seed : hashSeed(seed));
  return {
    /** [0,1) */
    float: () => next(),
    /** inclusive integer in [min,max] */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** true with probability p */
    chance: (p) => next() < p,
    /** pick one element; undefined-safe */
    pick: (arr) => (arr && arr.length ? arr[Math.floor(next() * arr.length) % arr.length] : undefined),
    /** Fisher-Yates shuffle, returns a NEW array (never mutates caller data) */
    shuffle: (arr) => {
      const out = (arr || []).slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
    /** a fresh child stream, so sub-systems never perturb each other's sequence */
    child: (label) => makeRng(`${hashSeed(seed)}:${label}`),
  };
}
