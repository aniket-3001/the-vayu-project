// The Lens with a (fake) camera: Chrome's test camera stands in for a real one. The microphone and speech recognition need a real browser.
import fs from 'node:fs';
import { open, L } from './lib.mjs';
import { SEED } from './seed.mjs';
const OUT = new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
process.env.CHROME_ARGS = '--use-fake-ui-for-media-stream --use-fake-device-for-media-stream';
const b = await open({ width: 390, height: 844, port: 9577 });
await b
  .send('Browser.grantPermissions', {
    permissions: ['geolocation', 'videoCapture', 'audioCapture'],
    origin: L,
  })
  .catch(() => {});
await b.send('Emulation.setGeolocationOverride', {
  latitude: 28.6139,
  longitude: 77.209,
  accuracy: 30,
});
await b.goto(L + '/#/', 3000);
await b.eval(SEED + 'location.reload()');
await b.wait(7000);
await b.eval(`location.hash='#/lens'`);
await b.wait(5000);
const pass = (n, p, d = '') =>
  console.log((p ? 'PASS ' : 'FAIL ') + n + (d ? `  [${String(d).slice(0, 200)}]` : ''));
await b.click('Experience on camera');
await b.wait(4000);
const video = await b.eval(
  `(()=>{const v=document.querySelector('video');return v?{w:v.videoWidth,h:v.videoHeight,playing:!v.paused,tracks:v.srcObject?v.srcObject.getTracks().length:0}:null})()`,
);
pass(
  'Lens opens the camera and plays it',
  !!video && video.w > 0 && video.playing,
  JSON.stringify(video),
);
await b.shot(OUT + 'phone-lens-camera.png');
const over = await b.eval(`document.scrollingElement.scrollWidth - window.innerWidth`);
pass('no sideways scroll with the camera on', over <= 1, over);
console.log('CONSOLE ERRORS', b.logs.filter((l) => /error|EXC/i.test(l)).slice(0, 6));
b.close();
process.exit(0);
