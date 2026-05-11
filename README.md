# mock_exam

Cloudflare Pages + Supabase を使用した資格試験学習プラットフォーム

## セットアップ手順

### 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com) にアクセスしてプロジェクトを作成
2. 新しいプロジェクトのデータベース（PostgreSQL）を初期化

### 2. データベーススキーマの作成

SupabaseのSQLエディタで以下のSQLを実行：

```sql
-- 問題テーブル
CREATE TABLE questions (
  id BIGSERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  category VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 選択肢テーブル
CREATE TABLE choices (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_correct INTEGER DEFAULT 0
);

-- インデックス
CREATE INDEX idx_questions_exam_id ON questions(exam_id);
CREATE INDEX idx_choices_question_id ON choices(question_id);

-- RLSポリシー（すべてのユーザーで読み取り・書き込み許可）
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on questions" ON questions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on choices" ON choices
  FOR ALL USING (true) WITH CHECK (true);
```

### 3. 環境変数の設定

`.env.production` ファイルを作成して、以下を入力：

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

または、Cloudflare Pages設定画面で環境変数を設定してください。

### 4. デプロイ

```bash
wrangler pages deploy
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