let supabaseClient = null;
let activeSchedule = null;
let studyTasks = [];
let calendarCursor = new Date();

const exams = [
  { id: 3, shortName: "HTML5 L1", title: "HTML5 Professional Level1" },
  { id: 4, shortName: "UML L2", title: "UMLモデリング技能認定試験 L2" },
  { id: 5, shortName: "AWS SAA", title: "AWS Certified Solutions Architect - Associate" },
  { id: 6, shortName: "JCSQE 初級", title: "JCSQE 初級" }
];

const params = new URLSearchParams(window.location.search);
const examSelect = document.getElementById("exam-select");
const examDateInput = document.getElementById("exam-date-input");
const saveExamDateButton = document.getElementById("save-exam-date-btn");
const selectedExamLabel = document.getElementById("selected-exam-label");
const daysLeftElement = document.getElementById("days-left");
const examDateText = document.getElementById("exam-date-text");
const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");
const prevMonthButton = document.getElementById("prev-month-btn");
const nextMonthButton = document.getElementById("next-month-btn");
const todayDateLabel = document.getElementById("today-date-label");
const todayTaskList = document.getElementById("today-task-list");
const allTaskList = document.getElementById("all-task-list");
const taskCountLabel = document.getElementById("task-count-label");
const jsonFileInput = document.getElementById("json-file-input");
const importJsonButton = document.getElementById("import-json-btn");
const statusMessage = document.getElementById("status-message");

function initSupabase() {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.key) {
    showStatus("Supabase設定が不足しています。", "error");
    return false;
  }

  supabaseClient = window.supabase.createClient(config.url, config.key);
  return true;
}

function showStatus(message, type = "") {
  statusMessage.textContent = message || "";
  statusMessage.className = `status-message${type ? ` is-${type}` : ""}`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function getTodayKey() {
  return toDateKey(new Date());
}

function formatDate(value) {
  const date = parseDateKey(value);
  if (!date) {
    return "未設定";
  }

  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
}

function getSelectedExamId() {
  return Number(examSelect.value) || 3;
}

function getExamById(examId) {
  return exams.find(exam => exam.id === Number(examId)) || exams[0];
}

function renderExamOptions() {
  const savedExamId = Number(params.get("examId")) || Number(localStorage.getItem("selectedExamId")) || 3;

  examSelect.innerHTML = "";
  exams.forEach(exam => {
    const option = document.createElement("option");
    option.value = String(exam.id);
    option.textContent = `${exam.shortName} - ${exam.title}`;
    examSelect.appendChild(option);
  });

  examSelect.value = String(getExamById(savedExamId).id);
}

function updateCountdown() {
  const exam = getExamById(getSelectedExamId());
  selectedExamLabel.textContent = exam.title;

  if (!activeSchedule || !activeSchedule.exam_date) {
    daysLeftElement.textContent = "--";
    examDateText.textContent = "試験日を設定してください";
    return;
  }

  const today = parseDateKey(getTodayKey());
  const examDate = parseDateKey(activeSchedule.exam_date);
  const diffDays = Math.ceil((examDate - today) / 86400000);

  if (diffDays > 0) {
    daysLeftElement.textContent = `${diffDays}日`;
  } else if (diffDays === 0) {
    daysLeftElement.textContent = "今日";
  } else {
    daysLeftElement.textContent = `${Math.abs(diffDays)}日経過`;
  }

  examDateText.textContent = formatDate(activeSchedule.exam_date);
}

async function loadSchedule() {
  const examId = getSelectedExamId();
  const exam = getExamById(examId);
  showStatus("スケジュールを読み込み中...");

  const { data: scheduleData, error: scheduleError } = await supabaseClient
    .from("exam_schedules")
    .select("*")
    .eq("exam_id", examId)
    .maybeSingle();

  if (scheduleError) {
    activeSchedule = null;
    studyTasks = [];
    renderAll();
    showStatus("DBテーブルが未作成の可能性があります。supabase-schedule-schema.sql を実行してください。", "error");
    console.error("Schedule load error:", scheduleError);
    return;
  }

  activeSchedule = scheduleData || null;
  examDateInput.value = activeSchedule && activeSchedule.exam_date ? activeSchedule.exam_date : "";
  localStorage.setItem("selectedExamId", String(exam.id));
  localStorage.setItem("selectedExam", exam.shortName);

  if (!activeSchedule) {
    studyTasks = [];
    renderAll();
    showStatus("試験日を設定すると、勉強スケジュールを登録できます。");
    return;
  }

  const { data: taskData, error: taskError } = await supabaseClient
    .from("study_schedule_tasks")
    .select("*")
    .eq("exam_schedule_id", activeSchedule.id)
    .order("task_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (taskError) {
    studyTasks = [];
    renderAll();
    showStatus("勉強スケジュールの読み込みに失敗しました。", "error");
    console.error("Task load error:", taskError);
    return;
  }

  studyTasks = taskData || [];
  renderAll();
  showStatus("");
}

async function saveExamDate() {
  const examId = getSelectedExamId();
  const exam = getExamById(examId);
  const examDate = examDateInput.value;

  if (!examDate) {
    showStatus("試験日を入力してください。", "error");
    return;
  }

  showStatus("試験日を保存中...");

  if (activeSchedule) {
    const { error } = await supabaseClient
      .from("exam_schedules")
      .update({
        exam_name: exam.shortName,
        exam_date: examDate,
        updated_at: new Date().toISOString()
      })
      .eq("id", activeSchedule.id);

    if (error) {
      showStatus("試験日の保存に失敗しました。", "error");
      console.error("Schedule update error:", error);
      return;
    }
  } else {
    const { data, error } = await supabaseClient
      .from("exam_schedules")
      .insert({
        exam_id: examId,
        exam_name: exam.shortName,
        exam_date: examDate
      })
      .select("*")
      .single();

    if (error) {
      showStatus("試験日の保存に失敗しました。", "error");
      console.error("Schedule insert error:", error);
      return;
    }

    activeSchedule = data;
  }

  await loadSchedule();
  showStatus("試験日を保存しました。", "success");
}

function normalizeImportedTasks(json) {
  const rawTasks = Array.isArray(json) ? json : json.tasks;
  if (!Array.isArray(rawTasks)) {
    throw new Error("tasks 配列が見つかりません。");
  }

  return rawTasks.map((task, index) => {
    const taskDate = task.date || task.task_date;
    const title = task.title || task.name || task.task;

    if (!taskDate || !parseDateKey(taskDate)) {
      throw new Error(`${index + 1}件目の date が不正です。`);
    }

    if (!title) {
      throw new Error(`${index + 1}件目の title が空です。`);
    }

    const estimatedMinutes = task.estimated_minutes === undefined || task.estimated_minutes === null || task.estimated_minutes === ""
      ? null
      : Number(task.estimated_minutes);

    if (estimatedMinutes !== null && (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 0)) {
      throw new Error(`${index + 1}件目の estimated_minutes が不正です。`);
    }

    return {
      task_date: String(taskDate).slice(0, 10),
      title: String(title),
      details: task.details ? String(task.details) : null,
      estimated_minutes: estimatedMinutes,
      sort_order: Number.isFinite(Number(task.sort_order)) ? Number(task.sort_order) : index,
      is_completed: Boolean(task.is_completed)
    };
  });
}

async function ensureScheduleFromImport(json) {
  const importedExam = json && json.exam ? json.exam : {};
  const importedExamId = Number(importedExam.exam_id || importedExam.examId);

  if (importedExamId && getExamById(importedExamId)) {
    examSelect.value = String(importedExamId);
  }

  const examDate = importedExam.exam_date || importedExam.examDate || json.exam_date || json.examDate || examDateInput.value;
  if (!examDate || !parseDateKey(examDate)) {
    if (!activeSchedule) {
      throw new Error("試験日が未設定です。画面で試験日を保存するか、JSONに exam.exam_date を含めてください。");
    }
    return activeSchedule;
  }

  examDateInput.value = String(examDate).slice(0, 10);
  await saveExamDate();
  return activeSchedule;
}

async function importJson() {
  const file = jsonFileInput.files && jsonFileInput.files[0];
  if (!file) {
    showStatus("インポートするJSONファイルを選択してください。", "error");
    return;
  }

  try {
    showStatus("JSONを読み込み中...");
    const json = JSON.parse(await file.text());
    const normalizedTasks = normalizeImportedTasks(json);
    const schedule = await ensureScheduleFromImport(json);

    if (!schedule) {
      throw new Error("スケジュールを作成できませんでした。");
    }

    const rows = normalizedTasks.map(task => ({
      ...task,
      exam_schedule_id: schedule.id,
      completed_at: task.is_completed ? new Date().toISOString() : null
    }));

    const { error: deleteError } = await supabaseClient
      .from("study_schedule_tasks")
      .delete()
      .eq("exam_schedule_id", schedule.id);

    if (deleteError) {
      throw deleteError;
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabaseClient
        .from("study_schedule_tasks")
        .insert(rows);

      if (insertError) {
        throw insertError;
      }
    }

    await loadSchedule();
    showStatus(`${rows.length}件の勉強スケジュールをインポートしました。`, "success");
  } catch (error) {
    showStatus(error.message || "JSONインポートに失敗しました。", "error");
    console.error("JSON import error:", error);
  }
}

async function toggleTask(taskId, checked) {
  const { error } = await supabaseClient
    .from("study_schedule_tasks")
    .update({
      is_completed: checked,
      completed_at: checked ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", taskId);

  if (error) {
    showStatus("タスクの更新に失敗しました。", "error");
    console.error("Task update error:", error);
    return;
  }

  studyTasks = studyTasks.map(task => task.id === taskId
    ? { ...task, is_completed: checked, completed_at: checked ? new Date().toISOString() : null }
    : task
  );
  renderAll();
  showStatus("タスクを更新しました。", "success");
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  const todayKey = getTodayKey();
  const examDateKey = activeSchedule && activeSchedule.exam_date ? activeSchedule.exam_date : "";

  calendarTitle.textContent = `${year}年${month + 1}月`;
  calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = toDateKey(date);
    const dayTasks = studyTasks.filter(task => task.task_date === dateKey);
    const day = document.createElement("article");
    const dayNumber = document.createElement("span");

    day.className = "calendar-day";
    day.classList.toggle("is-outside", date.getMonth() !== month);
    day.classList.toggle("is-today", dateKey === todayKey);
    day.classList.toggle("is-exam", dateKey === examDateKey);

    dayNumber.className = "day-number";
    dayNumber.textContent = String(date.getDate());
    day.appendChild(dayNumber);

    if (dateKey === examDateKey) {
      const examMark = document.createElement("div");
      examMark.className = "day-task";
      examMark.textContent = "試験日";
      day.appendChild(examMark);
    }

    dayTasks.slice(0, 3).forEach(task => {
      const taskBadge = document.createElement("div");
      taskBadge.className = `day-task${task.is_completed ? " is-completed" : ""}`;
      taskBadge.textContent = task.title;
      day.appendChild(taskBadge);
    });

    if (dayTasks.length > 3) {
      const more = document.createElement("div");
      more.className = "day-task";
      more.textContent = `+${dayTasks.length - 3}件`;
      day.appendChild(more);
    }

    calendarGrid.appendChild(day);
  }
}

function createTaskItem(task, withCheckbox) {
  const item = document.createElement("article");
  const row = document.createElement("label");
  const textWrap = document.createElement("div");
  const title = document.createElement("p");
  const meta = document.createElement("p");

  item.className = "task-item";
  row.className = "task-checkbox-row";
  title.className = `task-title${task.is_completed ? " is-completed" : ""}`;
  title.textContent = task.title;

  meta.className = "task-meta";
  meta.textContent = `${formatDate(task.task_date)}${task.estimated_minutes ? ` / ${task.estimated_minutes}分` : ""}`;

  if (withCheckbox) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.is_completed);
    checkbox.addEventListener("change", () => toggleTask(task.id, checkbox.checked));
    row.appendChild(checkbox);
  }

  textWrap.appendChild(title);
  textWrap.appendChild(meta);

  if (task.details) {
    const details = document.createElement("p");
    details.className = "task-details";
    details.textContent = task.details;
    textWrap.appendChild(details);
  }

  row.appendChild(textWrap);
  item.appendChild(row);
  return item;
}

function renderTasks() {
  const todayKey = getTodayKey();
  const todayTasks = studyTasks.filter(task => task.task_date === todayKey);
  const sortedTasks = [...studyTasks].sort((a, b) => a.task_date.localeCompare(b.task_date) || a.sort_order - b.sort_order);
  const completedCount = studyTasks.filter(task => task.is_completed).length;

  todayDateLabel.textContent = formatDate(todayKey);
  taskCountLabel.textContent = `${completedCount}/${studyTasks.length} 完了`;
  todayTaskList.innerHTML = "";
  allTaskList.innerHTML = "";

  if (todayTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "今日のタスクはありません。";
    todayTaskList.appendChild(empty);
  } else {
    todayTasks.forEach(task => todayTaskList.appendChild(createTaskItem(task, true)));
  }

  if (sortedTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "勉強スケジュールはまだ登録されていません。";
    allTaskList.appendChild(empty);
  } else {
    sortedTasks.forEach(task => allTaskList.appendChild(createTaskItem(task, task.task_date === todayKey)));
  }
}

function renderAll() {
  updateCountdown();
  renderCalendar();
  renderTasks();
}

examSelect.addEventListener("change", () => {
  const exam = getExamById(getSelectedExamId());
  localStorage.setItem("selectedExamId", String(exam.id));
  localStorage.setItem("selectedExam", exam.shortName);
  loadSchedule();
});

saveExamDateButton.addEventListener("click", saveExamDate);
importJsonButton.addEventListener("click", importJson);

prevMonthButton.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});

if (initSupabase()) {
  renderExamOptions();
  loadSchedule();
}
