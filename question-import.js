// ======================================
// question-import.js
// ======================================
// 問題追加画面（question-import.html）を動かすためのファイルです。
//
// 主な役割:
// 1. UIから1問ずつ問題を直接登録する
// 2. スマホのカメラで撮影した画像をCloudflare Workers AIへ送り、OCR候補を作る
// 3. Excel / JSON ファイルを読み込んで一括登録する
// 4. 問題文・解説に画像Data URIを埋め込めるようにする
//
// 初心者向けメモ:
// - 直接追加も一括インポートも、最終的には questions と choices テーブルへ保存します。
// - OCRで撮影した画像は端末に保存せず、メモリ上のBlobとしてAPIへ送ります。
// - OCR結果はそのまま保存せず、フォームに入れてから人が確認・調整する前提です。

// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================
// 問題登録用のデータベース接続を初期化

let supabaseClient = null;
const MAX_DIRECT_IMAGE_BYTES = 1024 * 1024;

function initSupabase() {

  const config = window.SUPABASE_CONFIG;

  if (!config.url || !config.key) {

    alert('Supabaseの設定が不足しています');

    return false;

  }

  supabaseClient = window.supabase.createClient(
    config.url,
    config.key
  );

  return true;

}

// ======================================
// ログ表示
// ======================================

function addLog(message, type) {

  const p =
    document.createElement("p");

  p.textContent =
    message;

  if (type === "success") {

    p.classList.add("log-success");

  } else {

    p.classList.add("log-error");

  }

  logArea.prepend(p);

}

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
// 選択中試験
// ======================================

// ここでは localStorage に保存した資格名を取得
// Cloudflare API では exam_id を受け取るため、
// 必要なら数値 ID に変換する処理を追加してください。
const selectedExamName =
  localStorage.getItem("selectedExam")
  || "AWS CCP";

// exams 配列から ID を取得
const selectedExam = exams.find(exam => exam.shortName === selectedExamName)?.id || 1;

// 資格名表示
const examName =
  document.getElementById("exam-name");

examName.textContent =
  selectedExamName;

// ======================================
// HTML取得
// ======================================

const importButton =
  document.getElementById("import-btn");

const fileInput =
  document.getElementById("import-file");

const logArea =
  document.getElementById("log-area");

const confirmCard =
  document.getElementById("confirm-card");

const confirmList =
  document.getElementById("confirm-list");

const confirmOkBtn =
  document.getElementById("confirm-ok-btn");

const confirmCancelBtn =
  document.getElementById("confirm-cancel-btn");

const directFormState = {
  choiceCount: 0,
  ocrStream: null,
  ocrCandidates: []
};

function renderRichText(container, text) {
  // 確認画面で、本文中の画像記法を実際の<img>として表示します。
  // innerHTMLへ直接入れず、createTextNode/createElementで作ることで安全性を高めています。
  container.innerHTML = "";

  const value = String(text || "");
  const imagePattern = /!\[([^\]]*)]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match;

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

function insertAtCursor(textarea, text) {
  // 問題文・解説のカーソル位置へ、画像記法などの文字列を差し込みます。
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

function insertDirectImage(textareaId) {
  // 直接追加フォームの「画像を追加」ボタン用です。
  // ファイルはData URIに変換して、問題文または解説の中に保存します。
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/gif,image/webp";

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("\u753b\u50cf\u30d5\u30a1\u30a4\u30eb\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044");
      return;
    }

    if (file.size > MAX_DIRECT_IMAGE_BYTES) {
      alert("\u753b\u50cf\u306f1MB\u4ee5\u4e0b\u306b\u3057\u3066\u304f\u3060\u3055\u3044");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const alt = file.name.replace(/[()[\]]/g, " ").trim() || "image";
      insertAtCursor(textarea, `![${alt}](${reader.result})`);
    };
    reader.readAsDataURL(file);
  });

  input.click();
}

function setupMobileOcrControls() {
  // OCRモーダル内のボタンにイベントを登録します。
  // カメラ開始、閉じる、OCR実行、結果クリアをここでつなぎます。
  const scanBtn = document.getElementById("direct-ocr-open-btn");
  const closeBtn = document.getElementById("direct-ocr-close-btn");
  const captureBtn = document.getElementById("direct-ocr-capture-btn");
  const retakeBtn = document.getElementById("direct-ocr-retake-btn");

  if (!scanBtn || !closeBtn || !captureBtn || !retakeBtn) return;

  scanBtn.addEventListener("click", openOcrScanner);
  closeBtn.addEventListener("click", closeOcrScanner);
  captureBtn.addEventListener("click", captureOcrFrame);
  retakeBtn.addEventListener("click", () => {
    const results = document.getElementById("direct-ocr-results");
    setOcrStatus("");
    if (results) {
      results.innerHTML = "";
    }
  });
}

async function openOcrScanner() {
  // スマホの背面カメラを優先して起動します。
  // getUserMedia はHTTPS環境でないと使えないため、Cloudflare Pages本番URLでの利用を想定しています。
  const modal = document.getElementById("direct-ocr-modal");
  const video = document.getElementById("direct-ocr-video");
  if (!modal || !video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    alert("This browser does not support camera capture.");
    return;
  }

  try {
    directFormState.ocrStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = directFormState.ocrStream;
    modal.style.display = "flex";
    setOcrStatus("");
  } catch (error) {
    console.error("Camera start error:", error);
    alert("Camera could not be started. Please allow camera access.");
  }
}

function closeOcrScanner() {
  // カメラを止め、canvasやOCR結果を消します。
  // スマホ上に撮影画像を残さないための後片付けです。
  const modal = document.getElementById("direct-ocr-modal");
  const video = document.getElementById("direct-ocr-video");
  const canvas = document.getElementById("direct-ocr-canvas");
  const results = document.getElementById("direct-ocr-results");

  if (directFormState.ocrStream) {
    directFormState.ocrStream.getTracks().forEach((track) => track.stop());
    directFormState.ocrStream = null;
  }

  if (video) {
    video.srcObject = null;
  }

  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }

  if (results) {
    results.innerHTML = "";
  }

  setOcrStatus("");

  if (modal) {
    modal.style.display = "none";
  }
}

function setOcrStatus(message) {
  const status = document.getElementById("direct-ocr-status");
  if (status) {
    status.textContent = message;
  }
}

async function captureOcrFrame() {
  // 現在カメラに映っている1フレームだけをcanvasへ描画し、
  // Blobに変換してCloudflare OCR APIへ送信します。
  // toDataURLは使わず、端末側にBase64文字列を残しにくい形にしています。
  const video = document.getElementById("direct-ocr-video");
  const canvas = document.getElementById("direct-ocr-canvas");
  const captureBtn = document.getElementById("direct-ocr-capture-btn");
  if (!video || !canvas || !captureBtn) return;

  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, width, height);

  try {
    captureBtn.disabled = true;
    setOcrStatus("Sending image to Cloudflare Workers AI...");
    const blob = await canvasToBlob(canvas);
    const result = await extractQuestionsWithCloudflareOcr(blob);
    const candidates = normalizeCloudflareOcrCandidates(result.questions);
    const rawText = result.rawText || "";

    showOcrCandidates(candidates, rawText);
    setOcrStatus(candidates.length ? "OCR complete. Select a candidate below." : "OCR complete, but no question-like text was found.");
  } catch (error) {
    console.error("OCR error:", error);
    setOcrStatus("OCR failed.");
    alert("OCR failed. Please try a clearer photo.");
  } finally {
    captureBtn.disabled = false;
    canvas.width = 0;
    canvas.height = 0;
  }
}

function canvasToBlob(canvas) {
  // canvasの画像をBlobへ変換します。
  // Blobはメモリ上の一時データで、ファイルとして端末に保存されません。
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to capture image."));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.86);
  });
}

async function extractQuestionsWithCloudflareOcr(blob) {
  // Cloudflare Pages Functionへ画像Blobを送り、Workers AIのOCR結果を受け取ります。
  // cache: "no-store" を付け、ブラウザキャッシュに残しにくくしています。
  const formData = new FormData();
  formData.append("image", blob, "ocr-capture.jpg");

  const response = await fetch("/api/ocr/extract", {
    method: "POST",
    body: formData,
    cache: "no-store"
  });

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    result = null;
  }

  if (!response.ok) {
    throw new Error(result?.error || "Cloudflare OCR failed.");
  }

  return result || { questions: [], rawText: "" };
}

function normalizeCloudflareOcrCandidates(questions) {
  // APIから返った値を、画面側で扱いやすい形に整えます。
  // 文字列でない値や空の選択肢をここで取り除きます。
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions
    .map((item) => ({
      question: String(item.question || "").trim(),
      choices: Array.isArray(item.choices)
        ? item.choices.map((choice) => String(choice || "").trim()).filter(Boolean)
        : [],
      explanation: String(item.explanation || "").trim()
    }))
    .filter((item) => item.question || item.choices.length);
}

function showOcrCandidates(candidates, rawText) {
  // OCR結果の候補一覧をモーダル内に表示します。
  // 候補をクリックすると、直接追加フォームへ反映されます。
  directFormState.ocrCandidates = candidates;

  const panel = document.getElementById("direct-ocr-results");
  if (!panel) return;

  panel.innerHTML = "";

  const rawBox = document.createElement("details");
  rawBox.className = "direct-ocr-raw";
  rawBox.innerHTML = `<summary>OCR raw text</summary><pre></pre>`;
  rawBox.querySelector("pre").textContent = rawText || "";
  panel.appendChild(rawBox);

  if (!candidates.length) {
    const empty = document.createElement("p");
    empty.className = "direct-ocr-empty";
    empty.textContent = "No candidates found. You can copy from raw text and adjust manually.";
    panel.appendChild(empty);
    return;
  }

  candidates.forEach((candidate, index) => {
    const item = document.createElement("div");
    item.className = "direct-ocr-candidate";

    const title = document.createElement("h4");
    title.textContent = `Candidate ${index + 1}`;

    const body = document.createElement("p");
    body.textContent = candidate.question || "(No question text)";

    const choices = document.createElement("ul");
    candidate.choices.forEach((choice) => {
      const li = document.createElement("li");
      li.textContent = choice;
      choices.appendChild(li);
    });

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "direct-secondary-btn";
    applyBtn.textContent = "Apply to form";
    applyBtn.addEventListener("click", () => applyOcrCandidate(candidate));

    item.appendChild(title);
    item.appendChild(body);
    item.appendChild(choices);
    item.appendChild(applyBtn);
    panel.appendChild(item);
  });
}

function applyOcrCandidate(candidate) {
  // 選ばれたOCR候補を、問題文・解説・選択肢の入力欄へコピーします。
  // 正解は画像だけでは確定できないので、先頭の選択肢だけ仮チェックにしています。
  const questionInput = document.getElementById("direct-question");
  const explanationInput = document.getElementById("direct-explanation");
  const choicesContainer = document.getElementById("direct-choices-container");

  if (questionInput) {
    questionInput.value = candidate.question || "";
  }

  if (explanationInput && candidate.explanation) {
    explanationInput.value = candidate.explanation;
  }

  if (choicesContainer) {
    choicesContainer.innerHTML = "";
    directFormState.choiceCount = 0;
    const choices = candidate.choices.length ? candidate.choices : ["", "", "", ""];
    choices.forEach((choice, index) => addDirectChoiceRow(choice, index === 0));
  }

  closeOcrScanner();
}

function createDirectAddForm() {
  // HTMLへ直接フォームを書き足さず、JavaScriptで直接追加フォームを生成します。
  // 既存のExcel/JSONインポート部分を壊さないためです。
  const mainContent = document.querySelector(".main-content");
  const importCard = document.querySelector(".import-card");
  if (!mainContent || !importCard || document.getElementById("direct-add-card")) {
    return;
  }

  const card = document.createElement("section");
  card.id = "direct-add-card";
  card.className = "direct-add-card";
  card.innerHTML = `
    <div class="direct-add-header">
      <div>
        <h2>\u554f\u984c\u3092\u76f4\u63a5\u8ffd\u52a0</h2>
        <p>Excel / JSON\u3092\u4f7f\u308f\u305a\u30011\u554f\u305a\u3064\u767b\u9332\u3067\u304d\u307e\u3059\u3002</p>
      </div>
      <button type="button" id="direct-ocr-open-btn" class="direct-ocr-open-btn">
        <i class="fa-solid fa-camera"></i>
        \u30ab\u30e1\u30e9OCR
      </button>
    </div>

    <form id="direct-question-form" class="direct-question-form">
      <div class="direct-grid">
        <label class="direct-field">
          <span>\u30ab\u30c6\u30b4\u30ea</span>
          <input type="text" id="direct-category" placeholder="\u4f8b: EC2" autocomplete="off">
        </label>

        <div class="direct-field direct-field-wide">
          <span>\u554f\u984c\u6587</span>
          <textarea id="direct-question" rows="5" placeholder="\u554f\u984c\u6587\u3092\u5165\u529b"></textarea>
          <button type="button" class="direct-inline-tool" data-target="direct-question">
            <i class="fa-solid fa-image"></i>
            \u554f\u984c\u6587\u306b\u753b\u50cf\u3092\u8ffd\u52a0
          </button>
        </div>

        <div class="direct-field direct-field-wide">
          <span>\u89e3\u8aac</span>
          <textarea id="direct-explanation" rows="4" placeholder="\u89e3\u8aac\u3092\u5165\u529b\uff08\u4efb\u610f\uff09"></textarea>
          <button type="button" class="direct-inline-tool" data-target="direct-explanation">
            <i class="fa-solid fa-image"></i>
            \u89e3\u8aac\u306b\u753b\u50cf\u3092\u8ffd\u52a0
          </button>
        </div>
      </div>

      <div class="direct-choices-block">
        <div class="direct-choices-header">
          <div>
            <h3>\u9078\u629e\u80a2\u3068\u6b63\u89e3</h3>
            <p>\u6b63\u89e3\u306e\u9078\u629e\u80a2\u306b\u30c1\u30a7\u30c3\u30af\u3092\u5165\u308c\u3066\u304f\u3060\u3055\u3044\u3002\u8907\u6570\u6b63\u89e3\u306b\u3082\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u3059\u3002</p>
          </div>
          <button type="button" id="direct-add-choice-btn" class="direct-secondary-btn">
            <i class="fa-solid fa-plus"></i>
            \u9078\u629e\u80a2\u3092\u8ffd\u52a0
          </button>
        </div>

        <div id="direct-choices-container" class="direct-choices-container"></div>
      </div>

      <div class="direct-actions">
        <button type="submit" id="direct-save-btn" class="direct-save-btn">
          <i class="fa-solid fa-floppy-disk"></i>
          \u3053\u306e\u554f\u984c\u3092\u767b\u9332
        </button>
        <button type="button" id="direct-reset-btn" class="direct-secondary-btn">
          \u5165\u529b\u3092\u30af\u30ea\u30a2
        </button>
      </div>
    </form>

    <div id="direct-ocr-modal" class="direct-ocr-modal" style="display: none;">
      <div class="direct-ocr-sheet">
        <div class="direct-ocr-toolbar">
          <div>
            <h3>\u30ab\u30e1\u30e9OCR</h3>
            <p>\u554f\u984c\u6587\u3068\u9078\u629e\u80a2\u304c\u5199\u308b\u3088\u3046\u306b\u64ae\u5f71\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u753b\u50cf\u306f\u7aef\u672b\u306b\u4fdd\u5b58\u305b\u305a\u3001OCR\u5f8c\u306b\u30e1\u30e2\u30ea\u304b\u3089\u7834\u68c4\u3057\u307e\u3059\u3002</p>
          </div>
          <button type="button" id="direct-ocr-close-btn" class="direct-ocr-icon-btn" aria-label="Close OCR">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <video id="direct-ocr-video" class="direct-ocr-video" autoplay playsinline muted></video>
        <canvas id="direct-ocr-canvas" class="direct-ocr-canvas"></canvas>
        <div class="direct-ocr-actions">
          <button type="button" id="direct-ocr-capture-btn" class="direct-save-btn">
            <i class="fa-solid fa-camera"></i>
            OCR\u5b9f\u884c
          </button>
          <button type="button" id="direct-ocr-retake-btn" class="direct-secondary-btn">
            \u64ae\u308a\u76f4\u3057
          </button>
        </div>

        <p id="direct-ocr-status" class="direct-ocr-status"></p>
        <div id="direct-ocr-results" class="direct-ocr-results"></div>
      </div>
    </div>
  `;

  mainContent.insertBefore(card, importCard);

  const addChoiceBtn = document.getElementById("direct-add-choice-btn");
  const resetBtn = document.getElementById("direct-reset-btn");
  const form = document.getElementById("direct-question-form");

  addChoiceBtn.addEventListener("click", () => addDirectChoiceRow());
  resetBtn.addEventListener("click", resetDirectForm);
  form.addEventListener("submit", saveDirectQuestion);
  document.querySelectorAll(".direct-inline-tool").forEach((button) => {
    button.addEventListener("click", () => insertDirectImage(button.dataset.target));
  });
  setupMobileOcrControls();

  resetDirectForm();
}

function addDirectChoiceRow(value = "", checked = false) {
  // 選択肢1行分の入力UIを作ります。
  // OCR候補から選択肢を流し込むときにも、この関数を使います。
  const container = document.getElementById("direct-choices-container");
  if (!container) return;

  directFormState.choiceCount += 1;

  const row = document.createElement("div");
  row.className = "direct-choice-row";

  const correctLabel = document.createElement("label");
  correctLabel.className = "direct-correct-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "direct-choice-correct";
  checkbox.checked = checked;

  const checkText = document.createElement("span");
  checkText.textContent = "\u6b63\u89e3";

  correctLabel.appendChild(checkbox);
  correctLabel.appendChild(checkText);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "direct-choice-input";
  input.placeholder = `\u9078\u629e\u80a2 ${directFormState.choiceCount}`;
  input.value = value;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "direct-remove-choice-btn";
  removeBtn.title = "\u9078\u629e\u80a2\u3092\u524a\u9664";
  removeBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateDirectChoicePlaceholders();
  });

  row.appendChild(correctLabel);
  row.appendChild(input);
  row.appendChild(removeBtn);
  container.appendChild(row);
  updateDirectChoicePlaceholders();
}

function updateDirectChoicePlaceholders() {
  document.querySelectorAll(".direct-choice-input").forEach((input, index) => {
    input.placeholder = `\u9078\u629e\u80a2 ${index + 1}`;
  });
}

function resetDirectForm() {
  // 直接追加フォームを初期状態へ戻します。
  // 最初から4択を入力しやすいよう、空の選択肢を4つ用意します。
  const category = document.getElementById("direct-category");
  const question = document.getElementById("direct-question");
  const explanation = document.getElementById("direct-explanation");
  const choicesContainer = document.getElementById("direct-choices-container");

  if (category) category.value = "";
  if (question) question.value = "";
  if (explanation) explanation.value = "";
  if (choicesContainer) choicesContainer.innerHTML = "";

  directFormState.choiceCount = 0;
  addDirectChoiceRow("", true);
  addDirectChoiceRow();
  addDirectChoiceRow();
  addDirectChoiceRow();
}

function collectDirectQuestion() {
  // 画面に入力された値を集め、DBへ保存しやすい形に整えます。
  // 必須項目や正解チェックの不足もここで確認します。
  const category = document.getElementById("direct-category").value.trim();
  const question = document.getElementById("direct-question").value.trim();
  const explanation = document.getElementById("direct-explanation").value.trim();
  const rows = [...document.querySelectorAll(".direct-choice-row")];

  if (!category) {
    throw new Error("Please enter a category.");
  }

  if (!question) {
    throw new Error("Please enter a question.");
  }

  const choices = rows
    .map((row, index) => ({
      choice_index: index + 1,
      content: row.querySelector(".direct-choice-input").value.trim(),
      is_correct: row.querySelector(".direct-choice-correct").checked ? 1 : 0
    }))
    .filter((choice) => choice.content)
    .map((choice, index) => ({
      ...choice,
      choice_index: index + 1
    }));

  if (choices.length < 2) {
    throw new Error("Please enter at least two choices.");
  }

  if (!choices.some((choice) => choice.is_correct)) {
    throw new Error("Please select at least one correct answer.");
  }

  return {
    category,
    question,
    explanation,
    choices
  };
}

async function insertQuestionWithChoices(questionData) {
  // 1問分の問題と選択肢をDBへ保存します。
  // 先にquestionsへ登録し、返ってきたquestionIdをchoicesへ入れます。
  const { data: questionResult, error: questionError } =
    await supabaseClient
      .from('questions')
      .insert({
        exam_id: selectedExam,
        category: questionData.category,
        question: questionData.question,
        explanation: questionData.explanation || ''
      })
      .select();

  if (questionError) {
    throw questionError;
  }

  const questionId = questionResult[0]?.id;
  if (!questionId) {
    throw new Error("Failed to get the question ID.");
  }

  const choicesToInsert = questionData.choices.map((choice) => ({
    question_id: questionId,
    choice_index: choice.choice_index,
    content: choice.content,
    is_correct: choice.is_correct
  }));

  const { error: choiceError } =
    await supabaseClient
      .from('choices')
      .insert(choicesToInsert);

  if (choiceError) {
    throw choiceError;
  }

  return questionId;
}

async function saveDirectQuestion(event) {
  // 直接追加フォームの保存ボタンが押されたときの処理です。
  // 入力チェック → Supabase接続 → DB保存 → フォーム初期化、の順に進みます。
  event.preventDefault();

  const saveBtn = document.getElementById("direct-save-btn");

  try {
    const questionData = collectDirectQuestion();

    if (!initSupabase()) {
      addLog("Failed to initialize Supabase.", "error");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> \u767b\u9332\u4e2d...';

    await insertQuestionWithChoices(questionData);

    addLog(`\u767b\u9332\u5b8c\u4e86: ${questionData.question}`, "success");
    alert("\u554f\u984c\u3092\u767b\u9332\u3057\u307e\u3057\u305f");
    resetDirectForm();
  } catch (error) {
    console.error("Direct add error:", error);
    addLog(error.message || "Failed to save the question.", "error");
    alert(error.message || "Failed to save the question.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> \u3053\u306e\u554f\u984c\u3092\u767b\u9332';
  }
}

createDirectAddForm();

// ======================================
// インポート処理
// ======================================

importButton.addEventListener("click", async () => {
  // Excel / JSON インポートの入口です。
  // ファイルを読み込み、形式チェックとバリデーションを行ってから確認画面へ進みます。

  // ログ初期化
  logArea.innerHTML = "";

  // ファイル取得
  const file =
    fileInput.files[0];

  // 未選択
  if (!file) {

    addLog(
      "ファイルを選択してください",
      "error"
    );

    return;

  }

  const extension =
    file.name
      .split('.')
      .pop()
      .toLowerCase();

  const supportedExtensions =
    ["xlsx", "xls", "json"];

  if (!supportedExtensions.includes(extension)) {

    addLog(
      "対応していないファイル形式です。.xlsx / .xls / .json を選択してください",
      "error"
    );

    return;

  }

  let rows = [];
  let isJsonFile = extension === "json";

  try {

    if (isJsonFile) {

      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || !Array.isArray(data.questions)) {

        addLog(
          "JSON形式が不正です。questions 配列を用意してください。",
          "error"
        );

        return;

      }

      rows = data.questions.map((item, index) => {

        const choices = Array.isArray(item.choices)
          ? item.choices
              .map((v) => String(v).trim())
              .filter((v) => v)
          : [];

        const answerField = item.answer ?? item.answers;

        if (!choices.length) {

          throw new Error(`JSON ${index + 1}件目: choices が配列で2個以上必要です`);

        }

        const answerValues = Array.isArray(answerField)
          ? answerField
          : [answerField];

        const parsedAnswers = answerValues
          .map((v) => {
            if (v === null || v === undefined || v === "") {
              return null;
            }
            const parsed = Number(v);
            return Number.isInteger(parsed) ? parsed : null;
          })
          .filter((v) => v !== null);

        if (!parsedAnswers.length) {

          throw new Error(`JSON ${index + 1}件目: answer が指定されていません。数値のインデックスを指定してください。`);

        }

        const invalidIndex = parsedAnswers.find(
          (value) => value < 1 || value > choices.length
        );

        if (invalidIndex !== undefined) {
          throw new Error(`JSON ${index + 1}件目: answer '${invalidIndex}' は choices の範囲外です`);
        }

        return {
          category: item.category ?? "",
          question: item.question ?? "",
          explanation: item.explanation ?? "",
          choices: choices.join(","),
          answers: [...new Set(parsedAnswers)].join(",")
        };

      });

    } else {

      // ArrayBuffer化
      const buffer =
        await file.arrayBuffer();

      // workbook生成
      const workbook =
        XLSX.read(buffer);

      // 先頭シート取得
      const sheetName =
        workbook.SheetNames[0];

      const sheet =
        workbook.Sheets[sheetName];

      // JSON変換
      rows =
        XLSX.utils.sheet_to_json(sheet, {
          defval: ""
        });

    }

    // 空チェック
    if (rows.length === 0) {

      addLog(
        isJsonFile ? "JSONにデータがありません" : "Excelにデータがありません",
        "error"
      );

      return;

    }

    // ======================================
    // 必須列確認
    // ======================================

    const requiredColumns = [
      "category",
      "question",
      "choices",
      "answers"
    ];

    const firstRow = rows[0];

    for (const column of requiredColumns) {

      if (!(column in firstRow)) {

        addLog(
          `列 '${column}' が存在しません`,
          "error"
        );

        return;

      }

    }

    // ======================================
    // バリデーション
    // ======================================

    const validQuestions = [];

    rows.forEach((row, index) => {

      const rowNumber =
        index + (isJsonFile ? 1 : 2);

      // trim
      const category =
        String(row.category).trim();

      const question =
        String(row.question).trim();

      const explanation =
        String(row.explanation || "").trim();

      const choicesRaw =
        String(row.choices).trim();

      const answersRaw =
        String(row.answers).trim();

      // ======================================
      // category
      // ======================================

      if (!category) {

        addLog(
          `${rowNumber}行目: category が空です`,
          "error"
        );

        return;

      }

      // ======================================
      // question
      // ======================================

      if (!question) {

        addLog(
          `${rowNumber}行目: question が空です`,
          "error"
        );

        return;

      }

      // ======================================
      // choices
      // ======================================

      if (!choicesRaw) {

        addLog(
          `${rowNumber}行目: choices が空です`,
          "error"
        );

        return;

      }

      // カンマ分割
      const choices =
        choicesRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v);

      // 選択肢数
      if (choices.length < 2) {

        addLog(
          `${rowNumber}行目: choices は2個以上必要です`,
          "error"
        );

        return;

      }

      // ======================================
      // answers
      // ======================================

      if (!answersRaw) {

        addLog(
          `${rowNumber}行目: answers が空です`,
          "error"
        );

        return;

      }

      // 数値配列化
      const answers =
        answersRaw
          .split(",")
          .map((v) => Number(v.trim()));

      // 数値チェック
      const invalidAnswer =
        answers.find((v) => Number.isNaN(v));

      if (invalidAnswer !== undefined) {

        addLog(
          `${rowNumber}行目: answers は数値で入力してください`,
          "error"
        );

        return;

      }

      // 範囲チェック
      const outOfRange =
        answers.find(
          (v) =>
            v < 1 ||
            v > choices.length
        );

      if (outOfRange !== undefined) {

        addLog(
          `${rowNumber}行目: answers の値 '${outOfRange}' が choices 数を超えています`,
          "error"
        );

        return;

      }

      // ======================================
      // API用データ変換
      // ======================================

      const formattedChoices =
        choices.map((choice, idx) => {

          return {

            choice_index:
              idx + 1,

            content:
              choice,

            is_correct:
              answers.includes(idx + 1)
                ? 1
                : 0

          };

        });

      validQuestions.push({

        category,

        question,

        explanation,

        choices: formattedChoices

      });

    });

    // ======================================
    // エラーがある場合停止
    // ======================================

    const hasError =
      logArea.querySelector(".log-error");

    if (hasError) {

      addLog(
        "エラーがあるため登録を中止しました",
        "error"
      );

      return;

    }

    // ======================================
    // 確認画面表示
    // ======================================

    // グローバル変数に保存
    window.validQuestions = validQuestions;

    showConfirmScreen(validQuestions);

  } catch (error) {

    addLog(
      error.message || "ファイル読み込み中にエラーが発生しました",
      "error"
    );

    return;

  }

});

// ======================================
// 確認画面表示
// ======================================

function showConfirmScreen(questions) {
  // 一括インポート前の確認画面を作ります。
  // ここではまだDB保存せず、ユーザーが内容を確認してOKを押すのを待ちます。

  // 確認リストをクリア
  confirmList.innerHTML = "";

  // 各問題を表示
  questions.forEach((questionData, index) => {

    const itemDiv = document.createElement("div");
    itemDiv.classList.add("confirm-item");

    // タイトル
    const title = document.createElement("h3");
    title.textContent = `問題 ${index + 1}`;
    itemDiv.appendChild(title);

    // カテゴリ
    const categoryP = document.createElement("p");
    const categoryStrong = document.createElement("strong");
    categoryStrong.textContent = "カテゴリ: ";
    categoryP.appendChild(categoryStrong);
    categoryP.appendChild(document.createTextNode(questionData.category));
    itemDiv.appendChild(categoryP);

    // 質問
    const questionP = document.createElement("p");
    const questionStrong = document.createElement("strong");
    questionStrong.textContent = "質問: ";
    questionP.appendChild(questionStrong);
    renderRichText(questionP, questionData.question);
    questionP.prepend(questionStrong);
    itemDiv.appendChild(questionP);

    if (questionData.explanation) {
      const explanationP = document.createElement("p");
      const explanationStrong = document.createElement("strong");
      explanationStrong.textContent = "\u89e3\u8aac: ";
      renderRichText(explanationP, questionData.explanation);
      explanationP.prepend(explanationStrong);
      itemDiv.appendChild(explanationP);
    }

    // 選択肢ラベル
    const choicesLabel = document.createElement("p");
    const choicesStrong = document.createElement("strong");
    choicesStrong.textContent = "選択肢:";
    choicesLabel.appendChild(choicesStrong);
    itemDiv.appendChild(choicesLabel);

    // 選択肢リスト
    const ul = document.createElement("ul");
    questionData.choices.forEach(choice => {
      const li = document.createElement("li");
      if (choice.is_correct) {
        li.classList.add("correct");
      }
      li.textContent = `${choice.choice_index}. ${choice.content} ${choice.is_correct ? '(正解)' : ''}`;
      ul.appendChild(li);
    });
    itemDiv.appendChild(ul);

    confirmList.appendChild(itemDiv);

  });

  // 確認画面を表示
  confirmCard.style.display = "block";

}

// ======================================
// 確認OKボタン
// ======================================

confirmOkBtn.addEventListener("click", async () => {
  // 確認画面の「登録」ボタンです。
  // window.validQuestions に一時保存した問題を、1問ずつDBへ登録します。

  // 確認画面を隠す
  confirmCard.style.display = "none";

  // ログ初期化
  logArea.innerHTML = "";

  // Supabase 初期化確認
  if (!initSupabase()) {

    addLog(
      "Supabaseの設定に失敗しました",
      "error"
    );

    return;

  }

  // 現在の validQuestions を取得（グローバル変数として保存）
  const questionsToImport = window.validQuestions;

  // DB登録
  let successCount = 0;

  for (const questionData of questionsToImport) {

    try {

      // ======================================
      // 問題を登録
      // ======================================

      const { data: questionResult, error: questionError } =
        await supabaseClient
          .from('questions')
          .insert({
            exam_id: selectedExam,
            category: questionData.category,
            question: questionData.question,
            explanation: questionData.explanation || ''
          })
          .select();

      if (questionError) {

        addLog(
          `問題の登録に失敗: ${questionData.question}`,
          "error"
        );

        continue;

      }

      const questionId = questionResult[0]?.id;

      if (!questionId) {

        addLog(
          `問題IDの取得に失敗: ${questionData.question}`,
          "error"
        );

        continue;

      }

      // ✅ 問題がDBに登録されたので、次は選択肢を登録
      // ======================================
      // 選択肢を登録
      // ======================================

      const choicesToInsert =
        questionData.choices.map((choice) => ({

          question_id: questionId,

          choice_index: choice.choice_index,

          content: choice.content,

          is_correct: choice.is_correct

        }));

      const { error: choiceError } =
        await supabaseClient
          .from('choices')
          .insert(choicesToInsert);

      if (choiceError) {

        addLog(
          `選択肢の登録に失敗: ${questionData.question}`,
          "error"
        );

        continue;

      }

      // ✅ 問題と選択肢の登録が完了
      successCount++;

      addLog(
        `登録完了: ${questionData.question}`,
        "success"
      );

    } catch (error) {

      addLog(
        `エラーが発生しました: ${error.message}`,
        "error"
      );

    }

  }

  // 🎉 登録完了メッセージ
  addLog(
    `${successCount}件の問題を登録しました`,
    "success"
  );

});

// ======================================
// 確認キャンセルボタン
// ======================================

confirmCancelBtn.addEventListener("click", () => {

  // ❌ 確認画面を隠す
  confirmCard.style.display = "none";

});

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
