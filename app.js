// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================

let supabaseClient = null;

function initSupabase() {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.key) {
    console.warn('Supabase設定が不正です。DB機能が使用できません');
    return false;
  }
  supabaseClient = window.supabase.createClient(config.url, config.key);
  return true;
}

// Supabase初期化
initSupabase();

// ======================================
// 問題数をDBから取得
// ======================================

async function fetchQuestionCount(examId) {
  if (!supabaseClient) {
    return null;
  }
  try {
    const { count, error } = await supabaseClient
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', examId);
    
    if (error) {
      console.error('問題数取得エラー:', error);
      return null;
    }
    return count;
  } catch (error) {
    console.error('問題数取得中にエラー発生:', error);
    return null;
  }
}

async function fetchExamHistory(examId, limit = 3) {
  if (!supabaseClient) {
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('exam_histories')
      .select('*')
      .eq('exam_id', examId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('学習履歴取得エラー:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('学習履歴取得中にエラー発生:', error);
    return [];
  }
}

async function fetchExamAccuracy(examId) {
  if (!supabaseClient) {
    return null;
  }

  try {
    const { data, error } = await supabaseClient
      .from('exam_histories')
      .select('correct_count,total_count')
      .eq('exam_id', examId);

    if (error) {
      console.error('正答率取得エラー:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const totalCorrect = data.reduce((sum, item) => sum + (item.correct_count || 0), 0);
    const totalCount = data.reduce((sum, item) => sum + (item.total_count || 0), 0);

    if (totalCount === 0) {
      return null;
    }

    return Math.round((totalCorrect / totalCount) * 100);
  } catch (error) {
    console.error('正答率計算中にエラー発生:', error);
    return null;
  }
}

// ======================================
// 📚 資格（試験）データ
// ======================================

const exams = [
  {
    id: 1,
    shortName: "AWS CCP",
    title: "AWS Cloud Practitioner",
    description: "AWSの基礎知識を問う入門資格。クラウド、セキュリティ、料金、サービスなど幅広く出題されます。",
    icon: "fa-cloud",
    stats: { questions: 320, accuracy: "78%", studyTime: "18時間", studyDays: "12日" },
    history: ["EC2 インスタンスの基本", "IAM ユーザーとグループ", "S3 ストレージの仕組み"],
    weakness: [{ name: "IAM", rate: "45%" }, { name: "VPC", rate: "55%" }, { name: "セキュリティ", rate: "60%" }]
  },
  {
    id: 2,
    shortName: "UML L2",
    title: "UMLモデリング技能認定 L2",
    description: "クラス図、シーケンス図、オブジェクト指向設計などを学ぶ資格。",
    icon: "fa-diagram-project",
    stats: { questions: 180, accuracy: "61%", studyTime: "9時間", studyDays: "5日" },
    history: ["クラス図の記法", "シーケンス図の作成", "ユースケース図"],
    weakness: [{ name: "シーケンス図", rate: "40%" }, { name: "ステートマシン", rate: "50%" }, { name: "コンポーネント図", rate: "65%" }]
  },
  {
    id: 3,
    shortName: "HTML5 L1",
    title: "HTML5 Professional Level1",
    description: "HTML/CSS/APIなどWebフロントエンド技術の基礎資格。",
    icon: "fa-code",
    stats: { questions: 250, accuracy: "83%", studyTime: "14時間", studyDays: "10日" },
    history: ["HTML5の新要素", "CSS Flexbox", "JavaScript DOM操作"],
    weakness: [{ name: "Canvas API", rate: "35%" }, { name: "Web Storage", rate: "45%" }, { name: "Geolocation", rate: "55%" }]
  },
  {
    id: 4,
    shortName: "アジャイル",
    title: "アジャイル開発技術者試験",
    description: "スクラム、XP、反復開発などアジャイル開発手法を学ぶ資格。",
    icon: "fa-rotate",
    stats: { questions: 90, accuracy: "92%", studyTime: "5時間", studyDays: "3日" },
    history: ["スクラムの役割", "XPのプラクティス", "アジャイルマニフェスト"],
    weakness: [{ name: "テスト駆動開発", rate: "30%" }, { name: "継続的インテグレーション", rate: "40%" }, { name: "ペアプログラミング", rate: "50%" }]
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

const heroIcon =
  document.querySelector(".hero-icon");

const historyList =
  document.querySelector(".history-card ul");

const weaknessItems =
  document.querySelectorAll(".weak-item");

// ======================================
// 画面更新
// ======================================

async function updateExam(index) {

  // 対象資格
  const exam = exams[index];

  // タイトル
  examTitle.textContent =
    exam.title;

  // 説明
  examDescription.textContent =
    exam.description;

  // アイコン
  heroIcon.className = `fa-solid ${exam.icon} hero-icon`;

  // 問題数をDBから取得して更新
  const dbQuestionCount = await fetchQuestionCount(exam.id);
  const displayQuestionCount = dbQuestionCount !== null ? dbQuestionCount : exam.stats.questions;

  // ステータス
  statQuestions.textContent =
    `${displayQuestionCount}問`;

  const dbAccuracy = await fetchExamAccuracy(exam.id);
  statAccuracy.textContent =
    dbAccuracy !== null ? `${dbAccuracy}%` : exam.stats.accuracy;

  statStudyTime.textContent =
    exam.stats.studyTime;

  statStudyDays.textContent =
    exam.stats.studyDays;

  // 学習履歴
  historyList.innerHTML = "";
  const historyItems = await fetchExamHistory(exam.id);

  if (historyItems.length > 0) {
    historyItems.forEach(item => {
      const li = document.createElement("li");
      const date = new Date(item.created_at).toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit'
      });
      li.textContent = `${date}：${item.activity}${item.result_rate !== null && item.result_rate !== undefined ? `（${item.result_rate}%）` : ''}`;
      historyList.appendChild(li);
    });
  } else if (exam.history && exam.history.length > 0) {
    exam.history.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      historyList.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = '学習履歴はまだありません';
    historyList.appendChild(li);
  }

  // 苦手分野
  weaknessItems.forEach((item, i) => {
    if (exam.weakness[i]) {
      item.querySelector("span:first-child").textContent = exam.weakness[i].name;
      item.querySelector("span:last-child").textContent = exam.weakness[i].rate;
    }
  });

  // localStorage に選択中の資格を保存
  localStorage.setItem("selectedExamId", exam.id);
  localStorage.setItem("selectedExam", exam.shortName);

}

// ======================================
// 資格クリック
// ======================================

examCards.forEach((card, index) => {

  card.addEventListener("click", async () => {

    // active削除
    examCards.forEach((c) => {

      c.classList.remove("active");

    });

    // active追加
    card.classList.add("active");

    // 👆 クリックされた試験の情報をメイン表示に反映
    // 更新
    await updateExam(index);

    // 選択中の資格を保存しておく
    localStorage.setItem("selectedExamId", exams[index].id);
    localStorage.setItem("selectedExam", exams[index].shortName);

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
  let selectedExamId = activeCard ? Number(activeCard.dataset.examId) : NaN;
  let selectedExam = activeCard ? activeCard.dataset.examShortName : null;

  if (!selectedExamId || Number.isNaN(selectedExamId)) {
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 1;
  }
  if (!selectedExam) {
    selectedExam = localStorage.getItem("selectedExam") || "AWS CCP";
  }

  // 🔄 ブラウザ保存の機能を使って選択情報を保持
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
  let selectedExamId = activeCard ? Number(activeCard.dataset.examId) : NaN;
  let selectedExam = activeCard ? activeCard.dataset.examShortName : null;

  // fallback: localStorage に保存されているものを使う
  if (!selectedExamId || Number.isNaN(selectedExamId)) {
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 1;
  }
  if (!selectedExam) {
    selectedExam = localStorage.getItem("selectedExam") || "AWS CCP";
  }

  // 📖 学習ページへ移動 - URLパラメータで試験情報を渡します
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
    `study.html?examId=${selectedExamId}&selectedExam=${encodeURIComponent(selectedExam)}&questionIndex=${startIndex}`;

});

// ======================================
// 問題編集ボタン
// ======================================

// ボタン取得
const editButton =
  document.querySelector(".edit-btn");

// クリックイベント
editButton.addEventListener("click", () => {

  // 現在activeの資格取得
  const activeCard =
    document.querySelector(".exam-card.active");

  // 資格ID / 資格名取得
  let selectedExamId = activeCard ? Number(activeCard.dataset.examId) : NaN;
  let selectedExam = activeCard ? activeCard.dataset.examShortName : null;

  // fallback: localStorage に保存されているものを使う
  if (!selectedExamId || Number.isNaN(selectedExamId)) {
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 1;
  }
  if (!selectedExam) {
    selectedExam = localStorage.getItem("selectedExam") || "AWS CCP";
  }

  // LocalStorage保存
  localStorage.setItem(
    "selectedExamId",
    selectedExamId
  );
  localStorage.setItem(
    "selectedExam",
    selectedExam
  );

  // 編集ページへ移動
  window.location.href =
    `question-editor.html?examId=${selectedExamId}&selectedExam=${encodeURIComponent(selectedExam)}`;

});


// 🎯 ページロード時の初期処理
// ======================================

// 最初に表示する試験（AWS CCP：id=0）
(async () => {
  await updateExam(0);
})();