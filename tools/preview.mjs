// preview.mjs — small JPEG previews of review frames, so a reviewer (human or model) can look at
// a 1600 px arch-shot frame without a 1.6 MB PNG. Evidence only: nothing here ships, and the
// full-size frames stay untouched because they are what gets uploaded and scored.
//
// Usage: node tools/preview.mjs <out-dir> <width> <file.png> [file.png ...]
// Writes <out-dir>/<name>.jpg at the given width, aspect kept, JPEG quality 0.82.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';

const PW = 'C:/Users/clementy/Downloads/email-automation/browser/node_modules/playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [outDir, widthArg, ...files] = process.argv.slice(2);
const width = Number(widthArg) || 800;

if (!outDir || !files.length) {
  console.log('usage: node tools/preview.mjs <out-dir> <width> <file.png> [file.png ...]');
  process.exitCode = 2;
} else {
  await mkdir(outDir, { recursive: true });
  const chromium = createRequire(join(PW, 'package.json'))('playwright-core').chromium;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    for (const f of files) {
      const b64 = (await readFile(f)).toString('base64');
      // Decode and resample in the page: Node has no image codec in core, and Chrome does.
      const out = await page.evaluate(async ([src, w]) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const h = Math.round((img.height * w) / img.width);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, w, h);
        return { url: c.toDataURL('image/jpeg', 0.82), w, h, sw: img.width, sh: img.height };
      }, [`data:image/png;base64,${b64}`, width]);
      const dest = join(outDir, basename(f).replace(/\.[a-z]+$/i, '.jpg'));
      const bytes = Buffer.from(out.url.split(',')[1], 'base64');
      await writeFile(dest, bytes);
      console.log(`${basename(f)} ${out.sw}x${out.sh} -> ${dest} ${out.w}x${out.h} ${(bytes.length / 1024).toFixed(0)}KB`);
    }
  } finally {
    await browser.close();
  }
}
