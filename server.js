const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('./config');
const { getNews } = require('./lib/news');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return send(res, 400, 'Bad request');
  }
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const data = await fs.readFile(file);
    send(res, 200, req.method === 'HEAD' ? undefined : data, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }

  if (pathname === '/api/news') {
    try {
      const payload = await getNews({ force: searchParams.get('refresh') === '1' });
      return send(res, 200, JSON.stringify(payload), {
        'Content-Type': MIME['.json'],
        'Cache-Control': 'no-store',
      });
    } catch (err) {
      console.error('[news] unexpected error', err);
      return send(res, 500, JSON.stringify({ error: 'Failed to load news' }), {
        'Content-Type': MIME['.json'],
      });
    }
  }

  return serveStatic(req, res, pathname);
});

server.listen(config.port, () => {
  console.log(`News dashboard running at http://localhost:${config.port}`);
  getNews().catch(() => {}); // warm the cache
});
