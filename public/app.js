import { toChordWikiSource, renderChordWiki, capoLabel } from './chordwiki.js';
import { checkLayout } from './layout-check.js';

const $ = (id) => document.getElementById(id);
const els = {
  form: $('form'),
  url: $('url'),
  submit: $('submit'),
  status: $('status'),
  result: $('result'),
  capo: $('capo'),
  key: $('key'),
  print: $('print'),
  link: $('source-link'),
  main: $('cw-main'),
};

const state = { song: null };

// 検証用(ブラウザのコンソールから window.cwLayoutCheck() で崩れの有無を確認できる)
window.cwLayoutCheck = () => checkLayout(els.main);

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = `status ${kind}`.trim();
}

function fillOptions(recommended) {
  // U-FRET と同じ並び: 1音下げ / 半音下げ / 原曲 / Capo 1〜9
  const capos = [2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8, -9];
  if (!capos.includes(recommended)) capos.push(recommended);
  els.capo.replaceChildren(
    ...capos.map((v) => new Option(`${capoLabel(v)}${v === recommended ? ' ★簡単弾き' : ''}`, String(v))),
  );
  els.capo.value = String(recommended);
  const keys = [];
  for (let k = 6; k >= -6; k--) keys.push(k);
  els.key.replaceChildren(...keys.map((k) => new Option(k === 0 ? '原曲キー' : `${k > 0 ? '+' : ''}${k}`, String(k))));
  els.key.value = '0';
}

// 表示専用: ChordWiki 形式は内部の中間表現としてだけ使い、テキストの編集・書き出しはしない
function render() {
  if (!state.song) return;
  const src = toChordWikiSource(state.song, { capo: Number(els.capo.value), key: Number(els.key.value) });
  els.main.innerHTML = renderChordWiki(src);
}

async function convert(input) {
  const value = input.trim();
  if (!value) return;
  els.submit.disabled = true;
  setStatus('U-FRET から読み込み中…');
  try {
    const res = await fetch(`/api/song?url=${encodeURIComponent(value)}`);
    const data = await res.json().catch(() => ({ error: `サーバーエラー (HTTP ${res.status})` }));
    if (!res.ok) throw new Error(data.error || `エラー (HTTP ${res.status})`);
    state.song = data;
    fillOptions(Number(data.recommendedCapo) || 0);
    els.link.href = data.url;
    render();
    els.result.hidden = false;
    document.title = `${data.title || '無題'} - U-FRET → ChordWiki`;
    const note = data.format === 'video' ? '（動画プラス形式のため段落区切りはありません）' : '';
    setStatus(`「${data.title}」を変換しました${note}`, 'ok');
    const params = new URLSearchParams({ url: value });
    history.replaceState(null, '', `?${params}`);
  } catch (e) {
    setStatus(e.message || '変換に失敗しました', 'error');
  } finally {
    els.submit.disabled = false;
  }
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  convert(els.url.value);
});

els.capo.addEventListener('change', render);
els.key.addEventListener('change', render);

els.print.addEventListener('click', () => window.print());

// ?url=… 付きで開かれたら自動で変換する(共有・ブックマーク用)
const initial = new URLSearchParams(location.search).get('url');
if (initial) {
  els.url.value = initial;
  convert(initial);
}
