import fs from 'node:fs';
import { open, L } from './lib.mjs';
const OUT = process.env.OUT ?? new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const res = [];
const ok = (n, pass, d = '') => {
  res.push({ n, pass, d: String(d).slice(0, 300) });
  console.log(
    (pass ? 'PASS ' : 'FAIL ') +
      n +
      (d ? '  [' + String(d).slice(0, 300).replace(/\n/g, ' | ') + ']' : ''),
  );
};
const W = 390,
  H = 844;
const b = await open({ width: W, height: H, port: 9540 });
await b.goto(L + '/#/week', 5000);
await b.eval(`document.querySelectorAll('.week-chip')[2].click()`);
await b.wait(1500);
// map centred on a known fire
const fire = { lat: 29.218, lng: 76.027 };
const z = 8;
await b.eval(`location.hash='#/map?lat=${fire.lat}&lng=${fire.lng}&z=${z}'`);
await b.wait(10000);
await b.shot(OUT + 'fire-1-map.png');
const info = await b.eval(
  `JSON.stringify({w:innerWidth,h:innerHeight, c:(()=>{const r=document.querySelector('canvas.maplibregl-canvas')?.getBoundingClientRect();return r&&{x:r.x,y:r.y,w:r.width,h:r.height}})()})`,
);
console.log(info);
const c = JSON.parse(info).c;
// map centre pixel = canvas centre; click there
const x = c.x + c.w / 2,
  y = c.y + c.h / 2;
for (const [type] of [['mousePressed'], ['mouseReleased']])
  await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
await b.wait(2000);
await b.shot(OUT + 'fire-2-popup.png');
const pop = await b.eval(`document.querySelector('.maplibregl-popup')?.innerText`);
ok(
  'Map: pressing a flame opens its popup with Report this fire',
  /Report this fire/.test(pop || ''),
  pop,
);
await b.click('Report this fire');
await b.wait(2500);
const d = await b.eval(
  `(document.querySelector('[role=dialog],.sheet')?.innerText||'').replace(/\\n+/g,' | ')`,
);
ok(
  'Fire report sheet: address, coordinates, Copy location, Open in maps, Call 112 and 101',
  /Copy location/.test(d) &&
    /Open in maps/.test(d) &&
    /112/.test(d) &&
    /101/.test(d) &&
    /°/.test(d),
  d,
);
ok(
  'Fire report says the app contacts no one',
  /not sent|contacts no one|does not (send|contact)|no one/i.test(d),
  d,
);
await b.shot(OUT + 'fire-3-sheet.png');
fs.writeFileSync(OUT + 'fire.json', JSON.stringify(res, null, 1));
b.close();
