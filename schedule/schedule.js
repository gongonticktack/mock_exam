let supabaseClient = null;
let activeSchedule = null;
let studyTasks = [];
let calendarCursor = new Date();
let selectedTaskId = null;
let selectedTaskDate = toDateKey(new Date());

const GLOBAL_SCHEDULE_EXAM_ID = 0;

const selectedExamLabel = document.getElementById("selected-exam-label");
const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");
const prevMonthButton = document.getElementById("prev-month-btn");
const nextMonthButton = document.getElementById("next-month-btn");
const taskPanelTitle = document.getElementById("task-panel-title");
const selectedDateLabel = document.getElementById("today-date-label");
const selectedTaskList = document.getElementById("today-task-list");
const jsonFileInput = document.getElementById("json-file-input");
const importJsonButton = document.getElementById("import-json-btn");
const statusMessage = document.getElementById("status-message");
const daysLeftElement = document.getElementById("days-left");
const examDateText = document.getElementById("exam-date-text");
const taskModal = document.getElementById("task-modal");
const closeTaskModalButton = document.getElementById("close-task-modal-btn");
const taskSelectField = document.getElementById("task-select-field");
const taskSelect = document.getElementById("task-select");
const taskDateInput = document.getElementById("task-date-input");
const taskTitleInput = document.getElementById("task-title-input");
const saveTaskButton = document.getElementById("save-task-btn");
const deleteTaskButton = document.getElementById("delete-task-btn");

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
  return GLOBAL_SCHEDULE_EXAM_ID;
}

function getCurrentExamName() {
  if (activeSchedule && activeSchedule.exam_name) {
    return activeSchedule.exam_name;
  }

  return "試験スケジュール";
}

function isMobileCalendar() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function getWeekStart(date) {
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay());
  return weekStart;
}

function updateExamLabel() {
  selectedExamLabel.textContent = getCurrentExamName();
}

function updateCountdown() {
  if (!activeSchedule || !activeSchedule.exam_date) {
    daysLeftElement.textContent = "--";
    examDateText.textContent = "試験日未設定";
    return;
  }

  const today = parseDateKey(toDateKey(new Date()));
  const examDate = parseDateKey(activeSchedule.exam_date);
  const diffDays = Math.ceil((examDate - today) / 86400000);

  if (diffDays > 0) {
    daysLeftElement.textContent = `あと${diffDays}日`;
  } else if (diffDays === 0) {
    daysLeftElement.textContent = "試験日";
  } else {
    daysLeftElement.textContent = `${Math.abs(diffDays)}日経過`;
  }

  examDateText.textContent = formatDate(activeSchedule.exam_date);
}

async function loadSchedule() {
  const examId = getSelectedExamId();
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

  if (!activeSchedule) {
    studyTasks = [];
    renderAll();
    showStatus("JSONをインポートするとタスクを登録できます。");
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
    showStatus("タスクの読み込みに失敗しました。", "error");
    console.error("Task load error:", taskError);
    return;
  }

  studyTasks = taskData || [];
  renderAll();
  showStatus("");
}

async function saveExamSchedule(examName, examDate) {
  const normalizedExamDate = String(examDate || "").slice(0, 10);
  if (!examName || !normalizedExamDate || !parseDateKey(normalizedExamDate)) {
    throw new Error("JSONに exam.exam_name と exam.exam_date を含めてください。");
  }

  const examId = getSelectedExamId();
  if (activeSchedule) {
    const { error } = await supabaseClient
      .from("exam_schedules")
      .update({
        exam_name: examName,
        exam_date: normalizedExamDate,
        updated_at: new Date().toISOString()
      })
      .eq("id", activeSchedule.id);

    if (error) {
      throw error;
    }
  } else {
    const { data, error } = await supabaseClient
      .from("exam_schedules")
      .insert({
        exam_id: examId,
        exam_name: examName,
        exam_date: normalizedExamDate
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    activeSchedule = data;
  }

  return activeSchedule;
}

function normalizeImportedTasks(json) {
  const rawTasks = Array.isArray(json) ? json : json.tasks;
  if (!Array.isArray(rawTasks)) {
    throw new Error("tasks 配列が見つかりません。");
  }

  return rawTasks.map((task, index) => {
    const taskDate = task.date || task.task_date;
    const title = task.task || task.title || task.name;

    if (!taskDate || !parseDateKey(taskDate)) {
      throw new Error(`${index + 1}件目の date が不正です。`);
    }

    if (!title) {
      throw new Error(`${index + 1}件目の task が空です。`);
    }

    return {
      task_date: String(taskDate).slice(0, 10),
      title: String(title),
      details: null,
      estimated_minutes: null,
      sort_order: Number.isFinite(Number(task.sort_order)) ? Number(task.sort_order) : index,
      is_completed: Boolean(task.is_completed)
    };
  });
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
    const exam = json.exam || {};
    const schedule = await saveExamSchedule(String(exam.exam_name || ""), exam.exam_date);

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

    selectedTaskDate = rows[0] ? rows[0].task_date : selectedTaskDate;
    calendarCursor = parseDateKey(selectedTaskDate) || calendarCursor;
    await loadSchedule();
    showStatus(`${rows.length}件のタスクをインポートしました。`, "success");
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

function getTaskById(taskId) {
  return studyTasks.find(task => String(task.id) === String(taskId)) || null;
}

function fillTaskModal(task) {
  selectedTaskId = task.id;
  taskDateInput.value = task.task_date;
  taskTitleInput.value = task.title;
}

function openTaskModal(dateKey, preferredTaskId = null) {
  const tasksForDate = studyTasks.filter(task => task.task_date === dateKey);
  if (tasksForDate.length === 0) {
    showStatus("この日のタスクはありません。", "error");
    return;
  }

  taskSelect.innerHTML = "";
  tasksForDate.forEach(task => {
    const option = document.createElement("option");
    option.value = String(task.id);
    option.textContent = task.title;
    taskSelect.appendChild(option);
  });

  taskSelectField.hidden = tasksForDate.length <= 1;
  const firstTask = preferredTaskId ? getTaskById(preferredTaskId) || tasksForDate[0] : tasksForDate[0];
  taskSelect.value = String(firstTask.id);
  fillTaskModal(firstTask);
  taskModal.hidden = false;
  taskTitleInput.focus();
}

function closeTaskModal() {
  selectedTaskId = null;
  taskModal.hidden = true;
}

async function saveSelectedTask() {
  const task = getTaskById(selectedTaskId);
  const title = taskTitleInput.value.trim();
  const taskDate = taskDateInput.value;

  if (!task) {
    return;
  }

  if (!title || !taskDate || !parseDateKey(taskDate)) {
    showStatus("日付と内容を入力してください。", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("study_schedule_tasks")
    .update({
      task_date: taskDate,
      title,
      updated_at: new Date().toISOString()
    })
    .eq("id", task.id);

  if (error) {
    showStatus("タスクの変更に失敗しました。", "error");
    console.error("Task save error:", error);
    return;
  }

  selectedTaskDate = taskDate;
  closeTaskModal();
  await loadSchedule();
  showStatus("タスクを変更しました。", "success");
}

async function deleteSelectedTask() {
  const task = getTaskById(selectedTaskId);
  if (!task) {
    return;
  }

  const confirmed = window.confirm("このタスクを削除しますか？");
  if (!confirmed) {
    return;
  }

  const { error } = await supabaseClient
    .from("study_schedule_tasks")
    .delete()
    .eq("id", task.id);

  if (error) {
    showStatus("タスクの削除に失敗しました。", "error");
    console.error("Task delete error:", error);
    return;
  }

  closeTaskModal();
  await loadSchedule();
  showStatus("タスクを削除しました。", "success");
}

function selectTaskDate(dateKey) {
  selectedTaskDate = dateKey;
  renderCalendar();
  renderTasks();
}

function createCalendarDay(date, currentMonth, todayKey, examDateKey) {
  const dateKey = toDateKey(date);
  const dayTasks = studyTasks.filter(task => task.task_date === dateKey);
  const day = document.createElement("article");
  const dayNumber = document.createElement("span");

  day.className = "calendar-day";
  day.classList.toggle("is-outside", !isMobileCalendar() && date.getMonth() !== currentMonth);
  day.classList.toggle("is-today", dateKey === todayKey);
  day.classList.toggle("is-selected", dateKey === selectedTaskDate);
  day.classList.toggle("is-exam", dateKey === examDateKey);
  day.addEventListener("click", () => selectTaskDate(dateKey));
  day.addEventListener("dblclick", () => openTaskModal(dateKey));

  dayNumber.className = "day-number";
  dayNumber.textContent = isMobileCalendar()
    ? date.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", weekday: "short" })
    : String(date.getDate());
  day.appendChild(dayNumber);

  if (dateKey === examDateKey) {
    const examMark = document.createElement("div");
    examMark.className = "day-task exam-mark";
    examMark.textContent = "試験日";
    day.appendChild(examMark);
  }

  dayTasks.slice(0, 3).forEach(task => {
    const taskBadge = document.createElement("div");
    taskBadge.className = `day-task${task.is_completed ? " is-completed" : ""}`;
    taskBadge.textContent = task.title;
    taskBadge.title = "ダブルクリックで変更/削除";
    taskBadge.addEventListener("dblclick", event => {
      event.stopPropagation();
      openTaskModal(dateKey, task.id);
    });
    day.appendChild(taskBadge);
  });

  if (dayTasks.length > 3) {
    const more = document.createElement("div");
    more.className = "day-task";
    more.textContent = `+${dayTasks.length - 3}件`;
    day.appendChild(more);
  }

  return day;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const monthStartDate = new Date(year, month, 1 - firstDay.getDay());
  const weekStartDate = getWeekStart(calendarCursor);
  const startDate = isMobileCalendar() ? weekStartDate : monthStartDate;
  const visibleDays = isMobileCalendar() ? 7 : 42;
  const todayKey = toDateKey(new Date());
  const examDateKey = activeSchedule && activeSchedule.exam_date ? activeSchedule.exam_date : "";

  calendarGrid.classList.toggle("is-week-view", isMobileCalendar());
  calendarTitle.textContent = isMobileCalendar()
    ? `${formatDate(toDateKey(weekStartDate))} 週`
    : `${year}年${month + 1}月`;
  calendarGrid.innerHTML = "";

  for (let index = 0; index < visibleDays; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    calendarGrid.appendChild(createCalendarDay(date, month, todayKey, examDateKey));
  }
}

function createTaskItem(task) {
  const item = document.createElement("article");
  const row = document.createElement("label");
  const checkbox = document.createElement("input");
  const textWrap = document.createElement("div");
  const title = document.createElement("p");
  const meta = document.createElement("p");

  item.className = "task-item";
  row.className = "task-checkbox-row";
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(task.is_completed);
  checkbox.addEventListener("change", () => toggleTask(task.id, checkbox.checked));

  title.className = `task-title${task.is_completed ? " is-completed" : ""}`;
  title.textContent = task.title;
  meta.className = "task-meta";
  meta.textContent = formatDate(task.task_date);

  textWrap.appendChild(title);
  textWrap.appendChild(meta);
  row.appendChild(checkbox);
  row.appendChild(textWrap);
  item.appendChild(row);
  return item;
}

function renderTasks() {
  const selectedTasks = studyTasks.filter(task => task.task_date === selectedTaskDate);
  const completedCount = selectedTasks.filter(task => task.is_completed).length;
  const todayKey = toDateKey(new Date());

  taskPanelTitle.textContent = selectedTaskDate === todayKey ? "今日のタスク" : "選択日のタスク";
  selectedDateLabel.textContent = selectedTasks.length > 0
    ? `${formatDate(selectedTaskDate)} / ${completedCount}/${selectedTasks.length} 完了`
    : formatDate(selectedTaskDate);
  selectedTaskList.innerHTML = "";

  if (selectedTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "この日のタスクはありません。";
    selectedTaskList.appendChild(empty);
    return;
  }

  selectedTasks.forEach(task => selectedTaskList.appendChild(createTaskItem(task)));
}

function renderAll() {
  updateExamLabel();
  updateCountdown();
  renderCalendar();
  renderTasks();
}

importJsonButton.addEventListener("click", importJson);

prevMonthButton.addEventListener("click", () => {
  calendarCursor = isMobileCalendar()
    ? new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), calendarCursor.getDate() - 7)
    : new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  calendarCursor = isMobileCalendar()
    ? new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), calendarCursor.getDate() + 7)
    : new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});

taskSelect.addEventListener("change", () => {
  const task = getTaskById(taskSelect.value);
  if (task) {
    fillTaskModal(task);
  }
});

saveTaskButton.addEventListener("click", saveSelectedTask);
deleteTaskButton.addEventListener("click", deleteSelectedTask);
closeTaskModalButton.addEventListener("click", closeTaskModal);
taskModal.addEventListener("click", event => {
  if (event.target.matches("[data-close-modal]")) {
    closeTaskModal();
  }
});

window.addEventListener("resize", renderCalendar);

if (initSupabase()) {
  loadSchedule();
}
