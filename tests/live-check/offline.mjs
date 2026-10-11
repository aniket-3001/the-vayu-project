import fs from 'node:fs';
import { open, L } from './lib.mjs';
import { SEED } from './seed.mjs';
const OUT = process.env.OUT ?? new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const res = [];
const ok = (n, pass, d = '') => {
  res.push({ n, pass, d: String(d).slice(0, 400) });
  console.log(
    (pass ? 'PASS ' : 'FAIL ') +
      n +
      (d ? '  [' + String(d).slice(0, 400).replace(/\n/g, ' | ') + ']' : ''),
  );
};
const b = await open({ width: 390, height: 844, port: 9544 });
await b.send('Network.enable');
await b.goto(L + '/#/', 3000);
await b.eval(SEED + 'location.reload()');
await b.wait(9000);
const card = () =>
  b.eval(
    `(document.querySelector('a.pc-hit')?.closest('div')?.parentElement?.innerText||'').replace(/\\n+/g,' | ').slice(0,260)`,
  );
const before = await card();
const aqiBefore = (/\| (\d+) \| AQI/.exec(before) ?? [])[1] ?? 'no reading';
await b.send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});
await b.eval(`window.dispatchEvent(new Event('offline'))`);
// move around the app while offline
await b.eval(`location.hash='#/exposure'`);
await b.wait(2500);
await b.eval(`location.hash='#/'`);
await b.wait(3000);
const after = await card();
const allText = await b.T(6000);
const full = await b.T(3000);
ok(
  'Offline: the last good readings stay on My Air and say how old they are',
  /Nearby station/.test(allText) && /ago/.test(allText) && allText.includes(aqiBefore),
  (allText.match(/Nearby station[^\n]*/) || [''])[0],
);
ok(
  'Offline: the page still works when moving between tabs',
  /My Air/.test(full) && !/Cannot GET|ERR_/.test(full),
);
console.log('BEFORE', before);
await b.shot(OUT + 'offline.png');
fs.writeFileSync(OUT + 'off.json', JSON.stringify(res, null, 1));
b.close();
