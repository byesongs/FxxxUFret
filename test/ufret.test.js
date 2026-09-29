import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractSongId, parseUfretHtml, extractJsonArray, cleanLines, fetchUfretSong } from '../lib/ufret.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('extractSongId: URL・ID の各種表記', () => {
  assert.equal(extractSongId('https://www.ufret.jp/song.php?data=1041'), '1041');
  assert.equal(extractSongId('http://ufret.jp/song.php?data=12345&foo=bar'), '12345');
  assert.equal(extractSongId('www.ufret.jp/song.php?data=77'), '77');
  assert.equal(extractSongId('  https://m.ufret.jp/song.php?data=5  '), '5');
  assert.equal(extractSongId('1041'), '1041');
});

test('extractSongId: U-FRET 以外や不正な入力は null', () => {
  assert.equal(extractSongId('https://example.com/song.php?data=1041'), null);
  assert.equal(extractSongId('https://ufret.jp.evil.com/song.php?data=1'), null);
  assert.equal(extractSongId('https://www.ufret.jp/song.php?data=abc'), null);
  assert.equal(extractSongId('https://www.ufret.jp/artist.php?data=back+number'), null);
  assert.equal(extractSongId('javascript:alert(1)'), null);
  assert.equal(extractSongId(''), null);
  assert.equal(extractSongId(null), null);
});

test('extractJsonArray: 文字列中の ] や " に惑わされない', () => {
  const html = 'var x = ["a]b", "c\\"]d", "e"]; var y = 1;';
  assert.deepEqual(extractJsonArray(html, 'x'), ['a]b', 'c"]d', 'e']);
  assert.equal(extractJsonArray('nothing here', 'x'), null);
});

test('cleanLines: \\r・BOM・行末空白の除去と空行の整理', () => {
  assert.deepEqual(cleanLines(['\r', '\ufeff[C]あ \r', '\r', '　\r', '\r', '[G]い\r', '\r']), ['[C]あ', '', '[G]い']);
});

test('parseUfretHtml: 通常ページ', () => {
  const song = parseUfretHtml(fixture('standard.html'));
  assert.equal(song.format, 'standard');
  assert.equal(song.title, 'テストの歌 & その2');
  assert.equal(song.artist, 'テスト楽団');
  assert.equal(song.lyricist, '作詞者A');
  assert.equal(song.composer, '作曲者B');
  assert.equal(song.recommendedCapo, -3);
  assert.deepEqual(song.lines, [
    '[A♭maj7]　[G7]　[Cm7]　[E♭7]',
    '',
    '[E♭]らら[E♭7]るる"引用"[A♭maj7]りり];[G7]れれ',
    '',
    '歌詞だけの行',
    '[N.C.]おわり[C#m7-5]',
  ]);
});

test('parseUfretHtml: 動画プラス(難読化HTML)ページ', () => {
  const song = parseUfretHtml(fixture('video.html'));
  assert.equal(song.format, 'video');
  assert.equal(song.title, 'テスト動画曲');
  assert.equal(song.artist, 'テスト歌手');
  assert.equal(song.lyricist, '同じ人');
  assert.equal(song.recommendedCapo, -5);
  assert.deepEqual(song.lines, ['[Dm]　[B♭]', 'まえ[C/E]あと & <x>', 'コードなし']);
});

test('parseUfretHtml: 半音下げ推奨(data-kantan_key="+1")', () => {
  const html = fixture('standard.html').replace('value="-3"', 'value="0"').replace('data-kantan_key="-3"', 'data-kantan_key="+1"');
  assert.equal(parseUfretHtml(html).recommendedCapo, 1);
});

test('parseUfretHtml: 譜面の無いページは lines が空', () => {
  const song = parseUfretHtml('<html><title>x</title><body>no data</body></html>');
  assert.deepEqual(song.lines, []);
});

test('fetchUfretSong: 取得先は常に www.ufret.jp の曲ページ / エラー処理', async () => {
  let requested;
  const ok = async (url) => {
    requested = url;
    return new Response(fixture('standard.html'), { status: 200 });
  };
  const song = await fetchUfretSong('1041', { fetchImpl: ok });
  assert.equal(requested, 'https://www.ufret.jp/song.php?data=1041');
  assert.equal(song.id, '1041');
  assert.equal(song.lines.length, 6);

  await assert.rejects(fetchUfretSong('1', { fetchImpl: async () => new Response('', { status: 404 }) }), { status: 404 });
  await assert.rejects(fetchUfretSong('1', { fetchImpl: async () => new Response('<html></html>', { status: 200 }) }), { status: 422 });
  await assert.rejects(
    fetchUfretSong('1', {
      fetchImpl: async () => {
        throw new TypeError('network down');
      },
    }),
    { status: 502 },
  );
});
