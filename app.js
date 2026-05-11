// ======================================
// 資格データ
// ======================================

const exams = [

  {
    shortName: "AWS CCP",

    title: "AWS Cloud Practitioner",

    description:
      "AWSの基礎知識を問う入門資格。クラウド、セキュリティ、料金、サービスなど幅広く出題されます。",

    stats: {

      questions: 320,
      accuracy: "78%",
      studyTime: "18時間",
      studyDays: "12日"

    }

  },

  {
    shortName: "UML L2",

    title: "UMLモデリング技能認定 L2",

    description:
      "クラス図、シーケンス図、オブジェクト指向設計などを学ぶ資格。",

    stats: {

      questions: 180,
      accuracy: "61%",
      studyTime: "9時間",
      studyDays: "5日"

    }

  },

  {
    shortName: "HTML5 L1",

    title: "HTML5 Professional Level1",

    description:
      "HTML/CSS/APIなどWebフロントエンド技術の基礎資格。",

    stats: {

      questions: 250,
      accuracy: "83%",
      studyTime: "14時間",
      studyDays: "10日"

    }

  },

  {
    shortName: "アジャイル",

    title: "アジャイル開発技術者試験",

    description:
      "スクラム、XP、反復開発などアジャイル開発手法を学ぶ資格。",

    stats: {

      questions: 90,
      accuracy: "92%",
      studyTime: "5時間",
      studyDays: "3日"

    }

  }

];

// ======================================
// HTML取得
// ======================================

const examCards =
  document.querySelectorAll(".exam-card");

const examTitle =
  document.getElementById("exam-title");

const examDescription =
  document.getElementById("exam-description");

const statQuestions =
  document.getElementById("stat-questions");

const statAccuracy =
  document.getElementById("stat-accuracy");

const statStudyTime =
  document.getElementById("stat-study-time");

const statStudyDays =
  document.getElementById("stat-study-days");

// ======================================
// 画面更新
// ======================================

function updateExam(index) {

  // 対象資格
  const exam = exams[index];

  // タイトル
  examTitle.textContent =
    exam.title;

  // 説明
  examDescription.textContent =
    exam.description;

  // ステータス
  statQuestions.textContent =
    `${exam.stats.questions}問`;

  statAccuracy.textContent =
    exam.stats.accuracy;

  statStudyTime.textContent =
    exam.stats.studyTime;

  statStudyDays.textContent =
    exam.stats.studyDays;

}

// ======================================
// 資格クリック
// ======================================

examCards.forEach((card, index) => {

  card.addEventListener("click", () => {

    // active削除
    examCards.forEach((c) => {

      c.classList.remove("active");

    });

    // active追加
    card.classList.add("active");

    // 更新
    updateExam(index);

  });

});

// ======================================
// 初期表示
// ======================================

updateExam(0);