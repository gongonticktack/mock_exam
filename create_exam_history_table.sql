-- exam_histories テーブルの既存テーブルに列を追加します
-- 既にテーブルが存在する場合、この ALTER TABLE を実行してください。
ALTER TABLE exam_histories
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS study_time_seconds,
  ADD COLUMN IF NOT EXISTS question_id INTEGER,
  ADD COLUMN IF NOT EXISTS exam_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_correct BOOLEAN NOT NULL DEFAULT false;

-- 例: テストデータ（必要に応じて挿入してください）
INSERT INTO exam_histories (exam_id, question_id, exam_started_at, answered_at, activity, correct_count, total_count, is_correct, result_rate, details) VALUES
(1, 1, '2026-05-01T09:00:00Z', '2026-05-01T09:03:00Z', 'EC2 インスタンスの基本', 1, 1, true, 100, '模擬問題セッション'),
(1, 2, '2026-05-01T09:00:00Z', '2026-05-01T09:07:00Z', 'IAM ユーザーとグループ', 1, 1, true, 100, '理解度チェック'),
(2, 3, '2026-05-02T14:10:00Z', '2026-05-02T14:16:00Z', 'クラス図の記法', 0, 1, false, 0, '演習問題'),
(3, 4, '2026-05-03T11:30:00Z', '2026-05-03T11:34:00Z', 'HTML5の新要素', 1, 1, true, 100, '復習テスト');