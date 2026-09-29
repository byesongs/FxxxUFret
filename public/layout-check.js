// 描画済みの ChordWiki レイアウトが「崩れていないか」を実寸(getClientRects)で検査する。
// 検査項目:
//   chord-overlap   … コード同士が重なっていない
//   chord-on-lyric  … コードが歌詞・コメント・タイトルに重なっていない
//   detached        … コードが対応する歌詞の真上(同じ段の直上)にある = 行末に取り残されていない
//   order           … 同じ行のコードが読む順(左→右、上段→下段)に並んでいる
//   overflow        … 文字が譜面の枠からはみ出していない / ページに横スクロールが出ていない

const TOL = 0.5; // px。サブピクセルの丸め誤差を許容

function rectsOf(el) {
  return [...el.getClientRects()].filter((r) => r.width > 0.1 && r.height > 0.1);
}

function textRects(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return [...range.getClientRects()].filter((r) => r.width > 0.1 && r.height > 0.1);
}

function intersects(a, b) {
  return a.left < b.right - TOL && b.left < a.right - TOL && a.top < b.bottom - TOL && b.top < a.bottom - TOL;
}

function describe(el) {
  const line = el.closest('p.line');
  const all = line ? [...line.parentElement.querySelectorAll('p.line')] : [];
  const n = line ? all.indexOf(line) + 1 : 0;
  return `${n ? `${n}行目 ` : ''}「${el.textContent.slice(0, 12)}」`;
}

/**
 * @param main 描画先(div.main)
 * @param opts.scroller 横スクロールの有無を調べる要素(省略時はページ全体)
 */
export function checkLayout(main, { scroller = document.documentElement } = {}) {
  const issues = [];
  const add = (type, msg) => issues.push({ type, msg });
  const frame = main.getBoundingClientRect();
  const fontPx = parseFloat(getComputedStyle(main).fontSize) || 16;

  const chords = [...main.querySelectorAll('span.chord')].map((el) => ({ el, r: el.getBoundingClientRect() }));
  const texts = [];
  for (const el of main.querySelectorAll('span.word, span.wordtop')) for (const r of rectsOf(el)) texts.push({ el, r });
  for (const el of main.querySelectorAll('p.comment, p.key, h1.title, h2.subtitle')) {
    for (const r of textRects(el)) texts.push({ el, r });
  }

  // コード同士
  for (let i = 0; i < chords.length; i++) {
    for (let j = i + 1; j < chords.length; j++) {
      if (intersects(chords[i].r, chords[j].r)) {
        add('chord-overlap', `${describe(chords[i].el)} と ${describe(chords[j].el)} が重なっています`);
      }
    }
  }

  // コードと文字
  for (const c of chords) {
    for (const t of texts) {
      if (intersects(c.r, t.r)) add('chord-on-lyric', `${describe(c.el)} が「${t.el.textContent.slice(0, 10)}」に重なっています`);
    }
  }

  // コードが対応する歌詞の真上にあるか
  for (const c of chords) {
    const unit = c.el.parentElement;
    const word = unit && unit.classList.contains('cw-u') ? unit.querySelector('span.word') : null;
    if (!word) continue;
    const w = rectsOf(word)[0];
    if (!w) continue;
    const above = c.r.bottom <= w.top + w.height * 0.5 && w.top - c.r.top < 2.2 * fontPx;
    const beside = w.left >= c.r.left - fontPx && w.left <= c.r.right + TOL;
    if (!above || !beside) add('detached', `${describe(c.el)} が歌詞「${word.textContent}」の真上にありません`);
  }

  // 同じ行のコードの並び順
  for (const line of main.querySelectorAll('p.line')) {
    const cs = [...line.querySelectorAll('span.chord')].map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1].r;
      const b = cs[i].r;
      const sameRow = Math.abs(a.top - b.top) < 1;
      const ok = sameRow ? b.left >= a.right - TOL : b.top > a.top + 1;
      if (!ok) add('order', `${describe(cs[i].el)} の位置が前のコードより前に来ています`);
    }
  }

  // はみ出し
  for (const { el, r } of [...chords, ...texts]) {
    if (r.left < frame.left - TOL || r.right > frame.right + TOL) {
      add('overflow', `${describe(el)} が枠の外にはみ出しています`);
    }
  }
  if (scroller.scrollWidth > scroller.clientWidth + 1) {
    add('overflow', `横スクロールが出ています (${scroller.scrollWidth}px > ${scroller.clientWidth}px)`);
  }

  const lineCount = main.querySelectorAll('p.line:not(.comment)').length;
  const rows = new Set(chords.map((c) => Math.round(c.r.top))).size;
  return {
    ok: issues.length === 0,
    width: Math.round(frame.width),
    lines: lineCount,
    chords: chords.length,
    chordRows: rows,
    issues,
  };
}
