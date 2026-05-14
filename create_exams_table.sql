-- exams テーブル作成
CREATE TABLE exams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100)
);

-- 既存データを挿入
INSERT INTO exams (id, name, description, icon) VALUES
(1, 'AWS Cloud Practitioner', 'AWSの基礎知識を問う入門資格。クラウド、セキュリティ、料金、サービスなど幅広く出題されます。', 'fa-cloud'),
(2, 'UMLモデリング技能認定 L2', 'クラス図、シーケンス図、オブジェクト指向設計などを学ぶ資格。', 'fa-diagram-project'),
(3, 'HTML5 Professional Level1', 'HTML/CSS/APIなどWebフロントエンド技術の基礎資格。', 'fa-code'),
(4, 'アジャイル開発技術者試験', 'スクラム、XP、反復開発などアジャイル開発手法を学ぶ資格。', 'fa-rotate');

-- questions テーブルに外部キー制約を追加（もしない場合）
-- ALTER TABLE questions ADD CONSTRAINT fk_exam_id FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;

-- choices テーブルに外部キー制約を追加（もしない場合）
-- ALTER TABLE choices ADD CONSTRAINT fk_question_id FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;