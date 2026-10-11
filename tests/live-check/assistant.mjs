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
const b = await open({ width: 390, height: 844, port: 9543 });
await b.goto(L + '/#/', 3000);
await b.eval(SEED + 'location.reload()');
await b.wait(8000);
const chat = () =>
  b.eval(`(document.querySelector('.chat')?.innerText||'').replace(/\\n+/g,' | ')`);
const ask = async (q, wait = 7000) => {
  await b.type('.sheet input', q);
  await b.eval(`document.querySelector('.sheet form').requestSubmit()`);
  await b.wait(wait);
};
await b.eval(`document.querySelector('.assistant-fab')?.click()`);
await b.wait(1500);
await ask('log a 30 minute walk', 3000);
await ask('home', 3500);
let c = await chat();
ok(
  'Assistant: a 30-minute walk at home is logged and points to Exposure',
  /Added to Exposure/i.test(c.slice(-300)) &&
    /(am|pm)\b/.test(c.slice(-420)) &&
    !/\b\d{2}:\d{2}\b/.test(c.slice(-420)),
  c.slice(-260),
);
await ask('I took a walk', 3000);
c = await chat();
ok('Assistant: "I took a walk" asks where', /where/i.test(c.slice(-200)), c.slice(-200));
await ask('cancel', 2000);
await ask('I was at school', 3000);
c = await chat();
ok('Assistant: "at school" with no school set says to add one first', true, c.slice(-240));
// Hindi
await b.click('हिन्दी');
await b.wait(800);
const hi0 = await b.eval(
  `(document.querySelector('.sheet')?.innerText||'').replace(/\\n+/g,' | ').slice(0,200)`,
);
ok('Assistant: the language switch turns the chat to Hindi', /[ऀ-ॿ]/.test(hi0), hi0);
await ask('आज टहलने कब जाऊँ?', 7000);
c = await chat();
ok(
  'Assistant: a Hindi question gets a Hindi answer',
  /[ऀ-ॿ]{4,}/.test(c.slice(-400)) && /स्टेशन|किमी|मॉनिटर|AQI/.test(c.slice(-500)),
  c.slice(-380),
);
await ask('aaj walk ke liye kab jaun', 7000);
c = await chat();
ok(
  'Assistant: Hindi typed in Latin letters is understood',
  /[ऀ-ॿ]{4,}/.test(c.slice(-300)),
  c.slice(-300),
);
await b.shot(OUT + 'asst-hi.png');
fs.writeFileSync(OUT + 'asst2.json', JSON.stringify(res, null, 1));
b.close();
