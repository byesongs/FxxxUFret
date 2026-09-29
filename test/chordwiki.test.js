import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChord,
  transposeChord,
  estimateMajorKey,
  parseChordLine,
  parseChordWiki,
  toChordWikiSource,
  renderChordWiki,
  capoLabel,
} from '../public/chordwiki.js';

test('normalizeChord: ♭♯・全角を ChordWiki 表記に', () => {
  assert.equal(normalizeChord('A♭maj7'), 'Abmaj7');
  assert.equal(normalizeChord('F♯m7/C♯'), 'F#m7/C#');
  assert.equal(normalizeChord('Ｃｍ７'), 'Cm7');
  assert.equal(normalizeChord('N.C.'), 'N.C.');
});

test('transposeChord: ルートとベース音を移調', () => {
  assert.equal(transposeChord('C', 2), 'D');
  assert.equal(transposeChord('Cm7/B♭', -3, 'common'), 'Am7/G');
  assert.equal(transposeChord('A♭maj7', -3, 'common'), 'Fmaj7');
  assert.equal(transposeChord('E♭7', -3, 'common'), 'C7');
  assert.equal(transposeChord('C#m7-5', 1, 'sharp'), 'Dm7-5');
  assert.equal(transposeChord('C', 1, 'flat'), 'Db');
  assert.equal(transposeChord('C', 1, 'sharp'), 'C#');
  assert.equal(transposeChord('ConE', 2), 'DonF#');
  assert.equal(transposeChord('(G)', 5), '(C)');
  assert.equal(transposeChord('N.C.', 3), 'N.C.');
  assert.equal(transposeChord('Bb', 12), 'Bb');
  assert.equal(transposeChord('Gadd9/F#', -14, 'common'), 'Fadd9/E');
});

test('estimateMajorKey: 調号の推定', () => {
  assert.equal(estimateMajorKey(['C', 'G', 'Am', 'F', 'Dm', 'G7']), 0);
  assert.equal(estimateMajorKey(['A♭maj7', 'G7', 'Cm7', 'E♭7', 'B♭']), 3); // Eb
  assert.equal(estimateMajorKey(['Dm', 'Gm', 'C', 'F', 'B♭', 'A']), 5); // F(= Dm)
  assert.equal(estimateMajorKey(['N.C.']), null);
});

test('parseChordLine', () => {
  assert.deepEqual(parseChordLine('まえ[C]あと[G]'), {
    leading: 'まえ',
    segments: [
      { chord: 'C', text: 'あと' },
      { chord: 'G', text: '' },
    ],
  });
  assert.deepEqual(parseChordLine('コードなし'), { leading: 'コードなし', segments: [] });
  assert.deepEqual(parseChordLine('[C][G]x'), {
    leading: '',
    segments: [
      { chord: 'C', text: '' },
      { chord: 'G', text: 'x' },
    ],
  });
});

test('parseChordWiki: 命令と行', () => {
  const blocks = parseChordWiki('{title:T}\n{st:S}\n{key:Eb}\n{c:コメ}\n{ci:斜体}\n\n[C]あ\n{unknown:x}');
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['title', 'subtitle', 'key', 'comment', 'comment', 'blank', 'line', 'line'],
  );
  assert.equal(blocks[4].italic, true);
  assert.equal(blocks[7].leading, '{unknown:x}');
});

const SONG = {
  title: '曲',
  artist: '歌手',
  lyricist: 'A',
  composer: 'A',
  lines: ['[A♭maj7]　[G7]　[Cm7]　[E♭7]', '', '[E♭]らら[B♭]るる', '{まるで命令}'],
};

test('toChordWikiSource: 原曲キー', () => {
  assert.equal(
    toChordWikiSource(SONG),
    ['{title:曲}', '{subtitle:歌：歌手　作詞・作曲：A}', '', '[Abmaj7]　[G7]　[Cm7]　[Eb7]', '', '[Eb]らら[Bb]るる', '｛まるで命令｝'].join('\n'),
  );
});

test('toChordWikiSource: カポ・移調・作詞作曲が別人', () => {
  const src = toChordWikiSource({ ...SONG, composer: 'B' }, { capo: -3 });
  assert.match(src, /\{subtitle:歌：歌手　作詞：A　作曲：B\}/);
  assert.match(src, /\{c:Capo 3\}/);
  assert.match(src, /\[Fmaj7\]　\[E7\]　\[Am7\]　\[C7\]/);
  assert.match(src, /\[C\]らら\[G\]るる/);

  const up = toChordWikiSource(SONG, { key: 2 });
  assert.match(up, /\{c:原曲キーから\+2\}/);
  assert.match(up, /\[Bbmaj7\]　\[A7\]　\[Dm7\]　\[F7\]/); // Eb → F(フラット系)

  const tuning = toChordWikiSource(SONG, { capo: 1 });
  assert.match(tuning, /\{c:半音下げチューニング\}/);
  assert.match(tuning, /\[Amaj7\]/);
});

test('capoLabel', () => {
  assert.equal(capoLabel(0), '原曲キー');
  assert.equal(capoLabel(-5), 'Capo 5');
  assert.equal(capoLabel(1), '半音下げチューニング');
  assert.equal(capoLabel(2), '1音下げチューニング');
});

test('renderChordWiki: ChordWiki と同じマークアップ', () => {
  const html = renderChordWiki('{title:T}\n{subtitle:S}\n{key:Ab}\n{c:C1}\n\n\nまえ[C]あいう[G][Am]\nのみ');
  assert.match(html, /<h1 class="title">T<\/h1>/);
  assert.match(html, /<h2 class="subtitle">S<\/h2>/);
  assert.match(html, /<p class="key">Key: Ab<\/p>/);
  assert.match(html, /<p class="line comment"><strong>C1<\/strong><\/p>/);
  assert.match(
    html,
    /<p class="line"><span class="wordtop">まえ<\/span><span class="cw-u"><span class="chord">C<\/span><span class="word">あ<\/span><\/span><span class="word">いう<\/span><span class="cw-u"><span class="chord">G<\/span>&nbsp;<\/span><wbr><span class="cw-u"><span class="chord">Am<\/span>&nbsp;<\/span><wbr><\/p>/,
  );
  assert.match(html, /<p class="line"><span class="wordtop">のみ<\/span><\/p>/);
  // 空行は <br> 1つずつ(連続する空行はそのまま)
  assert.equal((html.match(/<br>/g) || []).length, 2);
});

test('renderChordWiki: HTML エスケープ', () => {
  const html = renderChordWiki('{title:<b>x</b>}\n[<i>]<script>&"\'');
  assert.ok(!/<script>|<b>|<i>/.test(html));
  assert.match(html, /<span class="chord">&lt;i&gt;<\/span><span class="word">&lt;<\/span><\/span><span class="word">script&gt;&amp;&quot;&#39;<\/span>/);
});

test('renderChordWiki: 表示時の移調と Key 表示', () => {
  const html = renderChordWiki('{key:Eb}\n[Eb]あ[Bb]い[Cm]う', { transpose: -3 });
  assert.match(html, /Key: C</);
  assert.match(html, />C<\/span><span class="word">あ/);
  assert.match(html, />G<\/span><span class="word">い/);
  assert.match(html, />Am<\/span><span class="word">う/);
});

test('renderChordWiki: 結合文字・絵文字を先頭1文字で分断しない', () => {
  const html = renderChordWiki('[C]ガギ[G]👨‍👩‍👧x');
  assert.match(html, /<span class="word">ガ<\/span>/);
  assert.match(html, /<span class="word">👨‍👩‍👧<\/span>/);
});
