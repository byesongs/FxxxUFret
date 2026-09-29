// U-FRET → ChordWiki 変換サイトのサーバー(依存パッケージなし)
//   GET /                     … 変換ページ (public/index.html)
//   GET /api/song?url=<URL>   … U-FRET の曲ページを取得・解析した結果(JSON)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSongId, fetchUfretSong, UfretError } from './lib/ufret.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// U-FRET への負荷を抑えるため、取得結果を短時間キャッシュする
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();
const inflight = new Map();

async function getSong(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.song;
  if (inflight.has(id)) return inflight.get(id);
  const p = fetchUfretSong(id)
    .then((song) => {
      cache.delete(id);
      cache.set(id, { time: Date.now(), song });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return song;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleApi(req, res, url) {
  const input = url.searchParams.get('url') ?? '';
  const id = extractSongId(input);
  if (!id) {
    return sendJson(res, 400, {
      error: 'U-FRET の曲ページのURLを入力してください(例: https://www.ufret.jp/song.php?data=1234)',
    });
  }
  try {
    sendJson(res, 200, await getSong(id));
  } catch (e) {
    const status = e instanceof UfretError ? e.status : 500;
    if (!(e instanceof UfretError)) console.error(e);
    sendJson(res, status, { error: e instanceof UfretError ? e.message : 'サーバー内部でエラーが発生しました' });
  }
}

async function serveStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': MIME['.txt'] }).end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/song') return handleApi(req, res, url);
  return serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`U-FRET → ChordWiki 変換サイト: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
});
