let supabaseClient = null;
const HISTORY_ACTIVITY_MAX_LENGTH = 160;

const params = new URLSearchParams(window.location.search);
const examId = Number(params.get("examId")) || Number(localStorage.getItem("selectedExamId")) || 3;
const selectedExam = params.get("selectedExam") || localStorage.getItem("selectedExam") || "HTML5 L1";

const examNameElement = document.getElementById("exam-name");
const historyCountElement = document.getElementById("history-count");
const historyListElement = document.getElementById("history-list");
const unansweredPeriodTabs = document.querySelectorAll(".period-tab");
const startUnansweredButton = document.getElementById("start-unanswered-btn");
const startIncorrectButton = document.getElementById("start-incorrect-btn");
let selectedUnansweredPeriod = "7";

function stripMediaMarkup(text) {
  return String(text || "").replace(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/g, "[画像]");
}

function truncateText(text, maxLength) {
  const normalized = stripMediaMarkup(text).replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function returnToTop(message) {
  if (message) {
    alert(message);
  }

  window.location.replace("index.html");
}

function initSupabase() {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.key) {
    returnToTop("Supabase設定が不足しています。トップへ戻ります。");
    return false;
  }

  supabaseClient = window.supabase.createClient(config.url, config.key);
  return true;
}

function formatDate(value) {
  if (!value) {
    return "日時不明";
  }

  return new Date(value).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function getResult(item) {
  if (typeof item.is_correct === "boolean") {
    return item.is_correct;
  }

  if (typeof item.correct_count === "number" && typeof item.total_count === "number") {
    return item.correct_count >= item.total_count;
  }

  return null;
}

function buildStudyUrl(item, category) {
  const searchParams = new URLSearchParams({
    examId,
    selectedExam,
    questionId: item.question_id
  });

  if (category) {
    searchParams.set("category", category);
  }

  return `study.html?${searchParams.toString()}`;
}

function buildPracticeUrl(mode) {
  const searchParams = new URLSearchParams({
    examId,
    selectedExam,
    mode
  });

  if (mode === "unanswered") {
    searchParams.set("periodDays", selectedUnansweredPeriod);
  }

  return `study.html?${searchParams.toString()}`;
}

function startPractice(mode) {
  localStorage.setItem("selectedExamId", examId);
  localStorage.setItem("selectedExam", selectedExam);
  window.location.href = buildPracticeUrl(mode);
}

unansweredPeriodTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    unansweredPeriodTabs.forEach(item => item.classList.remove("active"));
    tab.classList.add("active");
    selectedUnansweredPeriod = tab.dataset.periodDays;
  });
});

if (startUnansweredButton) {
  startUnansweredButton.addEventListener("click", () => startPractice("unanswered"));
}

if (startIncorrectButton) {
  startIncorrectButton.addEventListener("click", () => startPractice("incorrect"));
}

function renderHistory(items, categoryMap) {
  historyListElement.innerHTML = "";
  historyCountElement.textContent = `${items.length}件`;

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "学習履歴はまだありません。";
    historyListElement.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const result = getResult(item);
    const category = item.question_id ? categoryMap[item.question_id] : "";
    const historyItem = document.createElement(item.question_id ? "button" : "article");
    historyItem.className = item.question_id ? "history-item history-item-link" : "history-item";

    if (item.question_id) {
      historyItem.type = "button";
      historyItem.addEventListener("click", () => {
        localStorage.setItem("selectedExamId", examId);
        localStorage.setItem("selectedExam", selectedExam);
        window.location.href = buildStudyUrl(item, category);
      });
    }

    const meta = document.createElement("div");
    meta.className = "history-meta";

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = formatDate(item.answered_at || item.created_at);
    meta.appendChild(date);

    if (result !== null) {
      const resultBadge = document.createElement("span");
      resultBadge.className = `history-result ${result ? "correct" : "incorrect"}`;
      resultBadge.textContent = result ? "正解" : "不正解";
      meta.appendChild(resultBadge);
    }

    if (category) {
      const categoryBadge = document.createElement("span");
      categoryBadge.className = "history-category";
      categoryBadge.textContent = category;
      meta.appendChild(categoryBadge);
    }

    const activity = document.createElement("p");
    activity.className = "history-activity";
    activity.textContent = truncateText(item.activity || "問題演習", HISTORY_ACTIVITY_MAX_LENGTH);
    activity.title = stripMediaMarkup(item.activity || "問題演習").replace(/\s+/g, " ").trim();

    historyItem.appendChild(meta);
    historyItem.appendChild(activity);
    historyListElement.appendChild(historyItem);
  });
}

async function fetchCategoryMap(items) {
  const questionIds = [...new Set(items.map(item => item.question_id).filter(Boolean))];
  if (questionIds.length === 0) {
    return {};
  }

  const { data, error } = await supabaseClient
    .from("questions")
    .select("id,category")
    .in("id", questionIds);

  if (error || !data) {
    return {};
  }

  return data.reduce((map, question) => {
    map[question.id] = question.category || "";
    return map;
  }, {});
}

async function loadHistory() {
  examNameElement.textContent = selectedExam;
  historyCountElement.textContent = "読み込み中";

  const { data, error } = await supabaseClient
    .from("exam_histories")
    .select("*")
    .eq("exam_id", examId)
    .order("answered_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("学習履歴の取得に失敗しました:", error);
    returnToTop("学習履歴の取得に失敗しました。トップへ戻ります。");
    return;
  }

  const items = data || [];
  const categoryMap = await fetchCategoryMap(items);
  renderHistory(items, categoryMap);
}

if (initSupabase()) {
  loadHistory();
}
