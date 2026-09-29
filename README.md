# U-FRET → ChordWiki 表示

U-FRET の曲ページを **ChordWiki のレイアウト**で表示するツールです。2つの形で使えます。

| | 使い方 | 他の人への配布 |
| --- | --- | --- |
| **ブックマークレット / ユーザースクリプト**（`bookmarklet/`） | U-FRET の曲ページでブックマークを押すと、その場で ChordWiki レイアウトの画面が重なって表示される | 配布ページ（静的HTML）を GitHub Pages などに置くだけ |
| **変換サイト**（`server.js` + `public/`） | 自分の PC で起動し、URL を貼って変換する | しない（自分専用） |

どちらも、カポ（U-FRET の「★簡単弾き」が初期値）・移調・印刷ができます。表示専用のツールで、歌詞やコード譜をテキストとして書き出したり、編集したりする機能はありません。

> [!IMPORTANT]
> **利用は自己責任でお願いします。** このツールは U-FRET・ChordWiki とは関係のない非公式ツールです。
> 利用によって生じたいかなる損害やトラブル（U-FRET の利用規約上の問題を含みます）についても、作者は責任を負いません。

## ブックマークレット版（配布用）

譜面は、利用者のブラウザが開いている U-FRET のページから読み取るだけです。どこのサーバーも経由しないので、こちらで歌詞を保存・配信することはありません。

### ビルド

Node.js 18 以上が必要です。依存パッケージはありません。

```bash
npm run build
```

`dist/` に次のファイルが出力されます。

| ファイル | 内容 |
| --- | --- |
| `index.html` | 配布ページ（導入方法、ブックマークレット、架空の曲でのデモ） |
| `bookmarklet.txt` | ブックマークレット本体（`javascript:…`） |
| `ufret2cw.user.js` | ユーザースクリプト（Tampermonkey / Violentmonkey / iOS の Userscripts 用） |
| `ufret2cw.js` | 本体スクリプト（読みやすい形のまま） |

配布ページの見た目は `npm run build` のあと `node scripts/serve-dist.mjs` を実行し、http://localhost:3001/ で確認できます。

### GitHub Pages で公開する

1. GitHub にリポジトリを作り、このフォルダを push する（`dist/` と `.mcp.json` は `.gitignore` 済み）
2. リポジトリの **Settings → Pages → Source** を **GitHub Actions** にする
3. main に push するたびに [.github/workflows/pages.yml](.github/workflows/pages.yml) がテストとビルドを実行し、`https://<ユーザー名>.github.io/<リポジトリ名>/` に配布ページを公開する

ユーザースクリプトには公開 URL が自動更新先として書き込まれるので、導入した人には更新が自動で届きます。
ブックマークレットは自動では更新されません。更新したら、配布ページから登録し直してもらってください。

## 変換サイト版（自分専用）

```bash
npm start
```

http://localhost:3000/ を開き、`https://www.ufret.jp/song.php?data=1234` のような URL を貼って「変換」を押します。
曲 ID だけ（`1234`）でも変換できます。`/?url=<U-FRETのURL>` で開くと自動で変換されます。
同じ Wi-Fi のスマホから使うときは、`HOST=0.0.0.0` を指定して起動してください。

このサーバーは U-FRET の歌詞を取得して配信するので、インターネットには公開しないでください。

## レイアウト

ChordWiki 本家（`ja.chordwiki.org/style.css`）と同じマークアップと見た目で描画します。使う要素は `h1.title` / `h2.subtitle` / `p.key` / `p.line` / `span.chord` / `span.word` で、空行は `<br>` です。コードは青く小さめの文字で、歌詞の流れの中に置いて持ち上げます。

本家の方式は、狭い画面で行が折り返したときにコードが上の段の歌詞に重なったり、コードだけが行末に取り残されたりします。そこで次の補強を加えています（[public/chordwiki.css](public/chordwiki.css)）。

- 行の高さを「コード1段＋歌詞1段」分確保し、折り返した段のコードが上の歌詞に重ならないようにする
- コードと直後の1文字をまとめて改行させず、コードが歌詞から離れないようにする
- コードに最小幅を持たせ、コードの下へ寄せた歌詞が前の歌詞に食い込まないようにする
- 長い単語やコードだけの長い行も折り返し、枠からはみ出さないようにする
- 折り返した2段目以降をぶら下げインデントにし、左へ寄せた歌詞の頭を1段目の行頭と揃える

## テストと崩れの確認

```bash
npm test
```

合成データで次の内容をテストします。

- U-FRET ページの解析（通常ページ・動画プラス）
- コードの移調と表記
- ChordWiki 形式の生成と描画
- HTML エスケープ
- ビルド結果（ブックマークレットが復元・実行できるか、ユーザースクリプトのヘッダー、配布ページ）

画面上のレイアウトは、変換サイトの起動中に次のページで実寸検査できます。

- http://localhost:3000/selftest.html — 崩れやすい要素を詰め込んだ合成ケース
- http://localhost:3000/selftest.html?ids=1041,1057,177888 — U-FRET の実曲も、原曲キーと簡単弾きカポの両方で検査

判定する項目は次の5つで、`getClientRects` の実測値を使います（[public/layout-check.js](public/layout-check.js)）。

- コード同士の重なり
- コードと歌詞・コメントの重なり
- コードが対応する歌詞の真上にあるか
- コードの並び順
- 枠からのはみ出し・横スクロール

変換サイトではコンソールで `cwLayoutCheck()` を実行すると同じ検査ができます。ブックマークレット版では `document.querySelector('ufret2cw-overlay').cwLayoutCheck()` です。

## 構成

| ファイル | 役割 |
| --- | --- |
| [lib/ufret.js](lib/ufret.js) | U-FRET ページの解析。通常ページは `ufret_chord_datas`、動画プラスは難読化 HTML から `[コード]歌詞` の行配列を取り出す |
| [public/chordwiki.js](public/chordwiki.js) | ChordWiki 形式の生成・解析・描画、移調 |
| [public/chordwiki.css](public/chordwiki.css) | ChordWiki レイアウト |
| [public/layout-check.js](public/layout-check.js) | レイアウト崩れの実測検査 |
| [bookmarklet/overlay.js](bookmarklet/overlay.js) | ブックマークレット / ユーザースクリプトの本体（Shadow DOM で U-FRET のページに重ねて表示） |
| [bookmarklet/install.html](bookmarklet/install.html) | 配布ページのテンプレート |
| [scripts/build.mjs](scripts/build.mjs) | 上記をまとめて `dist/` に出力する小さなビルドスクリプト |
| [server.js](server.js) / [public/app.js](public/app.js) | 変換サイト版 |

## 注意

- U-FRET のページ構造に依存しています。U-FRET 側の仕様変更で読み取れなくなることがあります。
- 動画プラスの曲は元データに段落区切りがないため、空行なしで表示されます。
- U-FRET の利用規約は、外部ツールの利用・作成・頒布（第12条12号）などを禁止しています。このツールの利用・配布は自己責任で行ってください。
- 歌詞・コード譜の著作権は各権利者にあります。個人での閲覧・練習の範囲で使ってください。
