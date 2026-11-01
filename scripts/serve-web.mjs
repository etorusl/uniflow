import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { root } from './environment.mjs';

const directory = join(root, 'apps/client/dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidates =
      path === '/'
        ? ['index.html']
        : [path.slice(1), path.slice(1) + '.html', join(path.slice(1), 'index.html')];
    let filename;
    for (const candidate of candidates) {
      const full = resolve(directory, candidate);
      const local = relative(directory, full);
      if (local.startsWith('..') || local.startsWith('/')) continue;
      if (
        await stat(full)
          .then((s) => s.isFile())
          .catch(() => false)
      ) {
        filename = full;
        break;
      }
    }
    if (!filename) {
      response.writeHead(404);
      response.end('Page not found');
      return;
    }
    response.setHeader('content-type', types[extname(filename)] ?? 'application/octet-stream');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'no-cache');
    if (request.method === 'HEAD') response.end();
    else
      createReadStream(filename)
        .on('error', () => response.destroy())
        .pipe(response);
  } catch {
    response.writeHead(400);
    response.end('Invalid request');
  }
});
server.listen(Number(process.env.WEB_PORT ?? 8081), '127.0.0.1', () =>
  console.log('UniFlow web export is ready.'),
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
