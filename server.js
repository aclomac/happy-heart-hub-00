// Production static server for Hostinger Node.js hosting.
// Serves the Vite SPA build from dist/client and falls back all unknown
// routes to index.html so client-side routing works on direct URL entry.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'dist', 'client');
const INDEX = path.join(ROOT, 'index.html');
const PORT = process.env.PORT || process.env.NODE_PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

function sendFile(res, filePath, { noCache = false } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const headers = { 'Content-Type': type };
  if (noCache || ext === '.html') {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    // prevent path traversal
    const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(ROOT, safe);

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isFile()) return sendFile(res, filePath);
      if (!err && stat.isDirectory()) {
        const idx = path.join(filePath, 'index.html');
        if (fs.existsSync(idx)) return sendFile(res, idx);
      }
      // SPA fallback — return index.html for non-asset routes
      if (/\.[a-zA-Z0-9]+$/.test(urlPath) && !urlPath.endsWith('.html')) {
        res.writeHead(404); res.end('Not found'); return;
      }
      sendFile(res, INDEX, { noCache: true });
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

if (!fs.existsSync(INDEX)) {
  console.error(`[server] Missing build output: ${INDEX}. Run "npm run build" first.`);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`[server] ERPOVO listening on http://0.0.0.0:${PORT} (root=${ROOT})`);
});
