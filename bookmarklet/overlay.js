// U-FRET の曲ページ上で動く「ChordWiki 表示」画面。ブックマークレット/ユーザースクリプトの本体。
// 譜面はユーザーのブラウザが開いている U-FRET のページから読み取り、外部には一切送信しない。
// ページ側の CSS と干渉しないよう Shadow DOM の中に描画する。
import { parseUfretHtml } from '../lib/ufret.js';
import { toChordWikiSource, renderChordWiki, capoLabel } from '../public/chordwiki.js';
import { checkLayout } from '../public/layout-check.js';

// SHEET_CSS(public/chordwiki.css の中身)と VERSION はビルド時に定義される
/* global SHEET_CSS, VERSION */

const TAG = 'ufret2cw-overlay';
const LAUNCHER_TAG = 'ufret2cw-launcher';
const PRINT_STYLE_ID = 'ufret2cw-print-style';

const UI_CSS = `
:host { all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block; }
*, *::before, *::after { box-sizing: border-box; }
.ov {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: #eef0f3; color: #1f2328;
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", sans-serif;
  font-size: 14px; line-height: 1.5; text-align: left;
}
.bar {
  position: relative; flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px;
  padding: 8px 52px 8px 12px; background: #fff; border-bottom: 1px solid #d7dbe0;
}
.bar > * { flex: none; }
.brand { font-weight: bold; }
.bar label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
select {
  -webkit-appearance: none; appearance: none;
  font: inherit; padding: 4px 24px 4px 8px; border: 1px solid #c9ced6; border-radius: 6px; color: inherit;
  background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23555' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 8px center / 10px 6px;
}
button {
  font: inherit; padding: 5px 12px; border-radius: 6px; border: 1px solid #1d5fd1;
  background: #1d5fd1; color: #fff; cursor: pointer; white-space: nowrap;
}
button.sub { background: #fff; color: #1d5fd1; }
button.close {
  position: absolute; top: 7px; right: 10px; width: 34px; height: 32px; padding: 0;
  background: #fff; color: #333; border-color: #c9ced6; font-size: 18px; line-height: 1;
}
.scroller { flex: 1 1 auto; overflow: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.inner { max-width: 980px; margin: 0 auto; padding: 12px 12px 48px; }
.msg { padding: 32px 12px; text-align: center; color: #5f6873; }
.msg.error { color: #c62828; }
.src { margin: 14px 0 0; background: #fff; border: 1px solid #d7dbe0; border-radius: 10px; padding: 8px 12px; }
.src summary { cursor: pointer; }
.src textarea {
  display: block; width: 100%; min-height: 280px; margin-top: 8px; padding: 8px;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 13px; line-height: 1.5;
  border: 1px solid #d7dbe0; border-radius: 8px; background: #f7f8fa; color: #1f2328; resize: vertical;
}
.note { margin: 10px 2px 0; font-size: 12px; color: #5f6873; }
@media (max-width: 639px) {
  .bar { padding: 6px 48px 6px 8px; gap: 6px 8px; }
  .brand { display: none; }
  button.close { top: 6px; right: 6px; }
  .inner { padding: 8px 6px 40px; }
}
@media print {
  :host { position: static; }
  .ov { position: static; display: block; background: #fff; }
  .bar, .src, .note { display: none !important; }
  .scroller { overflow: visible; }
  .inner { max-width: none; padding: 0; }
}
`;

// 印刷時は U-FRET のページ本体を隠して譜面だけを出す
const PRINT_CSS = `@media print {
  body > *:not(${TAG}) { display: none !important; }
  html, body { overflow: visible !important; height: auto !important; }
}`;

export function isSongPage(loc = location) {
  return /(^|\.)ufret\.jp$/i.test(loc.hostname) && /\/song\.php$/i.test(loc.pathname);
}

async function readSong() {
  // U-FRET 側の JS がページ内の譜面を移調済みに書き換えることがあるため、元の HTML を読み直して解析する
  try {
    const res = await fetch(location.href, { credentials: 'same-origin' });
    if (res.ok) {
      const song = parseUfretHtml(await res.text());
      if (song.lines.length) return song;
    }
  } catch {
    // 読み直せなければ表示中の DOM から読む
  }
  return parseUfretHtml(document.documentElement.outerHTML);
}

/** U-FRET のページで今選ばれているカポ(スライダー)。読めなければ推奨値 */
function currentCapo(recommended) {
  const input = document.querySelector('input[name="key_scrollbar"]');
  const v = input ? Number(input.value) : NaN;
  return Number.isInteger(v) && v >= -9 && v <= 2 ? v : recommended;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

function buildOptions(select, values, label, selected) {
  select.replaceChildren(...values.map((v) => new Option(label(v), String(v))));
  select.value = String(selected);
}

export async function openOverlay() {
  if (!isSongPage()) {
    alert('U-FRET の曲ページ（https://www.ufret.jp/song.php?data=…）を開いてから実行してください。');
    return null;
  }
  const existing = document.querySelector(TAG);
  if (existing) return existing;

  const host = document.createElement(TAG);
  const root = host.attachShadow({ mode: 'open' });
  root.append(el('style', { text: SHEET_CSS + UI_CSS }));

  const capoSel = el('select', { 'aria-label': 'カポ' });
  const keySel = el('select', { 'aria-label': '移調' });
  const copyBtn = el('button', { type: 'button', text: 'ChordWiki形式をコピー' });
  const printBtn = el('button', { type: 'button', class: 'sub', text: '印刷' });
  const closeBtn = el('button', { type: 'button', class: 'close', 'aria-label': '閉じる', title: '閉じる (Esc)', text: '×' });
  const bar = el(
    'div',
    { class: 'bar' },
    el('span', { class: 'brand', text: 'ChordWiki表示' }),
    el('label', {}, 'カポ', capoSel),
    el('label', {}, '移調', keySel),
    copyBtn,
    printBtn,
    closeBtn,
  );
  const main = el('div', { class: 'main' });
  const sheet = el('article', { class: 'cw-sheet', 'aria-label': 'ChordWikiレイアウトのコード譜' }, main);
  const source = el('textarea', { spellcheck: 'false', 'aria-label': 'ChordWiki形式のテキスト' });
  const details = el(
    'details',
    { class: 'src' },
    el('summary', { text: 'ChordWiki形式のテキスト（編集するとプレビューに反映）' }),
    source,
  );
  const msg = el('div', { class: 'msg', text: '読み込み中…' });
  const note = el('p', {
    class: 'note',
    text: `U-FRET → ChordWiki 表示 v${VERSION}　譜面はこのページから読み取って表示しているだけで、どこにも送信していません。`,
  });
  const inner = el('div', { class: 'inner' }, msg);
  const scroller = el('div', { class: 'scroller' }, inner);
  root.append(el('div', { class: 'ov', role: 'dialog', 'aria-label': 'ChordWiki表示' }, bar, scroller));

  // ページ本体のスクロールを止める(閉じたら戻す)
  const html = document.documentElement;
  const prevOverflow = html.style.overflow;
  html.style.overflow = 'hidden';
  const printStyle = el('style', { id: PRINT_STYLE_ID, text: PRINT_CSS });
  document.head.append(printStyle);
  (document.body || html).append(host);

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    host.remove();
    printStyle.remove();
    html.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);
  closeBtn.addEventListener('click', close);
  host.cwClose = close;
  host.cwLayoutCheck = () => checkLayout(main, { scroller });

  let song;
  try {
    song = await readSong();
  } catch (e) {
    song = null;
  }
  if (!song || song.lines.length === 0) {
    msg.className = 'msg error';
    msg.textContent = 'このページからコード譜を読み取れませんでした。U-FRET のページの仕様が変わった可能性があります。';
    return host;
  }

  const recommended = Number(song.recommendedCapo) || 0;
  const capos = [2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8, -9];
  if (!capos.includes(recommended)) capos.push(recommended);
  // 選択欄はスマホの1行に収まるよう短く表記する(ChordWiki 形式のコメントは capoLabel の正式名)
  const shortCapo = (v) => (v === 1 ? '半音下げ' : v === 2 ? '1音下げ' : capoLabel(v));
  buildOptions(capoSel, capos, (v) => `${shortCapo(v)}${v === recommended ? ' ★簡単' : ''}`, currentCapo(recommended));
  const keys = [];
  for (let k = 6; k >= -6; k--) keys.push(k);
  buildOptions(keySel, keys, (k) => (k === 0 ? '原曲キー' : `${k > 0 ? '+' : ''}${k}`), 0);

  let edited = false;
  const render = () => {
    main.innerHTML = renderChordWiki(source.value);
  };
  const regenerate = () => {
    source.value = toChordWikiSource(song, { capo: Number(capoSel.value), key: Number(keySel.value) });
    edited = false;
    render();
  };
  for (const sel of [capoSel, keySel]) {
    sel.addEventListener('change', () => {
      if (edited && !confirm('テキストの編集内容は破棄され、カポ・移調を反映したテキストに作り直されます。よろしいですか？')) return;
      regenerate();
    });
  }
  source.addEventListener('input', () => {
    edited = true;
    render();
  });
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source.value);
    } catch {
      details.open = true;
      source.focus();
      source.select();
      document.execCommand('copy');
    }
    copyBtn.textContent = 'コピーしました';
    setTimeout(() => (copyBtn.textContent = 'ChordWiki形式をコピー'), 1500);
  });
  printBtn.addEventListener('click', () => window.print());

  regenerate();
  inner.replaceChildren(sheet, details, note);
  scroller.scrollTop = 0;
  return host;
}

/** ブックマークレット用: 開いていれば閉じ、閉じていれば開く */
export function toggleOverlay() {
  const existing = document.querySelector(TAG);
  if (existing && existing.cwClose) existing.cwClose();
  else openOverlay();
}

/** ユーザースクリプト用: 曲ページに「ChordWiki表示」ボタンを置く */
export function installLauncher() {
  if (!isSongPage() || document.querySelector(LAUNCHER_TAG)) return;
  const host = document.createElement(LAUNCHER_TAG);
  const root = host.attachShadow({ mode: 'open' });
  const btn = el('button', { type: 'button', text: 'ChordWiki表示' });
  root.append(
    el('style', {
      text: `:host { all: initial; position: fixed; right: 12px; bottom: 96px; z-index: 2147483646; }
button {
  font: bold 13px/1 "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif; padding: 10px 14px;
  border-radius: 999px; border: 0; background: #1d5fd1; color: #fff; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.25);
}
@media print { :host { display: none; } }`,
    }),
    btn,
  );
  btn.addEventListener('click', () => openOverlay());
  (document.body || document.documentElement).append(host);
}
