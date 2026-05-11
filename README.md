# mock_exam

Cloudflare Workers/Pages を使用した資格試験学習プラットフォーム

## セットアップ手順

### 1. D1データベースの作成

```bash
wrangler d1 create mock_exam
```

### 2. wrangler.jsonc にデータベースIDを設定

上記コマンド実行後、出力された `database_id` を `wrangler.jsonc` の以下の部分に入力してください：

```json
"d1": {
  "bindings": [
    {
      "binding": "examDB",
      "database_name": "mock_exam",
      "database_id": "YOUR_DATABASE_ID_HERE"
    }
  ]
}
```

### 3. データベーススキーマの初期化

```bash
wrangler d1 execute mock_exam --file=./schema.sql
```

schema.sql の内容：

```sql
-- 問題テーブル
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  explanation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 選択肢テーブル
CREATE TABLE IF NOT EXISTS choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  choice_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_correct INTEGER DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_choices_question_id ON choices(question_id);
```

### 4. デプロイ

```bash
wrangler deploy
```

## ファイル構成

- `index.html` - メインページ（資格選択）
- `app.js` - メインページのロジック
- `style.css` - メインページのスタイル
- `question-import.html` - 問題インポートページ
- `question-import.js` - 問題インポートのロジック
- `question-import.css` - インポートページのスタイル
- `functions/api/questions/import.js` - 問題登録APIエンドポイント
- `wrangler.jsonc` - Cloudflare設定

## 機能

- 複数の資格試験を管理
- Excelファイルから一括で問題をインポート
- 問題と選択肢をデータベースに保存
- CORS対応のAPIエンドポイント