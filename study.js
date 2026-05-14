// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================
// 問題取得用のデータベース接続

let supabaseClient = null;
let questions = [];
let currentQuestionIndex = 0;
let currentExamId = 1;
let answered = false;
let loadingProgress = 0;
let currentStudySessionStartedAt = null;
let examHistoryColumnSupport = {};

function initSupabase() {

  const config = window.SUPABASE_CONFIG;

  if (!config || !config.url || !config.key) {

    alert('Supabaseの設定が不足しています。study.htmlのSUPABASE_CONFIGを設定してください.');

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

function startLoading() {

  document.getElementById('loading-overlay').style.display = 'flex';

  loadingProgress = 0;

  updateLoadingProgress();

}

function updateLoadingProgress() {

  document.getElementById('loading-progress-bar').style.width = `${loadingProgress}%`;

  document.getElementById('loading-text').textContent = `${loadingProgress}%`;

}

function stopLoading() {

  document.getElementById('loading-overlay').style.display = 'none';

}

// ======================================
// �🚀 アプリケーション開始
// ======================================

async function startStudyApp() {

  // Supabase初期化
  if (!initSupabase()) {

    alert('Supabaseの初期化に失敗しました');

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

async function initPage() {

  // URLクエリからexamIdと問題インデックスを取得
  const params = new URLSearchParams(window.location.search);
  const examIdFromQuery = Number(params.get("examId"));
  const questionIndexFromQuery = Number(params.get("questionIndex")) || 0;
  const selectedExamFromQuery = params.get("selectedExam");

  // localStorageから選択中の資格を取得
  const storedExamId = Number(localStorage.getItem("selectedExamId"));
  const storedExamName = localStorage.getItem("selectedExam");

  const exams = [
    { id: 1, shortName: "AWS CCP", name: "AWS Cloud Practitioner" },
    { id: 2, shortName: "UML L2", name: "UMLモデリング技能認定 L2" },
    { id: 3, shortName: "HTML5 L1", name: "HTML5 Professional Level1" },
    { id: 4, shortName: "アジャイル", name: "アジャイル開発技術者試験" }
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
    selectedExamId = 1;
  }

  const currentExam = exams.find(e => e.id === selectedExamId);
  if (!selectedExamName) {
    selectedExamName = currentExam?.name || "AWS Cloud Practitioner";
  }

  currentExamId = selectedExamId;
  currentStudySessionStartedAt = new Date().toISOString();

  // ヘッダーに資格名を表示
  document.getElementById("exam-name-header").textContent = selectedExamName;

  // DBから問題を取得
  await loadQuestions();

  // 問題をランダムにシャッフル
  shuffleQuestions();

  // URLパラメータで指定された問題インデックスを使用（ただしシャッフル後は0から開始）
  const startIndex = 0;

  // 問題を表示
  if (questions.length > 0) {

    displayQuestion(startIndex);

  } else {

    alert('問題がありません');

  }

}

async function hasExamHistoryColumn(columnName) {
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

async function loadQuestions() {

  try {

    startLoading();

    // 問題を取得
    const { data: questionsData, error: questionsError } =
      await supabaseClient
        .from('questions')
        .select('*')
        .eq('exam_id', currentExamId);

    if (questionsError) {

      alert('問題の取得に失敗しました');

      stopLoading();

      return;

    }

    if (!questionsData || questionsData.length === 0) {

      alert('該当する問題が見つかりませんでした');

      stopLoading();

      return;

    }

    // 各問題に対して選択肢を取得
    const questionsWithChoices = [];
    const total = questionsData.length;

    for (let i = 0; i < total; i++) {

      const question = questionsData[i];

      const { data: choicesData, error: choicesError } =
        await supabaseClient
          .from('choices')
          .select('*')
          .eq('question_id', question.id)
          .order('choice_index', { ascending: true });

      if (choicesError) {

        continue;

      }

      questionsWithChoices.push({

        ...question,
        choices: choicesData

      });

      // プログレス更新
      loadingProgress = Math.floor(((i + 1) / total) * 100);

      updateLoadingProgress();

    }

    questions = questionsWithChoices;

    stopLoading();

  } catch (error) {

    alert('問題の読み込み中にエラーが発生しました');

    stopLoading();

  }

}

// ======================================
// 🎲 問題をランダムにシャッフル
// ======================================
// Fisher-Yatesアルゴリズムで問題順序をランダム化

function shuffleQuestions() {

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

function displayQuestion(index) {

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
  document.getElementById("question-text").textContent =
    question.question;

  // 選択肢を表示
  const choicesContainer =
    document.getElementById("choices-container");

  choicesContainer.innerHTML = "";

  question.choices.forEach((choice) => {

    const choiceDiv = document.createElement("div");

    choiceDiv.classList.add("choice-item");

    // チェックボックス
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.className = "choice-checkbox";

    checkbox.value = choice.id;

    checkbox.dataset.is_correct = choice.is_correct ? '1' : '0';

    checkbox.dataset.choice_index = choice.choice_index;

    // ラベル
    const label = document.createElement("label");

    label.classList.add("choice-label");

    label.appendChild(checkbox);

    // テキスト
    const textSpan = document.createElement("span");

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

        is_correct: checkbox.dataset.is_correct === '1'

      });

    }

  });

  // 正解の選択肢を取得
  const correctChoices = [];

  checkboxes.forEach((checkbox) => {

    if (checkbox.dataset.is_correct === '1') {

      correctChoices.push({

        choice_index: parseInt(checkbox.dataset.choice_index)

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

});

// ======================================
// 📊 回答結果を表示
// ======================================
// 正解・不正解の判定結果を画面に表示

function displayResult(isCorrect, correctChoices, selectedChoices) {

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

        <p><strong>正解:</strong> ${correctChoices.map(c => c.choice_index).join(', ')}</p>

      </div>

    `;

  }

  resultContent.appendChild(resultDiv);

  resultBox.style.display = "block";

  // 解説を表示
  const explanation = questions[currentQuestionIndex].explanation;

  if (explanation && explanation.trim()) {

    document.getElementById("explanation-text").textContent = explanation;

    document.getElementById("explanation-box").style.display = "block";

  }

}

async function saveExamHistory(isCorrect, questionIndex, selectedChoices) {
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

function showCompletionScreen() {

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
