let supabaseClient = null;
let currentExamId = null;

function initSupabase() {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.key) {
    alert('Supabaseの設定が不足しています。');
    return false;
  }
  supabaseClient = window.supabase.createClient(config.url, config.key);
  return true;
}

async function loadExams() {
  if (!supabaseClient) return;

  const { data: exams, error } = await supabaseClient
    .from('exams')
    .select('*')
    .order('id');

  if (error) {
    alert('試験の読み込みに失敗しました');
    return;
  }

  const examList = document.getElementById('exam-list');
  examList.innerHTML = '';

  exams.forEach(exam => {
    const card = document.createElement('div');
    card.className = 'exam-card';
    card.onclick = () => editExam(exam.id);
    card.innerHTML = `
      <i class="fa-solid ${exam.icon} icon"></i>
      <h3>${exam.name}</h3>
      <p>${exam.description || ''}</p>
    `;
    examList.appendChild(card);
  });
}

function editExam(id) {
  currentExamId = id;
  document.getElementById('exam-list').style.display = 'none';
  document.getElementById('exam-editor').style.display = 'block';
  document.getElementById('editor-title').textContent = '試験編集';
  document.getElementById('delete-btn').style.display = 'inline-block';

  if (id) {
    loadExamData(id);
  } else {
    clearForm();
  }
}

async function loadExamData(id) {
  const { data: exam, error } = await supabaseClient
    .from('exams')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    alert('試験データの読み込みに失敗しました');
    return;
  }

  document.getElementById('exam-name').value = exam.name;
  document.getElementById('exam-description').value = exam.description || '';
  document.getElementById('exam-icon').value = exam.icon;
}

function clearForm() {
  document.getElementById('exam-name').value = '';
  document.getElementById('exam-description').value = '';
  document.getElementById('exam-icon').value = '';
}

async function saveExam() {
  const name = document.getElementById('exam-name').value.trim();
  const description = document.getElementById('exam-description').value.trim();
  const icon = document.getElementById('exam-icon').value.trim();

  if (!name) {
    alert('試験名を入力してください');
    return;
  }

  const examData = { name, description, icon };

  let result;
  if (currentExamId) {
    result = await supabaseClient
      .from('exams')
      .update(examData)
      .eq('id', currentExamId);
  } else {
    result = await supabaseClient
      .from('exams')
      .insert(examData);
  }

  if (result.error) {
    alert('試験の保存に失敗しました');
    return;
  }

  alert('試験を保存しました');
  cancelEdit();
  loadExams();
}

async function deleteExam() {
  if (!currentExamId) return;

  const confirmDelete = confirm('この試験を削除すると、関連する問題と選択肢もすべて削除されます。本当に削除しますか？');
  if (!confirmDelete) return;

  // まず選択肢を削除
  const { data: questions } = await supabaseClient
    .from('questions')
    .select('id')
    .eq('exam_id', currentExamId);

  if (questions) {
    for (const question of questions) {
      await supabaseClient
        .from('choices')
        .delete()
        .eq('question_id', question.id);
    }
  }

  // 次に問題を削除
  await supabaseClient
    .from('questions')
    .delete()
    .eq('exam_id', currentExamId);

  // 最後に試験を削除
  const { error } = await supabaseClient
    .from('exams')
    .delete()
    .eq('id', currentExamId);

  if (error) {
    alert('試験の削除に失敗しました');
    return;
  }

  alert('試験を削除しました');
  cancelEdit();
  loadExams();
}

function cancelEdit() {
  document.getElementById('exam-list').style.display = 'grid';
  document.getElementById('exam-editor').style.display = 'none';
  currentExamId = null;
  clearForm();
}

document.addEventListener('DOMContentLoaded', () => {
  if (!initSupabase()) return;

  loadExams();

  document.getElementById('add-exam-btn').onclick = () => editExam(null);
  document.getElementById('save-btn').onclick = saveExam;
  document.getElementById('cancel-btn').onclick = cancelEdit;
  document.getElementById('delete-btn').onclick = deleteExam;
});