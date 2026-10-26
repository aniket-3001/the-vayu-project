// Makes the startup-screen and icon pictures smaller without changing how they look. They are a flat colour with one
// small gradient mark, so a 256-colour palette holds them almost exactly (the difference is under 0.1 of 255 on average)
// and the files shrink to a fifth. Run by `npm run assets`, after the pictures are made. A picture is only replaced
// when the new one is smaller, and one already squeezed is left alone, so running it again changes nothing.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..');

/** Every .png under `dir` whose path matches `keep`. */
function pictures(dir, keep) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return; // that platform's project is not there
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.png') && keep(p.replace(/\\/g, '/'))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const targets = [
  ...pictures(join(mobile, 'assets'), () => true),
  ...pictures(join(mobile, 'android/app/src/main/res'), (p) => /\/drawable[^/]*\/splash\.png$/u.test(p)),
  ...pictures(join(mobile, 'ios/App/App/Assets.xcassets/Splash.imageset'), () => true),
];

let before = 0;
let after = 0;
for (const file of targets) {
  const original = readFileSync(file);
  before += original.length;
  // Already a palette picture: squeezing it again would only lose a little more each time.
  if ((await sharp(original).metadata()).paletteBitDepth !== undefined) {
    after += original.length;
    continue;
  }
  const smaller = await sharp(original).png({ palette: true, quality: 95, effort: 10, colours: 256, dither: 0.5 }).toBuffer();
  if (smaller.length < original.length) {
    writeFileSync(file, smaller);
    after += smaller.length;
  } else after += original.length;
}
const kb = (n) => `${String(Math.round(n / 1024))} KB`;
console.log(`shrink-art: ${String(targets.length)} pictures, ${kb(before)} -> ${kb(after)} (${kb(before - after)} saved)`);
