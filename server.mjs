import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function safePath(requestUrl) {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  const stripped = pathname.replace(/^\/omnirush(?=\/|$)/, '') || '/';
  const relative = normalize(stripped).replace(/^([/\\])+/, '');
  if (relative.includes('..')) return null;
  return join(root, relative || 'index.html');
}

createServer(async (request, response) => {
  const filePath = safePath(request.url ?? '/');
  if (!filePath) { response.writeHead(400); response.end('Bad request'); return; }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(filePath).pipe(response);
  } catch {
    if (request.url?.endsWith('/') || !posix.basename(request.url ?? '').includes('.')) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      createReadStream(join(root, 'index.html')).pipe(response);
    } else { response.writeHead(404); response.end('Not found'); }
  }
}).listen(port, '0.0.0.0', () => console.log(`DataTrust Passport listening on http://0.0.0.0:${port}`));
