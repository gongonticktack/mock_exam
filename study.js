// ======================================
// Supabase 初期化
// ======================================

let supabaseClient = null;
let questions = [];
let currentQuestionIndex = 0;
let currentExamId = 1;
let answered = false;

function initSupabase() {

  const config = window.SUPABASE_CONFIG;

  console.log('Loaded Supabase config:', config);

  if (!config || !config.url || !config.key) {

    console.error('Supabaseの設定が不足しています。study.htmlのSUPABASE_CONFIGを設定してください。');

    return false;

  }

  supabaseClient = window.supabase.createClient(
    config.url,
    config.key
  );

  return true;

}

// ======================================
// 初期化
// ======================================

window.addEventListener('DOMContentLoaded', async () => {

  // Supabase初期化
  if (!initSupabase()) {

    alert('Supabaseの初期化に失敗しました');

    return;

  }

  // ページを読み込む
  await initPage();

});

// ======================================
// ページ初期化
// ======================================

async function initPage() {

  // エラーハンドラー設定
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

  // console.logをオーバーライドしてHTMLにも表示
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

  // URLクエリからexamIdを取得
  const params = new URLSearchParams(window.location.search);
  const examIdFromQuery = Number(params.get("examId"));

  // localStorageから選択中の資格を取得
  const storedExamId = Number(localStorage.getItem("selectedExamId"));
  const storedExamName = localStorage.getItem("selectedExam");

  console.log('initPage: examIdFromQuery=', examIdFromQuery, 'storedExamId=', storedExamId, 'storedExamName=', storedExamName);

  // 資格データ
  const exams = [

    { id: 1, shortName: "AWS CCP" },
    { id: 2, shortName: "UML L2" },
    { id: 3, shortName: "HTML5 L1" },
    { id: 4, shortName: "アジャイル" }

  ];

  // examIdを優先的に使用
  if (examIdFromQuery && !Number.isNaN(examIdFromQuery)) {
    currentExamId = examIdFromQuery;
  } else if (storedExamId && !Number.isNaN(storedExamId)) {
    currentExamId = storedExamId;
  } else {
    currentExamId = 1;
  }

  console.log('initPage: using currentExamId=', currentExamId);
  const currentExam = exams.find(e => e.id === currentExamId);
  const selectedExamName = storedExamName || currentExam?.shortName || "AWS CCP";

  // ヘッダーに資格名を表示
  document.getElementById("exam-name-header").textContent = selectedExamName;

  // DBから問題を取得
  console.log('initPage: start loading questions for examId=', currentExamId);
  await loadQuestions();

  // 最初の問題を表示
  if (questions.length > 0) {

    displayQuestion(0);

  } else {

    console.warn('initPage: no questions loaded for examId=', currentExamId);
    alert('問題がありません');

  }

}

// ======================================
// DBから問題を取得
// ======================================

async function loadQuestions() {

  try {

    // 問題を取得
    const { data: questionsData, error: questionsError } =
      await supabaseClient
        .from('questions')
        .select('*')
        .eq('exam_id', currentExamId);

    if (questionsError) {

      console.error('Questions fetch error:', questionsError);

      alert('問題の取得に失敗しました');

      return;

    }

    if (!questionsData || questionsData.length === 0) {

      console.warn('questionsData is empty or missing for exam_id', currentExamId);

      alert('該当する問題が見つかりませんでした');

      return;

    }

    // 各問題に対して選択肢を取得
    const questionsWithChoices = [];

    for (const question of questionsData) {

      const { data: choicesData, error: choicesError } =
        await supabaseClient
          .from('choices')
          .select('*')
          .eq('question_id', question.id)
          .order('choice_index', { ascending: true });

      if (choicesError) {

        console.error('Choices fetch error:', choicesError);

        continue;

      }

      questionsWithChoices.push({

        ...question,
        choices: choicesData

      });

    }

    questions = questionsWithChoices;

    console.log('loadQuestions: questions loaded count=', questions.length, 'for examId=', currentExamId, questions);

  } catch (error) {

    console.error('Error loading questions:', error);

    alert('問題の読み込み中にエラーが発生しました');

  }

}

// ======================================
// 問題を表示
// ======================================

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
  console.log('displayQuestion: index=', index, 'questionId=', question.id, 'question=', question.question, 'choices=', question.choices?.length);

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

    checkbox.dataset.is_correct = choice.is_correct;

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
// 回答ボタン
// ======================================

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

        is_correct: parseInt(checkbox.dataset.is_correct)

      });

    }

  });

  console.log('answer-btn: selectedChoices=', selectedChoices);

  // 正解の選択肢を取得
  const correctChoices = [];

  checkboxes.forEach((checkbox) => {

    if (parseInt(checkbox.dataset.is_correct) === 1) {

      correctChoices.push({

        choice_index: parseInt(checkbox.dataset.choice_index)

      });

    }

  });

  // 選択数と正解数が一致するか確認
  const selectedIndices = selectedChoices
    .filter(c => c.is_correct === 1)
    .map(c => c.choice_index)
    .sort((a, b) => a - b);

  const correctIndices = correctChoices
    .map(c => c.choice_index)
    .sort((a, b) => a - b);

  const isCorrect =
    selectedIndices.length === correctIndices.length &&
    selectedIndices.every((val, idx) => val === correctIndices[idx]) &&
    selectedChoices.length === correctIndices.length;

  console.log('answer-btn: correctIndices=', correctIndices, 'selectedIndices=', selectedIndices, 'isCorrect=', isCorrect);

  // 結果を表示
  displayResult(isCorrect, correctChoices, selectedChoices);

  // 選択肢を無効化
  checkboxes.forEach((checkbox) => {

    checkbox.disabled = true;

  });

  // ボタン表示切り替え
  document.getElementById("answer-btn").style.display = "none";

  document.getElementById("next-btn").style.display = "block";

});

// ======================================
// 結果を表示
// ======================================

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

// ======================================
// 次の問題ボタン
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
// 完了画面
// ======================================

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

// ======================================
// 戻るボタン
// ======================================

document.getElementById("back-btn").addEventListener("click", () => {

  window.location.href = "index.html";

});
