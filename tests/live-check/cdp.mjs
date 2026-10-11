// Tiny Chrome DevTools driver: launches headless Chrome, runs steps, saves screenshots.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export async function launch({ width = 390, height = 844, port = 9333 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cdp-'));
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--disable-gpu',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let list;
  for (let i = 0; i < 50; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (list.length) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    } else if (d.method === 'Runtime.consoleAPICalled')
      logs.push(
        d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '),
      );
    else if (d.method === 'Runtime.exceptionThrown')
      logs.push(
        'EXC: ' +
          (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text),
      );
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  return {
    logs,
    send,
    async goto(url, wait = 2500) {
      await send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, wait));
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    async wait(ms) {
      await new Promise((r) => setTimeout(r, ms));
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
}
