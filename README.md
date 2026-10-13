# mock_exam — 資格試験学習プラットフォーム

## 概要

資格試験の問題・選択肢を登録し、ブラウザで演習・復習・学習履歴の確認を行うWebアプリです。現行コードはSupabaseをデータ保存に使用し、Cloudflare Pages Functionsで画像からの問題抽出を行います。

## 主な機能

- 試験別の問題管理と演習。
- Excel・JSONからの問題取り込み。
- 問題・選択肢・解説の直接入力と編集。
- カメラ画像からの問題・選択肢・解説候補の抽出。
- 学習履歴の確認とスケジュール画面。

## 推奨要件

| 項目 | 環境 |
| --- | --- |
| 利用 | JavaScript対応の現行ブラウザ |
| 保存先 | Supabaseプロジェクトと必要なテーブル |
| 公開・開発 | Cloudflare Pages、Node.jsの現行LTS、Wrangler |
| 画像抽出 | Cloudflare Workers AIのAIバインディング |
| カメラ | カメラ権限を許可したHTTPS環境またはlocalhost |

## 必要なライブラリ

- Supabase JavaScript SDK：DBとの通信。
- SheetJS（XLSX）：Excelの読み取り。
- 各HTMLが読み込む表示用ライブラリ・フォント。
- Wrangler：Cloudflareでのローカル実行・公開。

通常のフロントエンドビルドは不要です。読み込むCDNライブラリは各HTMLのscriptタグを参照してください。

## 使い方

### DBと接続設定

1. Supabaseに`questions`、`choices`、`exam_histories`など、各画面が利用するテーブルを準備します。
2. `supabase-config.json`を次の形式で設定します。

```json
{
  "supabase": {
    "url": "https://YOUR_PROJECT.supabase.co",
    "key": "YOUR_PUBLIC_ANON_KEY"
  }
}
```

3. RLSで必要な読み書きを許可します。ブラウザへ配信するため、管理用service_roleキーを設定しないでください。

本リポジトリにはDB初期化用のSQLファイルが含まれていません。既存DBの定義を利用するか、各JavaScriptの保存・取得項目に合わせてテーブルを作成してください。

### ローカル起動と公開

静的画面の確認だけならルートで次を実行します。

```bash
python -m http.server 8000
```

`http://localhost:8000/`を開きます。画像抽出APIも使う場合はPages Functionsが動く環境を使います。

```bash
npx wrangler pages dev .
```

公開する場合は、Cloudflare Pagesのプロジェクトでルートの静的ファイルと`functions/`を配信し、`AI`バインディングを設定します。CLIを使う場合は、接続先プロジェクトを確認して次を実行します。

```bash
npx wrangler pages deploy . --project-name YOUR_PAGES_PROJECT
```

### 問題の取り込み・学習

1. 問題取り込み画面を開き、試験カテゴリとファイルを指定します。
2. プレビューと検証ログを確認して登録します。
3. トップ画面で試験を選び、演習を開始します。
4. 問題編集・学習履歴・スケジュール画面で内容と進捗を確認します。

Excelは先頭シートを読み取り、次の列を使用します。`example/test.xlsx`も参照してください。

| 列 | 内容 |
| --- | --- |
| `category` | 試験カテゴリ。必須 |
| `question` | 問題文。必須 |
| `choices` | カンマ区切りの選択肢。2個以上 |
| `answers` | 1始まりの正解番号。複数の場合はカンマ区切り |
| `explanation` | 解説。任意 |

JSONは取り込み画面の検証に合わせた構造を使用してください。画像抽出はJPEG・PNG・WebP、最大5 MBに対応します。抽出結果は候補なので、問題文・選択肢と正解を確認してから登録します。

## フォルダ構成

| 相対パス | 役割 |
| --- | --- |
| `index.html / index.js / index.css` | 試験一覧とトップ画面 |
| `study.*` | 演習画面 |
| `study-history.*` | 学習履歴 |
| `question-import.*` | ファイル・直接入力・画像からの取り込み |
| `question-editor.*` | 問題一覧の編集 |
| `question-single-editor.*` | 個別問題編集 |
| `schedule/` | 学習スケジュール |
| `functions/api/ocr/extract.js` | 画像抽出API |
| `example/` | 入力サンプル |
| `supabase-config.json` | Supabase接続先 |
| `wrangler.jsonc` | CloudflareとAIバインディング設定 |

## 仕組み

問題を`questions`、選択肢を`choices`へ登録し、演習画面が読み込みます。学習履歴をDBに保存して振り返りに使います。画像抽出は`POST /api/ocr/extract`へ画像を送り、Workers AIの応答を問題候補へ整形します。

## 確認とトラブル対処

- 問題が表示されない：接続設定、テーブル・列、RLSとブラウザのNetworkを確認します。
- Excel取り込み失敗：先頭シートの必須列、正解番号、カンマ区切りを確認します。
- 画像抽出が404：Pages Functionsを配信しているか確認します。
- 画像抽出が500 / 502：`AI`バインディング、利用モデルの応答、画像サイズを確認します。
- 初回導入時は、サンプル取り込み→演習→履歴表示まで一通り確認してください。
