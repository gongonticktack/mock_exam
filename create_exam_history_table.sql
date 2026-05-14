-- exam_histories テーブル作成
-- 学習履歴と正答率を保存し、トップ画面で表示するために使用します。
CREATE TABLE exam_histories (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL,
  activity TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  result_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 例: テストデータ
INSERT INTO exam_histories (exam_id, activity, correct_count, total_count, result_rate, details) VALUES
(1, 'EC2 インスタンスの基本', 8, 10, 80, '模擬問題セッション'),
(1, 'IAM ユーザーとグループ', 9, 10, 90, '理解度チェック'),
(2, 'クラス図の記法', 7, 10, 70, '演習問題'),
(3, 'HTML5の新要素', 8, 10, 80, '復習テスト');