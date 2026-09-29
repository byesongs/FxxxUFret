// U-FRET の曲ページ(HTML)を取得・解析して、`[コード]歌詞` 形式の行配列に正規化する。
//
// U-FRET の曲ページには2種類の形式がある。
//  - 通常ページ: <script> 内の `var ufret_chord_datas = ["[C]歌詞…\r", …]` に原曲キーの譜面が入っている
//  - 動画プラス: 譜面がサーバー側で HTML 化されており、クラス名が難読化されている
//      <p class="xxxx" data-xxxx="行番号"><span>歌詞</span><span class="yyyy"><ruby><img …><rt>Dm</rt></ruby></span><span class="zzzz">歌詞</span>…</p>

const UFRET_ORIGIN = 'https://www.ufret.jp';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * 入力(URL または曲ID)から U-FRET の曲IDを取り出す。U-FRET 以外のURLは null。
 * 例: https://www.ufret.jp/song.php?data=1041 / ufret.jp/song.php?data=1041&x=1 / 1041
 */
export function extractSongId(input) {
  const s = String(input ?? '').trim();
  if (/^\d{1,9}$/.test(s)) return s;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (!/(^|\.)ufret\.jp$/i.test(url.hostname)) return null;
  const id = url.searchParams.get('data');
  return id && /^\d{1,9}$/.test(id) ? id : null;
}

export function songUrl(id) {
  return `${UFRET_ORIGIN}/song.php?data=${encodeURIComponent(id)}`;
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, '');
}

function cleanText(s) {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

/** `name = [ ... ]` の配列リテラルを、文字列内の括弧に惑わされずに切り出して JSON.parse する */
export function extractJsonArray(html, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*\\[`, 'g');
  let m;
  while ((m = re.exec(html))) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let inString = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) {
        try {
          const arr = JSON.parse(html.slice(start, i + 1));
          if (Array.isArray(arr)) return arr.map((x) => String(x));
        } catch {
          // 次の出現を試す
        }
        break;
      }
    }
  }
  return null;
}

/** 動画プラス形式の譜面HTMLを `[コード]歌詞` 形式の行配列にする */
export function parseVideoPlusLines(html) {
  const lines = [];
  // クラス名は難読化されているが「class と同名の data 属性に行番号」という構造は共通
  const re = /<p class="([A-Za-z][\w-]*)" data-\1="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    let inner = m[3].replace(/<ruby\b[\s\S]*?<rt\b[^>]*>([\s\S]*?)<\/rt>[\s\S]*?<\/ruby>/gi, (_, chord) => {
      const c = cleanText(chord);
      return c ? `\u0001${c}\u0002` : '';
    });
    inner = inner.replace(/<br\s*\/?>/gi, ' ');
    const text = decodeEntities(stripTags(inner));
    lines.push(text.replace(/\u0001/g, '[').replace(/\u0002/g, ']'));
  }
  return lines;
}

/** U-FRET の「簡単弾き」推奨設定(0=原曲, -N=Capo N, +1=半音下げ, +2=1音下げ) */
function parseRecommendedCapo(html) {
  let m = html.match(/<input[^>]*name="key_scrollbar"[^>]*>/);
  if (m) {
    const k = m[0].match(/data-kantan_key="([+-]?\d+)"/) || m[0].match(/\bvalue="([+-]?\d+)"/);
    if (k) return Number(k[1]);
  }
  m = html.match(/function\s+score_choice_guitar\s*\(\)\s*\{[^}]*?var\s+key\s*=\s*"([+-]?\d+)"/);
  if (m) return Number(m[1]);
  return 0;
}

function parseMeta(html) {
  let title = '';
  let artist = '';
  const h1 = html.match(/<h1[^>]*class="[^"]*p-detail-head__ttl[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
  if (h1) title = cleanText(h1[1].replace(/<span\b[\s\S]*?<\/span>/gi, ''));
  const a = html.match(/<a[^>]*class="[^"]*p-detail-head__artist[^"]*"[^>]*>([\s\S]*?)<\/a>/);
  if (a) artist = cleanText(a[1]);
  if (!title || !artist) {
    // <title>曲名 / アーティスト ギターコード/… - U-FRET</title>
    const t = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (t) {
      const mm = decodeEntities(t[1]).match(/^\s*(.*?)\s+\/\s+(.*?)\s+ギターコード/);
      if (mm) {
        title ||= mm[1].replace(/\s*\(動画プラス\)\s*$/, '').trim();
        artist ||= mm[2].trim();
      }
    }
  }
  let lyricist = '';
  let composer = '';
  const lyr = html.match(/<p[^>]*class="[^"]*p-detail-head__lyrics[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  if (lyr) {
    const l = lyr[1].match(/作詞\s*[:：]\s*<span>([\s\S]*?)<\/span>/);
    const c = lyr[1].match(/作曲\s*[:：]\s*<span>([\s\S]*?)<\/span>/);
    if (l) lyricist = cleanText(l[1]);
    if (c) composer = cleanText(c[1]);
  }
  return { title, artist, lyricist, composer };
}

/** 行配列の後始末: \r・BOM・行末空白を除去し、先頭/末尾/連続の空行を詰める */
export function cleanLines(rawLines) {
  const out = [];
  for (const raw of rawLines) {
    const line = String(raw)
      .replace(/[\ufeff\u200b\r\n]/g, '')
      .replace(/\t/g, ' ')
      .replace(/[ \u00a0]+$/, '');
    const blank = line.replace(/[\s\u3000]/g, '') === '';
    if (blank) {
      if (out.length && out[out.length - 1] !== '') out.push('');
    } else {
      out.push(line);
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

/** U-FRET の曲ページHTMLを解析する。譜面が見つからなければ lines は空配列 */
export function parseUfretHtml(html) {
  const meta = parseMeta(html);
  let format = 'standard';
  let raw = extractJsonArray(html, 'ufret_chord_datas');
  if (!raw || raw.length === 0) {
    format = 'video';
    raw = parseVideoPlusLines(html);
  }
  return {
    ...meta,
    format,
    recommendedCapo: parseRecommendedCapo(html),
    lines: cleanLines(raw),
  };
}

export class UfretError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** 曲IDからページを取得して解析する */
export async function fetchUfretSong(id, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const url = songUrl(id);
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ja,en;q=0.8', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new UfretError(`U-FRET に接続できませんでした (${e.name === 'TimeoutError' ? 'タイムアウト' : e.message})`, 502);
  }
  if (res.status === 404) throw new UfretError('曲が見つかりませんでした。URLを確認してください。', 404);
  if (!res.ok) throw new UfretError(`U-FRET からの応答がエラーでした (HTTP ${res.status})`, 502);
  const html = await res.text();
  const song = parseUfretHtml(html);
  if (song.lines.length === 0) {
    throw new UfretError('このページからコード譜を読み取れませんでした。曲ページのURLか確認してください。', 422);
  }
  return { id: String(id), url, ...song };
}
