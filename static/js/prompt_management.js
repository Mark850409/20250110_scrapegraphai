// 全局變量
let currentEditId = null;
let isEditing = false;

// 快速提問相關函數
function toggleSelectAllQuestions() {
    const selectAll = document.getElementById('selectAllQuestions');
    const checkboxes = document.querySelectorAll('#questionsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    updateBatchDeleteButton();
}

// 批量刪除功能
async function batchDeleteQuestions() {
    try {
        const selectedIds = Array.from(document.querySelectorAll('#questionsList input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value)
            .filter(id => id);

        if (selectedIds.length === 0) {
            await Swal.fire('提示', '請選擇要刪除的項目', 'info');
            return;
        }

        const result = await Swal.fire({
            title: '確定要批量刪除嗎？',
            text: `將刪除 ${selectedIds.length} 個項目，此操作無法復原`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '確定刪除',
            cancelButtonText: '取消'
        });

        if (result.isConfirmed) {
            const response = await fetch('/api/quick-questions/batch', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ids: selectedIds })
            });

            if (!response.ok) throw new Error('批量刪除失敗');
            
            const data = await response.json();
            if (data.success) {
                await Swal.fire('成功', '批量刪除成功', 'success');
                await loadQuestionsList();
            } else {
                throw new Error(data.message || '批量刪除失敗');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message || '批量刪除失敗', 'error');
    }
}

// 顯示新增/編輯對話框
async function showAddQuestionModal(id = null) {
    try {
        let formData = {
            display_text: '',
            sort_order: 1,  // 預設排序為1
            status: true    // 預設啟用
        };

        if (id) {
            // 編輯模式：獲取現有數據
            const response = await fetch(`/api/quick-questions/${id}`);
            if (!response.ok) throw new Error('載入數據失敗');
            formData = await response.json();
        } else {
            // 新增模式：獲取最大排序值
            const response = await fetch('/api/quick-questions/max-sort-order');
            if (response.ok) {
                const data = await response.json();
                formData.sort_order = (parseInt(data.max_sort_order) || 0) + 1;
            }
        }

        const result = await Swal.fire({
            title: id ? '編輯快速提問' : '新增快速提問',
            html: `
                <div class="mb-3">
                    <label class="form-label">顯示文字</label>
                    <input id="swal-display-text" class="form-control" value="${formData.display_text || ''}" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">排序</label>
                    <input id="swal-sort-order" type="number" class="form-control" value="${formData.sort_order}" min="1" required>
                </div>
                <div class="form-check">
                    <input id="swal-status" class="form-check-input" type="checkbox" ${formData.status ? 'checked' : ''}>
                    <label class="form-check-label">啟用</label>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: '保存',
            cancelButtonText: '取消',
            preConfirm: async () => {
                const displayText = document.getElementById('swal-display-text').value;
                const sortOrder = document.getElementById('swal-sort-order').value;
                const status = document.getElementById('swal-status').checked;

                if (!displayText || !sortOrder) {
                    Swal.showValidationMessage('請填寫所有必填欄位');
                    return false;
                }

                // 檢查排序是否重複
                try {
                    const checkResponse = await fetch(`/api/quick-questions/check-sort-order?order=${sortOrder}&exclude_id=${id || ''}`);
                    if (!checkResponse.ok) throw new Error('檢查排序值失敗');
                    const checkResult = await checkResponse.json();
                    
                    if (checkResult.exists) {
                        Swal.showValidationMessage('此排序值已存在，請使用其他值');
                        return false;
                    }
                } catch (error) {
                    console.error('Error:', error);
                    Swal.showValidationMessage('檢查排序值時發生錯誤');
                    return false;
                }

                return {
                    display_text: displayText,
                    sort_order: parseInt(sortOrder),
                    status: status
                };
            }
        });

        if (result.isConfirmed && result.value) {
            // 保存數據
            const response = await fetch(id ? `/api/quick-questions/${id}` : '/api/quick-questions', {
                method: id ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(result.value)
            });

            if (!response.ok) throw new Error('保存失敗');
            
            const saveResult = await response.json();
            if (saveResult.success) {
                await Swal.fire('成功', id ? '更新成功' : '新增成功', 'success');
                loadQuestionsList();
            } else {
                throw new Error(saveResult.message || '操作失敗');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message || '操作失敗', 'error');
    }
}

// 保存快速提問
async function saveQuickQuestion() {
    try {
        // 獲取表單數據
        const questionText = document.querySelector('#questionText').value;
        const sortOrder = document.querySelector('#order').value;
        const status = document.querySelector('#enabled').checked;

        // 驗證必填欄位
        if (!questionText || !sortOrder) {
            await Swal.fire('提示', '請填寫所有必填欄位', 'warning');
            return;
        }

        // 檢查排序是否重複
        const response = await fetch('/api/quick-questions');
        const questions = await response.json();
        
        const isDuplicate = questions.some(q => 
            q.sort_order === parseInt(sortOrder) && 
            (!currentEditId || q.id !== parseInt(currentEditId))
        );
        
        if (isDuplicate) {
            await Swal.fire('提示', '排序號碼已存在，請選擇其他數字！', 'warning');
            return;
        }

        // 發送保存請求
        const url = currentEditId 
            ? `/api/quick-questions/${currentEditId}`
            : '/api/quick-questions';
            
        const method = currentEditId ? 'PUT' : 'POST';

        const saveResponse = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                display_text: questionText,
                sort_order: parseInt(sortOrder),
                status: status ? 1 : 0
            })
        });

        if (saveResponse.ok) {
            // 先關閉 modal
            const modal = document.getElementById('addQuestionModal');
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // 移除模態背景
            const modalBackdrop = document.querySelector('.modal-backdrop');
            if (modalBackdrop) {
                modalBackdrop.remove();
            }
            
            // 移除 modal-open class
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
            
            // 重新載入列表
            await loadQuickQuestions();
            
            // 重置表單和編輯狀態
            resetQuestionForm();
            
            // 顯示成功消息
            await Swal.fire('成功', currentEditId ? '更新成功' : '新增成功', 'success');
        } else {
            const errorData = await saveResponse.json();
            throw new Error(errorData.message || '保存失敗');
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message || '發生錯誤，請稍後再試', 'error');
    }
}

// 打開新增快速提問對話框時重置表單
function openQuickQuestionModal() {
    resetQuestionForm();
}

// 載入快速提問列表
async function loadQuickQuestions() {
    try {
        const response = await fetch('/api/quick-questions');
        const questions = await response.json();
        
        const tbody = document.getElementById('questionsList');
        tbody.innerHTML = '';
        
        questions.forEach(question => {
            // 格式化日期
            const createdAt = question.created_at 
                ? new Date(question.created_at).toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })
                : '無效日期';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="checkbox" class="question-checkbox" value="${question.id}"></td>
                <td>${question.display_text}</td>
                <td>${question.sort_order}</td>
                <td>
                    <span class="badge ${question.status ? 'bg-success' : 'bg-secondary'}">
                        ${question.status ? '啟用' : '停用'}
                    </span>
                </td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-2" onclick="editQuestion(${question.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${question.id})">
                        <i class="fas fa-trash"></i>
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

// 頁面載入時載入快速提問列表
document.addEventListener('DOMContentLoaded', function() {
    // 初始化批量刪除按鈕狀態
    updateBatchDeleteButton();
    
    // 載入列表
    loadQuickQuestions();

   
    // 添加全選事件監聽
    const selectAllCheckbox = document.getElementById('selectAllQuestions');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', toggleSelectAllQuestions);
    }
    
    // 為新增按鈕添加事件監聽
    const addButton = document.querySelector('[data-bs-target="#addQuestionModal"]');
    if (addButton) {
        addButton.addEventListener('click', () => {
            resetQuestionForm();
            currentEditId = null;
        });
    }
    
    // 綁定批量刪除按鈕事件
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', function() {
            batchDeleteQuestions().catch(error => {
                console.error('批量刪除錯誤:', error);
                Swal.fire('錯誤', '批量刪除操作失敗', 'error');
            });
        });
    }
    
    // 載入提示詞列表
    loadPromptsList();


    
    // 等待頁面完全載入後檢查數據
    setTimeout(() => {
        const tables = document.querySelectorAll('.table');
        
        tables.forEach(table => {
            const tbody = table.querySelector('tbody');
            const rows = tbody.querySelectorAll('tr:not(.empty-message)');
            
            if (rows.length === 0) {
                // 判斷是快速提問還是提示詞管理
                const isPrompt = table.closest('.card').querySelector('h5').textContent.includes('提示詞');
                
                const emptyMessage = document.createElement('tr');
                emptyMessage.className = 'empty-message';
                emptyMessage.innerHTML = `
                    <td colspan="6">
                        <i class="fas ${isPrompt ? 'fa-lightbulb' : 'fa-comments'}"></i>
                        <h4>${isPrompt ? '尚未建立提示詞' : '尚未建立快速提問'}</h4>
                        <p>${isPrompt ? '提示詞可以幫助AI更準確地理解並回答使用者的問題' : '建立快速提問可以幫助使用者更快找到常見問題的解答'}</p>
                        <button class="btn btn-primary" onclick="${isPrompt ? 'openAddPromptModal()' : 'openAddQuestionModal()'}">
                            <i class="fas fa-plus"></i>
                            <span>建立第一個${isPrompt ? '提示詞' : '快速提問'}</span>
                        </button>
                    </td>
                `;
                
                tbody.appendChild(emptyMessage);
                
                // 添加延遲以確保 DOM 更新後再顯示
                setTimeout(() => {
                    emptyMessage.classList.add('show');
                }, 100);
            }
        });
    }, 500);
});

// 刪除確認
function deleteQuestion(id) {
    Swal.fire({
        title: '確定要刪除嗎？',
        text: '此操作無法復原',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: '確定刪除',
        cancelButtonText: '取消'
    }).then((result) => {
        if (result.isConfirmed) {
            performDelete(id);
        }
    });
}

// 執行刪除
async function performDelete(id) {
    try {
        const response = await fetch(`/api/quick-questions/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('刪除失敗');

        await Swal.fire('成功', '刪除成功', 'success');
        loadQuestionsList();
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('錯誤', '刪除失敗', 'error');
    }
}

// 提示詞相關函數
function toggleSelectAllPrompts() {
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('#prompts-table-body input[type="checkbox"]');
    
    // 設置所有 checkbox 的狀態與全選框一致
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    // 更新批量刪除按鈕狀態
    updateBatchDeletePromptsButton();
}

// 更新提示詞批量刪除按鈕狀態
function updateBatchDeletePromptsButton() {
    const batchDeleteBtn = document.querySelector('[onclick="batchDeletePrompts()"]');
    if (!batchDeleteBtn) return;

    const checkedBoxes = document.querySelectorAll('#prompts-table-body input[type="checkbox"]:checked');
    
    // 更新按鈕禁用狀態
    batchDeleteBtn.disabled = checkedBoxes.length === 0;
    
    // 更新按鈕樣式
    if (checkedBoxes.length === 0) {
        batchDeleteBtn.classList.add('btn-secondary');
        batchDeleteBtn.classList.remove('btn-danger');
    } else {
        batchDeleteBtn.classList.add('btn-danger');
        batchDeleteBtn.classList.remove('btn-secondary');
    }
}

// 批量刪除提示詞
async function batchDeletePrompts() {
    try {
        const selectedIds = [];
        const checkboxes = document.querySelectorAll('#prompts-table-body input[type="checkbox"]:checked');
        
        checkboxes.forEach(checkbox => {
            if (checkbox.value) {
                selectedIds.push(checkbox.value);
            }
        });

        if (selectedIds.length === 0) {
            await Swal.fire('提示', '請選擇要刪除的項目', 'warning');
            return;
        }

        const result = await Swal.fire({
            title: '確定要刪除選中的項目嗎？',
            text: `將刪除 ${selectedIds.length} 個項目，此操作無法復原`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '確定刪除',
            cancelButtonText: '取消'
        });

        if (result.isConfirmed) {
            const response = await fetch('/api/prompts/batch', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: selectedIds })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                await Swal.fire('成功', '批量刪除成功', 'success');
                await loadPromptsList();
            } else {
                throw new Error(data.message || '批量刪除失敗');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message || '批量刪除失敗', 'error');
    }
}

// 保存提示詞
async function savePrompt() {
    try {
        const name = document.getElementById('promptName').value.trim();
        const category = document.getElementById('promptCategory').value.trim();
        const content = document.getElementById('promptContent').value.trim();

        // 驗證必填欄位
        if (!name || !category || !content) {
            await Swal.fire('提示', '請填寫所有必填欄位', 'warning');
            return;
        }

        const url = isEditing ? `/api/prompts/${currentEditId}` : '/api/prompts';
        const method = isEditing ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                category: category,
                content: content
            })
        });

        const data = await response.json();

        if (response.ok) {
            // 先關閉 modal
            const modal = document.getElementById('addPromptModal');
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // 移除模態背景
            const modalBackdrop = document.querySelector('.modal-backdrop');
            if (modalBackdrop) {
                modalBackdrop.remove();
            }
            
            // 移除 modal-open class
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
            
            // 重新載入列表
            await loadPromptsList();
            
            // 重置表單
            resetPromptForm();
            
            // 顯示成功消息
            await Swal.fire('成功', isEditing ? '更新成功' : '新增成功', 'success');
        } else {
            throw new Error(data.message || '保存失敗');
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message || '保存失敗，請稍後再試', 'error');
    }
}

// 重置提示詞表單
function resetPromptForm() {
    const form = document.getElementById('promptForm');
    if (form) {
        form.reset();
    }
    document.getElementById('promptName').value = '';
    document.getElementById('promptCategory').value = 'general';
    document.getElementById('promptContent').value = '';
    currentEditId = null;
    isEditing = false;
    
    // 重置模態框標題
    document.getElementById('promptModalTitle').textContent = '新增提示詞';
}

// 輔助函數
function resetQuestionForm() {
    document.getElementById('questionText').value = '';
    document.getElementById('order').value = '1';
    document.getElementById('enabled').checked = true;
    currentEditId = null;
}

// 載入列表函數
async function loadQuestionsList() {
    try {
        const response = await fetch('/api/quick-questions-list');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        const tbody = document.querySelector('#questionsList');
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
                        <button class="btn btn-primary" onclick="openAddQuestionModal()">
                            <i class="fas fa-plus"></i>
                            <span>建立第一個快速提問</span>
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        items.forEach(item => {
            console.log(item.created_at)
            // 格式化日期時間
            const createdAt = item.created_at 
                ? new Date(item.created_at).toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })
                : '無效日期';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <input type="checkbox" value="${item.id}" onchange="updateBatchDeleteButton()">
                </td>
                <td>${item.display_text}</td>
                <td>${item.sort_order}</td>
                <td>
                    <span class="badge ${item.status ? 'bg-success' : 'bg-secondary'}">
                        ${item.status ? '啟用' : '停用'}
                    </span>
                </td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-2" onclick="editQuestion(${item.id})" title="編輯">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${item.id})" title="刪除">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error:', error);
        const tbody = document.querySelector('#questionsList');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">載入失敗</td></tr>';
        }
    }
}

// 載入提示詞列表
async function loadPromptsList() {
    try {
        const response = await fetch('/api/prompts');
        const data = await response.json();
        
        const tableBody = document.querySelector('#prompts-table-body');
        if (!tableBody) {
            console.error('無法找到表格主體元素');
            return;
        }

        tableBody.innerHTML = '';

        if (data.length === 0) {
            tableBody.innerHTML = `
            <tr id="noPromptsMessage" class="no-data-row">
                            <td colspan="6">
                                <div class="empty-state">
                                    <div class="empty-state-icon">
                                        <i class="fas fa-lightbulb"></i>
                                    </div>
                                    <h4>尚未建立提示詞</h4>
                                    <p>提示詞可以幫助AI更準確地理解並回答使用者的問題</p>
                                    <div class="empty-state-actions">
                                        <button class="btn btn-primary" onclick="openAddPromptModal()">
                                            <i class="fas fa-plus me-1"></i>建立第一個提示詞
                                        </button>
                                    </div>
                                </div>
                            </td>
                        </tr>
            `;
            return;
        }

        data.forEach((prompt, index) => {
            // 格式化日期時間
            const createdAt = prompt.created_at 
                ? new Date(prompt.created_at).toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })
                : '無效日期';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="checkbox" class="prompt-checkbox" value="${prompt.id}">
                </td>
                <td>${prompt.name}</td>
                <td>${index + 1}</td>
                <td>
                    <span class="badge ${prompt.status ? 'bg-success' : 'bg-secondary'}">
                        ${prompt.status ? '啟用' : '停用'}
                    </span>
                </td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-2" onclick="editPrompt(${prompt.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deletePrompt(${prompt.id})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('載入提示詞列表時發生錯誤:', error);
        await Swal.fire('錯誤', '載入提示詞列表失敗，請稍後再試', 'error');
    }
}



// 打開新增提示詞對話框
function openAddPromptModal() {
    // 重置表單
    resetPromptForm();
    
    // 更改模態框標題為新增
    document.getElementById('promptModalTitle').textContent = '新增提示詞';
    
    // 打開模態框
    const modal = new bootstrap.Modal(document.getElementById('addPromptModal'));
    modal.show();
}
// 打開新增快速提問對話框
function openAddQuestionModal() {
    // 重置表單
    resetPromptForm();
    
    // 更改模態框標題為新增
    document.getElementById('questionModalTitle').textContent = '新增快速提問';
    
    // 打開模態框
    const modal = new bootstrap.Modal(document.getElementById('addQuestionModal'));
    modal.show();
}


// 刪除提示詞
async function deletePrompt(id) {
    try {
        const result = await Swal.fire({
            title: '確定要刪除嗎？',
            text: '此操作無法復原',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '確定刪除',
            cancelButtonText: '取消'
        });

        if (result.isConfirmed) {
            const response = await fetch(`/api/prompts/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                await Swal.fire('成功', '刪除成功', 'success');
                await loadPromptsList();  // 重新載入列表
            } else {
                throw new Error(data.message || '刪除失敗');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message || '刪除失敗', 'error');
    }
}

// 更新批量刪除按鈕狀態
function updateBatchDeleteButton() {
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (!batchDeleteBtn) return; // 如果按鈕不存在則退出

    const checkedBoxes = document.querySelectorAll('#questionsList input[type="checkbox"]:checked');
    if (batchDeleteBtn) {
        batchDeleteBtn.disabled = checkedBoxes.length === 0;
        // 更新按鈕樣式
        if (checkedBoxes.length === 0) {
            batchDeleteBtn.classList.add('btn-secondary');
            batchDeleteBtn.classList.remove('btn-danger');
        } else {
            batchDeleteBtn.classList.add('btn-danger');
            batchDeleteBtn.classList.remove('btn-secondary');
        }
    }
}

// 修改全選功能
function toggleSelectAllQuestions() {
    const selectAll = document.getElementById('selectAllQuestions');
    const checkboxes = document.querySelectorAll('#questionsList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    updateBatchDeleteButton();
}

// 編輯提示詞
async function editPrompt(id) {
    try {
        currentEditId = id;
        isEditing = true;
        
        // 更改模態框標題
        document.getElementById('promptModalTitle').textContent = '編輯提示詞';
        
        const response = await fetch(`/api/prompts/${id}`);
        if (!response.ok) {
            throw new Error('載入數據失敗');
        }
        
        const data = await response.json();
        
        // 填充表單數據
        document.getElementById('promptName').value = data.name || '';
        document.getElementById('promptCategory').value = data.category || 'general';
        document.getElementById('promptContent').value = data.content || '';
        
        // 打開模態框
        const modal = new bootstrap.Modal(document.getElementById('addPromptModal'));
        modal.show();
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', '載入提示詞數據失敗', 'error');
    }
}

//編輯快速提問
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
        
        const modal = new bootstrap.Modal(document.getElementById('addQuestionModal'));
        modal.show();
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', '載入快速提問數據失敗', 'error');
    }
}

// 確保 DOM 完全載入後再初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化批量刪除按鈕狀態
    updateBatchDeleteButton();
    
    // 載入列表
    loadQuickQuestions();
    
    // 添加全選事件監聽
    const selectAllCheckbox = document.getElementById('selectAllQuestions');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', toggleSelectAllQuestions);
    }
    
    // 為新增按鈕添加事件監聽
    const addButton = document.querySelector('[data-bs-target="#addQuestionModal"]');
    if (addButton) {
        addButton.addEventListener('click', () => {
            resetQuestionForm();
            currentEditId = null;
        });
    }
    
    // 綁定批量刪除按鈕事件
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', function() {
            batchDeleteQuestions().catch(error => {
                console.error('批量刪除錯誤:', error);
                Swal.fire('錯誤', '批量刪除操作失敗', 'error');
            });
        });
    }
    
    // 載入提示詞列表
    loadPromptsList();
    
    // 添加全選框事件監聽
    const selectAllPrompts = document.getElementById('select-all');
    if (selectAllPrompts) {
        selectAllPrompts.addEventListener('change', toggleSelectAllPrompts);
    }
    
    // 為每個 checkbox 添加變更事件監聽
    document.querySelector('#prompts-table-body')?.addEventListener('change', function(e) {
        if (e.target.type === 'checkbox') {
            updateBatchDeletePromptsButton();
            
            // 檢查是否所有 checkbox 都被選中
            const allCheckboxes = document.querySelectorAll('#prompts-table-body input[type="checkbox"]');
            const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
            const selectAllCheckbox = document.getElementById('select-all');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allChecked;
            }
        }
    });
    
    // 初始化批量刪除按鈕狀態
    updateBatchDeletePromptsButton();
}); 