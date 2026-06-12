// ======================================
// index.js
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

/**
 * トップ画面の履歴表示用に画像マークアップを短く置き換えます。
 *
 * @param {string} text - この関数に渡す値。
 * @returns {string} 処理結果。
 */
function stripMediaMarkup(text) {
  return String(text || '').replace(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, '[画像]');
}

/**
 * 長い文字列をカード表示に収まる長さへ省略します。
 *
 * @param {string} text - この関数に渡す値。
 * @param {number} maxLength - この関数に渡す値。
 * @returns {string} 処理結果。
 */
function truncateText(text, maxLength) {
  const normalized = stripMediaMarkup(text).replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

/**
 * トップ画面で使う Supabase クライアントを初期化します。
 *
 * @returns {boolean} 処理結果。
 */
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

/**
 * 指定資格に登録されている問題数を取得します。
 *
 * @param {number} examId - この関数に渡す値。
 * @returns {number} 処理結果。
 */
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

/**
 * トップ画面に表示する直近の学習履歴を取得します。
 *
 * @param {number} examId - この関数に渡す値。
 * @param {number} limit  - この関数に渡す値。
 * @returns {Array} 処理結果。
 */
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

/**
 * 正答率、学習時間、学習日数などの概要を取得します。
 *
 * @param {number} examId - この関数に渡す値。
 * @returns {object} 処理結果。
 */
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

/**
 * 履歴レコードを正解数と回答数に変換します。
 *
 * @param {any} item - この関数に渡す値。
 * @returns {object} 処理結果。
 */
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

/**
 * 正解数と回答数から表示ラベルと CSS クラスを決めます。
 *
 * @param {number} correctCount - この関数に渡す値。
 * @param {number} totalCount - この関数に渡す値。
 * @returns {object} 処理結果。
 */
function getHistoryResultLabel(correctCount, totalCount) {
  if (totalCount <= 0) {
    return {
      text: "集計外",
      className: "skipped"
    };
  }

  if (correctCount >= totalCount) {
    return {
      text: "正解",
      className: "correct"
    };
  }

  if (correctCount <= 0) {
    return {
      text: "不正解",
      className: "incorrect"
    };
  }

  return {
    text: "一部正解",
    className: "incorrect"
  };
}

/**
 * 苦手分野計算の元データをデバッグ表示に描画します。
 *
 * @param {Array} logs - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function renderWeaknessDebugLogs(logs) {
  if (!debugLogSummary || !debugLogList) {
    return;
  }

  debugLogList.innerHTML = "";

  const totalCount = logs.reduce((sum, log) => sum + log.totalCount, 0);
  const correctCount = logs.reduce((sum, log) => sum + log.correctCount, 0);
  const includedCount = logs.filter(log => log.totalCount > 0).length;
  const skippedCount = logs.length - includedCount;

  debugLogSummary.textContent =
    `${includedCount}件を集計 / 正解 ${correctCount}/${totalCount}${skippedCount > 0 ? ` / 集計外 ${skippedCount}件` : ""}`;

  if (logs.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "集計対象の履歴がありません。";
    debugLogList.appendChild(empty);
    return;
  }

  logs.forEach(log => {
    const row = document.createElement("div");
    const result = document.createElement("strong");
    const detail = document.createTextNode(
      ` ${log.date} / ${log.category} / question_id=${log.questionId || "-"} / correct=${log.correctCount}, total=${log.totalCount} / is_correct=${log.rawIsCorrect}, correct_count=${log.rawCorrectCount}, total_count=${log.rawTotalCount}`
    );
    const activity = document.createElement("div");

    row.className = `debug-log-row ${log.className}`;
    result.textContent = log.resultLabel;
    activity.textContent = log.activity;
    row.appendChild(result);
    row.appendChild(detail);
    row.appendChild(activity);
    debugLogList.appendChild(row);
  });
}

/**
 * 学習履歴から苦手カテゴリを計算して取得します。
 *
 * @param {number} examId - この関数に渡す値。
 * @returns {Array} 処理結果。
 */
async function fetchExamWeaknesses(examId) {
  // すべての回答履歴を見て、カテゴリごとの正答率を計算します。
  // exam_histories に question_id があれば questions テーブルからカテゴリを引きます。
  if (!supabaseClient) {
    weaknessDebugLogs = [];
    return [];
  }

  try {
    const { data: allQuestionsData, error: allQuestionsError } = await supabaseClient
      .from('questions')
      .select('id,category')
      .eq('exam_id', examId);

    const allCategories = [];

    if (!allQuestionsError && allQuestionsData) {
      allQuestionsData.forEach(question => {
        const category = question && question.category ? question.category : '未分類';

        if (!allCategories.includes(category)) {
          allCategories.push(category);
        }
      });
    }

    const emptyWeaknesses = () => allCategories.map(name => ({
      name,
      rate: "-",
      count: 0,
      totalCount: 0,
      correctRate: Number.POSITIVE_INFINITY
    }));

    const { data, error } = await supabaseClient
      .from('exam_histories')
      .select('*')
      .eq('exam_id', examId)
      .order('answered_at', { ascending: false });

    if (error) {
      console.error('苦手分野取得エラー:', error);
      weaknessDebugLogs = [];
      return emptyWeaknesses();
    }

    if (!data || data.length === 0) {
      weaknessDebugLogs = [];
      return emptyWeaknesses();
    }

    const questionIds = [...new Set(data.map(item => item.question_id).filter(Boolean))];
    const categoryMap = {};

    if (questionIds.length > 0) {
      const { data: questionsData, error: questionsError } = await supabaseClient
        .from('questions')
        .select('id,category')
        .in('id', questionIds)
        .eq('exam_id', examId);

      if (!questionsError && questionsData) {
        questionsData.forEach(q => {
          if (q && q.id != null) {
            categoryMap[q.id] = q.category || '未分類';
          }
        });
      }
    }

    const debugLogs = [];

    const grouped = data.reduce((acc, item) => {
      const key = item.question_id && categoryMap[item.question_id] ? categoryMap[item.question_id] : item.activity || '未分類';
      if (!acc[key]) {
        acc[key] = { correctCount: 0, totalCount: 0 };
      }

      const { correctCount, totalCount } = getHistoryResultCounts(item);
      const result = getHistoryResultLabel(correctCount, totalCount);
      const answeredAt = item.answered_at ? new Date(item.answered_at) : null;

      if (!item.question_id || !categoryMap[item.question_id]) {
        debugLogs.push({
          category: "対象外",
          questionId: item.question_id,
          activity: truncateText(item.activity || "問題履歴なし", 120),
          date: answeredAt && !Number.isNaN(answeredAt.getTime())
            ? answeredAt.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" })
            : "日時なし",
          resultLabel: "対象外",
          className: "skipped",
          correctCount: 0,
          totalCount: 0,
          rawIsCorrect: item.is_correct === undefined ? "-" : String(item.is_correct),
          rawCorrectCount: item.correct_count === undefined ? "-" : String(item.correct_count),
          rawTotalCount: item.total_count === undefined ? "-" : String(item.total_count)
        });
        return acc;
      }

      debugLogs.push({
        category: key,
        questionId: item.question_id,
        activity: truncateText(item.activity || "問題履歴なし", 120),
        date: answeredAt && !Number.isNaN(answeredAt.getTime())
          ? answeredAt.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" })
          : "日時なし",
        resultLabel: result.text,
        className: result.className,
        correctCount,
        totalCount,
        rawIsCorrect: item.is_correct === undefined ? "-" : String(item.is_correct),
        rawCorrectCount: item.correct_count === undefined ? "-" : String(item.correct_count),
        rawTotalCount: item.total_count === undefined ? "-" : String(item.total_count)
      });

      acc[key].totalCount += totalCount;
      acc[key].correctCount += correctCount;
      return acc;
    }, {});

    weaknessDebugLogs = debugLogs;

    Object.keys(grouped).forEach(category => {
      if (!allCategories.includes(category)) {
        allCategories.push(category);
      }
    });

    const weaknesses = allCategories
      .map(name => {
        const stats = grouped[name];

        if (!stats || stats.totalCount <= 0) {
          return {
            name,
            rate: "-",
            count: 0,
            totalCount: 0,
            correctRate: Number.POSITIVE_INFINITY
          };
        }

        return {
          name,
          rate: `${Math.round((stats.correctCount / stats.totalCount) * 100)}%`,
          count: stats.correctCount,
          totalCount: stats.totalCount,
          correctRate: stats.correctCount / stats.totalCount
        };
      })
      .sort((a, b) => a.correctRate - b.correctRate || b.totalCount - a.totalCount || a.count - b.count || a.name.localeCompare(b.name, "ja"));

    return weaknesses;
  } catch (error) {
    console.error('苦手分野計算中にエラー発生:', error);
    weaknessDebugLogs = [];
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

const weaknessList =
  document.getElementById("weak-list");

const weaknessToggleButton =
  document.getElementById("weak-toggle-btn");

const historyMoreButton =
  document.querySelector(".history-more-btn");

const topPeriodTabs =
  document.querySelectorAll(".top-period-tab");

const topStartUnansweredButton =
  document.getElementById("top-start-unanswered-btn");

const topStartIncorrectButton =
  document.getElementById("top-start-incorrect-btn");

const topStartRecentIncorrectButton =
  document.getElementById("top-start-recent-incorrect-btn");

const topCustomPeriodInput =
  document.getElementById("top-custom-period-days");

const topCustomPeriodField =
  document.getElementById("top-custom-period-field");

const debugLogSummary =
  document.getElementById("debug-log-summary");

const debugLogList =
  document.getElementById("debug-log-list");

let weaknessDebugLogs = [];
let selectedTopUnansweredPeriod = "7";
let weaknessData = [];
let isWeaknessExpanded = false;

/**
 * 現在選択中の資格カードのインデックスを取得します。
 *
 * @returns {number} 処理結果。
 */
function getActiveExamIndex() {
  const activeCard = document.querySelector(".exam-card.active");
  const index = Array.from(examCards).indexOf(activeCard);
  return index >= 0 ? index : 0;
}

/**
 * 現在選択中の資格データを取得します。
 *
 * @returns {object} 処理結果。
 */
function getActiveExam() {
  return exams[getActiveExamIndex()] || exams[0];
}

/**
 * 選択中の資格と条件から学習画面の URL を作ります。
 *
 * @param {any} exam - この関数に渡す値。
 * @param {any} params  - この関数に渡す値。
 * @returns {string} 処理結果。
 */
function buildStudyUrl(exam, params = {}) {
  const searchParams = new URLSearchParams({
    examId: exam.id,
    selectedExam: exam.shortName,
    questionIndex: params.questionIndex || 0
  });

  if (params.category) {
    searchParams.set("category", params.category);
  }

  if (params.mode) {
    searchParams.set("mode", params.mode);
  }

  if (params.periodDays) {
    searchParams.set("periodDays", params.periodDays);
  }

  return `study.html?${searchParams.toString()}`;
}

/**
 * トップ画面の復習ボタンから、指定モードで学習を開始します。
 *
 * @param {Event} mode - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function startTopPractice(mode) {
  const exam = getActiveExam();
  let periodDays = null;

  if (mode === "unanswered") {
    periodDays = selectedTopUnansweredPeriod;

    if (selectedTopUnansweredPeriod === "custom") {
      const customDays = Number(topCustomPeriodInput ? topCustomPeriodInput.value : NaN);

      if (!Number.isFinite(customDays) || customDays < 1) {
        alert("指定期間は1日以上で入力してください。");
        return;
      }

      periodDays = String(Math.floor(customDays));
    }
  }

  localStorage.setItem("selectedExamId", exam.id);
  localStorage.setItem("selectedExam", exam.shortName);

  window.location.href = buildStudyUrl(exam, {
    mode,
    periodDays
  });
}

// ======================================
// 画面更新
// ======================================

function createWeaknessItem(weakness) {
  const item = document.createElement("button");
  const name = document.createElement("span");
  const rate = document.createElement("span");

  item.type = "button";
  item.className = "weak-item";
  item.dataset.category = weakness.name || "";
  item.disabled = !weakness.name;

  name.textContent = weakness.name || "未分類";
  rate.textContent = weakness.rate || "-";

  item.appendChild(name);
  item.appendChild(rate);

  return item;
}

function renderWeaknessList() {
  if (!weaknessList) {
    return;
  }

  const visibleWeaknesses = isWeaknessExpanded
    ? weaknessData
    : weaknessData.slice(0, 3);

  weaknessList.innerHTML = "";

  if (visibleWeaknesses.length === 0) {
    weaknessList.appendChild(createWeaknessItem({
      name: "",
      rate: "-"
    }));
  } else {
    visibleWeaknesses.forEach(weakness => {
      weaknessList.appendChild(createWeaknessItem(weakness));
    });
  }

  if (!weaknessToggleButton) {
    return;
  }

  const canToggle = weaknessData.length > 3;
  weaknessToggleButton.hidden = !canToggle;
  weaknessToggleButton.textContent = isWeaknessExpanded ? "閉じる" : "もっと見る";
  weaknessToggleButton.setAttribute("aria-expanded", String(isWeaknessExpanded));
}

/**
 * 選択された資格カードに合わせてトップ画面の表示を更新します。
 *
 * @param {number} index - この関数に渡す値。
 * @returns {Promise<void>} 処理結果。
 */
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
  weaknessData = await fetchExamWeaknesses(exam.id);
  isWeaknessExpanded = false;
  renderWeaknessDebugLogs(weaknessDebugLogs);
  renderWeaknessList();

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

if (weaknessList) {
  weaknessList.addEventListener("click", event => {
    const item = event.target.closest(".weak-item");

    if (!item || !weaknessList.contains(item)) {
      return;
    }

    const category = item.dataset.category;
    const exam = getActiveExam();

    if (!category) {
      return;
    }

    localStorage.setItem("selectedExamId", exam.id);
    localStorage.setItem("selectedExam", exam.shortName);

    window.location.href = buildStudyUrl(exam, { category });
  });
}

if (weaknessToggleButton) {
  weaknessToggleButton.addEventListener("click", () => {
    isWeaknessExpanded = !isWeaknessExpanded;
    renderWeaknessList();
  });
}

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

topPeriodTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    topPeriodTabs.forEach(item => item.classList.remove("active"));
    tab.classList.add("active");
    selectedTopUnansweredPeriod = tab.dataset.periodDays;

    if (topCustomPeriodInput) {
      topCustomPeriodInput.disabled = selectedTopUnansweredPeriod !== "custom";
      topCustomPeriodField?.classList.toggle("is-active", selectedTopUnansweredPeriod === "custom");

      if (!topCustomPeriodInput.disabled) {
        topCustomPeriodInput.focus();
      }
    }
  });
});

if (topStartUnansweredButton) {
  topStartUnansweredButton.addEventListener("click", () => startTopPractice("unanswered"));
}

if (topStartIncorrectButton) {
  topStartIncorrectButton.addEventListener("click", () => startTopPractice("incorrect"));
}

if (topStartRecentIncorrectButton) {
  topStartRecentIncorrectButton.addEventListener("click", () => startTopPractice("recent-incorrect"));
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
