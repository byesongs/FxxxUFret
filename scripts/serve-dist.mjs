// dist/ をローカルで確認するための静的サーバー(配布ページのプレビュー用)
//   node scripts/serve-dist.mjs   → http://localhost:3001/
// ビルドしたブックマークレットを U-FRET のページ上で試せるよう CORS を許可している。公開サーバーには使わないこと。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 3001;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
// 開発用: /__bridge.html?to=<U-FRETの曲URL> を開くと、ビルド済みブックマークレットを URL のフラグメント
// (#ufret2cw=…、サーバーには送られない)に載せて曲ページへ移動する。曲ページ側でそれを取り出して実行すれば、
// ブックマークレットを押したのと同じ状態を再現できる(https のページから localhost への fetch は
// ブラウザのローカルネットワーク保護で遮断されるため)
const BRIDGE_HTML = `<!doctype html><meta charset="utf-8"><title>bridge</title><script>
const params = new URLSearchParams(location.search);
const to = params.get('to') || '';
const user = params.get('kind') === 'user';
if (/^https:\\/\\/(www\\.)?ufret\\.jp\\/song\\.php\\?data=\\d+$/.test(to)) {
  fetch(user ? '/ufret2cw.user.js' : '/bookmarklet.txt', { cache: 'no-store' }).then((r) => r.text()).then((t) => {
    location.href = to + '#ufret2cw=' + (user ? 'javascript:' + encodeURIComponent(t) : t);
  });
} else {
  document.write('to= に U-FRET の曲URLを指定してください');
}
</script>`;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Private-Network': 'true',
};

http
  .createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...CORS, 'Access-Control-Allow-Methods': 'GET' }).end();
      return;
    }
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/, '/index.html');
    if (rel === '/__bridge.html') {
      res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(BRIDGE_HTML);
      return;
    }
    const file = path.resolve(DIST, '.' + rel);
    if (!file.startsWith(DIST + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { ...CORS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      res.writeHead(404, CORS).end('Not Found');
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`dist プレビュー: http://localhost:${PORT}/`));
