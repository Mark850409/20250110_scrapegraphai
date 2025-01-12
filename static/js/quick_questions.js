// 全局變量
let currentEditId = null;
let isEditing = false;

// 頁面加載完成後初始化
document.addEventListener('DOMContentLoaded', function() {
    loadQuestions();
    initializeEventListeners();
});

// 初始化事件監聽器
function initializeEventListeners() {
    // 全選checkbox
    document.getElementById('selectAll')?.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.question-checkbox');
        checkboxes.forEach(cb => cb.checked = this.checked);
    });
}

// 載入快速提問列表
async function loadQuestions() {
    try {
        const response = await fetch('/api/quick-questions-list');
        if (!response.ok) throw new Error('載入數據失敗');
        
        const data = await response.json();
        const tbody = document.getElementById('questionsList');
        if (!tbody) return;

        tbody.innerHTML = '';
        const items = Array.isArray(data) ? data : [];
        
        if (items.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-message">
                    <td colspan="6">
                        <i class="fas fa-comments"></i>
                        <h4>尚未建立快速提問</h4>
                        <p>建立快速提問可以幫助使用者更快找到常見問題的解答</p>
                        <button class="btn btn-primary" onclick="createNewQuestion()">
                            <i class="fas fa-plus"></i>
                            <span>建立第一個快速提問</span>
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        items.forEach(item => {
            // 格式化日期時間
            let formattedDate = '無效日期';
            try {
                if (item.created_at) {
                    // 直接使用 MySQL 日期時間格式
                    const createdAt = new Date(item.created_at);
                    
                    if (!isNaN(createdAt.getTime())) {
                        formattedDate = createdAt.toLocaleString('zh-TW', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false,
                            timeZone: 'Asia/Taipei'
                        });
                    } else {
                        console.error('無效的日期時間:', item.created_at);
                    }
                }
            } catch (error) {
                console.error('日期格式化錯誤:', error, item.created_at);
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <input type="checkbox" class="question-checkbox" value="${item.id}" onchange="updateBatchDeleteButton()">
                </td>
                <td>${item.display_text}</td>
                <td>${item.sort_order}</td>
                <td>
                    <span class="badge ${item.status ? 'bg-success' : 'bg-secondary'}">
                        ${item.status ? '啟用' : '停用'}
                    </span>
                </td>
                <td>${formattedDate}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-2" onclick="editQuestion(${item.id})" title="編輯">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${item.id})" title="刪除">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        await refreshAIAssistant();
    } catch (error) {
        console.error('Error:', error);
        const tbody = document.querySelector('#questionsList');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">載入失敗</td></tr>';
        }
    }
}

// 編輯快速提問
async function editQuestion(id) {
    try {
        currentEditId = id;
        isEditing = true;
        
        document.getElementById('questionModalTitle').textContent = '編輯快速提問';
        
        const response = await fetch(`/api/quick-questions/${id}`);
        if (!response.ok) throw new Error('載入數據失敗');
        
        const data = await response.json();
        
        document.getElementById('questionText').value = data.display_text || '';
        document.getElementById('order').value = data.sort_order || '';
        document.getElementById('enabled').checked = data.status === 1;
        
        const modal = new bootstrap.Modal(document.getElementById('quickQuestionModal'));
        modal.show();
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', '載入快速提問數據失敗', 'error');
    }
}

// 新增快速提問
async function createNewQuestion() {
    try {
        currentEditId = null;
        isEditing = false;
        
        // 獲取最大排序值
        const response = await fetch('/api/quick-questions/max-sort-order');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('order').value = (parseInt(data.max_sort_order) || 0) + 1;
        }
        
        document.getElementById('questionModalTitle').textContent = '新增快速提問';
        document.getElementById('questionForm').reset();
        
        const modal = new bootstrap.Modal(document.getElementById('quickQuestionModal'));
        modal.show();
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', '載入數據失敗', 'error');
    }
}

// 保存快速提問
async function saveQuestion() {
    try {
        const data = {
            display_text: document.getElementById('questionText').value,
            sort_order: document.getElementById('order').value,
            status: document.getElementById('enabled').checked ? 1 : 0
        };

        if (!data.display_text || !data.sort_order) {
            await Swal.fire('錯誤', '請填寫所有必要欄位', 'error');
            return;
        }

        // 檢查排序是否重複
        try {
            const checkResponse = await fetch(`/api/quick-questions/check-sort-order?order=${data.sort_order}&exclude_id=${currentEditId || ''}`);
            if (!checkResponse.ok) throw new Error('檢查排序值失敗');
            const checkResult = await checkResponse.json();
            
            if (checkResult.exists) {
                await Swal.fire('錯誤', '此排序值已存在，請使用其他值', 'error');
                return;
            }
        } catch (error) {
            console.error('Error:', error);
            await Swal.fire('錯誤', '檢查排序值時發生錯誤', 'error');
            return;
        }

        const url = isEditing 
            ? `/api/quick-questions/${currentEditId}`
            : '/api/quick-questions';
        
        const response = await fetch(url, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('保存失敗');
        
        const result = await response.json();
        
        if (result.success) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('quickQuestionModal'));
            modal.hide();
            await loadQuestions();
            await Swal.fire('成功', isEditing ? '編輯成功' : '新增成功', 'success');
        } else {
            throw new Error(result.message || '操作失敗');
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message, 'error');
    }
}

// 刪除快速提問
async function deleteQuestion(id) {
    try {
        const result = await Swal.fire({
            title: '確認刪除',
            text: '確定要刪除此快速提問嗎？',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '確定',
            cancelButtonText: '取消'
        });
        
        if (!result.isConfirmed) return;
        
        const response = await fetch(`/api/quick-questions/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('刪除失敗');
        
        await loadQuestions();
        await Swal.fire('成功', '刪除成功', 'success');
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', '刪除失敗', 'error');
    }
}

// 批量刪除
async function batchDelete() {
    try {
        const checkboxes = document.querySelectorAll('.question-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.value);
        
        if (ids.length === 0) {
            await Swal.fire('提示', '請選擇要刪除的項目', 'info');
            return;
        }
        
        const result = await Swal.fire({
            title: '確認批量刪除',
            text: `確定要刪除選中的 ${ids.length} 個項目嗎？`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '確定',
            cancelButtonText: '取消'
        });
        
        if (!result.isConfirmed) return;
        
        const response = await fetch('/api/quick-questions/batch', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        
        if (!response.ok) throw new Error('批量刪除失敗');
        
        await loadQuestions();
        await Swal.fire('成功', '批量刪除成功', 'success');
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', '批量刪除失敗', 'error');
    }
} 