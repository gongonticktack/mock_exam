// ======================================
// study.js
// ======================================
// 学習画面（study.html）を動かすためのファイルです。
//
// 主な役割:
// 1. 選択された資格の問題と選択肢をSupabaseから読み込む
// 2. 問題をシャッフルして1問ずつ画面に表示する
// 3. ユーザーの回答を判定し、正解/不正解と解説を表示する
// 4. 回答履歴を exam_histories テーブルへ保存する
//
// 初心者向けメモ:
// - questions は、現在の学習で使う問題一覧を入れる配列です。
// - currentQuestionIndex は、今表示している問題が何番目かを表します。
// - answered は、同じ問題で二重回答しないためのフラグです。

// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================
// 問題取得用のデータベース接続

let supabaseClient = null;
let questions = [];
let currentQuestionIndex = 0;
let currentExamId = 1;
let currentCategoryFilter = "";
let currentTargetQuestionId = null;
let currentStudyMode = "";
let currentUnansweredPeriodDays = "7";
let answered = false;
let loadingProgress = 0;
let currentStudySessionStartedAt = null;
let examHistoryColumnSupport = {};

/**
 * メッセージを表示して、トップ画面へ戻します。
 *
 * @param {Event} message - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function returnToTop(message) {
  if (message) {
    alert(message);
  }

  window.location.replace("index.html");
}

/**
 * Supabase クライアントを初期化し、学習画面から DB を使える状態にします。
 *
 * @returns {boolean} 処理結果。
 */
function initSupabase() {

  const config = window.SUPABASE_CONFIG;

  if (!config || !config.url || !config.key) {

    returnToTop('Supabaseの設定が不足しています。トップへ戻ります。');

    return false;

  }

  supabaseClient = window.supabase.createClient(
    config.url,
    config.key
  );

  return true;

}

// ======================================
// � ローディング画面制御
// ======================================

/**
 * 問題読み込み中のオーバーレイを表示し、進捗を初期化します。
 *
 * @returns {void} 処理結果。
 */
function startLoading() {

  document.getElementById('loading-overlay').style.display = 'flex';

  loadingProgress = 0;

  updateLoadingProgress();

}

/**
 * 読み込み進捗バーとパーセント表示を更新します。
 *
 * @returns {void} 処理結果。
 */
function updateLoadingProgress() {

  document.getElementById('loading-progress-bar').style.width = `${loadingProgress}%`;

  document.getElementById('loading-text').textContent = `${loadingProgress}%`;

}

/**
 * 読み込み中オーバーレイを非表示にします。
 *
 * @returns {void} 処理結果。
 */
function stopLoading() {

  document.getElementById('loading-overlay').style.display = 'none';

}

/**
 * 画像マークアップを含む本文を、安全に DOM 要素へ描画します。
 *
 * @param {HTMLElement} container - この関数に渡す値。
 * @param {string} text - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function renderRichText(container, text) {
  // 問題文や解説には、通常の文字だけでなく画像記法も入ることがあります。
  // 例: ![diagram](data:image/png;base64,...)
  // textContentだけだと画像にならないので、安全にDOM要素へ分解して表示します。
  container.innerHTML = "";

  const value = String(text || "");
  const imagePattern = /!\[([^\]]*)]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match;

  /**
   * 改行を保ちながら、通常テキストを表示先へ追加します。
   *
   * @param {string} chunk - 追加したいテキストの一部分。
   * @returns {void}
   */
  const appendText = (chunk) => {
    chunk.split('\n').forEach((line, index) => {
      if (index > 0) {
        container.appendChild(document.createElement('br'));
      }
      if (line) {
        container.appendChild(document.createTextNode(line));
      }
    });
  };

  while ((match = imagePattern.exec(value)) !== null) {
    appendText(value.slice(lastIndex, match.index));

    const img = document.createElement('img');
    img.className = 'rich-text-image';
    img.alt = match[1] || 'image';
    img.src = match[2];
    img.loading = 'lazy';
    container.appendChild(img);

    lastIndex = imagePattern.lastIndex;
  }

  appendText(value.slice(lastIndex));
}

/**
 * 画像マークアップを除いた、画面表示用の文字数を数えます。
 *
 * @param {string} text - この関数に渡す値。
 * @returns {number} 処理結果。
 */
function getReadableTextLength(text) {
  return String(text || "")
    .replace(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, "")
    .replace(/\s+/g, "")
    .length;
}

/**
 * 文章量に応じて長文用の CSS クラスを付け替えます。
 *
 * @param {HTMLElement} element - この関数に渡す値。
 * @param {any} baseClass - この関数に渡す値。
 * @param {string} text - この関数に渡す値。
 * @param {any} thresholds - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function setLengthClass(element, baseClass, text, thresholds) {
  element.classList.remove(`${baseClass}-long`, `${baseClass}-very-long`);

  const textLength = getReadableTextLength(text);

  if (textLength >= thresholds.veryLong) {
    element.classList.add(`${baseClass}-very-long`);
  } else if (textLength >= thresholds.long) {
    element.classList.add(`${baseClass}-long`);
  }
}

// ======================================
// �🚀 アプリケーション開始
// ======================================

/**
 * Supabase 初期化後、学習ページ全体の初期化を始めます。
 *
 * @returns {Promise<void>} 処理結果。
 */
async function startStudyApp() {
  // この画面の最初の入口です。
  // Supabase接続に成功したら、ページ情報を読み込んで学習を開始します。

  // Supabase初期化
  if (!initSupabase()) {

    return;

  }

  examHistoryColumnSupport = {};

  // ページを読み込む
  await initPage();

}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startStudyApp);
} else {
  startStudyApp();
}

// ======================================
// 📄 ページ初期化
// ======================================
// 試験選択情報を取得して、問題を読み込みます

/**
 * URLや保存情報から学習条件を決め、問題を読み込んで最初の問題を表示します。
 *
 * @returns {Promise<void>} 処理結果。
 */
async function initPage() {
  // URLクエリやlocalStorageから「どの資格を学習するか」を決めます。
  // その後、DBから問題を読み込んで最初の問題を表示します。

  // URLクエリからexamIdと問題インデックスを取得
  const params = new URLSearchParams(window.location.search);
  const examIdFromQuery = Number(params.get("examId"));
  const questionIndexFromQuery = Number(params.get("questionIndex")) || 0;
  const questionIdFromQuery = Number(params.get("questionId")) || null;
  const selectedExamFromQuery = params.get("selectedExam");
  const categoryFromQuery = params.get("category") || "";
  const studyModeFromQuery = params.get("mode") || "";
  const unansweredPeriodDaysFromQuery = params.get("periodDays") || "7";

  // localStorageから選択中の資格を取得
  const storedExamId = Number(localStorage.getItem("selectedExamId"));
  const storedExamName = localStorage.getItem("selectedExam");

  const exams = [
    { id: 1, shortName: "AWS CCP", name: "AWS Cloud Practitioner" },
    { id: 2, shortName: "UML L2", name: "UMLモデリング技能認定 L2" },
    { id: 3, shortName: "HTML5 L1", name: "HTML5 Professional Level1" },
    { id: 4, shortName: "アジャイル", name: "アジャイル開発技術者試験" },
    { id: 5, shortName: "AWS SAA", name: "AWS Certified Solutions Architect - Associate" },
    { id: 6, shortName: "JCSQE 初級", name: "JCSQE 初級" }
  ];

  let selectedExamName = selectedExamFromQuery || storedExamName;
  let selectedExamId = null;

  if (selectedExamName) {
    const examFromName = exams.find(e => e.shortName === selectedExamName || e.name === selectedExamName);
    if (examFromName) {
      selectedExamId = examFromName.id;
    }
  }

  if (!selectedExamId && examIdFromQuery && !Number.isNaN(examIdFromQuery)) {
    selectedExamId = examIdFromQuery;
  }

  if (!selectedExamId && storedExamId && !Number.isNaN(storedExamId)) {
    selectedExamId = storedExamId;
  }

  if (!selectedExamId) {
    selectedExamId = 3;
  }

  const currentExam = exams.find(e => e.id === selectedExamId);
  if (!selectedExamName) {
    selectedExamName = currentExam?.name || "HTML5 Professional Level1";
  }

  currentExamId = selectedExamId;
  currentCategoryFilter = categoryFromQuery;
  currentTargetQuestionId = questionIdFromQuery;
  currentStudyMode = ["unanswered", "incorrect", "recent-incorrect"].includes(studyModeFromQuery) ? studyModeFromQuery : "";
  currentUnansweredPeriodDays = unansweredPeriodDaysFromQuery;
  currentStudySessionStartedAt = new Date().toISOString();

  // ヘッダーに資格名を表示
  const headerLabels = [selectedExamName];
  if (currentCategoryFilter) {
    headerLabels.push(currentCategoryFilter);
  }
  if (currentStudyMode === "unanswered") {
    headerLabels.push("未回答問題");
  } else if (currentStudyMode === "recent-incorrect") {
    headerLabels.push("直近で間違えた問題");
  } else if (currentStudyMode === "incorrect") {
    headerLabels.push("過去に間違えた問題");
  }
  document.getElementById("exam-name-header").textContent = headerLabels.join(" / ");

  // DBから問題を取得
  const loaded = await loadQuestions();

  if (!loaded) {
    return;
  }

  // 問題をランダムにシャッフル
  shuffleQuestions();

  let startIndex = 0;

  if (currentTargetQuestionId) {
    startIndex = questions.findIndex(question => Number(question.id) === currentTargetQuestionId);

    if (startIndex === -1) {
      returnToTop('指定された問題が見つかりませんでした。トップへ戻ります。');
      return;
    }
  } else if (questionIndexFromQuery > 0 && questionIndexFromQuery < questions.length) {
    startIndex = questionIndexFromQuery;
  }

  // 問題を表示
  if (questions.length > 0) {

    displayQuestion(startIndex);

  } else {

    returnToTop('問題がありません。トップへ戻ります。');

  }

}

/**
 * exam_histories テーブルに指定列があるか確認し、結果をキャッシュします。
 *
 * @param {Event} columnName - この関数に渡す値。
 * @returns {boolean} 処理結果。
 */
async function hasExamHistoryColumn(columnName) {
  // exam_histories テーブルは、環境によって列構成が少し違う可能性があります。
  // そこで「この列が存在するか」を一度確認し、結果をキャッシュしています。
  if (examHistoryColumnSupport[columnName] !== undefined) {
    return examHistoryColumnSupport[columnName];
  }

  if (!supabaseClient) {
    return false;
  }

  try {
    const { error } = await supabaseClient
      .from('exam_histories')
      .select(columnName)
      .limit(1);

    const supported = !error;
    examHistoryColumnSupport[columnName] = supported;
    return supported;
  } catch (error) {
    console.error(`exam_histories column check failed: ${columnName}`, error);
    examHistoryColumnSupport[columnName] = false;
    return false;
  }
}

// ======================================
// 📚 選択した試験の問題をDB取得
// ======================================
// Supab aseから問題と選択肢を取得します

/**
 * 現在の資格・カテゴリ・学習モードに合う問題と選択肢を読み込みます。
 *
 * @returns {Promise<void>} 処理結果。
 */
async function loadQuestions() {
  // questions テーブルから問題を取り、
  // それぞれの問題IDを使って choices テーブルから選択肢を取得します。

  try {

    startLoading();

    // 問題を取得
    let query = supabaseClient
      .from('questions')
      .select('*,choices(*)')
      .eq('exam_id', currentExamId);

    if (currentCategoryFilter) {
      query = query.eq('category', currentCategoryFilter);
    }

    const { data: loadedQuestionsData, error: questionsError } = await query;

    if (questionsError) {

      returnToTop('問題の取得に失敗しました。トップへ戻ります。');

      stopLoading();

      return false;

    }

    if (!loadedQuestionsData || loadedQuestionsData.length === 0) {

      returnToTop('該当する問題が見つかりませんでした。トップへ戻ります。');

      stopLoading();

      return false;

    }

    loadingProgress = 40;
    updateLoadingProgress();

    const questionsData = await filterQuestionsForStudyMode(loadedQuestionsData);

    if (questionsData.length === 0) {
      stopLoading();
      returnToTop(getEmptyStudyModeMessage());
      return false;
    }

    const questionsWithChoices = questionsData.map(question => ({
      ...question,
      choices: [...(question.choices || [])]
        .sort((a, b) => (a.choice_index || 0) - (b.choice_index || 0))
    }));

    const questionWithoutChoices = questionsWithChoices.find(question => !question.choices.length);
    if (questionWithoutChoices) {
      stopLoading();
      returnToTop('選択肢が見つかりませんでした。トップへ戻ります。');
      return false;
    }

    loadingProgress = 100;
    updateLoadingProgress();
    questions = questionsWithChoices;
    stopLoading();
    return true;

  } catch (error) {

    console.error('問題の読み込み中にエラーが発生しました', error);

    stopLoading();

    const message = error.message === "回答履歴に question_id 列がないため、復習モードを利用できません。"
      ? `${error.message}トップへ戻ります。`
      : '問題の読み込み中にエラーが発生しました。トップへ戻ります。';
    returnToTop(message);

    return false;

  }

}

/**
 * 履歴レコードから正解/不正解を取り出します。
 *
 * @param {any} item - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function getHistoryResult(item) {
  if (typeof item.is_correct === "boolean") {
    return item.is_correct;
  }

  if (typeof item.correct_count === "number" && typeof item.total_count === "number") {
    return item.correct_count >= item.total_count;
  }

  return null;
}

/**
 * 履歴レコードの回答日時を比較しやすい数値に変換します。
 *
 * @param {any} item - この関数に渡す値。
 * @returns {number} 処理結果。
 */
function getHistoryAnsweredTime(item) {
  const answeredTime = new Date(item.answered_at || item.created_at).getTime();
  return Number.isFinite(answeredTime) ? answeredTime : 0;
}

/**
 * 復習モードで対象問題がないときに表示するメッセージを返します。
 *
 * @returns {string} 処理結果。
 */
function getEmptyStudyModeMessage() {
  if (currentStudyMode === "unanswered") {
    return "指定した期間内に未回答の問題はありません。トップへ戻ります。";
  }

  if (currentStudyMode === "incorrect") {
    return "過去に間違えた問題はありません。トップへ戻ります。";
  }

  if (currentStudyMode === "recent-incorrect") {
    return "直近で間違えた問題はありません。トップへ戻ります。";
  }

  return "該当する問題が見つかりませんでした。トップへ戻ります。";
}

/**
 * 未回答・不正解などの学習モードに合わせて問題を絞り込みます。
 *
 * @param {Array} questionsData - この関数に渡す値。
 * @returns {Array} 処理結果。
 */
async function filterQuestionsForStudyMode(questionsData) {
  if (!currentStudyMode) {
    return questionsData;
  }

  if (!await hasExamHistoryColumn("question_id")) {
    throw new Error("回答履歴に question_id 列がないため、復習モードを利用できません。");
  }

  const { data: historyData, error } = await supabaseClient
    .from("exam_histories")
    .select("*")
    .eq("exam_id", currentExamId);

  if (error) {
    throw error;
  }

  const histories = historyData || [];
  let targetQuestionIds;

  if (currentStudyMode === "incorrect") {
    targetQuestionIds = new Set(
      histories
        .filter(item => item.question_id && getHistoryResult(item) === false)
        .map(item => Number(item.question_id))
    );

    return questionsData.filter(question => targetQuestionIds.has(Number(question.id)));
  }

  if (currentStudyMode === "recent-incorrect") {
    const latestHistoryByQuestionId = histories.reduce((map, item) => {
      if (!item.question_id) {
        return map;
      }

      const questionId = Number(item.question_id);
      const latestItem = map.get(questionId);

      if (!latestItem || getHistoryAnsweredTime(item) > getHistoryAnsweredTime(latestItem)) {
        map.set(questionId, item);
      }

      return map;
    }, new Map());

    targetQuestionIds = new Set(
      [...latestHistoryByQuestionId.entries()]
        .filter(([, item]) => getHistoryResult(item) === false)
        .map(([questionId]) => questionId)
    );

    return questionsData.filter(question => targetQuestionIds.has(Number(question.id)));
  }

  const periodDays = Number(currentUnansweredPeriodDays);
  const cutoffTime = currentUnansweredPeriodDays === "all"
    ? null
    : Date.now() - (Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 7) * 24 * 60 * 60 * 1000;

  targetQuestionIds = new Set(
    histories
      .filter(item => {
        if (!item.question_id) {
          return false;
        }

        if (cutoffTime === null) {
          return true;
        }

        const answeredAt = new Date(item.answered_at || item.created_at).getTime();
        return Number.isFinite(answeredAt) && answeredAt >= cutoffTime;
      })
      .map(item => Number(item.question_id))
  );

  return questionsData.filter(question => !targetQuestionIds.has(Number(question.id)));
}

// ======================================
// 🎲 問題をランダムにシャッフル
// ======================================
// Fisher-Yatesアルゴリズムで問題順序をランダム化

/**
 * 問題一覧をランダムな順番に並べ替えます。
 *
 * @returns {void} 処理結果。
 */
function shuffleQuestions() {
  // Fisher-Yatesという定番アルゴリズムで、問題の順番をランダムに並べ替えます。

  // Fisher-Yatesシャッフルアルゴリズム
  for (let i = questions.length - 1; i > 0; i--) {

    const j = Math.floor(Math.random() * (i + 1));

    // 要素を入れ替え
    [questions[i], questions[j]] = [questions[j], questions[i]];

  }

}

// ======================================
// 🎯 問題を画面に表示
// ======================================
// 指定されたインデックスの問題と選択肢を表示

/**
 * 表示用に選択肢の順番をランダムに並べ替えます。
 *
 * @param {Array} choices - この関数に渡す値。
 * @returns {Array} 処理結果。
 */
function getShuffledChoices(choices) {
  const shuffledChoices = [...choices];

  for (let i = shuffledChoices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
  }

  return shuffledChoices;
}

/**
 * 指定された番号の問題を画面に表示します。
 *
 * @param {number} index - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function displayQuestion(index) {
  // 指定された番号の問題を画面へ表示します。
  // 問題文、カテゴリ、選択肢、ボタン表示をここでまとめてリセットします。

  // インデックス確認
  if (index < 0 || index >= questions.length) {

    alert('問題がありません');

    return;

  }

  // リセット
  answered = false;

  // 現在の問題インデックスを更新
  currentQuestionIndex = index;

  // 問題データを取得
  const question = questions[index];

  // プログレスを更新
  document.getElementById("progress-text").textContent =
    `${index + 1} / ${questions.length}`;

  document.getElementById("progress-bar").style.width =
    `${((index + 1) / questions.length) * 100}%`;

  // カテゴリを表示
  document.getElementById("question-category").textContent =
    question.category;

  // 質問を表示
  const questionText = document.getElementById("question-text");
  setLengthClass(questionText, "question-text", question.question, {
    long: 110,
    veryLong: 190
  });
  renderRichText(
    questionText,
    question.question
  );

  // 選択肢を表示
  const choicesContainer =
    document.getElementById("choices-container");

  choicesContainer.innerHTML = "";
  choicesContainer.classList.remove("choices-container-long", "choices-container-very-long");

  const totalChoicesLength = question.choices.reduce((sum, choice) => {
    return sum + getReadableTextLength(choice.content);
  }, 0);

  if (totalChoicesLength >= 520) {
    choicesContainer.classList.add("choices-container-very-long");
  } else if (totalChoicesLength >= 300) {
    choicesContainer.classList.add("choices-container-long");
  }

  getShuffledChoices(question.choices).forEach((choice, displayIndex) => {

    const choiceDiv = document.createElement("div");

    choiceDiv.classList.add("choice-item");

    // チェックボックス
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.className = "choice-checkbox";

    checkbox.value = choice.id;

    checkbox.dataset.is_correct = choice.is_correct ? '1' : '0';

    checkbox.dataset.choice_index = choice.choice_index;

    checkbox.dataset.display_index = displayIndex + 1;

    // ラベル
    const label = document.createElement("label");

    label.classList.add("choice-label");
    setLengthClass(label, "choice-label", choice.content, {
      long: 95,
      veryLong: 170
    });

    const numberSpan = document.createElement("span");

    numberSpan.className = "choice-number";

    numberSpan.textContent = `${displayIndex + 1}`;

    label.appendChild(checkbox);

    label.appendChild(numberSpan);

    // テキスト
    const textSpan = document.createElement("span");

    textSpan.className = "choice-text";

    textSpan.textContent = choice.content;

    label.appendChild(textSpan);

    choiceDiv.appendChild(label);

    choicesContainer.appendChild(choiceDiv);

  });

  // 説明と結果をリセット
  document.getElementById("explanation-box").style.display = "none";

  document.getElementById("result-box").style.display = "none";

  // ボタン表示切り替え
  document.getElementById("answer-btn").style.display = "block";

  document.getElementById("next-btn").style.display = "none";

  document.getElementById("edit-current-question-btn").style.display = "none";

}

/**
 * 現在表示中の問題を編集するための URL を作ります。
 *
 * @returns {string} 処理結果。
 */
function buildCurrentQuestionEditUrl() {
  const question = questions[currentQuestionIndex];
  const params = new URLSearchParams({
    examId: currentExamId,
    selectedExam: localStorage.getItem("selectedExam") || "",
    questionId: question?.id || ""
  });

  return `question-single-editor.html?${params.toString()}`;
}

// ======================================
// ✅ 回答ボタン処理
// ======================================
// ユーザーの回答を判定して結果を表示

document.getElementById("answer-btn").addEventListener("click", () => {

  // 既に回答済みなら何もしない
  if (answered) {

    return;

  }

  answered = true;

  // チェックボックスを全て取得
  const checkboxes = document.querySelectorAll(".choice-checkbox");

  // 選択された選択肢を取得
  const selectedChoices = [];

  checkboxes.forEach((checkbox) => {

    if (checkbox.checked) {

      selectedChoices.push({

        choice_index: parseInt(checkbox.dataset.choice_index),

        is_correct: checkbox.dataset.is_correct === '1',

        display_index: parseInt(checkbox.dataset.display_index)

      });

    }

  });

  // 正解の選択肢を取得
  const correctChoices = [];

  checkboxes.forEach((checkbox) => {

    if (checkbox.dataset.is_correct === '1') {

      correctChoices.push({

        choice_index: parseInt(checkbox.dataset.choice_index),

        display_index: parseInt(checkbox.dataset.display_index)

      });

    }

  });

  // 選択数と正解数が一致するか確認
  const selectedIndices = selectedChoices
    .filter(c => c.is_correct)
    .map(c => c.choice_index)
    .sort((a, b) => a - b);

  const correctIndices = correctChoices
    .map(c => c.choice_index)
    .sort((a, b) => a - b);

  const isCorrect =
    selectedIndices.length === correctIndices.length &&
    selectedIndices.every((val, idx) => val === correctIndices[idx]) &&
    selectedChoices.length === correctIndices.length;

  // 結果を表示
  displayResult(isCorrect, correctChoices, selectedChoices);

  // 学習履歴をDBに保存
  saveExamHistory(isCorrect, currentQuestionIndex, selectedChoices);

  // 選択肢を無効化
  checkboxes.forEach((checkbox) => {

    checkbox.disabled = true;

  });

  // ボタン表示切り替え
  document.getElementById("answer-btn").style.display = "none";

  document.getElementById("next-btn").style.display = "block";

  document.getElementById("edit-current-question-btn").style.display = "flex";

});

document.getElementById("edit-current-question-btn").addEventListener("click", () => {
  window.open(buildCurrentQuestionEditUrl(), "_blank");
});

// ======================================
// 📊 回答結果を表示
// ======================================
// 正解・不正解の判定結果を画面に表示

/**
 * 回答結果、正解、選択した選択肢、解説を画面に表示します。
 *
 * @param {boolean} isCorrect - この関数に渡す値。
 * @param {Array} correctChoices - この関数に渡す値。
 * @param {Array} selectedChoices - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function displayResult(isCorrect, correctChoices, selectedChoices) {
  // 回答後に、正解/不正解と正しい選択肢、解説を表示します。

  const resultBox = document.getElementById("result-box");

  const resultContent = document.getElementById("result-content");

  resultContent.innerHTML = "";

  // 結果表示
  const resultDiv = document.createElement("div");

  if (isCorrect) {

    resultDiv.classList.add("result-correct");

    resultDiv.innerHTML = `

      <i class="fa-solid fa-circle-check"></i>

      <p>正解です！</p>

    `;

  } else {

    resultDiv.classList.add("result-incorrect");

    resultDiv.innerHTML = `

      <i class="fa-solid fa-circle-xmark"></i>

      <p>不正解です</p>

      <div class="correct-answer">

        <p><strong>正解:</strong> ${correctChoices.map(c => c.display_index).sort((a, b) => a - b).join(', ')}</p>

      </div>

    `;

  }

  resultContent.appendChild(resultDiv);

  resultBox.style.display = "block";

  // 解説を表示
  const explanation = questions[currentQuestionIndex].explanation;

  if (explanation && explanation.trim()) {

    renderRichText(
      document.getElementById("explanation-text"),
      explanation
    );

    document.getElementById("explanation-box").style.display = "block";

  }

}

/**
 * 回答結果を exam_histories テーブルへ保存します。
 *
 * @param {boolean} isCorrect - この関数に渡す値。
 * @param {number} questionIndex - この関数に渡す値。
 * @param {Array} selectedChoices - この関数に渡す値。
 * @returns {Promise<void>} 処理結果。
 */
async function saveExamHistory(isCorrect, questionIndex, selectedChoices) {
  // 1問回答するたびに、学習履歴をDBへ保存します。
  // トップ画面の正答率・学習履歴・苦手分野はこのデータから作られます。
  if (!supabaseClient || !currentExamId) {
    return;
  }

  const question = questions[questionIndex];
  const questionId = question ? question.id : null;
  const activity = question ? question.question : `問題 ${questionIndex + 1}`;
  const answeredAt = new Date().toISOString();
  const row = {
    exam_id: currentExamId,
    activity,
    answered_at: answeredAt
  };

  if (questionId && await hasExamHistoryColumn('question_id')) {
    row.question_id = questionId;
  }

  if (currentStudySessionStartedAt && await hasExamHistoryColumn('exam_started_at')) {
    row.exam_started_at = currentStudySessionStartedAt;
  }

  if (await hasExamHistoryColumn('is_correct')) {
    row.is_correct = isCorrect;
  } else {
    row.correct_count = isCorrect ? 1 : 0;
    row.total_count = 1;
    row.result_rate = isCorrect ? 100 : 0;
  }

  try {
    const { error } = await supabaseClient
      .from('exam_histories')
      .insert([row]);

    if (error) {
      console.error('学習履歴の保存に失敗しました', error);
      if (error.code === '42501') {
        alert('学習履歴の保存に失敗しました。SupabaseのRLSポリシーが exam_histories への挿入を拒否しています。table policy を確認してください。');
      }
    }
  } catch (error) {
    console.error('学習履歴の保存に失敗しました', error);
    if (error && error.code === '42501') {
      alert('学習履歴の保存に失敗しました。SupabaseのRLSポリシーが exam_histories への挿入を拒否しています。table policy を確認してください。');
    }
  }
}

// ======================================
// ➡️ 次の問題へ移動
// ======================================

document.getElementById("next-btn").addEventListener("click", () => {

  const nextIndex = currentQuestionIndex + 1;

  // 最後の問題か確認
  if (nextIndex >= questions.length) {

    // 完了画面へ
    showCompletionScreen();

    return;

  }

  // 次の問題を表示
  displayQuestion(nextIndex);

});

// ======================================
// 🎉 全問題完了画面
// ======================================
// すべての問題が終わったら完了画面を表示

/**
 * 全問終了後の完了画面を表示します。
 *
 * @returns {void} 処理結果。
 */
function showCompletionScreen() {
  // 最後の問題まで解いたあとに表示する完了画面です。

  const main = document.querySelector(".study-main");

  main.innerHTML = `

    <section class="completion-card">

      <i class="fa-solid fa-trophy completion-icon"></i>

      <h2>すべての問題が完了しました！</h2>

      <p>お疲れ様でした。</p>

      <button id="return-btn" class="return-btn">

        <i class="fa-solid fa-arrow-left"></i>

        メインページへ戻る

      </button>

    </section>

  `;

  document.getElementById("return-btn").addEventListener("click", () => {

    window.location.href = "index.html";

  });

}
