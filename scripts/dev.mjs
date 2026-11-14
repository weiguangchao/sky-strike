import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const root = resolve(process.env.SERVE_DIST === '1' ? 'dist' : 'game');
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Sky Strike: http://localhost:${port}`));
