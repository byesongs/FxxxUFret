import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ufret2cw-'));
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], {
  env: { ...process.env, OUT_DIR: out, BASE_URL: 'https://example.github.io/ufret2cw' },
});
const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');

/** 配布物を U-FRET 以外のページ相当の最小環境で実行し、トップレベルで例外が出ないことを確かめる */
function runIn(code) {
  const alerts = [];
  const document = { querySelector: () => null };
  const location = { hostname: 'example.com', pathname: '/' };
  new Function('document', 'location', 'alert', code)(document, location, (m) => alerts.push(m));
  return alerts;
}

test('ブックマークレット: javascript: URL として復元・実行できる', () => {
  const href = read('bookmarklet.txt');
  assert.match(href, /^javascript:/);
  assert.doesNotMatch(href, /[\s"<>]/, 'URL にそのまま入らない文字を含まない');
  const code = decodeURIComponent(href.slice('javascript:'.length));
  assert.doesNotMatch(code, /^\s*(import|export)\b/m);
  // U-FRET 以外で実行すると案内を出すだけ
  const alerts = runIn(code);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /U-FRET の曲ページ/);
});

test('ユーザースクリプト: ヘッダーと自動更新URL、曲ページ以外では何もしない', () => {
  const us = read('ufret2cw.user.js');
  assert.match(us, /^\/\/ ==UserScript==/);
  assert.match(us, /\/\/ @match {8}https:\/\/www\.ufret\.jp\/song\.php\*/);
  assert.match(us, /\/\/ @match {8}https:\/\/ufret\.jp\/song\.php\*/);
  assert.match(us, /\/\/ @updateURL {4}https:\/\/example\.github\.io\/ufret2cw\/ufret2cw\.user\.js/);
  assert.deepEqual(runIn(us), []);
});

test('配布物は表示専用: 譜面のテキスト書き出し・編集の機能を含まない', () => {
  for (const code of [decodeURIComponent(read('bookmarklet.txt').slice('javascript:'.length)), read('ufret2cw.user.js')]) {
    assert.doesNotMatch(code, /clipboard|execCommand|textarea|contenteditable/i);
    assert.doesNotMatch(code, /ChordWiki形式/);
  }
  assert.doesNotMatch(read('index.html'), /ChordWiki形式/);
});

test('配布ページ: 置き換え漏れがなく、ブックマークレットとデモが入っている', () => {
  const page = read('index.html');
  assert.doesNotMatch(page, /%%[A-Z_]+%%/);
  assert.ok(page.includes(`href="${read('bookmarklet.txt')}"`));
  assert.match(page, /<h1 class="title">サンプルの歌<\/h1>/);
  assert.match(page, /<span class="chord">Fmaj7<\/span>/);
});
