// materials.js â€” brand-locked materials and procedural textures. No image assets:
// every texture is drawn on a canvas at runtime, so the app stays asset-light and a
// palette switch costs zero network requests.
//
// Resolution: a facade tile is 512px (256 on touch). At 128px a window was 18 pixels
// wide, so a camera move toward a wall showed mush â€” that is what made the first
// detail pass read as a sticker rather than a building.
import * as THREE from '../../vendor/three/three.module.min.js';
import { PALETTES } from '../sim/catalogue.js';
import { mulberry32 } from '../sim/rng.js';

/** MO canon plus the neutral families every building is drawn from. */
export const BRAND = {
  gold: '#B59060',
  sage: '#B7CDC2',
  ink: '#232323',
  ivory: '#F6F2EA',
  stone: '#E4DCCC',
  stoneDark: '#CFC5B2',
  glass: '#7E8C8A',
  warmLight: '#FFD9A0',
};

export function accentFor(paletteId) {
  return (PALETTES.find((p) => p.id === paletteId) || PALETTES[0]).accent;
}

const cache = new Map();

/* ------------------------------------------------------------------ facades */

/**
 * Three facade languages, keyed by function category. The OPENINGS differ, not just
 * the tint: guest wings get tall punched windows with a balcony slab and rail, back
 * of house gets a louvre band, colleague spaces get a ribbon window. That is the
 * difference between fifteen tinted boxes and a site you can read from across it.
 *
 * win = [left inset, top inset, width, height] as fractions of one 4-storey tile cell.
 */
const FACADE_LOOK = {
  G: { win: [0.22, 0.13, 0.56, 0.50], balcony: true, sill: true },
  B: { win: [0.04, 0.30, 0.92, 0.30], louvre: true },
  P: { win: [0.04, 0.21, 0.92, 0.40], ribbon: true, sill: true },
};

const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;

/**
 * Paint one facade tile. mode: 'albedo' | 'lights' | 'rough'.
 *
 * All three modes walk the SAME window rectangles, so a lit window can never land on
 * a wall between openings, and the gloss map lines up with the glass. The albedo also
 * serves as the bump map, so sills and rails catch light with no extra texture.
 */
function paintFacade(g, S, role, mode) {
  const n = 4, cell = S / n, lw = Math.max(1, S / 256);
  const look = FACADE_LOOK[role] || FACADE_LOOK.G;
  const albedo = mode === 'albedo', lights = mode === 'lights';

  g.fillStyle = albedo ? '#F7F3EA' : (lights ? '#000000' : '#D4D4D4');
  g.fillRect(0, 0, S, S);

  if (albedo) {
    // Ashlar joints: a wall is never one unbroken field.
    g.strokeStyle = 'rgba(150,140,124,0.26)';
    g.lineWidth = lw;
    for (let i = 0; i <= n; i++) {
      const p = i * cell + 0.5;
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    }
    // A shadow line under every floor slab: the elevation is stacked, not printed.
    for (let cy = 0; cy < n; cy++) {
      g.fillStyle = 'rgba(96,88,76,0.12)';
      g.fillRect(0, cy * cell + cell * 0.94, S, cell * 0.06);
    }
  }

  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = cx * cell, y = cy * cell;
      const blind = (cx * 7 + cy * 13) % 5 === 0;  // same rule as the light map
      const wx = x + cell * look.win[0], wy = y + cell * look.win[1];
      const ww = cell * look.win[2], wh = cell * look.win[3];

      if (look.louvre) {
        // Louvre band: slats, not glass. Plant rooms read as plant rooms.
        for (let k = 0; k < 5; k++) {
          const sy = wy + (wh / 5) * k;
          g.fillStyle = albedo ? '#545A56' : (lights ? (blind ? '#000000' : '#7A5F3E') : '#1C1C1C');
          g.fillRect(wx, sy, ww, wh / 9);
          if (albedo) {
            g.fillStyle = '#BEB6A6';
            g.fillRect(wx, sy + wh / 9, ww, Math.max(1, wh / 30));
          }
        }
      } else if (lights) {
        if (!blind) {
          const grad = g.createLinearGradient(0, wy, 0, wy + wh);
          grad.addColorStop(0, '#FFE7C2');
          grad.addColorStop(1, '#E7B276');
          g.fillStyle = 'rgba(255,220,170,0.30)';      // spill onto the reveal
          g.fillRect(wx - cell * 0.02, wy - cell * 0.02, ww + cell * 0.04, wh + cell * 0.04);
          g.fillStyle = grad;
          g.fillRect(wx, wy, ww, wh);
        }
      } else if (!albedo) {
        // Gloss: glass is smooth, stone is not. Without this split the whole wall
        // reflects the sky evenly and reads as painted card however detailed it is.
        g.fillStyle = '#141414';
        g.fillRect(wx, wy, ww, wh);
      } else {
        // Glass: a vertical gradient reads as a sky reflection, not a flat hole.
        const grad = g.createLinearGradient(0, wy, 0, wy + wh);
        grad.addColorStop(0, '#C6D0CC');
        grad.addColorStop(0.55, '#8D9A96');
        grad.addColorStop(1, '#525D5A');
        g.fillStyle = grad;
        g.fillRect(wx, wy, ww, wh);

        // Every fifth opening has a blind drawn: breaks the mechanical repetition.
        if (blind) {
          g.fillStyle = 'rgba(233,227,216,0.88)';
          g.fillRect(wx + ww * 0.06, wy + wh * 0.06, ww * 0.88, wh * 0.40);
        }

        g.strokeStyle = '#EFE9DD';
        g.lineWidth = 2 * lw;
        g.strokeRect(wx, wy, ww, wh);
        g.fillStyle = '#EFE9DD';
        const mull = look.ribbon ? 2 : 1;
        for (let m = 1; m <= mull; m++) g.fillRect(wx + (ww * m) / (mull + 1) - lw, wy, 2 * lw, wh);

        if (look.balcony) {
          // Slab and rail: the detail that makes a punched window read as a bedroom.
          const by = wy + wh, bx = x + cell * 0.10, bw = cell * 0.80;
          g.fillStyle = '#DDD5C6';
          g.fillRect(bx, by, bw, cell * 0.05);
          g.fillStyle = 'rgba(60,55,48,0.18)';
          g.fillRect(bx, by + cell * 0.05, bw, cell * 0.03);
          g.strokeStyle = '#8E8779';
          g.lineWidth = lw;
          for (let b = 0; b < 7; b++) {
            const px = bx + (bw * b) / 6;
            g.beginPath(); g.moveTo(px, by - cell * 0.12); g.lineTo(px, by); g.stroke();
          }
          g.fillStyle = '#8E8779';
          g.fillRect(bx, by - cell * 0.13, bw, 2 * lw);
        }
        if (look.sill) {
          g.fillStyle = '#E9E2D4';
          g.fillRect(wx - cell * 0.02, wy + wh, ww + cell * 0.04, cell * 0.03);
        }
      }
    }
  }

  if (albedo) {
    // Fine grain keeps flat wall areas from reading as plastic.
    for (let i = 0; i < 2600; i++) {
      const gx = (i * 37) % S, gy = (i * 61) % S;
      g.fillStyle = `rgba(140,130,114,${0.02 + ((i * 13) % 7) / 240})`;
      g.fillRect(gx, gy, 1, 1);
    }
  }
}

/**
 * The three maps for one facade language, built once and shared by every building
 * that uses it: one GPU upload, one sampler, and a palette switch touches colour only.
 */
function facadeSet(role) {
  const key = `facade:${role}`;
  if (cache.has(key)) return cache.get(key);
  const S = isTouch() ? 256 : 512;
  const tex = (mode) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    paintFacade(c.getContext('2d'), S, role, mode);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // Roughness is data, not colour: it must NOT be sRGB-decoded.
    if (mode !== 'rough') t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const set = { map: tex('albedo'), lights: tex('lights'), rough: tex('rough') };
  cache.set(key, set);
  return set;
}

export function facadeTexture(role = 'G') { return facadeSet(role).map; }
export function windowLightTexture(role = 'G') { return facadeSet(role).lights; }

/** Paving texture for the site plinth: stone joints plus faint grain. */
/**
 * Deterministic per-index noise. A texture that redraws differently on every reload
 * makes two screenshots incomparable, and the visual gate compares screenshots.
 */
const hash1 = (i) => { const s = Math.sin(i * 127.1 + 13.7) * 43758.5453; return s - Math.floor(s); };

/** Exported for the render modules that need the same deterministic jitter. */
export { hash1 };

/**
 * Paving: large honed slabs with real joint depth.
 *
 * The 128 px version drew a 32 px grid with 1 px lines, so at the wide camera the
 * entire forecourt was one uniform sheet of graph paper â€” the flattest thing in the
 * frame. A generated limestone reference (FLORA, review/flora-ref/paving.png) showed
 * what was missing: four or five slabs of visibly different tone, a chamfer that
 * catches a highlight on one edge and a shadow on the other, and a few faint damp
 * patches. All four are cheap to draw and none of them cost a network byte.
 */
export function pavingTexture() {
  if (cache.has('pave')) return cache.get('pave');
  const S = isTouch() ? 256 : 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const n = 4, cell = S / n, joint = Math.max(1.5, S / 220);

  // The joint is the BASE, not a stroke: filling every slab inset by the joint width
  // guarantees a continuous line in both directions, including across the tile seam.
  g.fillStyle = '#C9C0AE';
  g.fillRect(0, 0, S, S);

  const tone = ['#F2ECE2', '#EAE3D5', '#F4EFE6', '#E5DDCD', '#EEE7D9', '#F0E9DD'];
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const k = cx + cy * n;
      const x = cx * cell + joint * 0.5, y = cy * cell + joint * 0.5;
      const w = cell - joint, h = cell - joint;
      g.fillStyle = tone[Math.floor(hash1(k) * tone.length)];
      g.fillRect(x, y, w, h);
      // Chamfer: one lit edge, one shadowed edge. This is the whole difference between
      // a printed grid and stone that has thickness.
      const e = Math.max(1, joint * 1.4);
      g.fillStyle = 'rgba(255,255,255,0.26)';
      g.fillRect(x, y, w, e);
      g.fillRect(x, y, e, h);
      g.fillStyle = 'rgba(96,88,76,0.20)';
      g.fillRect(x, y + h - e, w, e);
      g.fillRect(x + w - e, y, e, h);
      // Slight per-slab wear: a corner scuff, never more than a hint.
      if (hash1(k + 21) > 0.55) {
        g.fillStyle = 'rgba(150,140,122,0.10)';
        g.fillRect(x + w * 0.1, y + h * 0.62, w * 0.45, h * 0.3);
      }
    }
  }

  // Low-frequency patchiness across several slabs at once, then damp stains.
  for (let i = 0; i < 9; i++) {
    const x = hash1(i + 40) * S, y = hash1(i + 80) * S, r = S * (0.09 + hash1(i + 120) * 0.14);
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, 'rgba(174,164,144,0.13)');
    rad.addColorStop(1, 'rgba(174,164,144,0)');
    g.fillStyle = rad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fossil speck and grain: limestone is never a flat colour field.
  for (let i = 0; i < 4200; i++) {
    const x = hash1(i + 900) * S, y = hash1(i + 2100) * S;
    g.fillStyle = `rgba(146,136,118,${0.03 + hash1(i + 3000) * 0.07})`;
    g.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 90; i++) {
    const x = hash1(i + 5000) * S, y = hash1(i + 5600) * S;
    g.fillStyle = `rgba(132,122,104,${0.06 + hash1(i + 6200) * 0.08})`;
    g.beginPath(); g.arc(x, y, 0.7 + hash1(i + 6800) * 1.3, 0, Math.PI * 2); g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set('pave', t);
  return t;
}

/** Flat-roof membrane: welded seams and gravel grain, so a roof is a surface, not a lid. */
export function roofMembraneTexture() {
  if (cache.has('roof')) return cache.get('roof');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // Cooler and with a harder seam than the first pass: a sand-coloured, seam-free plate
  // is exactly what made every flat service roof read as a bald tan lid at close range.
  g.fillStyle = '#D9D6CD';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(112,110,100,0.62)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(0, i * 32 + 0.5); g.lineTo(128, i * 32 + 0.5); g.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    const x = (i * 53) % 128, y = (i * 29) % 128;
    g.fillStyle = `rgba(126,118,104,${0.05 + ((i * 7) % 9) / 130})`;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('roof', t);
  return t;
}

/**
 * Pitched-roof courses. A scaled cone's UVs run base-to-apex in v, so horizontal
 * course lines in this texture wrap the pyramid as tile courses â€” the difference
 * between a tiled roof and a painted tent.
 */
/**
 * Roof tiling, used by every pitched roof on the site â€” and the pitched roofs are the
 * largest continuous surfaces in the wide shot, which is why the 128 px version read as
 * a grey smear from the inspection camera. The generated slate reference
 * (review/flora-ref/roof.png) had two things this was missing: per-tile tonal range
 * (warm grey-brown through charcoal, not one flat hue) and a crisp shadow line under
 * every course, which is what makes a roof read as overlapping plates.
 */
export function roofTileTexture() {
  if (cache.has('tile')) return cache.get('tile');
  const S = isTouch() ? 256 : 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rows = 10, cols = 6, ch = S / rows, cw = S / cols, lw = Math.max(1, S / 320);

  g.fillStyle = '#B6AE9E';
  g.fillRect(0, 0, S, S);

  // The map MODULATES; the material colour does the tinting (every other material in this
  // kit works that way). Painting the slate tints dark here as well made the roofs
  // multiply twice and go near-black â€” a regression the wide shot showed immediately.
  // So: a light modulation field with per-tile range, and the darkness lives in the
  // material colour where it belongs.
  const tint = ['#F2ECDE', '#E3DCCC', '#EDE6D6', '#D9D2C2', '#E8E1D1', '#CFC8B8'];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * cw + (r % 2 ? cw * 0.5 : 0) - cw * 0.5;
      const y = r * ch;
      const t = tint[Math.floor(hash1(r * 31 + k) * tint.length)];
      g.fillStyle = t;
      g.fillRect(x + lw * 0.5, y, cw - lw, ch);
      // Wrap the half-tile that hangs past the right edge so the course stays bonded
      // across the tile seam instead of showing a cut column.
      if (x < 0) {
        g.fillRect(x + S + lw * 0.5, y, cw - lw, ch);
      } else if (x + cw > S) {
        g.fillRect(x - S + lw * 0.5, y, cw - lw, ch);
      }
      // Vertical slate edges.
      g.fillStyle = 'rgba(96,90,80,0.34)';
      g.fillRect(x + cw - lw, y, lw, ch);
      // Weathering: a soft darkening down each slate, never a hard line.
      const grad = g.createLinearGradient(x, y, x, y + ch);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(60,56,50,0.14)');
      g.fillStyle = grad;
      g.fillRect(x + lw * 0.5, y, cw - lw, ch);
      if (hash1(r * 71 + k + 9) > 0.82) {
        g.fillStyle = 'rgba(228,230,214,0.22)';   // lichen speck
        g.fillRect(x + cw * 0.3, y + ch * 0.35, cw * 0.28, ch * 0.18);
      }
    }
    // Course shadow: the single strongest depth cue on a slate roof â€” but shallow. At
    // 0.55 alpha it reads as a black stripe every 0.5 m and the roof turns into a grate.
    const sg = g.createLinearGradient(0, r * ch + ch * 0.78, 0, r * ch + ch);
    sg.addColorStop(0, 'rgba(48,45,40,0)');
    sg.addColorStop(1, 'rgba(48,45,40,0.26)');
    g.fillStyle = sg;
    g.fillRect(0, r * ch + ch * 0.78, S, ch * 0.22);
  }

  for (let i = 0; i < 2600; i++) {
    const x = hash1(i + 300) * S, y = hash1(i + 1300) * S;
    g.fillStyle = `rgba(${hash1(i + 2300) > 0.5 ? '210,206,192' : '40,38,34'},0.05)`;
    g.fillRect(x, y, 1, 1);
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // No bake-in repeat: the roof materials declare their world tile size and every roof â€”
  // box or cone â€” scales its own UVs to it, so courses are the same size on every roof.
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set('tile', t);
  return t;
}

/** Relief for the roof comes from the albedo, as for the paving: the course shadow and the
 *  slate edges are already the darkest pixels, so they read as the recesses. */

/**
 * Open ground outside the plot: dry gravel and scrub. Flat #DED6C6 fill was 60% of the
 * frame in the review screenshot and read as nothing at all.
 */
export function groundTexture() {
  if (cache.has('ground')) return cache.get('ground');
  const S = isTouch() ? 256 : 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#E4DBC7';
  g.fillRect(0, 0, S, S);

  // Broad tonal patches first: dry ground is uneven at a scale much larger than grass.
  for (let i = 0; i < 14; i++) {
    const x = hash1(i + 11) * S, y = hash1(i + 22) * S, r = S * (0.12 + hash1(i + 33) * 0.22);
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = hash1(i + 44) > 0.45;
    rad.addColorStop(0, warm ? 'rgba(206,192,162,0.44)' : 'rgba(188,198,176,0.32)');
    rad.addColorStop(1, 'rgba(206,192,162,0)');
    g.fillStyle = rad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Brushed streaks: the single most useful cue. The old version scattered filled
  // circles, which read as blotches of paint; sun-bleached ground has directional
  // grain, so every stroke here is a short, nearly horizontal arc.
  g.lineWidth = 1;
  for (let i = 0; i < 2600; i++) {
    const x = hash1(i + 101) * S, y = hash1(i + 202) * S;
    const len = S * (0.012 + hash1(i + 303) * 0.05);
    const tilt = (hash1(i + 404) - 0.5) * 0.22;
    const light = hash1(i + 505) > 0.5;
    g.strokeStyle = light
      ? `rgba(246,238,218,${(0.09 + hash1(i + 606) * 0.20).toFixed(3)})`
      : `rgba(150,140,116,${(0.07 + hash1(i + 707) * 0.16).toFixed(3)})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y + len * tilt);
    g.stroke();
  }

  // Tufts and pebbles at a real scale, then fine dust.
  for (let i = 0; i < 220; i++) {
    const x = hash1(i + 808) * S, y = hash1(i + 909) * S;
    const r = 1 + hash1(i + 111) * 2.6;
    g.fillStyle = hash1(i + 222) > 0.55 ? 'rgba(158,168,132,0.30)' : 'rgba(176,160,126,0.34)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 5200; i++) {
    const x = hash1(i + 333) * S, y = hash1(i + 444) * S;
    g.fillStyle = `rgba(132,123,106,${0.03 + hash1(i + 555) * 0.09})`;
    g.fillRect(x, y, 1, 1);
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set('ground', t);
  return t;
}

/** Water: pale ripple bands. Pairs with the environment map for a real sheen. */
export function waterTexture() {
  if (cache.has('water')) return cache.get('water');
  // 26 lone arcs on a 128 px tile was a flat sage sheet with three faint stripes on it,
  // and the canal is a fifth of the wide frame. Water reads as water because of the
  // *density* of overlapping wavelets at several scales, all nearly horizontal, plus the
  // sheer the environment map supplies â€” so: three sizes of wavelet, one tile, no assets.
  const S = isTouch() ? 256 : 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#DCEBE6';
  g.fillRect(0, 0, S, S);

  // Broad swell: low-contrast bands, the thing that reads at a distance.
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * S + hash1(i + 5) * 6;
    g.strokeStyle = `rgba(146,180,172,${(0.10 + hash1(i + 15) * 0.10).toFixed(3)})`;
    g.lineWidth = 3 + hash1(i + 25) * 5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= S; x += S / 4) {
      g.quadraticCurveTo(x + S / 8, y + (hash1(i * 9 + x) - 0.5) * 5, x + S / 4, y);
    }
    g.stroke();
  }

  // Mid wavelets.
  g.lineWidth = 1.6;
  for (let i = 0; i < 220; i++) {
    const y = hash1(i + 101) * S, x = hash1(i + 202) * S;
    const len = S * (0.03 + hash1(i + 303) * 0.09);
    const light = hash1(i + 404) > 0.45;
    g.strokeStyle = light
      ? `rgba(255,255,255,${(0.16 + hash1(i + 505) * 0.30).toFixed(3)})`
      : `rgba(120,158,150,${(0.10 + hash1(i + 606) * 0.20).toFixed(3)})`;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len * 0.5, y - 2 - hash1(i + 707) * 3, x + len, y);
    g.stroke();
  }

  // Fine chop: the sparkle that only shows when the sun is behind the camera.
  g.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const x = hash1(i + 808) * S, y = hash1(i + 909) * S, len = 2 + hash1(i + 111) * 5;
    g.strokeStyle = `rgba(255,255,255,${(0.20 + hash1(i + 222) * 0.35).toFixed(3)})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set('water', t);
  return t;
}

/**
 * Roof and bed planting. `lawn` on its own is one flat #9CBBAE, and 40 mÂ² of it on a
 * planted roof read as a plastic lid â€” or, worse, as water. This map is the same green
 * with groundcover scale under it, so a roof garden reads as vegetation from the
 * inspection camera without a single extra draw call: one 128 px tile, repeated at 2.6 m.
 */
export function plantingTexture() {
  if (cache.has('planting')) return cache.get('planting');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#BFD5C6';
  g.fillRect(0, 0, 128, 128);
  // Three layers, and none of them is a stroked circle.
  //
  // Positions come from a seeded stream, NOT from (i*53)%128 / (i*97)%128. A stride that
  // shares factors with the canvas pairs into a lattice: the discs ranked into diagonal
  // rows and, tiled at 2.6 m, the deck read as a venetian blind - the "roof showing
  // through the green" that a zoom crop appeared to show was this map all along. The seed
  // keeps the canvas identical between runs so the visual check can still diff it.
  //
  // The seed fixed the lattice but not the shape: 210 same-sized discs, each with a dark
  // rim and a white rim, covered the whole tile and read as bubble wrap. Real planting is
  // clumps with bare ground between them, so this draws (1) broad dark shade for massing,
  // (2) 40 clusters of 3-7 leaf-scale ellipses, each with one highlight on its sun side
  // (upper left, matching the scene light), and (3) a fine grain. A first pass at (2) used
  // large soft mounds instead and read as marble, and the white family it carried washed
  // the deck to mint. Light belongs on the leaves, not on the ground between them.
  const TILE = 128;
  const rand = mulberry32(0x9e3779b9);
  // Every mark is drawn again in the eight neighbouring cells, so the tile wraps without a
  // seam; a clipped mark on the edge otherwise repeats as a visible grid across the deck.
  const wrapped = (x, y, r, draw) => {
    for (const ox of [-TILE, 0, TILE]) {
      for (const oy of [-TILE, 0, TILE]) {
        const px = x + ox, py = y + oy;
        if (px + r < 0 || px - r > TILE || py + r < 0 || py - r > TILE) continue;
        draw(px, py);
      }
    }
  };
  // Fade to the SAME colour at zero alpha: canvas interpolates gradients unpremultiplied,
  // so fading to transparent black rings every blob with a grey halo. `squash`/`rot` make
  // the same primitive an ellipse, which is what a leaf is; circles alone told the eye
  // "bubble" no matter how the alpha was set.
  const blob = (x, y, r, rgb, alpha, falloff = 1, squash = 1, rot = 0) => {
    wrapped(x, y, r, (px, py) => {
      g.save();
      g.translate(px, py);
      if (rot) g.rotate(rot);
      g.scale(1, squash);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, `rgba(${rgb},${alpha})`);
      grad.addColorStop(falloff, `rgba(${rgb},${alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    });
  };

  // (1) Broad shade only, dark, low contrast. A white family at this scale washed the deck
  // to mint and read as foam; light belongs on the leaves, not on the ground between them.
  for (let i = 0; i < 14; i++) {
    blob(rand() * TILE, rand() * TILE, 18 + rand() * 22, '74,100,88', 0.06 + rand() * 0.05, 0.5);
  }

  // (2) Groundcover: leaf-scale ellipses in clusters, with one highlight per leaf on its sun
  // side. At this tile (2.6 m) a leaf is ~0.1 m, i.e. 5 px, and one screen pixel is ~2 cm,
  // so the pattern is at the limit of resolution on purpose â€” it averages to vegetation
  // instead of resolving as speckle.
  for (let i = 0; i < 40; i++) {
    const cx = rand() * TILE, cy = rand() * TILE;
    const leaves = 3 + Math.floor(rand() * 5);
    for (let j = 0; j < leaves; j++) {
      const away = rand() * Math.PI * 2, dist = rand() * 6;
      const x = cx + Math.cos(away) * dist, y = cy + Math.sin(away) * dist;
      const r = 2 + rand() * 2.6, tilt = rand() * Math.PI, flat = 0.55 + rand() * 0.3;
      blob(x, y, r, '58,88,75', 0.16 + rand() * 0.12, 0.4, flat, tilt);
      blob(x - r * 0.35, y - r * 0.35, r * 0.5, '255,255,255', 0.09 + rand() * 0.06, 0.3, flat, tilt);
    }
  }

  // (3) Fine grain, barely there: it breaks up the flat fill without becoming gravel.
  for (let i = 0; i < 1000; i++) {
    const x = rand() * TILE, y = rand() * TILE;
    g.fillStyle = `rgba(62,90,78,${0.03 + rand() * 0.04})`;
    g.fillRect(x, y, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('planting', t);
  return t;
}

/** Soft radial blob for props not worth a real shadow pass, and contact darkening. */
export function blobTexture() {
  if (cache.has('blob')) return cache.get('blob');
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(35,35,35,0.68)');
  grad.addColorStop(0.55, 'rgba(35,35,35,0.34)');
  grad.addColorStop(1, 'rgba(35,35,35,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('blob', t);
  return t;
}

/**
 * A small studio environment, PMREM-filtered once.
 *
 * Gold, accent and glass are METALS: with nothing to reflect they render near-black.
 * That is exactly why every accent band in the review screenshot read as dull brown
 * rather than #B59060. Contrast in the environment â€” a warm sun, a cool bounce card â€”
 * is what turns a metal surface into gold instead of orange plastic. Costs one small
 * cube render at boot and zero network bytes.
 */
/**
 * A real sky, drawn once at 1024x512 and used twice: as the visible background and as
 * the source of the PMREM environment. It is the highest-leverage surface in the whole
 * renderer and it used to be a 16x64 three-band gradient. Every metal in the scene
 * reflects it â€” the gold bands reflected a grey stripe and read as dull brown, and glass
 * reflected nothing at all, which is most of the reason the first wide shot read as a
 * diagram rather than a photograph.
 *
 * Palette and structure are taken from a generated reference sky (FLORA, Workspace 12,
 * review/flora-ref/sky.png): high-key ivory at the horizon, cool grey-blue at the
 * zenith, one broad diffuse bloom instead of a hard disc, cirrus faint enough that it
 * only registers in a reflection.
 */
export function skyTexture(dusk = false) {
  const key = dusk ? 'sky:dusk' : 'sky:day';
  if (cache.has(key)) return cache.get(key);
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // v runs from zenith (0) to below-horizon (1). The horizon sits at 0.52, so a low
  // camera sees sky in the top half and ground bounce underneath.
  const grad = g.createLinearGradient(0, 0, 0, H);
  if (dusk) {
    grad.addColorStop(0.00, '#1A2230');
    grad.addColorStop(0.30, '#3A4A63');
    grad.addColorStop(0.46, '#8A7C7E');
    grad.addColorStop(0.52, '#D9A277');
    grad.addColorStop(0.60, '#6E5A48');
    grad.addColorStop(1.00, '#2A2521');
  } else {
    grad.addColorStop(0.00, '#8FA9BC');
    grad.addColorStop(0.26, '#AFC5CE');
    grad.addColorStop(0.44, '#DCE4E0');
    grad.addColorStop(0.52, '#F6EEDF');
    grad.addColorStop(0.58, '#EFE4D0');
    grad.addColorStop(1.00, '#C6BBA4');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Sun bloom, broad and disc-less. A hard disc in an IBL puts a small bright dot in
  // every polished surface â€” a specular artefact, not a sun.
  const sx = dusk ? W * 0.16 : W * 0.72;
  const sy = dusk ? H * 0.53 : H * 0.30;
  const bloom = g.createRadialGradient(sx, sy, 0, sx, sy, W * 0.40);
  bloom.addColorStop(0.00, dusk ? 'rgba(255,196,138,0.85)' : 'rgba(255,250,236,0.90)');
  bloom.addColorStop(0.18, dusk ? 'rgba(255,168,110,0.40)' : 'rgba(255,244,214,0.45)');
  bloom.addColorStop(0.55, dusk ? 'rgba(190,120,80,0.12)' : 'rgba(255,238,206,0.12)');
  bloom.addColorStop(1.00, 'rgba(255,238,206,0)');
  g.fillStyle = bloom;
  g.fillRect(0, 0, W, H);

  // Horizon haze: the reason a distant roof edge sits *in* the air rather than on it.
  const haze = g.createLinearGradient(0, H * 0.40, 0, H * 0.62);
  haze.addColorStop(0, 'rgba(255,248,236,0)');
  haze.addColorStop(0.55, dusk ? 'rgba(226,168,124,0.30)' : 'rgba(255,250,240,0.42)');
  haze.addColorStop(1, 'rgba(255,248,236,0)');
  g.fillStyle = haze;
  g.fillRect(0, H * 0.40, W, H * 0.22);

  // Cirrus: thin, high and almost invisible, until something reflects it.
  for (let i = 0; i < 9; i++) {
    const y = H * (0.06 + hash1(i + 3) * 0.30);
    const x = hash1(i + 17) * W;
    const w = W * (0.10 + hash1(i + 29) * 0.22);
    g.strokeStyle = dusk
      ? `rgba(226,206,196,${(0.02 + hash1(i + 41) * 0.05).toFixed(3)})`
      : `rgba(255,255,252,${(0.03 + hash1(i + 41) * 0.08).toFixed(3)})`;
    g.lineWidth = 1 + hash1(i + 53) * 3.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w * 0.5, y - H * 0.02, x + w, y + H * 0.006);
    g.stroke();
  }

  // Dither: an 8-bit gradient bands visibly across 512 rows, and ACES amplifies it.
  g.fillStyle = 'rgba(255,255,255,0.012)';
  for (let i = 0; i < 9000; i++) {
    g.fillRect(hash1(i + 601) * W, hash1(i + 811) * H, 1, 1);
  }
  g.fillStyle = 'rgba(0,0,0,0.012)';
  for (let i = 0; i < 9000; i++) {
    g.fillRect(hash1(i + 907) * W, hash1(i + 1013) * H, 1, 1);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/**
 * Canopy mottle. A tree crown is not one green: it is a hundred clumps catching light at
 * different angles. This map is deliberately near-white so it MODULATES the material
 * colour and the instance tints (the same rule the roofs taught: a dark map plus a dark
 * colour multiplies twice and everything goes to mud).
 */
export function canopyTexture() {
  if (cache.has('canopy')) return cache.get('canopy');
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#EFEFEA';
  g.fillRect(0, 0, S, S);
  // Clumps: overlapping soft discs, half lighter, half darker, nothing circular enough
  // to read as a shape.
  for (let i = 0; i < 130; i++) {
    const x = hash1(i + 7) * S, y = hash1(i + 19) * S, r = 3 + hash1(i + 31) * 9;
    const light = hash1(i + 43) > 0.5;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, light ? 'rgba(255,255,250,0.42)' : 'rgba(120,132,118,0.34)');
    rad.addColorStop(1, light ? 'rgba(255,255,250,0)' : 'rgba(120,132,118,0)');
    g.fillStyle = rad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Leaf flecks: the detail that survives a close camera on a balcony tree.
  for (let i = 0; i < 700; i++) {
    const x = hash1(i + 61) * S, y = hash1(i + 73) * S;
    g.fillStyle = hash1(i + 87) > 0.5 ? 'rgba(255,255,252,0.30)' : 'rgba(110,124,112,0.22)';
    g.fillRect(x, y, 1 + (i % 2), 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('canopy', t);
  return t;
}

/** The same sky, mapped the way `scene.background` expects. */
export function skyBackground(dusk = false) {
  const key = dusk ? 'skybg:dusk' : 'skybg:day';
  if (cache.has(key)) return cache.get(key);
  const t = new THREE.CanvasTexture(skyTexture(dusk).image);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function environment(renderer, dusk = false) {
  const envKey = dusk ? 'env:dusk' : 'env:day';
  if (cache.has(envKey)) return cache.get(envKey);
  const s = new THREE.Scene();

  // The sky sphere is the IBL source. 48x32 segments: with 24x16 the PMREM picked up
  // faceting along the horizon and gold showed visible banding.
  const skyTex = skyTexture(dusk);
  s.add(new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 32),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide }),
  ));

  const panel = (hex, gain, w, h, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(gain) }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(dusk ? '#FFC79A' : '#FFF3DC', dusk ? 1.4 : 3.2, 26, 26, dusk ? -30 : 30, dusk ? 14 : 44, 22);  // sun
  panel(dusk ? '#5A6E86' : '#CFE0E6', dusk ? 0.5 : 1.1, 40, 18, -34, 12, -18);                           // cool bounce
  panel(dusk ? '#E7A374' : '#FFF0D8', dusk ? 0.6 : 0.9, 30, 14, 10, 6, 46);                              // warm bounce

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.02);
  pmrem.dispose();
  // Dispose the panels but NOT the sky map: it is the cached texture the visible
  // background is drawn from, and disposing it here blanks the sky on the next frame.
  s.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map && o.material.map !== skyTex) o.material.map.dispose(); o.material.dispose(); }
  });
  cache.set(envKey, rt.texture);
  return rt.texture;
}

/**
 * A material kit for one palette. Everything the renderer draws comes from here, so
 * a palette switch is one rebuild + dispose, and no colour is hard-coded elsewhere.
 */
export function makeKit(paletteId) {
  const accent = accentFor(paletteId);
  const accentCol = new THREE.Color(accent);
  const pave = pavingTexture();
  const membrane = roofMembraneTexture();
  const tiles = roofTileTexture();
  const soil = groundTexture();
  const ripple = waterTexture();
  const blob = blobTexture();
  const owned = [];
  const keep = (m) => { owned.push(m); return m; };

  /**
   * The accent tints the envelope, not just the trim. `mix(base, amount)` lerps the
   * accent into a neutral base; it is what makes a palette switch visible at all.
   */
  const mix = (base, amount) => new THREE.Color(base).lerp(accentCol, amount);

  const FACADE = { G: ['#F1EAE0', 0.22, 0.9], B: ['#E2DACB', 0.28, 0.35], P: ['#EDE6DA', 0.24, 0.6] };

  /**
   * One facade material: shared textures (same GPU upload, one sampler), tinted by
   * the palette. The albedo doubles as the bump map and the matching rough map makes
   * glass glossy and stone matte. `jitter` shifts lightness a few percent so fifteen
   * walls never read as one flat tone â€” derived from the placement, so the same hotel
   * always looks the same.
   *
   * `isDynamic` marks per-building copies for disposal on rebuild; kit-shared ones
   * are owned by the kit and must never be freed by scene teardown.
   */
  const buildFacade = (role, jitter, isDynamic) => {
    const [base, amount, emissive] = FACADE[role] || FACADE.G;
    const color = mix(base, amount);
    if (jitter) color.offsetHSL(0, 0, jitter);
    const set = facadeSet(role);
    const m = new THREE.MeshStandardMaterial({
      color,
      map: set.map,
      bumpMap: set.map,
      bumpScale: 0.12,
      roughnessMap: set.rough,
      roughness: 1,
      metalness: 0.03,
      emissive: new THREE.Color(BRAND.warmLight),
      emissiveMap: set.lights,
      emissiveIntensity: 0,
      userData: { duskEmissive: emissive, dynamic: !!isDynamic },
    });
    if (!isDynamic) keep(m);
    return m;
  };
  const facade = (role) => buildFacade(role, 0, false);

  const kit = {
    accentHex: accent,
    facadeGuest: facade('G'),
    facadeBoh: facade('B'),
    facadePeople: facade('P'),
    makeFacade: (role, jitter) => buildFacade(role, jitter, true),
    // Polished metal needs an environment to reflect: 0.7+ metalness with no env map
    // renders almost black, which is how the gold turned brown.
    accent: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.38, metalness: 0.18 })),
    gold: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.gold), roughness: 0.3, metalness: 0.35 })),
    goldLine: keep(new THREE.LineBasicMaterial({ color: new THREE.Color(BRAND.gold), transparent: true, opacity: 0.55 })),
    gridLine: keep(new THREE.LineBasicMaterial({ color: new THREE.Color(BRAND.gold), transparent: true, opacity: 0.16 })),
  // Land for sale: dashed, so it reads as an offer rather than a wall or a kerb.
  plotOutline: keep(new THREE.LineDashedMaterial({ color: new THREE.Color(BRAND.gold), dashSize: 1.1, gapSize: 0.7, transparent: true, opacity: 0.75 })),
    roof: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#9C998E'), map: membrane, roughness: 0.96, userData: { tileWorld: 3.4 } })),
    // tileWorld 4.8, not 3.2: eight courses over 3.2 m is a 0.4 m course, which is about
    // four pixels in the establishing camera and mips down to flat noise. At 4.8 m the
    // courses survive at ~8 px and the roofs read as tiled rather than spray-textured.
    roofTile: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#8D8271'), map: tiles, bumpMap: tiles, bumpScale: 0.30, roughness: 0.9, userData: { tileWorld: 4.8 } })),
    roofSlate: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#625E54'), map: tiles, bumpMap: tiles, bumpScale: 0.30, roughness: 0.88, userData: { tileWorld: 4.8 } })),
    roofDark: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#8E8577'), roughness: 0.95 })),
    glass: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.glass), roughness: 0.06, metalness: 0.62, transparent: true, opacity: 0.6 })),
    water: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#6F9A92'), map: ripple, bumpMap: ripple, bumpScale: 0.10, roughness: 0.12, metalness: 0.42, transparent: true, opacity: 0.95, userData: { tileWorld: 6 } })),
    paving: keep(new THREE.MeshStandardMaterial({ color: mix('#EDE7DC', 0.10), roughness: 0.9, map: pave, bumpMap: pave, bumpScale: 0.45, userData: { tileWorld: 4 } })),
    pavingDark: keep(new THREE.MeshStandardMaterial({ color: mix('#D8D0C1', 0.10), roughness: 0.92, map: pave, bumpMap: pave, bumpScale: 0.45, userData: { tileWorld: 4 } })),
    path: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#C4B79C'), roughness: 0.88, map: pave, bumpMap: pave, bumpScale: 0.40, userData: { tileWorld: 2.2 } })),
    ground: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#D2C8B2'), map: soil, roughness: 1, userData: { tileWorld: 9 } })),
    lawn: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#9CBBAE'), roughness: 0.95 })),
    // Roof gardens and beds: same green, mottled, so a planted deck does not read as a
    // flat plastic sheet or as a pool.
    planting: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#8FB3A4'), map: plantingTexture(), roughness: 0.97, userData: { tileWorld: 2.6 } })),
    foliage: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#7E9C8E'), map: canopyTexture(), flatShading: true, roughness: 0.92 })),
    trunk: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#8A7A66'), roughness: 1 })),
    ink: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(BRAND.ink), roughness: 0.6 })),
    warm: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color('#FFF0D6'), emissive: new THREE.Color(BRAND.warmLight), emissiveIntensity: 0.6, roughness: 0.5, userData: { dayEmissive: 0.15, duskEmissive: 1.4 } })),
    // Soft ground darkening under every building: a massing model with no contact
    // shadow looks as if it floats a little above its own paving.
    contact: keep(new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.9 })),
    valid: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.sage), transparent: true, opacity: 0.42 })),
    invalid: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#C0604A'), transparent: true, opacity: 0.42 })),
    selected: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.gold), transparent: true, opacity: 0.3 })),
    dispose() { for (const m of owned) m.dispose(); },
  };
  return kit;
}

/**
 * Flip every facade's window emission for day/dusk. Traverses the SCENE GRAPH, not
 * the kit: per-building facade materials are created during rebuild and are never
 * members of the kit, so a kit-only sweep silently leaves them stuck at day.
 */
export function applyDusk(root, dusk) {
  root.traverse((o) => {
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of list) {
      if (!m || !m.isMeshStandardMaterial || !m.userData) continue;
      if (m.userData.duskEmissive === undefined && m.userData.dayEmissive === undefined) continue;
      m.emissiveIntensity = dusk ? (m.userData.duskEmissive ?? 0) : (m.userData.dayEmissive ?? 0);
    }
  });
}

