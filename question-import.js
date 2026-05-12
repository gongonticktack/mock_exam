// ======================================
// ☁️ Supabase（クラウドDB）初期化
// ======================================
// 問題登録用のデータベース接続を初期化

let supabaseClient = null;

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
  document.getElementById("excel-file");

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

// ======================================
// インポート処理
// ======================================

importButton.addEventListener("click", async () => {

  // ログ初期化
  logArea.innerHTML = "";

  // ファイル取得
  const file =
    fileInput.files[0];

  // 未選択
  if (!file) {

    addLog(
      "Excelファイルを選択してください",
      "error"
    );

    return;

  }

  try {

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
    const rows =
      XLSX.utils.sheet_to_json(sheet, {
        defval: ""
      });

    // 空チェック
    if (rows.length === 0) {

      addLog(
        "Excelにデータがありません",
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

      // Excel行番号
      // headerが1行あるため+2
      const rowNumber =
        index + 2;

      // trim
      const category =
        String(row.category).trim();

      const question =
        String(row.question).trim();

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
      "Excel読み込み中にエラーが発生しました",
      "error"
    );

  }

});

// ======================================
// 確認画面表示
// ======================================

function showConfirmScreen(questions) {

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
    questionP.appendChild(document.createTextNode(questionData.question));
    itemDiv.appendChild(questionP);

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
            explanation: ''
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