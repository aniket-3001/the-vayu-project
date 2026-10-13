// Draws the app icon and splash artwork (apps/mobile/assets/*.png) from the shapes below, with no outside artwork.
// Run `npm run assets -w @vayu/mobile` to draw them and have @capacitor/assets write the Android and iOS sizes.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets');
mkdirSync(out, { recursive: true });

const LIGHT = '#F4F6F8';
const DARK = '#101820';

// A "V" for Vayu, drawn in the colours of the US AQI bands from good (green) to hazardous (red). It sits inside the
// middle two thirds of a 1024 square, where Android's adaptive icon never crops.
const mark = `
  <defs>
    <linearGradient id="bands" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#2FA066"/>
      <stop offset="0.35" stop-color="#E4BE00"/>
      <stop offset="0.7" stop-color="#F08A24"/>
      <stop offset="1" stop-color="#D2453F"/>
    </linearGradient>
  </defs>
  <path d="M330 372 L512 692 L694 372" fill="none" stroke="url(#bands)" stroke-width="112"
        stroke-linecap="round" stroke-linejoin="round"/>`;

const square = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;
const background = (colour) => `<rect width="1024" height="1024" fill="${colour}"/>`;
// The splash is a tall canvas with the mark small in the middle; the native layer crops it to each screen.
const splash = (colour) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
     <rect width="2732" height="2732" fill="${colour}"/>
     <g transform="translate(1366 1366) scale(1.5) translate(-512 -512)">${mark}</g>
   </svg>`;

const files = {
  'icon-only.png': square(1024, background(LIGHT) + mark),
  'icon-foreground.png': square(1024, mark),
  'icon-background.png': square(1024, background(LIGHT)),
  'splash.png': splash(LIGHT),
  'splash-dark.png': splash(DARK),
};
for (const [name, svg] of Object.entries(files)) {
  await sharp(Buffer.from(svg)).png().toFile(join(out, name));
  console.log(`wrote assets/${name}`);
}
