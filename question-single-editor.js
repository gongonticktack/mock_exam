let supabaseClient = null;
let currentQuestion = null;
let originalChoiceIds = new Set();

const MAX_INLINE_IMAGE_BYTES = 1024 * 1024;

const params = new URLSearchParams(window.location.search);
const examId = Number(params.get("examId")) || Number(localStorage.getItem("selectedExamId")) || 3;
const questionId = Number(params.get("questionId"));
const selectedExam = params.get("selectedExam") || localStorage.getItem("selectedExam") || "HTML5 L1";

const loadingOverlay = document.getElementById("loading-overlay");
const editorForm = document.getElementById("editor-form");
const saveStatus = document.getElementById("save-status");
const saveButton = document.getElementById("save-btn");
const deleteButton = document.getElementById("delete-btn");
const closeButton = document.getElementById("close-btn");
const choicesContainer = document.getElementById("choices-container");

/**
 * Supabase クライアントを初期化し、この編集タブで DB 操作できる状態にします。
 *
 * @returns {boolean} 処理結果。
 */
function initSupabase() {
  const config = window.SUPABASE_CONFIG;

  if (!config || !config.url || !config.key) {
    setStatus("Supabase設定が不足しています。", "error");
    return false;
  }

  supabaseClient = window.supabase.createClient(config.url, config.key);
  return true;
}

/**
 * 問題読み込みなどの待ち時間に、ローディング表示を出します。
 *
 * @returns {void} 処理結果。
 */
function showLoading() {
  loadingOverlay.style.display = "flex";
}

/**
 * ローディング表示を閉じ、通常の画面操作に戻します。
 *
 * @returns {void} 処理結果。
 */
function hideLoading() {
  loadingOverlay.style.display = "none";
}

/**
 * 保存や削除などの結果メッセージを画面に表示します。
 *
 * @param {Event} message - この関数に渡す値。
 * @param {string} type  - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function setStatus(message, type = "") {
  saveStatus.textContent = message;
  saveStatus.className = `save-status ${type}`.trim();
}

/**
 * 保存ボタンを保存中の見た目に切り替え、二重送信を防ぎます。
 *
 * @param {boolean} isSaving - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function setSaving(isSaving) {
  saveButton.disabled = isSaving;
  deleteButton.disabled = isSaving;
  closeButton.disabled = isSaving;
}

/**
 * 単独編集タブを閉じるか、閉じられない場合は案内メッセージを表示します。
 *
 * @returns {void} 処理結果。
 */
function closeEditorTab() {
  window.close();
  setTimeout(() => {
    setStatus("このタブを閉じて回答画面に戻ってください。", "success");
    setSaving(false);
  }, 350);
}

/**
 * textarea の現在のカーソル位置へ指定文字列を挿入します。
 *
 * @param {string} textarea - この関数に渡す値。
 * @param {string} text - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n" : "";
  textarea.value = `${before}${prefix}${text}${suffix}${after}`;
  const cursor = before.length + prefix.length + text.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
}

/**
 * 問題文と解説欄へ画像追加ボタンを差し込みます。
 *
 * @returns {void} 処理結果。
 */
function setupImageInsertControls() {
  [
    { textareaId: "question", label: "問題に画像を追加" },
    { textareaId: "explanation", label: "解説に画像を追加" }
  ].forEach(({ textareaId, label }) => {
    const textarea = document.getElementById(textareaId);
    if (!textarea || textarea.dataset.imageControlReady) return;

    const controls = document.createElement("div");
    controls.className = "media-tools";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "media-insert-btn";
    button.innerHTML = `<i class="fa-solid fa-image"></i><span>${label}</span>`;

    const hint = document.createElement("span");
    hint.className = "media-hint";
    hint.textContent = "PNG/JPEG/GIF/WebP, max 1MB";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.className = "media-file-input";

    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        alert("画像ファイルを選択してください。");
        input.value = "";
        return;
      }

      if (file.size > MAX_INLINE_IMAGE_BYTES) {
        alert("画像は1MB以下にしてください。");
        input.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const alt = file.name.replace(/[()[\]]/g, " ").trim() || "image";
        insertAtCursor(textarea, `![${alt}](${reader.result})`);
        input.value = "";
      };
      reader.readAsDataURL(file);
    });

    controls.appendChild(button);
    controls.appendChild(hint);
    controls.appendChild(input);
    textarea.insertAdjacentElement("afterend", controls);
    textarea.dataset.imageControlReady = "true";
  });
}

/**
 * 選択肢1行分の入力欄、正解チェック、削除ボタンを作ります。
 *
 * @param {any} choice  - この関数に渡す値。
 * @param {number} index  - この関数に渡す値。
 * @returns {HTMLElement} 処理結果。
 */
function createChoiceElement(choice = {}, index = 0) {
  const choiceDiv = document.createElement("div");
  choiceDiv.className = "choice-item";

  if (choice.id) {
    choiceDiv.dataset.choiceId = choice.id;
  }

  const header = document.createElement("div");
  header.className = "choice-header";

  const title = document.createElement("span");
  title.className = "choice-title";
  title.textContent = `選択肢 ${index + 1}`;

  const actions = document.createElement("div");
  actions.className = "choice-actions";

  const correctLabel = document.createElement("label");
  correctLabel.className = "correct-label";

  const correctCheckbox = document.createElement("input");
  correctCheckbox.type = "checkbox";
  correctCheckbox.className = "correct-checkbox";
  correctCheckbox.checked = !!choice.is_correct;

  correctLabel.appendChild(correctCheckbox);
  correctLabel.append("正解");

  const deleteChoiceButton = document.createElement("button");
  deleteChoiceButton.type = "button";
  deleteChoiceButton.className = "delete-choice-btn";
  deleteChoiceButton.title = "選択肢を削除";
  deleteChoiceButton.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  deleteChoiceButton.addEventListener("click", () => {
    choiceDiv.remove();
    refreshChoiceTitles();
  });

  actions.appendChild(correctLabel);
  actions.appendChild(deleteChoiceButton);
  header.appendChild(title);
  header.appendChild(actions);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "choice-input";
  input.value = choice.content || "";
  input.placeholder = "選択肢を入力";

  choiceDiv.appendChild(header);
  choiceDiv.appendChild(input);

  return choiceDiv;
}

/**
 * 選択肢を削除・追加した後、表示番号を上から振り直します。
 *
 * @returns {void} 処理結果。
 */
function refreshChoiceTitles() {
  [...choicesContainer.querySelectorAll(".choice-item")].forEach((item, index) => {
    const title = item.querySelector(".choice-title");
    if (title) {
      title.textContent = `選択肢 ${index + 1}`;
    }
  });
}

/**
 * DBから読んだ問題と選択肢を編集フォームに表示します。
 *
 * @param {any} question - この関数に渡す値。
 * @param {Array} choices - この関数に渡す値。
 * @returns {void} 処理結果。
 */
function displayQuestion(question, choices) {
  currentQuestion = { ...question, choices };
  originalChoiceIds = new Set(choices.map(choice => Number(choice.id)).filter(Boolean));

  document.getElementById("exam-name").textContent = selectedExam;
  document.getElementById("question-id-label").textContent = `ID: ${question.id}`;
  document.getElementById("question-id").value = question.id;
  document.getElementById("category").value = question.category || "";
  document.getElementById("question").value = question.question || "";
  document.getElementById("explanation").value = question.explanation || "";

  choicesContainer.innerHTML = "";
  choices.forEach((choice, index) => {
    choicesContainer.appendChild(createChoiceElement(choice, index));
  });
}

/**
 * URL の questionId を使い、編集対象の問題と選択肢を読み込みます。
 *
 * @returns {Promise<void>} 処理結果。
 */
async function loadQuestion() {
  if (!questionId || Number.isNaN(questionId)) {
    setStatus("編集する問題が指定されていません。", "error");
    hideLoading();
    return;
  }

  showLoading();

  try {
    const { data: question, error: questionError } = await supabaseClient
      .from("questions")
      .select("*")
      .eq("id", questionId)
      .eq("exam_id", examId)
      .single();

    if (questionError || !question) {
      console.error("問題取得エラー:", questionError);
      setStatus("対象の問題が見つかりませんでした。", "error");
      return;
    }

    const { data: choices, error: choicesError } = await supabaseClient
      .from("choices")
      .select("*")
      .eq("question_id", questionId)
      .order("choice_index", { ascending: true });

    if (choicesError) {
      console.error("選択肢取得エラー:", choicesError);
      setStatus("選択肢の読み込みに失敗しました。", "error");
      return;
    }

    displayQuestion(question, choices || []);
  } catch (error) {
    console.error("問題読み込みエラー:", error);
    setStatus(`読み込み中にエラーが発生しました: ${error.message}`, "error");
  } finally {
    hideLoading();
  }
}

/**
 * 編集フォームに入力された値を保存用のデータへまとめます。
 *
 * @returns {object} 処理結果。
 */
function collectFormData() {
  const category = document.getElementById("category").value.trim();
  const question = document.getElementById("question").value.trim();
  const explanation = document.getElementById("explanation").value.trim();
  const choiceItems = [...choicesContainer.querySelectorAll(".choice-item")];

  if (!category) {
    throw new Error("カテゴリを入力してください。");
  }

  if (!question) {
    throw new Error("問題文を入力してください。");
  }

  if (choiceItems.length < 2) {
    throw new Error("選択肢は2件以上必要です。");
  }

  const choices = choiceItems.map((item, index) => {
    const content = item.querySelector(".choice-input").value.trim();

    if (!content) {
      throw new Error("空の選択肢があります。");
    }

    return {
      id: item.dataset.choiceId ? Number(item.dataset.choiceId) : null,
      choice_index: index + 1,
      content,
      is_correct: item.querySelector(".correct-checkbox").checked ? 1 : 0
    };
  });

  if (!choices.some(choice => choice.is_correct)) {
    throw new Error("正解の選択肢を1つ以上選んでください。");
  }

  return { category, question, explanation, choices };
}

/**
 * フォーム内容を DB に保存し、既存選択肢の更新や新規追加も行います。
 *
 * @returns {Promise<void>} 処理結果。
 */
async function saveQuestion() {
  if (!currentQuestion) {
    return;
  }

  setSaving(true);
  setStatus("保存中...");

  try {
    const formData = collectFormData();
    const existingChoices = formData.choices.filter(choice => choice.id);
    const newChoices = formData.choices.filter(choice => !choice.id);
    const currentChoiceIds = new Set(existingChoices.map(choice => Number(choice.id)));
    const deletedChoiceIds = [...originalChoiceIds].filter(id => !currentChoiceIds.has(id));

    const { error: questionError } = await supabaseClient
      .from("questions")
      .update({
        category: formData.category,
        question: formData.question,
        explanation: formData.explanation
      })
      .eq("id", currentQuestion.id)
      .eq("exam_id", examId);

    if (questionError) {
      throw questionError;
    }

    for (const choice of existingChoices) {
      const { error } = await supabaseClient
        .from("choices")
        .update({
          choice_index: choice.choice_index,
          content: choice.content,
          is_correct: choice.is_correct
        })
        .eq("id", choice.id)
        .eq("question_id", currentQuestion.id);

      if (error) {
        throw error;
      }
    }

    if (newChoices.length > 0) {
      const { error } = await supabaseClient
        .from("choices")
        .insert(newChoices.map(choice => ({
          question_id: currentQuestion.id,
          choice_index: choice.choice_index,
          content: choice.content,
          is_correct: choice.is_correct
        })));

      if (error) {
        throw error;
      }
    }

    if (deletedChoiceIds.length > 0) {
      const { error } = await supabaseClient
        .from("choices")
        .delete()
        .in("id", deletedChoiceIds)
        .eq("question_id", currentQuestion.id);

      if (error) {
        throw error;
      }
    }

    setStatus("保存しました。タブを閉じます...", "success");
    closeEditorTab();
  } catch (error) {
    console.error("保存エラー:", error);
    setStatus(`保存に失敗しました: ${error.message}`, "error");
    setSaving(false);
  }
}

/**
 * 現在編集中の問題と、その問題に紐づく選択肢を削除します。
 *
 * @returns {Promise<void>} 処理結果。
 */
async function deleteQuestion() {
  if (!currentQuestion) {
    return;
  }

  if (!confirm("この問題と選択肢を削除しますか？")) {
    return;
  }

  setSaving(true);
  setStatus("削除中...");

  try {
    const { error: choicesError } = await supabaseClient
      .from("choices")
      .delete()
      .eq("question_id", currentQuestion.id);

    if (choicesError) {
      throw choicesError;
    }

    const { error: questionError } = await supabaseClient
      .from("questions")
      .delete()
      .eq("id", currentQuestion.id)
      .eq("exam_id", examId);

    if (questionError) {
      throw questionError;
    }

    setStatus("削除しました。タブを閉じます...", "success");
    closeEditorTab();
  } catch (error) {
    console.error("削除エラー:", error);
    setStatus(`削除に失敗しました: ${error.message}`, "error");
    setSaving(false);
  }
}

document.getElementById("add-choice-btn").addEventListener("click", () => {
  choicesContainer.appendChild(createChoiceElement({}, choicesContainer.children.length));
});

editorForm.addEventListener("submit", event => {
  event.preventDefault();
  saveQuestion();
});

deleteButton.addEventListener("click", deleteQuestion);
closeButton.addEventListener("click", closeEditorTab);

if (initSupabase()) {
  setupImageInsertControls();
  loadQuestion();
} else {
  hideLoading();
}
