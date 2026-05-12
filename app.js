// ======================================
// 資格データ
// ======================================

const exams = [

  {
    id: 1,
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
    id: 2,
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
    id: 3,
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
    id: 4,
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

// exam card に exam id を紐づけ
examCards.forEach((card, index) => {
  card.dataset.examId = exams[index].id;
  card.dataset.examShortName = exams[index].shortName;
});

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

    console.log('Exam card clicked - index:', index, 'examId:', exams[index].id, 'examName:', exams[index].shortName);

    // 更新
    updateExam(index);

  });

});

// ======================================
// 問題追加ボタン
// ======================================

// ボタン取得
const importButton =
  document.querySelector(".import-btn");

// クリックイベント
importButton.addEventListener("click", () => {

  // 現在activeの資格取得
  const activeCard =
    document.querySelector(".exam-card.active");

  // 資格ID / 資格名取得
  const selectedExamId = Number(activeCard.dataset.examId);
  const selectedExam =
    activeCard.dataset.examShortName;

  console.log('Import button clicked - selectedExamId:', selectedExamId, 'selectedExam:', selectedExam);

  // LocalStorage保存
  localStorage.setItem(
    "selectedExamId",
    selectedExamId
  );
  localStorage.setItem(
    "selectedExam",
    selectedExam
  );

  // 登録ページへ移動
  window.location.href =
    "question-import.html";

});

// ======================================
// 学習開始ボタン
// ======================================

// ボタン取得
const startButton =
  document.querySelector(".start-btn");

// クリックイベント
startButton.addEventListener("click", () => {

  // 現在activeの資格取得
  const activeCard =
    document.querySelector(".exam-card.active");

  // 資格ID / 資格名取得
  const selectedExamId = Number(activeCard.dataset.examId);
  const selectedExam =
    activeCard.dataset.examShortName;

  console.log('Start button clicked - selectedExamId:', selectedExamId, 'selectedExam:', selectedExam, 'activeCard.dataset:', activeCard.dataset);

  // LocalStorage保存
  localStorage.setItem(
    "selectedExamId",
    selectedExamId
  );
  localStorage.setItem(
    "selectedExam",
    selectedExam
  );

  // 前回学習していた問題インデックスを取得（ない場合は0）
  const lastExamId = Number(localStorage.getItem("lastStudyExamId")) || 0;
  const lastQuestionIndex = Number(localStorage.getItem("lastQuestionIndex")) || 0;
  const startIndex = lastExamId === selectedExamId ? lastQuestionIndex : 0;

  // 学習ページへ移動
  window.location.href =
    `study.html?examId=${selectedExamId}&questionIndex=${startIndex}`;

});

// ======================================
// 初期表示
// ======================================

updateExam(0);

// ======================================
// エラーハンドラー設定
// ======================================

window.onerror = function(message, source, lineno, colno, error) {
  const errorLog = document.getElementById('error-log');
  if (errorLog) {
    const errorMsg = `${new Date().toLocaleString()}: ERROR: ${message} at ${source}:${lineno}:${colno}`;
    const p = document.createElement('p');
    p.textContent = errorMsg;
    errorLog.appendChild(p);
    errorLog.style.display = 'block';
  }
};

// ======================================
// console.logをオーバーライドしてHTMLにも表示
// ======================================

const originalConsoleLog = console.log;
console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  const errorLog = document.getElementById('error-log');
  if (errorLog) {
    const msg = args.join(' ');
    const p = document.createElement('p');
    p.textContent = `${new Date().toLocaleString()}: LOG: ${msg}`;
    errorLog.appendChild(p);
    errorLog.style.display = 'block';
  }
};