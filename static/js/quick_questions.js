// 載入快速提問列表
async function loadQuickQuestions() {
    try {
        const response = await fetch('/api/quick-questions');
        const questions = await response.json();
        
        const tbody = document.getElementById('questionsList');
        tbody.innerHTML = '';
        
        questions.forEach(question => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${question.text}</td>
                <td>${question.order}</td>
                <td>
                    <span class="badge ${question.status ? 'bg-success' : 'bg-secondary'}">
                        ${question.status ? '啟用' : '停用'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary me-2" onclick="editQuestion(${question.id})">
                        編輯
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${question.id})">
                        刪除
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading questions:', error);
        alert('載入快速提問失敗');
    }
}

// 保存快速提問
async function saveQuickQuestion() {
    const displayText = document.querySelector('#display-text').value;
    const order = document.querySelector('#order').value;
    const enabled = document.querySelector('#enabled').checked;

    // 檢查排序是否重複
    try {
        const response = await fetch('/api/quick_questions');
        const questions = await response.json();
        
        const isDuplicate = questions.some(q => q.order === parseInt(order));
        if (isDuplicate) {
            alert('排序號碼已存在，請選擇其他數字！');
            return;
        }

        // 如果沒有重複，繼續保存
        const saveResponse = await fetch('/api/quick_questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                display_text: displayText,
                order: parseInt(order),
                enabled: enabled
            })
        });

        if (saveResponse.ok) {
            // 保存成功後關閉對話框並刷新列表
            closeQuickQuestionModal();
            loadQuickQuestions();
        } else {
            alert('保存失敗，請稍後再試');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('發生錯誤，請稍後再試');
    }
}

// 打開新增快速提問對話框時重置表單
function openQuickQuestionModal() {
    document.querySelector('#display-text').value = '';
    document.querySelector('#order').value = '1';  // 設置默認排序為1
    document.querySelector('#enabled').checked = true;  // 默認勾選啟用
    // 顯示對話框的代碼...
}

// 刪除快速提問
async function deleteQuestion(id) {
    if (!confirm('確定要刪除此快速提問？')) return;
    
    try {
        const response = await fetch(`/api/quick-questions/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('刪除失敗');
        
        loadQuickQuestions();
        alert('刪除成功！');
    } catch (error) {
        console.error('Error:', error);
        alert('刪除失敗：' + error.message);
    }
}

// 頁面載入時載入快速提問列表
document.addEventListener('DOMContentLoaded', loadQuickQuestions); 