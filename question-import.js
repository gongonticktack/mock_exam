// ======================================
// 選択中試験名
// 本来はURLやLocalStorageから取得
// ======================================

const selectedExam =
  localStorage.getItem("selectedExam")
  || "AWS CCP";

// 資格名表示
document.getElementById("exam-name")
  .textContent = selectedExam;

// ======================================
// HTML取得
// ======================================

const importButton =
  document.getElementById("import-btn");

const fileInput =
  document.getElementById("excel-file");

const logArea =
  document.getElementById("log-area");

// ======================================
// インポートボタン押下
// ======================================

importButton.addEventListener("click", async () => {

  // ファイル取得
  const file =
    fileInput.files[0];

  // 未選択チェック
  if (!file) {

    addLog(
      "Excelファイルを選択してください",
      "error"
    );

    return;
  }

  // FormData作成
  const formData = new FormData();

  // ファイル追加
  formData.append("excel", file);

  // 試験名追加
  formData.append(
    "examName",
    selectedExam
  );

  try {

    // API送信
    const response =
      await fetch(
        "/api/questions/import",
        {
          method: "POST",
          body: formData
        }
      );

    // JSON化
    const result =
      await response.json();

    // 成功
    if (result.success) {

      addLog(
        `${result.count}件の問題を登録しました`,
        "success"
      );

    } else {

      addLog(
        result.message,
        "error"
      );

    }

  } catch (error) {

    console.error(error);

    addLog(
      "インポート中にエラーが発生しました",
      "error"
    );

  }

});

// ======================================
// ログ追加
// ======================================

function addLog(message, type) {

  const p =
    document.createElement("p");

  p.textContent = message;

  // class設定
  if (type === "success") {

    p.classList.add("log-success");

  } else {

    p.classList.add("log-error");

  }

  logArea.prepend(p);

}