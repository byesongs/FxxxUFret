// ブックマークレット・ユーザースクリプト・配布ページを dist/ に作る(依存パッケージなし)
//   node scripts/build.mjs
//   BASE_URL=https://example.github.io/ufret2cw/ node scripts/build.mjs  … ユーザースクリプトに自動更新URLを入れる
//   OUT_DIR=<dir> で出力先を変更(テスト用)
//
// 小さなバンドラ: 各モジュールを関数スコープで包み、`import { a } from './x.js'` と `export function/const/class`
// だけを書き換える。それ以外の import/export 構文を見つけたら失敗させる。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderChordWiki } from '../public/chordwiki.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/*$/, '/') : '';

function bundle(entryFile, entryCall) {
  const ids = new Map();
  const modules = [];
  function load(file) {
    if (ids.has(file)) return ids.get(file);
    const id = `__m${ids.size}`;
    ids.set(file, id);
    let src = fs.readFileSync(file, 'utf8');
    src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*$/gm, (_, names, spec) => {
      return `const {${names}} = ${load(path.resolve(path.dirname(file), spec))};`;
    });
    const exported = [];
    src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
      exported.push(name);
      return `${kw} ${name}`;
    });
    if (/^\s*(import|export)\b/m.test(src)) throw new Error(`未対応の import/export 構文: ${file}`);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    modules.push(`// ---- ${rel}\nconst ${id} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();`);
    return id;
  }
  const entry = load(entryFile);
  const sheetCss = fs.readFileSync(path.join(ROOT, 'public/chordwiki.css'), 'utf8');
  return [
    '(() => {',
    "'use strict';",
    `const SHEET_CSS = ${JSON.stringify(minifyCss(sheetCss))};`,
    `const VERSION = ${JSON.stringify(VERSION)};`,
    ...modules,
    `${entry}.${entryCall}();`,
    '})();',
    '',
  ].join('\n');
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

// ブックマークレット用の軽い圧縮: 行頭の空白・行コメント・JSDoc・空行を落とすだけ(意味は変えない)
function shrinkJs(code) {
  return code
    .replace(/^[ \t]*\/\*\*[\s\S]*?\*\/[ \t]*\n/gm, '')
    .split('\n')
    .map((l) => l.replace(/^[ \t]+/, ''))
    .filter((l) => l !== '' && !l.startsWith('//'))
    .join('\n');
}

function assertParses(code, label) {
  try {
    new Function(code); // 構文チェックのみ(実行はしない)
  } catch (e) {
    throw new Error(`${label} の構文エラー: ${e.message}`);
  }
}

fs.mkdirSync(DIST, { recursive: true });
const overlay = path.join(ROOT, 'bookmarklet/overlay.js');

const plain = bundle(overlay, 'toggleOverlay');
assertParses(plain, 'ufret2cw.js');
fs.writeFileSync(path.join(DIST, 'ufret2cw.js'), plain);

const bookmarkletCode = shrinkJs(plain);
assertParses(bookmarkletCode, 'bookmarklet');
const bookmarklet = `javascript:${encodeURIComponent(bookmarkletCode)}`;
fs.writeFileSync(path.join(DIST, 'bookmarklet.txt'), bookmarklet);

const userHeader = [
  '// ==UserScript==',
  '// @name         U-FRET → ChordWiki 表示',
  '// @namespace    ufret2cw',
  `// @version      ${VERSION}`,
  '// @description  U-FRETの曲ページに「ChordWiki表示」ボタンを追加し、ChordWikiのレイアウトで表示します',
  '// @match        https://www.ufret.jp/song.php*',
  '// @match        https://ufret.jp/song.php*',
  '// @grant        none',
  '// @run-at       document-idle',
  ...(BASE_URL ? [`// @downloadURL  ${BASE_URL}ufret2cw.user.js`, `// @updateURL    ${BASE_URL}ufret2cw.user.js`] : []),
  '// ==/UserScript==',
  '',
].join('\n');
const userScript = userHeader + bundle(overlay, 'installLauncher');
assertParses(userScript, 'ufret2cw.user.js');
fs.writeFileSync(path.join(DIST, 'ufret2cw.user.js'), userScript);

// 配布ページ(デモは架空の曲)
const DEMO_SOURCE = [
  '{title:サンプルの歌}',
  '{subtitle:歌：サンプル　作詞・作曲：サンプル}',
  '{c:Capo 3}',
  '[Fmaj7]　[E7]　[Am7]　[C7]',
  '',
  '[C]あさの ひかりが[G]まどを てらして',
  '[Am]きょうも また[Em]あたらしい いちにち[F]が',
  'はじ[G]まる[C]',
  '',
  '[F]ならんで[G]あるく [Em]みちの[Am]うえ',
  '[Dm7]すこしだけ[G7]はやあしで[C]',
].join('\n');
const sheetCss = fs.readFileSync(path.join(ROOT, 'public/chordwiki.css'), 'utf8');
const page = fs
  .readFileSync(path.join(ROOT, 'bookmarklet/install.html'), 'utf8')
  .replace('%%SHEET_CSS%%', () => sheetCss.replace(/\n/g, '\n    '))
  .replace('%%DEMO_HTML%%', () => renderChordWiki(DEMO_SOURCE))
  .replaceAll('%%BOOKMARKLET_HREF%%', () => bookmarklet)
  .replaceAll('%%VERSION%%', () => VERSION);
if (/%%[A-Z_]+%%/.test(page)) throw new Error('配布ページに置き換え漏れがあります');
fs.writeFileSync(path.join(DIST, 'index.html'), page);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
console.log(`dist/ に出力しました (v${VERSION})`);
console.log(`  ufret2cw.js       ${kb(plain)}`);
console.log(`  ufret2cw.user.js  ${kb(userScript)}${BASE_URL ? `  更新URL: ${BASE_URL}ufret2cw.user.js` : ''}`);
console.log(`  bookmarklet       ${kb(bookmarklet)} (圧縮前 ${kb(bookmarkletCode)})`);
console.log(`  index.html        ${kb(page)}`);
