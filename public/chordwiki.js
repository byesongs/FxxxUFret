// ChordWiki 形式テキストの生成・解析・描画。ブラウザと Node(テスト)の両方から使う。
//
// ChordWiki のソース記法:
//   {title:曲名} {subtitle:歌：…　作詞：…　作曲：…} {key:C} {c:コメント} {ci:斜体コメント}
//   [C]歌詞[G]歌詞      … コードは [] で歌詞の直前に書く / 空行 … 段落区切り
//
// 描画は ChordWiki 本家と同じマークアップ(h1.title, h2.subtitle, p.key, p.line, span.chord, span.word,
// span.wordtop, br)を出力する。本家との違いは、折り返しで崩れないための補強だけ:
//   - コードと直後の1文字を span.cw-u (nowrap) で束ね、行末でコードだけ取り残されないようにする
//   - 歌詞なしで連続するコードの後ろに <wbr> を入れ、コードだけの長い行も折り返せるようにする

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// 調号のない曲で臨時記号が出たときの一般的な表記
const COMMON_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // F Bb Eb Ab Db
const SHARP_KEYS = new Set([7, 2, 9, 4, 11, 6]); // G D A E B F#

// ルート音: 先頭(括弧付きも可)、ベース音: "/" または "on" の後
const ROOT_RE = /^(\(?)([A-G])([#b]?)/;
const BASS_RE = /(\/|on)([A-G])([#b]?)/g;

/** U-FRET の表記(♭ ♯ 全角英数など)を ChordWiki の表記(b #)に揃える */
export function normalizeChord(chord) {
  return String(chord)
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[♭]/g, 'b')
    .replace(/[♯]/g, '#')
    .replace(/[\s\u3000]+/g, '')
    .trim();
}

function pitchOf(letter, acc) {
  return (NOTE_INDEX[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
}

function noteName(pc, spelling) {
  const names = spelling === 'flat' ? FLAT_NAMES : spelling === 'sharp' ? SHARP_NAMES : COMMON_NAMES;
  return names[((pc % 12) + 12) % 12];
}

/** コード1つを semitones 半音移調する。コードとして解釈できないもの(N.C. 等)はそのまま */
export function transposeChord(chord, semitones, spelling = 'common') {
  const c = normalizeChord(chord);
  const n = ((semitones % 12) + 12) % 12;
  if (n === 0) return c;
  const m = c.match(ROOT_RE);
  if (!m) return c;
  const head = m[1] + noteName(pitchOf(m[2], m[3]) + n, spelling);
  const rest = c.slice(m[0].length).replace(BASS_RE, (_, sep, l, a) => sep + noteName(pitchOf(l, a) + n, spelling));
  return head + rest;
}

/** コードのルート音(0-11)と長短。解釈できなければ null */
function chordInfo(chord) {
  const c = normalizeChord(chord);
  const m = c.match(ROOT_RE);
  if (!m) return null;
  const rest = c.slice(m[0].length);
  const minor = /^m(?!aj)/.test(rest);
  const dim = /^(dim|m7-5|m7\(b5\)|m7b5)/.test(rest);
  return { root: pitchOf(m[2], m[3]), minor, dim };
}

/** コード列から最も当てはまる長調の主音(0-11)を推定する。臨時記号の表記(#/b)を決めるのに使う */
export function estimateMajorKey(chords) {
  const MAJOR_DEGREES = { 0: 'M', 2: 'm', 4: 'm', 5: 'M', 7: 'M', 9: 'm', 11: 'd' };
  const infos = chords.map(chordInfo).filter(Boolean);
  if (infos.length === 0) return null;
  let best = null;
  for (let k = 0; k < 12; k++) {
    let score = 0;
    for (const { root, minor, dim } of infos) {
      const deg = MAJOR_DEGREES[(root - k + 12) % 12];
      if (!deg) continue;
      const q = dim ? 'd' : minor ? 'm' : 'M';
      score += deg === q ? 1 : 0.4;
    }
    // 同点ならトニック(I)や vi が多い方を優先
    const tonic = infos.filter((i) => i.root === k && !i.minor).length + infos.filter((i) => i.root === (k + 9) % 12 && i.minor).length;
    score += tonic * 0.01;
    if (!best || score > best.score) best = { key: k, score };
  }
  return best.key;
}

function spellingForKey(key) {
  if (key == null) return 'common';
  if (FLAT_KEYS.has(key)) return 'flat';
  if (SHARP_KEYS.has(key)) return 'sharp';
  return 'common';
}

/** `[C]歌詞[G]歌詞` を {leading, segments:[{chord, text}]} に分解する */
export function parseChordLine(line) {
  const segments = [];
  const re = /\[([^\]]*)\]/g;
  let last = 0;
  let leading = null;
  let m;
  while ((m = re.exec(line))) {
    const before = line.slice(last, m.index);
    if (leading === null) leading = before;
    else segments[segments.length - 1].text = before;
    segments.push({ chord: m[1], text: '' });
    last = re.lastIndex;
  }
  const tail = line.slice(last);
  if (leading === null) leading = tail;
  else segments[segments.length - 1].text = tail;
  return { leading, segments };
}

function mapChords(line, fn) {
  return line.replace(/\[([^\]]*)\]/g, (_, c) => `[${fn(c)}]`);
}

function allChords(lines) {
  const out = [];
  for (const l of lines) for (const m of l.matchAll(/\[([^\]]*)\]/g)) out.push(m[1]);
  return out;
}

/** カポ設定値(U-FRET と同じ: 0=原曲, -N=Capo N, +1=半音下げ, +2=1音下げ)の表示名 */
export function capoLabel(capo) {
  if (capo === 0) return '原曲キー';
  if (capo === 1) return '半音下げチューニング';
  if (capo === 2) return '1音下げチューニング';
  if (capo < 0) return `Capo ${-capo}`;
  return `+${capo}`;
}

/**
 * U-FRET の曲データから ChordWiki 形式のテキストを作る。
 * @param song {title, artist, lyricist, composer, lines}
 * @param opts.capo カポ設定(U-FRET と同じ値)。コードは capo 半音ずらして出力し、コメントで明記する
 * @param opts.key  移調(半音、+で高く)
 */
export function toChordWikiSource(song, { capo = 0, key = 0 } = {}) {
  const lines = song.lines ?? [];
  const shift = capo + key;
  let spelling = 'keep';
  if (((shift % 12) + 12) % 12 !== 0) {
    const k = estimateMajorKey(allChords(lines));
    spelling = spellingForKey(k == null ? null : (k + shift + 120) % 12);
  }
  const conv = (c) => (spelling === 'keep' ? normalizeChord(c) : transposeChord(c, shift, spelling));

  const out = [];
  const esc = (s) => String(s ?? '').replace(/[{}]/g, '').trim();
  if (song.title) out.push(`{title:${esc(song.title)}}`);
  const credit = [];
  if (song.artist) credit.push(`歌：${esc(song.artist)}`);
  const lyr = esc(song.lyricist);
  const comp = esc(song.composer);
  if (lyr && lyr === comp) credit.push(`作詞・作曲：${lyr}`);
  else {
    if (lyr) credit.push(`作詞：${lyr}`);
    if (comp) credit.push(`作曲：${comp}`);
  }
  if (credit.length) out.push(`{subtitle:${credit.join('　')}}`);
  if (key !== 0) out.push(`{c:原曲キーから${key > 0 ? '+' : ''}${key}}`);
  if (capo !== 0) out.push(`{c:${capoLabel(capo)}}`);
  if (out.length) out.push('');
  for (const line of lines) {
    // 歌詞行が {…} だけだと ChordWiki の命令として解釈されるため全角括弧に逃がす
    const safe = /^\s*\{.*\}\s*$/.test(line) ? line.replace(/\{/g, '｛').replace(/\}/g, '｝') : line;
    out.push(mapChords(safe, conv));
  }
  return out.join('\n');
}

const DIRECTIVES = {
  title: 'title', t: 'title',
  subtitle: 'subtitle', st: 'subtitle',
  key: 'key', k: 'key',
  comment: 'comment', c: 'comment',
  comment_italic: 'ci', ci: 'ci',
};

/** ChordWiki 形式テキストをブロック列に解析する */
export function parseChordWiki(src) {
  const blocks = [];
  for (const raw of String(src).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/[\ufeff]/g, '').replace(/\s+$/, '');
    if (line.trim() === '') {
      blocks.push({ type: 'blank' });
      continue;
    }
    const d = line.match(/^\s*\{([A-Za-z_]+)(?::([\s\S]*))?\}\s*$/);
    if (d && DIRECTIVES[d[1].toLowerCase()]) {
      const type = DIRECTIVES[d[1].toLowerCase()];
      const text = (d[2] ?? '').trim();
      if (type === 'comment' || type === 'ci') blocks.push({ type: 'comment', text, italic: type === 'ci' });
      else blocks.push({ type, text });
      continue;
    }
    blocks.push({ type: 'line', ...parseChordLine(line) });
  }
  return blocks;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 絵文字の結合などを壊さずに先頭1文字を取る
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
function splitFirstGrapheme(s) {
  if (!s) return ['', ''];
  if (segmenter) {
    const first = segmenter.segment(s)[Symbol.iterator]().next().value.segment;
    return [first, s.slice(first.length)];
  }
  const cp = String.fromCodePoint(s.codePointAt(0));
  return [cp, s.slice(cp.length)];
}

function renderLine(block, conv) {
  const parts = [];
  if (block.leading) parts.push(`<span class="wordtop">${escapeHtml(block.leading)}</span>`);
  for (const { chord, text } of block.segments) {
    const chordHtml = `<span class="chord">${escapeHtml(conv(chord))}</span>`;
    if (text === '') {
      parts.push(`<span class="cw-u">${chordHtml}&nbsp;</span><wbr>`);
      continue;
    }
    const [first, rest] = splitFirstGrapheme(text);
    parts.push(`<span class="cw-u">${chordHtml}<span class="word">${escapeHtml(first)}</span></span>`);
    if (rest) parts.push(`<span class="word">${escapeHtml(rest)}</span>`);
  }
  return `<p class="line">${parts.join('')}</p>`;
}

/**
 * ChordWiki 形式テキストを ChordWiki と同じマークアップの HTML にする。
 * @param opts.transpose 表示時の移調(半音)
 */
export function renderChordWiki(src, { transpose = 0 } = {}) {
  const blocks = parseChordWiki(src);
  let spelling = 'keep';
  if (((transpose % 12) + 12) % 12 !== 0) {
    const chords = blocks.filter((b) => b.type === 'line').flatMap((b) => b.segments.map((s) => s.chord));
    const k = estimateMajorKey(chords);
    spelling = spellingForKey(k == null ? null : (k + transpose + 120) % 12);
  }
  const conv = (c) => (spelling === 'keep' ? normalizeChord(c) : transposeChord(c, transpose, spelling));

  const head = [];
  const body = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'title':
        head.push(`<h1 class="title">${escapeHtml(b.text)}</h1>`);
        break;
      case 'subtitle':
        head.push(`<h2 class="subtitle">${escapeHtml(b.text)}</h2>`);
        break;
      case 'key':
        body.push(`<p class="key">Key: ${escapeHtml(conv(b.text))}</p>`);
        break;
      case 'comment': {
        const t = escapeHtml(b.text);
        body.push(`<p class="line comment"><strong>${b.italic ? `<i>${t}</i>` : t}</strong></p>`);
        break;
      }
      case 'blank':
        body.push('<br>');
        break;
      default:
        body.push(renderLine(b, conv));
    }
  }
  // 先頭・末尾の空行は描画しない
  while (body[0] === '<br>') body.shift();
  while (body[body.length - 1] === '<br>') body.pop();
  return `${head.join('\n')}\n<div class="lines">\n${body.join('\n')}\n</div>`;
}
