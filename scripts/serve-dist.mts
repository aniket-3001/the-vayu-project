// The deployed layout on one local address: the built app from apps/web/dist, the API under /v1 (forwarded to the
// local API), and the same security headers CloudFront sends. For checking the real build and its content policy.
//   make local-api   (another terminal)     VITE_API_URL= npm run build -w @vayu/web     npx tsx scripts/serve-dist.mts
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { CONTENT_SECURITY_POLICY } from '../infra/lib/Site';

const root = join(import.meta.dirname, '../apps/web/dist');
const api = process.env.API ?? 'http://localhost:8787';
const port = Number(process.env.PORT ?? 4180);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const headers = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), geolocation=(self), microphone=(self), payment=(), usb=()',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/v1/')) {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      fetch(`${api}${url.pathname}${url.search}`, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
        ...(req.method === 'GET' ? {} : { body: Buffer.concat(chunks) }),
      })
        .then(async (r) => {
          res.writeHead(r.status, { 'content-type': 'application/json', ...headers });
          res.end(Buffer.from(await r.arrayBuffer()));
        })
        .catch(() => {
          res.writeHead(502, headers);
          res.end('{}');
        });
    });
    return;
  }
  const last = url.pathname.split('/').pop() ?? '';
  const file = last.includes('.') ? normalize(url.pathname) : '/index.html';
  readFile(join(root, file))
    .then((body) => {
      res.writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
        ...headers,
      });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(404, headers);
      res.end('not found');
    });
}).listen(port, () => {
  console.log(`built app on http://localhost:${String(port)} (API ${api})`);
});
