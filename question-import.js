// ======================================
// 選択中試験
// ======================================

// ここでは localStorage に保存した資格名を取得
// Cloudflare API では exam_id を受け取るため、
// 必要なら数値 ID に変換する処理を追加してください。
const selectedExam =
  localStorage.getItem("selectedExam")
  || "AWS CCP";

// 資格名表示
const examName =
  document.getElementById("exam-name");

examName.textContent =
  selectedExam;

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

    console.error(error);

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

    itemDiv.innerHTML = `
      <h3>問題 ${index + 1}</h3>
      <p><strong>カテゴリ:</strong> ${questionData.category}</p>
      <p><strong>質問:</strong> ${questionData.question}</p>
      <p><strong>選択肢:</strong></p>
      <ul>
        ${questionData.choices.map(choice => `
          <li class="${choice.is_correct ? 'correct' : ''}">
            ${choice.choice_index}. ${choice.content} ${choice.is_correct ? '(正解)' : ''}
          </li>
        `).join('')}
      </ul>
    `;

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

  // 現在の validQuestions を取得（グローバル変数として保存）
  const questionsToImport = window.validQuestions;

  // API送信
  let successCount = 0;

  for (const questionData of questionsToImport) {

    // Cloudflare Pages / Workers 側で公開された API エンドポイントへ送信
    const response =
      await fetch(
        "/api/questions/import",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            exam_id:
              selectedExam,

            category:
              questionData.category,

            question:
              questionData.question,

            choices:
              questionData.choices

          })

        }
      );

    // レスポンスが成功でなければ、JSON 変換前にエラー内容を取得してログに表示
    if (!response.ok) {
      const errorText = await response.text();
      addLog(
        `APIエラー ${response.status}: ${errorText}`,
        "error"
      );
      continue;
    }

    const result =
      await response.json();

    if (result.success) {

      successCount++;

    } else {

      addLog(
        `登録失敗: ${questionData.question}`,
        "error"
      );

    }

  }

  // 完了
  addLog(
    `${successCount}件の問題を登録しました`,
    "success"
  );

});

// ======================================
// 確認キャンセルボタン
// ======================================

confirmCancelBtn.addEventListener("click", () => {

  // 確認画面を隠す
  confirmCard.style.display = "none";

});