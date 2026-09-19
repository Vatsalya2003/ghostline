// Dead-simple static server for dist/. Used by the e2e harness so a test run
// is immune to Vite's HMR — with several people editing at once, a dev-server
// playthrough gets reloaded out from under itself and the mission restarts.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};

export function serve(root, port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = await readFile(join(root, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
