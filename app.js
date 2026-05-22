// ======================================
// app.js
// ======================================
// トップページ（index.html）を動かすためのファイルです。
//
// 主な役割:
// 1. Supabase（クラウドDB）へ接続する
// 2. 資格ごとの問題数・正答率・学習履歴を取得する
// 3. ユーザーが選んだ資格を localStorage に保存する
// 4. 「学習開始」「問題追加」「問題編集」ページへ遷移する
//
// 初心者向けメモ:
// - async function は、DB通信など時間がかかる処理を待てる関数です。
// - localStorage は、ブラウザ内に小さな設定値を保存する場所です。
// - Supabase の .from('table') は、どのテーブルを見るかを指定しています。

// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================

let supabaseClient = null;
const TOP_HISTORY_ACTIVITY_MAX_LENGTH = 80;

function stripMediaMarkup(text) {
  return String(text || '').replace(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, '[画像]');
}

function truncateText(text, maxLength) {
  const normalized = stripMediaMarkup(text).replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

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
  // 指定された資格ID（examId）に紐づく問題数だけをDBから数えます。
  // head: true を使うと、行データ本体を取らずに件数だけ取得できます。
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
  // トップ画面の「最近の学習履歴」に表示するため、
  // 新しい回答履歴から limit 件だけ取得します。
  if (!supabaseClient) {
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('exam_histories')
      .select('*')
      .eq('exam_id', examId)
      .order('answered_at', { ascending: false })
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
  // 正答率を計算します。
  // 古いDB形式（correct_count / total_count）と新しいDB形式（is_correct）の両方に対応しています。
  if (!supabaseClient) {
    return null;
  }

  try {
    let data;
    let error;
    let result = null;

    ({ data, error } = await supabaseClient
      .from('exam_histories')
      .select('is_correct')
      .eq('exam_id', examId));

    if (error) {
      console.warn('is_correct取得エラー、legacy schemaを試行します:', error.message || error);
      ({ data, error } = await supabaseClient
        .from('exam_histories')
        .select('correct_count,total_count')
        .eq('exam_id', examId));

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

      result = Math.round((totalCorrect / totalCount) * 100);
    } else {
      if (!data || data.length === 0) {
        return null;
      }

      const totalCorrect = data.reduce((sum, item) => sum + (item.is_correct ? 1 : 0), 0);
      const totalCount = data.length;

      if (totalCount === 0) {
        return null;
      }

      result = Math.round((totalCorrect / totalCount) * 100);
    }

    return result;
  } catch (error) {
    console.error('正答率計算中にエラー発生:', error);
    return null;
  }
}

async function fetchExamSummary(examId) {
  // 問題数・正答率・学習時間・学習日数をまとめて計算します。
  // トップページの統計カードに表示する値を作る関数です。
  if (!supabaseClient) {
    return null;
  }

  try {
    let data;
    let error;
    let useLegacy = false;

    ({ data, error } = await supabaseClient
      .from('exam_histories')
      .select('is_correct,answered_at,exam_started_at')
      .eq('exam_id', examId));

    if (error) {
      console.warn('学習サマリー取得でis_correct列が見つかりません。legacy schemaを試行します:', error.message || error);
      useLegacy = true;
      ({ data, error } = await supabaseClient
        .from('exam_histories')
        .select('correct_count,total_count,answered_at,exam_started_at')
        .eq('exam_id', examId));
    }

    if (error) {
      console.error('学習サマリー取得エラー:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const totalCorrect = data.reduce((sum, item) => sum + (useLegacy ? (item.correct_count || 0) : (item.is_correct ? 1 : 0)), 0);
    const totalCount = useLegacy ? data.reduce((sum, item) => sum + (item.total_count || 0), 0) : data.length;
    const studyDays = new Set(
      data
        .map(item => item.answered_at)
        .filter(Boolean)
        .map(ts => new Date(ts).toISOString().slice(0, 10))
    ).size;

    const sessions = data.reduce((acc, item) => {
      if (!item.exam_started_at || !item.answered_at) {
        return acc;
      }
      const startTime = new Date(item.exam_started_at).getTime();
      const answeredTime = new Date(item.answered_at).getTime();
      const sessionKey = item.exam_started_at;
      if (!acc[sessionKey] || acc[sessionKey].lastAnswered < answeredTime) {
        acc[sessionKey] = { startTime, lastAnswered: answeredTime };
      }
      return acc;
    }, {});

    const totalSeconds = Object.values(sessions).reduce(
      (sum, session) => sum + Math.max(0, (session.lastAnswered - session.startTime) / 1000),
      0
    );

    return {
      accuracy: totalCount === 0 ? null : Math.round((totalCorrect / totalCount) * 100),
      study_time: totalSeconds > 0 ? `${Math.ceil(totalSeconds / 3600)}時間` : null,
      study_days: studyDays > 0 ? `${studyDays}日` : null
    };
  } catch (error) {
    console.error('学習サマリー計算中にエラー発生:', error);
    return null;
  }
}

function getHistoryResultCounts(item) {
  if (typeof item.is_correct === 'boolean') {
    return {
      correctCount: item.is_correct ? 1 : 0,
      totalCount: 1
    };
  }

  if (item.is_correct === 'true' || item.is_correct === 'false') {
    return {
      correctCount: item.is_correct === 'true' ? 1 : 0,
      totalCount: 1
    };
  }

  if (item.is_correct === 1 || item.is_correct === 0 || item.is_correct === '1' || item.is_correct === '0') {
    return {
      correctCount: item.is_correct === 1 || item.is_correct === '1' ? 1 : 0,
      totalCount: 1
    };
  }

  const hasLegacyTotal = item.total_count !== null && item.total_count !== undefined && item.total_count !== '';
  const hasLegacyCorrect = item.correct_count !== null && item.correct_count !== undefined && item.correct_count !== '';
  const legacyTotal = Number(item.total_count);
  const legacyCorrect = Number(item.correct_count);

  if (hasLegacyTotal && Number.isFinite(legacyTotal) && legacyTotal > 0) {
    return {
      correctCount: hasLegacyCorrect && Number.isFinite(legacyCorrect) ? legacyCorrect : 0,
      totalCount: legacyTotal
    };
  }

  if (hasLegacyCorrect && Number.isFinite(legacyCorrect)) {
    return {
      correctCount: legacyCorrect,
      totalCount: 1
    };
  }

  const hasResultRate = item.result_rate !== null && item.result_rate !== undefined && item.result_rate !== '';
  const resultRate = Number(item.result_rate);

  if (hasResultRate && Number.isFinite(resultRate)) {
    return {
      correctCount: resultRate >= 100 ? 1 : 0,
      totalCount: 1
    };
  }

  return {
    correctCount: 0,
    totalCount: 0
  };
}

async function fetchExamWeaknesses(examId) {
  // 直近1週間の回答データを見て、カテゴリごとの不正解率を計算します。
  // exam_histories に question_id があれば questions テーブルからカテゴリを引きます。
  if (!supabaseClient) {
    return [];
  }

  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const selectAttempts = [
      'question_id,activity,is_correct,correct_count,total_count,result_rate',
      'question_id,activity,is_correct',
      'question_id,activity,correct_count,total_count,result_rate',
      'activity,is_correct,correct_count,total_count,result_rate',
      'activity,is_correct',
      'activity,correct_count,total_count,result_rate'
    ];

    let data = null;
    let error = null;

    for (const columns of selectAttempts) {
      ({ data, error } = await supabaseClient
        .from('exam_histories')
        .select(columns)
        .eq('exam_id', examId)
        .gte('answered_at', oneWeekAgo.toISOString()));

      if (!error) {
        break;
      }
    }

    if (error) {
      console.error('苦手分野取得エラー:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const questionIds = [...new Set(data.map(item => item.question_id).filter(Boolean))];
    const categoryMap = {};

    if (questionIds.length > 0) {
      const { data: questionsData, error: questionsError } = await supabaseClient
        .from('questions')
        .select('id,category')
        .in('id', questionIds);

      if (!questionsError && questionsData) {
        questionsData.forEach(q => {
          if (q && q.id != null) {
            categoryMap[q.id] = q.category || '未分類';
          }
        });
      }
    }

    const grouped = data.reduce((acc, item) => {
      const key = item.question_id && categoryMap[item.question_id] ? categoryMap[item.question_id] : item.activity || '未分類';
      if (!acc[key]) {
        acc[key] = { wrongCount: 0, totalCount: 0 };
      }

      const { correctCount, totalCount } = getHistoryResultCounts(item);
      const wrongCount = Math.max(0, totalCount - correctCount);

      acc[key].totalCount += totalCount;
      acc[key].wrongCount += wrongCount;
      return acc;
    }, {});

    const weaknesses = Object.entries(grouped)
      .filter(([, stats]) => stats.totalCount > 0)
      .map(([name, stats]) => ({
        name,
        rate: `${Math.round((stats.wrongCount / stats.totalCount) * 100)}%`,
        count: stats.wrongCount,
        totalCount: stats.totalCount,
        wrongRate: stats.wrongCount / stats.totalCount
      }))
      .sort((a, b) => b.wrongRate - a.wrongRate || b.count - a.count || b.totalCount - a.totalCount)
      .slice(0, 3);

    return weaknesses;
  } catch (error) {
    console.error('苦手分野計算中にエラー発生:', error);
    return [];
  }
}

// ======================================
// 📚 資格（試験）データ
// ======================================

const exams = [
  {
    id: 3,
    shortName: "HTML5 L1",
    title: "HTML5 Professional Level1",
    description: "HTML5/CSS/JavaScriptの基礎を学ぶWeb資格。マークアップ、スタイリング、アクセシビリティなどを幅広く出題します。",
    icon: "fa-code",
    stats: { questions: 250, accuracy: "83%", studyTime: "14時間", studyDays: "10日" },
    history: ["HTML5の新要素", "CSS Flexbox", "JavaScript DOM操作"],
    weakness: [{ name: "Canvas API", rate: "35%" }, { name: "Web Storage", rate: "45%" }, { name: "Geolocation", rate: "55%" }]
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
    id: 5,
    shortName: "AWS SAA",
    title: "AWS Certified Solutions Architect - Associate",
    description: "AWSの設計と運用を問う中級資格。インフラ構築、ネットワーク、セキュリティ、可用性設計などが出題されます。",
    icon: "fa-cloud",
    stats: { questions: 300, accuracy: "75%", studyTime: "20時間", studyDays: "14日" },
    history: ["VPC設計の基本", "IAMベストプラクティス", "高可用性アーキテクチャ"],
    weakness: [{ name: "VPC", rate: "50%" }, { name: "設計パターン", rate: "60%" }, { name: "コスト最適化", rate: "55%" }]
  },
  {
    id: 6,
    shortName: "JCSQE 初級",
    title: "JCSQE 初級",
    description: "ソフトウェア品質管理の基礎資格。テスト技法、品質保証、ソフトウェア開発プロセスについて学びます。",
    icon: "fa-book",
    stats: { questions: 210, accuracy: "80%", studyTime: "12時間", studyDays: "8日" },
    history: ["テスト設計基礎", "品質管理プロセス", "レビュー手法"],
    weakness: [{ name: "テストケース設計", rate: "40%" }, { name: "品質指標", rate: "55%" }, { name: "プロセス改善", rate: "50%" }]
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

const historyMoreButton =
  document.querySelector(".history-more-btn");

function getActiveExamIndex() {
  const activeCard = document.querySelector(".exam-card.active");
  const index = Array.from(examCards).indexOf(activeCard);
  return index >= 0 ? index : 0;
}

function getActiveExam() {
  return exams[getActiveExamIndex()] || exams[0];
}

function buildStudyUrl(exam, params = {}) {
  const searchParams = new URLSearchParams({
    examId: exam.id,
    selectedExam: exam.shortName,
    questionIndex: params.questionIndex || 0
  });

  if (params.category) {
    searchParams.set("category", params.category);
  }

  return `study.html?${searchParams.toString()}`;
}

// ======================================
// 画面更新
// ======================================

async function updateExam(index) {
  // 資格カードをクリックしたときに呼ばれます。
  // 画面右側のタイトル・説明・統計・履歴・苦手分野をまとめて更新します。

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

  const examSummary = await fetchExamSummary(exam.id);
  statAccuracy.textContent =
    examSummary && examSummary.accuracy !== null ? `${examSummary.accuracy}%` : exam.stats.accuracy;
  statStudyTime.textContent =
    examSummary && examSummary.study_time ? examSummary.study_time : exam.stats.studyTime;
  statStudyDays.textContent =
    examSummary && examSummary.study_days ? examSummary.study_days : exam.stats.studyDays;

  // 学習履歴
  historyList.innerHTML = "";
  const historyItems = await fetchExamHistory(exam.id);

  if (historyItems.length > 0) {
    historyItems.forEach(item => {
      const li = document.createElement("li");
      const date = new Date(item.answered_at || item.created_at).toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit'
      });
      const resultLabel = item.is_correct ? '正解' : '不正解';
      const activity = truncateText(item.activity || '問題練習', TOP_HISTORY_ACTIVITY_MAX_LENGTH);
      li.textContent = `${date}：${activity}（${resultLabel}）`;
      li.title = stripMediaMarkup(item.activity || '問題練習').replace(/\s+/g, ' ').trim();
      historyList.appendChild(li);
    });
  } else if (exam.history && exam.history.length > 0) {
    exam.history.forEach(item => {
      const li = document.createElement("li");
      li.textContent = truncateText(item, TOP_HISTORY_ACTIVITY_MAX_LENGTH);
      li.title = stripMediaMarkup(item).replace(/\s+/g, ' ').trim();
      historyList.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = '学習履歴はまだありません';
    historyList.appendChild(li);
  }

  // 苦手分野
  const weaknessData = await fetchExamWeaknesses(exam.id);
  weaknessItems.forEach((item, i) => {
    const weakness = weaknessData[i] || exam.weakness[i];
    if (weakness) {
      item.querySelector("span:first-child").textContent = weakness.name;
      item.querySelector("span:last-child").textContent = weakness.rate;
      item.dataset.category = weakness.name;
      item.disabled = false;
    } else {
      item.querySelector("span:first-child").textContent = "未分類";
      item.querySelector("span:last-child").textContent = "-";
      item.dataset.category = "";
      item.disabled = true;
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

weaknessItems.forEach((item) => {
  item.addEventListener("click", () => {
    const category = item.dataset.category;
    const exam = getActiveExam();

    if (!category) {
      return;
    }

    localStorage.setItem("selectedExamId", exam.id);
    localStorage.setItem("selectedExam", exam.shortName);

    window.location.href = buildStudyUrl(exam, { category });
  });
});

if (historyMoreButton) {
  historyMoreButton.addEventListener("click", () => {
    const exam = getActiveExam();

    localStorage.setItem("selectedExamId", exam.id);
    localStorage.setItem("selectedExam", exam.shortName);

    const searchParams = new URLSearchParams({
      examId: exam.id,
      selectedExam: exam.shortName
    });

    window.location.href = `study-history.html?${searchParams.toString()}`;
  });
}

// ======================================
// 問題追加ボタン
// ======================================

// ボタン取得
const importButton =
  document.querySelector(".import-btn");

// クリックイベント
importButton.addEventListener("click", () => {
  // 「問題を追加」ボタン。
  // どの資格へ問題を追加するか分かるように、選択中の資格IDを保存してから遷移します。

  // 現在activeの資格取得
  const activeCard =
    document.querySelector(".exam-card.active");

  // 資格ID / 資格名取得
  let selectedExamId = activeCard ? Number(activeCard.dataset.examId) : NaN;
  let selectedExam = activeCard ? activeCard.dataset.examShortName : null;

  if (!selectedExamId || Number.isNaN(selectedExamId)) {
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 3;
  }
  if (!selectedExam) {
    selectedExam = localStorage.getItem("selectedExam") || "HTML5 L1";
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
  // 「学習開始」ボタン。
  // 前回途中だった資格なら、最後に解いた位置から再開できるようにしています。

  // 現在activeの資格取得
  const activeCard =
    document.querySelector(".exam-card.active");

  // 資格ID / 資格名取得
  let selectedExamId = activeCard ? Number(activeCard.dataset.examId) : NaN;
  let selectedExam = activeCard ? activeCard.dataset.examShortName : null;

  // fallback: localStorage に保存されているものを使う
  if (!selectedExamId || Number.isNaN(selectedExamId)) {
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 3;
  }
  if (!selectedExam) {
    selectedExam = localStorage.getItem("selectedExam") || "HTML5 L1";
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
    buildStudyUrl({ id: selectedExamId, shortName: selectedExam }, { questionIndex: startIndex });

});

// ======================================
// 問題編集ボタン
// ======================================

// ボタン取得
const editButton =
  document.querySelector(".edit-btn");

// クリックイベント
editButton.addEventListener("click", () => {
  // 「問題編集」ボタン。
  // 選択中の資格IDをURLクエリにも付けて編集画面へ渡します。

  // 現在activeの資格取得
  const activeCard =
    document.querySelector(".exam-card.active");

  // 資格ID / 資格名取得
  let selectedExamId = activeCard ? Number(activeCard.dataset.examId) : NaN;
  let selectedExam = activeCard ? activeCard.dataset.examShortName : null;

  // fallback: localStorage に保存されているものを使う
  if (!selectedExamId || Number.isNaN(selectedExamId)) {
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 3;
  }
  if (!selectedExam) {
    selectedExam = localStorage.getItem("selectedExam") || "HTML5 L1";
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

// 最初に表示する試験（HTML5 L1：id=0）
(async () => {
  await updateExam(0);
})();
