// 批量刪除功能
function batchDelete() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    const ids = Array.from(checkboxes)
        .filter(cb => cb.value)  // 排除全選checkbox
        .map(cb => cb.value);
        
    if (ids.length === 0) {
        alert('請選擇要刪除的項目');
        return;
    }
    
    if (confirm('確定要刪除選中的項目嗎？')) {
        fetch('/api/quick-questions/batch', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ids: ids })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                location.reload();
            } else {
                alert(data.message || '刪除失敗');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('刪除失敗');
        });
    }
}

// 全選功能
function toggleAllCheckboxes(source) {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (checkbox !== source) {
            checkbox.checked = source.checked;
        }
    });
}

// 顯示新增對話框
function showAddQuestionModal() {
    // 重置表單
    document.getElementById('questionForm').reset();
    // 設置標題
    document.querySelector('#questionModal .modal-title').textContent = '新增快速提問';
    // 顯示對話框
    $('#questionModal').modal('show');
}

// 編輯功能
function editQuestion(id) {
    fetch(`/api/quick-questions/${id}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('questionId').value = data.data.id;
                document.getElementById('displayText').value = data.data.display_text;
                document.getElementById('sortOrder').value = data.data.sort_order;
                document.getElementById('status').value = data.data.status;
                document.querySelector('#questionModal .modal-title').textContent = '編輯快速提問';
                $('#questionModal').modal('show');
            }
        })
        .catch(error => console.error('Error:', error));
}

// 刪除功能
function deleteQuestion(id) {
    if (confirm('確定要刪除此項目嗎？')) {
        fetch(`/api/quick-questions/${id}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                location.reload();
            } else {
                alert(data.message || '刪除失敗');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('刪除失敗');
        });
    }
} 