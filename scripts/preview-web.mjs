import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { root } from './environment.mjs';

const dist = resolve(root, 'apps/client/dist');
await stat(join(dist, 'index.html')).catch(() => {
  throw new Error('Run pnpm build:web before starting the local web preview.');
});

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  let filename;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    filename = resolve(dist, `.${pathname}`);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (filename !== dist && !filename.startsWith(dist + sep)) {
    response.writeHead(404).end();
    return;
  }
  const candidates = [filename, `${filename}.html`, join(filename, 'index.html')];
  for (const candidate of candidates) {
    if (!candidate.startsWith(dist + sep)) continue;
    const file = await stat(candidate).catch(() => null);
    if (!file?.isFile()) continue;
    response.writeHead(200, {
      'content-type': contentTypes[extname(candidate)] ?? 'application/octet-stream',
      'content-length': file.size,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    if (request.method === 'HEAD') response.end();
    else
      createReadStream(candidate)
        .on('error', () => response.destroy())
        .pipe(response);
    return;
  }
  response.writeHead(404).end();
});

server.listen(8081, 'localhost', () => console.log('UniFlow web preview: http://localhost:8081'));
