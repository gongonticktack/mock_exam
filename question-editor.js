// ======================================
// question-editor.js
// ======================================
// 問題編集画面（question-editor.html）を動かすためのファイルです。
//
// 主な役割:
// 1. 選択中の資格に登録済みの問題一覧をDBから読み込む
// 2. 左側の一覧から問題を選ぶと、右側の編集フォームへ表示する
// 3. 問題文・解説・選択肢・正解チェックを保存する
// 4. 問題削除、JSON/Excelエクスポート、画像Data URI挿入を行う
//
// 初心者向けメモ:
// - currentSelectedQuestion は、今編集している問題を覚えておく変数です。
// - choices テーブルは questions テーブルと question_id でつながっています。
// - 画像はDBへ別ファイル保存せず、本文中に data:image/... として埋め込んでいます。

// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================

let supabaseClient = null;
let questions = [];
let currentExamId = 1;
let currentSelectedQuestion = null;
let showOnlyMissingExplanation = false;
let showOnlyDuplicateCandidates = false;
let targetQuestionId = null;
let duplicateCandidateIds = new Set();
let duplicateCandidateMeta = new Map();
let displayNumberByQuestionId = new Map();
let selectedQuestionIds = new Set();
const MAX_INLINE_IMAGE_BYTES = 1024 * 1024;

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

function stripMediaMarkup(text) {
  // 問題一覧では画像そのものを表示せず、[画像] という短い表示に置き換えます。
  // 一覧が長くなりすぎるのを防ぐためです。
  return String(text || '').replace(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, '[\u753b\u50cf]');
}

function hasExplanation(question) {
  return !!String(question?.explanation || '').trim();
}

function normalizeForDuplicateCheck(text) {
  return stripMediaMarkup(text)
    .toLowerCase()
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~、。，．・「」『』（）【】［］｛｝！？\s]/g, '')
    .trim();
}

function getDuplicateCheckText(question) {
  const choicesText = (question.choices || [])
    .map(choice => choice.content || '')
    .join(' ');

  return normalizeForDuplicateCheck(`${question.question || ''} ${choicesText}`);
}

function getTextTokens(text) {
  const tokens = new Set();

  for (let i = 0; i < text.length - 1; i++) {
    tokens.add(text.slice(i, i + 2));
  }

  return tokens;
}

function getTokenSimilarity(leftText, rightText) {
  const leftTokens = getTextTokens(leftText);
  const rightTokens = getTextTokens(rightText);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  leftTokens.forEach(token => {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  });

  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function updateDuplicateCandidates() {
  duplicateCandidateIds = new Set();
  duplicateCandidateMeta = new Map();

  const comparableQuestions = questions
    .map((question, index) => ({
      id: Number(question.id),
      originalIndex: index,
      text: getDuplicateCheckText(question)
    }))
    .filter(item => item.id && item.text.length >= 20);
  const duplicatePairs = [];

  for (let i = 0; i < comparableQuestions.length; i++) {
    for (let j = i + 1; j < comparableQuestions.length; j++) {
      const current = comparableQuestions[i];
      const other = comparableQuestions[j];
      const shorterLength = Math.min(current.text.length, other.text.length);
      const longerLength = Math.max(current.text.length, other.text.length);

      if (shorterLength / longerLength < 0.58) {
        continue;
      }

      const isExactMatch = current.text === other.text;
      const isSimilar = getTokenSimilarity(current.text, other.text) >= 0.72;

      if (isExactMatch || isSimilar) {
        duplicatePairs.push([current.id, other.id]);
      }
    }
  }

  if (duplicatePairs.length === 0) {
    return;
  }

  const parent = new Map(comparableQuestions.map(item => [item.id, item.id]));
  const findParent = (id) => {
    let current = id;
    while (parent.get(current) !== current) {
      current = parent.get(current);
    }
    return current;
  };
  const unite = (leftId, rightId) => {
    const leftRoot = findParent(leftId);
    const rightRoot = findParent(rightId);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };

  duplicatePairs.forEach(([leftId, rightId]) => unite(leftId, rightId));

  const indexById = new Map(comparableQuestions.map(item => [item.id, item.originalIndex]));
  const grouped = new Map();
  comparableQuestions.forEach(item => {
    const root = findParent(item.id);
    if (!grouped.has(root)) {
      grouped.set(root, []);
    }
    grouped.get(root).push(item.id);
  });

  const groups = [...grouped.values()]
    .filter(group => group.length > 1)
    .map(group => group.sort((leftId, rightId) => indexById.get(leftId) - indexById.get(rightId)))
    .sort((leftGroup, rightGroup) => indexById.get(leftGroup[0]) - indexById.get(rightGroup[0]));

  groups.forEach((group, groupIndex) => {
    group.forEach((id, itemIndex) => {
      duplicateCandidateIds.add(id);
      duplicateCandidateMeta.set(id, {
        group: groupIndex + 1,
        order: itemIndex + 1,
        sortKey: groupIndex * 1000 + itemIndex,
        relatedIds: group.filter(relatedId => relatedId !== id)
      });
    });
  });
}

function insertAtCursor(textarea, text) {
  // textarea のカーソル位置に文字列を差し込みます。
  // 画像を追加するとき、本文の末尾ではなくカーソル位置へ入れられるようにしています。
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !before.endsWith('\n') ? '\n' : '';
  const suffix = after && !after.startsWith('\n') ? '\n' : '';
  textarea.value = `${before}${prefix}${text}${suffix}${after}`;
  const cursor = before.length + prefix.length + text.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
}

function setupImageInsertControls() {
  // HTMLを直接大きく変えず、JavaScriptで「画像追加」ボタンを差し込みます。
  // 選んだ画像はFileReaderでData URIに変換し、本文へMarkdown風に挿入します。
  [
    { textareaId: 'question', label: '\u554f\u984c\u306b\u753b\u50cf\u3092\u8ffd\u52a0' },
    { textareaId: 'explanation', label: '\u89e3\u8aac\u306b\u753b\u50cf\u3092\u8ffd\u52a0' }
  ].forEach(({ textareaId, label }) => {
    const textarea = document.getElementById(textareaId);
    if (!textarea || textarea.dataset.imageControlReady) return;

    const controls = document.createElement('div');
    controls.className = 'media-tools';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-insert-btn';
    button.innerHTML = '<i class="fa-solid fa-image"></i><span>' + label + '</span>';

    const hint = document.createElement('span');
    hint.className = 'media-hint';
    hint.textContent = 'PNG/JPEG/GIF/WebP, max 1MB';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.className = 'media-file-input';

    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('\u753b\u50cf\u30d5\u30a1\u30a4\u30eb\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044');
        input.value = '';
        return;
      }
      if (file.size > MAX_INLINE_IMAGE_BYTES) {
        alert('\u753b\u50cf\u306f1MB\u4ee5\u4e0b\u306b\u3057\u3066\u304f\u3060\u3055\u3044');
        input.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const alt = file.name.replace(/[()[\]]/g, ' ').trim() || 'image';
        insertAtCursor(textarea, `![${alt}](${reader.result})`);
        input.value = '';
      };
      reader.readAsDataURL(file);
    });

    controls.appendChild(button);
    controls.appendChild(hint);
    controls.appendChild(input);
    textarea.insertAdjacentElement('afterend', controls);
    textarea.dataset.imageControlReady = 'true';
  });
}

// ======================================
// 初期化処理
// ======================================

async function initPage() {
  // URLやlocalStorageから編集対象の資格を決めて、問題一覧を読み込みます。
  // Supabase初期化
  if (!initSupabase()) {
    alert('Supabaseの初期化に失敗しました');
    return;
  }

  // URLパラメータから資格IDを取得
  const params = new URLSearchParams(window.location.search);
  const examIdFromQuery = Number(params.get("examId"));
  const selectedExamFromQuery = params.get("selectedExam");
  const questionIdFromQuery = Number(params.get("questionId"));

  // 資格データ
  const exams = [
    { id: 1, shortName: "AWS CCP" },
    { id: 2, shortName: "UML L2" },
    { id: 3, shortName: "HTML5 L1" },
    { id: 4, shortName: "アジャイル" },
    { id: 5, shortName: "AWS SAA" },
    { id: 6, shortName: "JCSQE 初級" }
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
    selectedExamId = Number(localStorage.getItem("selectedExamId")) || 3;
  }

  currentExamId = selectedExamId;
  targetQuestionId = questionIdFromQuery && !Number.isNaN(questionIdFromQuery)
    ? questionIdFromQuery
    : null;
  const selectedExam = exams.find(e => e.id === selectedExamId);
  const selectedExamName = selectedExam?.shortName || "HTML5 L1";

  // 資格名を表示
  document.getElementById("exam-name").textContent = selectedExamName;

  // 問題を読み込む
  setupImageInsertControls();
  await loadQuestions();
}

// ======================================
// DBから問題一覧を読み込む
// ======================================

async function loadQuestions() {
  // questions テーブルから問題を取得し、
  // 各問題に紐づく choices テーブルの選択肢も一緒に読み込みます。
  try {
    showLoading();

    // 問題を取得
    const { data: questionsData, error: questionsError } =
      await supabaseClient
        .from('questions')
        .select('*,choices(*)')
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

    questions = questionsData.map(question => ({
      ...question,
      choices: [...(question.choices || [])]
        .sort((a, b) => (a.choice_index || 0) - (b.choice_index || 0))
    }));
    updateDuplicateCandidates();
    hideLoading();
    displayQuestionsList();
    return;

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
    updateDuplicateCandidates();
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
  selectedQuestionIds = new Set();
  updateQuestionsCount(0);
  updateBulkDeleteButton();
}

function selectQuestionItem(item, question) {
  document.querySelectorAll('.question-item').forEach(el => {
    el.classList.remove('active');
  });

  item.classList.add('active');
  displayQuestionEditor(question);
}

function selectTargetQuestion() {
  if (!targetQuestionId) {
    return;
  }

  const targetItem = document.querySelector(`.question-item[data-question-id="${targetQuestionId}"]`);
  const targetQuestion = questions.find(question => Number(question.id) === targetQuestionId);

  if (!targetItem || !targetQuestion) {
    return;
  }

  selectQuestionItem(targetItem, targetQuestion);
  targetItem.scrollIntoView({ block: 'center' });
}

// ======================================
// 問題一覧を表示
// ======================================

function displayQuestionsList() {
  // 左側の問題一覧を作ります。
  // クリックされた問題だけが active 表示になり、右側の編集フォームへ内容が入ります。
  const listContainer = document.getElementById('questions-list');
  listContainer.innerHTML = '';
  selectedQuestionIds = new Set([...selectedQuestionIds].filter(id => {
    return questions.some(question => Number(question.id) === id);
  }));
  displayNumberByQuestionId = new Map();

  questions.forEach((question, index) => {
    displayNumberByQuestionId.set(Number(question.id), index + 1);
  });

  questions.forEach((question, index) => {
    const duplicateMeta = duplicateCandidateMeta.get(Number(question.id));
    const questionId = Number(question.id);
    const item = document.createElement('div');
    item.className = 'question-item';
    item.classList.toggle('selected', selectedQuestionIds.has(questionId));
    item.dataset.questionId = question.id;
    item.dataset.originalIndex = index;
    item.dataset.hasExplanation = hasExplanation(question) ? 'true' : 'false';
    item.dataset.isDuplicateCandidate = duplicateCandidateIds.has(Number(question.id)) ? 'true' : 'false';
    item.dataset.duplicateSortKey = duplicateMeta ? duplicateMeta.sortKey : 999999;

    const numberDiv = document.createElement('div');
    numberDiv.className = 'question-item-number';
    numberDiv.textContent = index + 1;

    const selectLabel = document.createElement('label');
    selectLabel.className = 'question-select';
    selectLabel.title = '削除対象に選択';

    const selectCheckbox = document.createElement('input');
    selectCheckbox.type = 'checkbox';
    selectCheckbox.checked = selectedQuestionIds.has(questionId);
    selectCheckbox.setAttribute('aria-label', `問題 ${index + 1} を選択`);

    const selectMark = document.createElement('span');
    selectMark.className = 'question-select-mark';
    selectMark.innerHTML = '<i class="fa-solid fa-check"></i>';

    selectLabel.appendChild(selectCheckbox);
    selectLabel.appendChild(selectMark);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'question-item-content';

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'question-item-category';
    categoryDiv.textContent = question.category;

    if (duplicateMeta) {
      const duplicateBadge = document.createElement('div');
      duplicateBadge.className = 'duplicate-badge';
      const relatedDisplayNumbers = duplicateMeta.relatedIds
        .map(id => displayNumberByQuestionId.get(id))
        .filter(Boolean);
      duplicateBadge.textContent =
        `重複候補 #${duplicateMeta.group} / 重複対象: ${relatedDisplayNumbers.join(', ')}`;
      contentDiv.appendChild(duplicateBadge);
    }

    const textDiv = document.createElement('div');
    textDiv.className = 'question-item-text';
    const questionText = stripMediaMarkup(question.question || '');
    textDiv.textContent = questionText.length > 50 ? questionText.substring(0, 50) + '...' : questionText;
    item.dataset.filterText = `${question.category || ''} ${questionText}`.toLowerCase();

    contentDiv.appendChild(categoryDiv);
    contentDiv.appendChild(textDiv);
    item.appendChild(selectLabel);
    item.appendChild(numberDiv);
    item.appendChild(contentDiv);

    selectLabel.addEventListener('click', event => {
      event.stopPropagation();
    });

    selectCheckbox.addEventListener('change', () => {
      if (selectCheckbox.checked) {
        selectedQuestionIds.add(questionId);
      } else {
        selectedQuestionIds.delete(questionId);
      }

      item.classList.toggle('selected', selectCheckbox.checked);
      updateBulkDeleteButton();
    });

    item.addEventListener('click', () => {
      selectQuestionItem(item, question);
    });

    listContainer.appendChild(item);
  });

  applyQuestionFilters();
  updateBulkDeleteButton();
  selectTargetQuestion();
}

function sortQuestionItemsForCurrentFilter() {
  const listContainer = document.getElementById('questions-list');
  const items = Array.from(listContainer.querySelectorAll('.question-item'));

  items
    .sort((leftItem, rightItem) => {
      if (showOnlyDuplicateCandidates) {
        return Number(leftItem.dataset.duplicateSortKey) - Number(rightItem.dataset.duplicateSortKey);
      }

      return Number(leftItem.dataset.originalIndex) - Number(rightItem.dataset.originalIndex);
    })
    .forEach(item => listContainer.appendChild(item));
}

// ======================================
// 問題の詳細をエディタに表示
// ======================================

function displayQuestionEditor(question) {
  // 選択された問題データを、右側の編集フォームへ流し込みます。
  // 既存の選択肢も createChoiceElement() で1行ずつ作ります。
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
  // 選択肢1件分の入力欄を作る関数です。
  // 既存の選択肢にも、新しく追加した空の選択肢にも使います。
  const choiceDiv = document.createElement('div');
  choiceDiv.className = 'choice-item';
  choiceDiv.dataset.choiceId = choice.id;

  const choiceHeader = document.createElement('div');
  choiceHeader.className = 'choice-header';

  const choiceLabel = document.createElement('label');
  choiceLabel.textContent = `選択肢 ${choice.choice_index}`;

  const choiceActions = document.createElement('div');
  choiceActions.className = 'choice-actions';

  const correctLabel = document.createElement('label');
  const correctCheckbox = document.createElement('input');
  correctCheckbox.type = 'checkbox';
  correctCheckbox.className = 'correct-checkbox';
  correctCheckbox.checked = !!choice.is_correct;
  correctLabel.appendChild(correctCheckbox);
  correctLabel.append(' 正解');

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-choice-btn';
  deleteBtn.title = '削除';
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';

  choiceActions.appendChild(correctLabel);
  choiceActions.appendChild(deleteBtn);
  choiceHeader.appendChild(choiceLabel);
  choiceHeader.appendChild(choiceActions);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'choice-input';
  input.value = choice.content || '';
  input.placeholder = '選択肢を入力';

  choiceDiv.appendChild(choiceHeader);
  choiceDiv.appendChild(input);

  // 削除ボタンのイベント
  deleteBtn.addEventListener('click', (e) => {
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
  // 保存ボタンが押されたときの処理です。
  // まず入力チェックを行い、questions を更新し、choices は既存更新と新規追加に分けて保存します。
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
  // 削除ボタンが押されたときの処理です。
  // choices は questions に紐づくため、先に選択肢を消してから問題を消します。
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
  // 現在読み込んでいる問題一覧をJSONファイルとして書き出します。
  // バックアップや別環境への移行に使えます。
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
  // 現在読み込んでいる問題一覧をExcelファイルとして書き出します。
  // SheetJS(XLSX)ライブラリを使ってブラウザ上で生成しています。
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
  // Blob（ブラウザ上のファイルのようなデータ）を一時URLにしてダウンロードさせます。
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

function applyQuestionFilters() {
  const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
  sortQuestionItemsForCurrentFilter();

  const questionItems = document.querySelectorAll('.question-item');
  let visibleCount = 0;
  questionItems.forEach(item => {
    const text = item.dataset.filterText || item.textContent.toLowerCase();
    const matchesSearch = text.includes(searchQuery);
    const matchesExplanationFilter =
      !showOnlyMissingExplanation || item.dataset.hasExplanation === 'false';
    const matchesDuplicateFilter =
      !showOnlyDuplicateCandidates || item.dataset.isDuplicateCandidate === 'true';

    if (matchesSearch && matchesExplanationFilter && matchesDuplicateFilter) {
      item.style.display = 'flex';
      visibleCount += 1;
    } else {
      item.style.display = 'none';
    }
  });

  updateQuestionsCount(visibleCount);
}

function updateQuestionsCount(visibleCount) {
  const countLabel = document.getElementById('questions-count');
  if (!countLabel) {
    return;
  }

  countLabel.textContent = `${visibleCount} / ${questions.length}件`;
}

function updateBulkDeleteButton() {
  const bulkDeleteButton = document.getElementById('bulk-delete-btn');
  if (!bulkDeleteButton) {
    return;
  }

  const selectedCount = selectedQuestionIds.size;
  bulkDeleteButton.disabled = selectedCount === 0;
  bulkDeleteButton.innerHTML =
    `<i class="fa-solid fa-trash-can"></i>${selectedCount > 0 ? `${selectedCount}件を削除` : '選択した問題を削除'}`;
}

document.getElementById('search-input').addEventListener('input', () => {
  applyQuestionFilters();
});

const bulkDeleteButton = document.getElementById('bulk-delete-btn');
if (bulkDeleteButton) {
  bulkDeleteButton.addEventListener('click', async () => {
    const targetIds = [...selectedQuestionIds];
    if (targetIds.length === 0) {
      return;
    }

    if (!confirm(`${targetIds.length}件の問題と選択肢を削除しますか？`)) {
      return;
    }

    try {
      showLoading();

      const { error: choicesError } = await supabaseClient
        .from('choices')
        .delete()
        .in('question_id', targetIds);

      if (choicesError) {
        console.error('一括削除: 選択肢削除エラー:', choicesError);
        alert('選択肢の一括削除に失敗しました');
        hideLoading();
        return;
      }

      const { error: questionsError } = await supabaseClient
        .from('questions')
        .delete()
        .in('id', targetIds);

      if (questionsError) {
        console.error('一括削除: 問題削除エラー:', questionsError);
        alert('問題の一括削除に失敗しました');
        hideLoading();
        return;
      }

      if (currentSelectedQuestion && targetIds.includes(Number(currentSelectedQuestion.id))) {
        currentSelectedQuestion = null;
        document.getElementById('editor-form').style.display = 'none';
        document.getElementById('no-selection').style.display = 'flex';
      }

      selectedQuestionIds = new Set();
      await loadQuestions();
      alert(`${targetIds.length}件の問題を削除しました`);
    } catch (error) {
      console.error('一括削除エラー:', error);
      alert('一括削除中にエラーが発生しました: ' + error.message);
      hideLoading();
    }
  });
}

const missingExplanationFilterButton = document.getElementById('missing-explanation-filter-btn');
if (missingExplanationFilterButton) {
  missingExplanationFilterButton.addEventListener('click', () => {
    showOnlyMissingExplanation = !showOnlyMissingExplanation;
    missingExplanationFilterButton.classList.toggle('active', showOnlyMissingExplanation);
    missingExplanationFilterButton.setAttribute('aria-pressed', String(showOnlyMissingExplanation));
    applyQuestionFilters();
  });
}

const duplicateFilterButton = document.getElementById('duplicate-filter-btn');
if (duplicateFilterButton) {
  duplicateFilterButton.addEventListener('click', () => {
    showOnlyDuplicateCandidates = !showOnlyDuplicateCandidates;
    duplicateFilterButton.classList.toggle('active', showOnlyDuplicateCandidates);
    duplicateFilterButton.setAttribute('aria-pressed', String(showOnlyDuplicateCandidates));
    applyQuestionFilters();
  });
}

// ======================================
// ページロード時の初期化
// ======================================

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
