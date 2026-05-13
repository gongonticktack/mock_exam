// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================

let supabaseClient = null;
let questions = [];
let currentExamId = 1;
let currentSelectedQuestion = null;

function initSupabase() {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.key) {
    console.warn('Supabase設定が不正です。DB機能が使用できません');
    return false;
  }
  supabaseClient = window.supabase.createClient(config.url, config.key);
  return true;
}

// ======================================
// ローディング画面制御
// ======================================

function showLoading() {
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

// ======================================
// 初期化処理
// ======================================

async function initPage() {
  // Supabase初期化
  if (!initSupabase()) {
    alert('Supabaseの初期化に失敗しました');
    return;
  }

  // URLパラメータから資格IDを取得
  const params = new URLSearchParams(window.location.search);
  const examIdFromQuery = Number(params.get("examId"));
  const selectedExamFromQuery = params.get("selectedExam");

  // 資格データ
  const exams = [
    { id: 1, shortName: "AWS CCP" },
    { id: 2, shortName: "UML L2" },
    { id: 3, shortName: "HTML5 L1" },
    { id: 4, shortName: "アジャイル" }
  ];

  // 資格名から資格IDを取得
  let selectedExamId = examIdFromQuery;
  if (selectedExamFromQuery) {
    const exam = exams.find(e => e.shortName === selectedExamFromQuery);
    if (exam) {
      selectedExamId = exam.id;
    }
  }

  if (!selectedExamId) {
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 1;
  }

  currentExamId = selectedExamId;
  const selectedExam = exams.find(e => e.id === selectedExamId);
  const selectedExamName = selectedExam?.shortName || "AWS CCP";

  // 資格名を表示
  document.getElementById("exam-name").textContent = selectedExamName;

  // 問題を読み込む
  await loadQuestions();
}

// ======================================
// DBから問題一覧を読み込む
// ======================================

async function loadQuestions() {
  try {
    showLoading();

    // 問題を取得
    const { data: questionsData, error: questionsError } =
      await supabaseClient
        .from('questions')
        .select('*')
        .eq('exam_id', currentExamId)
        .order('id', { ascending: false });

    if (questionsError) {
      console.error('問題取得エラー:', questionsError);
      alert('問題の取得に失敗しました');
      hideLoading();
      return;
    }

    if (!questionsData || questionsData.length === 0) {
      hideLoading();
      displayNoQuestions();
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
        console.error('選択肢取得エラー:', choicesError);
        continue;
      }

      questionsWithChoices.push({
        ...question,
        choices: choicesData || []
      });
    }

    questions = questionsWithChoices;
    hideLoading();

    // 問題一覧を表示
    displayQuestionsList();

  } catch (error) {
    console.error('問題読み込みエラー:', error);
    alert('問題の読み込み中にエラーが発生しました');
    hideLoading();
  }
}

// ======================================
// 問題が無い場合の表示
// ======================================

function displayNoQuestions() {
  const listContainer = document.getElementById('questions-list');
  listContainer.innerHTML = '<p class="no-questions">問題がありません</p>';
}

// ======================================
// 問題一覧を表示
// ======================================

function displayQuestionsList() {
  const listContainer = document.getElementById('questions-list');
  listContainer.innerHTML = '';

  questions.forEach((question, index) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <div class="question-item-number">${index + 1}</div>
      <div class="question-item-content">
        <div class="question-item-category">${question.category}</div>
        <div class="question-item-text">${question.question.substring(0, 50)}${question.question.length > 50 ? '...' : ''}</div>
      </div>
    `;

    item.addEventListener('click', () => {
      // 全ての問題アイテムからactiveクラスを削除
      document.querySelectorAll('.question-item').forEach(el => {
        el.classList.remove('active');
      });
      // クリックされたアイテムにactiveクラスを追加
      item.classList.add('active');
      // フォームを表示
      displayQuestionEditor(question);
    });

    listContainer.appendChild(item);
  });
}

// ======================================
// 問題の詳細をエディタに表示
// ======================================

function displayQuestionEditor(question) {
  currentSelectedQuestion = question;

  // フォーム要素を取得
  const form = document.getElementById('editor-form');
  const noSelection = document.getElementById('no-selection');
  const questionIdInput = document.getElementById('question-id');
  const categoryInput = document.getElementById('category');
  const questionInput = document.getElementById('question');
  const explanationInput = document.getElementById('explanation');
  const choicesContainer = document.getElementById('choices-container');

  // フォームを表示
  form.style.display = 'block';
  noSelection.style.display = 'none';

  // フォーム値を設定
  questionIdInput.value = question.id;
  categoryInput.value = question.category;
  questionInput.value = question.question;
  explanationInput.value = question.explanation || '';

  // 選択肢コンテナをクリア
  choicesContainer.innerHTML = '';

  // 選択肢を表示
  if (question.choices && question.choices.length > 0) {
    question.choices.forEach((choice, index) => {
      const choiceDiv = createChoiceElement(choice, index);
      choicesContainer.appendChild(choiceDiv);
    });
  }
}

// ======================================
// 選択肢要素を作成
// ======================================

function createChoiceElement(choice, index) {
  const choiceDiv = document.createElement('div');
  choiceDiv.className = 'choice-item';
  choiceDiv.dataset.choiceId = choice.id;

  choiceDiv.innerHTML = `
    <div class="choice-header">
      <label>選択肢 ${choice.choice_index}</label>
      <div class="choice-actions">
        <label>
          <input type="checkbox" class="correct-checkbox" ${choice.is_correct ? 'checked' : ''}>
          正解
        </label>
        <button type="button" class="delete-choice-btn" title="削除">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
    <input 
      type="text" 
      class="choice-input" 
      value="${choice.content}"
      placeholder="選択肢を入力"
    >
  `;

  // 削除ボタンのイベント
  choiceDiv.querySelector('.delete-choice-btn').addEventListener('click', (e) => {
    e.preventDefault();
    choiceDiv.remove();
  });

  return choiceDiv;
}

// ======================================
// 新しい選択肢を追加
// ======================================

document.getElementById('add-choice-btn').addEventListener('click', (e) => {
  e.preventDefault();

  const choicesContainer = document.getElementById('choices-container');
  const choiceCount = choicesContainer.children.length;

  const newChoice = {
    choice_index: choiceCount + 1,
    content: '',
    is_correct: 0
  };

  const choiceDiv = createChoiceElement(newChoice, choiceCount);
  choicesContainer.appendChild(choiceDiv);
});

// ======================================
// フォーム送信（保存）
// ======================================

document.getElementById('editor-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentSelectedQuestion) return;

  try {
    const questionId = document.getElementById('question-id').value;
    const category = document.getElementById('category').value.trim();
    const question = document.getElementById('question').value.trim();
    const explanation = document.getElementById('explanation').value.trim();

    // バリデーション
    if (!category) {
      alert('カテゴリを入力してください');
      return;
    }
    if (!question) {
      alert('問題を入力してください');
      return;
    }

    const choiceItems = document.querySelectorAll('.choice-item');
    if (choiceItems.length < 2) {
      alert('選択肢は2個以上必要です');
      return;
    }

    // 選択肢を取得
    const choices = [];
    const newChoices = [];
    choiceItems.forEach((item, index) => {
      const content = item.querySelector('.choice-input').value.trim();
      const isCorrect = item.querySelector('.correct-checkbox').checked ? 1 : 0;
      const choiceId = item.dataset.choiceId;

      if (!content) {
        throw new Error('選択肢のテキストが空です');
      }

      if (choiceId && choiceId !== 'undefined') {
        // 既存の選択肢
        choices.push({
          id: choiceId,
          choice_index: index + 1,
          content: content,
          is_correct: isCorrect
        });
      } else {
        // 新規の選択肢
        newChoices.push({
          choice_index: index + 1,
          content: content,
          is_correct: isCorrect
        });
      }
    });

    // 問題を更新
    const { error: updateError } =
      await supabaseClient
        .from('questions')
        .update({
          category: category,
          question: question,
          explanation: explanation
        })
        .eq('id', questionId);

    if (updateError) {
      console.error('更新エラー:', updateError);
      alert('問題の更新に失敗しました');
      return;
    }

    // 既存の選択肢を更新
    for (const choice of choices) {
      const { error } =
        await supabaseClient
          .from('choices')
          .update({
            content: choice.content,
            is_correct: choice.is_correct,
            choice_index: choice.choice_index
          })
          .eq('id', choice.id);

      if (error) {
        console.error('選択肢更新エラー:', error);
        alert('選択肢の更新に失敗しました');
        return;
      }
    }

    // 新規の選択肢を追加
    if (newChoices.length > 0) {
      const choicesToInsert = newChoices.map(choice => ({
        question_id: questionId,
        choice_index: choice.choice_index,
        content: choice.content,
        is_correct: choice.is_correct
      }));

      const { error } =
        await supabaseClient
          .from('choices')
          .insert(choicesToInsert);

      if (error) {
        console.error('新規選択肢追加エラー:', error);
        alert('選択肢の追加に失敗しました');
        return;
      }
    }

    alert('問題を保存しました');

    // 問題リストを再読み込み
    await loadQuestions();

  } catch (error) {
    console.error('保存エラー:', error);
    alert('エラーが発生しました: ' + error.message);
  }
});

// ======================================
// 削除ボタン
// ======================================

document.getElementById('delete-btn').addEventListener('click', async (e) => {
  e.preventDefault();

  if (!currentSelectedQuestion) return;

  if (!confirm('この問題と選択肢を削除しますか？')) {
    return;
  }

  try {
    const questionId = document.getElementById('question-id').value;

    // 選択肢を削除
    const { error: choicesError } =
      await supabaseClient
        .from('choices')
        .delete()
        .eq('question_id', questionId);

    if (choicesError) {
      console.error('選択肢削除エラー:', choicesError);
      alert('選択肢の削除に失敗しました');
      return;
    }

    // 問題を削除
    const { error: questionError } =
      await supabaseClient
        .from('questions')
        .delete()
        .eq('id', questionId);

    if (questionError) {
      console.error('問題削除エラー:', questionError);
      alert('問題の削除に失敗しました');
      return;
    }

    alert('問題を削除しました');

    // 問題リストを再読み込み
    currentSelectedQuestion = null;
    document.getElementById('editor-form').style.display = 'none';
    document.getElementById('no-selection').style.display = 'flex';
    await loadQuestions();

  } catch (error) {
    console.error('削除エラー:', error);
    alert('エラーが発生しました: ' + error.message);
  }
});

// ======================================
// キャンセルボタン
// ======================================

document.getElementById('cancel-btn').addEventListener('click', (e) => {
  e.preventDefault();
  currentSelectedQuestion = null;
  document.getElementById('editor-form').style.display = 'none';
  document.getElementById('no-selection').style.display = 'flex';
  document.querySelectorAll('.question-item').forEach(el => {
    el.classList.remove('active');
  });
});

// ======================================
// JSONエクスポート
// ======================================

document.getElementById('export-json-btn').addEventListener('click', () => {
  if (questions.length === 0) {
    alert('エクスポートする問題がありません');
    return;
  }

  // JSON形式にフォーマット
  const exportData = {
    exam_id: currentExamId,
    questions: questions.map(q => ({
      category: q.category,
      question: q.question,
      explanation: q.explanation,
      choices: q.choices.map(c => c.content),
      answers: q.choices
        .filter(c => c.is_correct)
        .map(c => c.choice_index)
    }))
  };

  // JSONファイルをダウンロード
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  downloadFile(blob, 'questions.json');
});

// ======================================
// Excelエクスポート
// ======================================

document.getElementById('export-excel-btn').addEventListener('click', () => {
  if (questions.length === 0) {
    alert('エクスポートする問題がありません');
    return;
  }

  // Excelデータを作成
  const excelData = questions.map(q => ({
    category: q.category,
    question: q.question,
    choices: q.choices.map(c => c.content).join(','),
    answers: q.choices
      .filter(c => c.is_correct)
      .map(c => c.choice_index)
      .join(','),
    explanation: q.explanation || ''
  }));

  // ワークシートを作成
  const ws = XLSX.utils.json_to_sheet(excelData);

  // ワークブックを作成
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');

  // Excelファイルをダウンロード
  XLSX.writeFile(wb, 'questions.xlsx');
});

// ======================================
// ファイルダウンロード
// ======================================

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ======================================
// 検索機能
// ======================================

document.getElementById('search-input').addEventListener('input', (e) => {
  const searchQuery = e.target.value.toLowerCase();

  const questionItems = document.querySelectorAll('.question-item');
  questionItems.forEach(item => {
    const text = item.textContent.toLowerCase();
    if (text.includes(searchQuery)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
});

// ======================================
// ページロード時の初期化
// ======================================

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
