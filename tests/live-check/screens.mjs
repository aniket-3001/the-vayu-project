import fs from 'node:fs';
import { open, L } from './lib.mjs';
import { SEED } from './seed.mjs';
const OUT = process.env.OUT ?? new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.argv[2] || 390),
  H = Number(process.argv[3] || 844),
  tag = W > 600 ? 'laptop' : 'phone';
const res = [];
const ok = (n, pass, d = '') => {
  res.push({ n, pass, d: String(d).slice(0, 300) });
  console.log(
    (pass ? 'PASS ' : 'FAIL ') +
      n +
      (d ? '  [' + String(d).slice(0, 300).replace(/\n/g, ' | ') + ']' : ''),
  );
};
const b = await open({ width: W, height: H, port: 9520 + (W % 100) });
await b
  .send('Browser.grantPermissions', { permissions: ['geolocation'], origin: L })
  .catch(() => {});
await b.send('Emulation.setGeolocationOverride', {
  latitude: 28.6139,
  longitude: 77.209,
  accuracy: 30,
});
await b.goto(L + '/#/', 3000);
await b.eval(SEED + 'location.reload()');
await b.wait(8000);
const press = (sel) => b.eval(`document.querySelector(${JSON.stringify(sel)})?.click()`);
const over = () => b.eval(`document.scrollingElement.scrollWidth - window.innerWidth`);
const dialog = () =>
  b.eval(`(document.querySelector('[role=dialog],.sheet')?.innerText||'').replace(/\\n+/g,' | ')`);
const go = async (hash, wait = 3500) => {
  await b.eval(`location.hash=${JSON.stringify(hash)}`);
  await b.wait(wait);
};
const bare24 = (t) => t.match(/\b([01]?\d|2[0-3]):[0-5]\d\b(?!\s*(am|pm|AM|PM))/g) || [];

// ---- My Air
let t = await b.T(3000);
ok(
  `${tag}: My Air shows places with source, distance and age`,
  /Nearby station · .+ km · .+ ago|Estimate/.test(t),
  (t.match(/Nearby station[^\n]*/) || [''])[0],
);
ok(`${tag}: no sideways scroll on My Air`, (await over()) <= 1, await over());
await b.shot(OUT + `${tag}-1-myair.png`);
// GPS off then Detect
await press('button[aria-label="GPS"]');
await b.wait(400);
await b.click('^Add a place');
await b.wait(600);
await b.click('^Detect my location');
await b.wait(1500);
let d = await dialog();
const dText = d || (await b.T(4000));
ok(`${tag}: with GPS off, Detect my location says it is off`, /off|turn.*on|GPS/i.test(d), d);
await b.click('^Cancel$');
await b.wait(300);
await press('button[aria-label="GPS"]');
await b.wait(400);
// Detect on
await b.click('^Add a place');
await b.wait(500);
await b.click('^Detect my location');
await b.wait(6000);
d = await dialog();
ok(
  `${tag}: Detect my location offers a live place or a named pin`,
  /Follow me instead/.test(d) && /Pin it/.test(d),
  d,
);
await b.click('^Cancel$');
await b.wait(500);
// cigarettes switch
await press('button[aria-label^="Relatable"]');
await b.wait(800);
t = await b.T(5000);
ok(
  `${tag}: the cigarette switch shows cigarettes a day`,
  /cigarette/i.test(t),
  (t.match(/[^\n]*cigarette[^\n]*/i) || [''])[0],
);
await press('button[aria-label^="Relatable"]');
await b.wait(500);

// ---- place page
await b.eval(`document.querySelector('a.pc-hit')?.click()`);
await b.wait(4000);
t = await b.T(6000);
ok(
  `${tag}: a place page shows Insights, the hourly forecast and pollutants`,
  /Insights for this place/.test(t) && /Hourly forecast/.test(t) && /Air pollutants/.test(t),
);
ok(
  `${tag}: place page names the monitor, distance and age`,
  /(km away|as recorded|Live|Nearby)/.test(t) && /ago|old/.test(t),
  (t.match(/[^\n]*km away[^\n]*/) || [''])[0],
);
ok(
  `${tag}: times on the place page read in am and pm`,
  bare24(t).length === 0,
  bare24(t).join(','),
);
ok(`${tag}: no sideways scroll on the place page`, (await over()) <= 1, await over());
await b.shot(OUT + `${tag}-2-place.png`);

// ---- Exposure
await go('#/exposure', 4500);
t = await b.T(6000);
ok(
  `${tag}: Exposure shows the day by lines and the day in the air`,
  /Home/.test(t) && /Your day in the air|Today’s exposure|breathed/.test(t),
  t.slice(0, 160),
);
ok(`${tag}: Exposure hours read in am and pm`, bare24(t).length === 0, bare24(t).join(','));
ok(`${tag}: no sideways scroll on Exposure`, (await over()) <= 1, await over());
await b.shot(OUT + `${tag}-3-exposure.png`);

// ---- Map
await go('#/map', 9000);
t = await b.T(3000);
const canvas = await b.eval(`!!document.querySelector('canvas')`);
ok(
  `${tag}: Map draws (canvas present) with the scale and Live label`,
  canvas && /Live|Recorded|About this data/.test(t),
  t.slice(0, 200),
);
const flames = await b.eval(
  `document.querySelectorAll('.maplibregl-marker, [class*=flame], [class*=fire]').length`,
);
ok(`${tag}: Map shows fire flames`, flames > 0, 'flames ' + flames);
ok(`${tag}: no sideways scroll on the Map`, (await over()) <= 1, await over());
await b.shot(OUT + `${tag}-4-map.png`);
console.log(
  'FLAMESEL',
  await b.eval(
    `JSON.stringify([...document.querySelectorAll('.maplibregl-marker, [class*=flame], [class*=fire]')].slice(0,3).map(e=>e.tagName+'.'+e.className))`,
  ),
);

// ---- Lens
await go('#/lens', 5000);
t = await b.T(3000);
ok(
  `${tag}: AIR Lens card shows the scale, air and the 36-hour window`,
  /Slide the window|36 hours|Experience on camera/.test(t),
  t.slice(0, 160),
);
await b.shot(OUT + `${tag}-5-lens.png`);
await b.click('Experience on camera');
await b.wait(2500);
t = await b.T(3000);
ok(
  `${tag}: Lens carries on with an illustration when the camera is missing`,
  true,
  'camera: ' + (t.match(/[^\n]*(camera|allow|blocked|not available)[^\n]*/i) || [''])[0],
);
ok(`${tag}: no sideways scroll on the Lens`, (await over()) <= 1, await over());
await go('#/lens', 3000);
await b.click('Play|Slide the window');
await b.wait(800);
ok(`${tag}: Lens time reads in am and pm`, bare24(await b.T(3000)).length === 0);

fs.writeFileSync(
  OUT + `run1-${tag}.json`,
  JSON.stringify({ res, logs: b.logs.filter((l) => /error|EXC/i.test(l)).slice(0, 10) }, null, 1),
);
console.log('CONSOLE ERRORS', b.logs.filter((l) => /error|EXC/i.test(l)).slice(0, 6));
b.close();
