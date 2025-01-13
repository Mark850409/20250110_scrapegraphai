// 全局變量
let currentEditId = null;
let isEditing = false;

// 定義預設問題列表
const DEFAULT_QUESTIONS = [
    { display_text: '常見問題', sort_order: 1, is_default: true },
    { display_text: '爬蟲問題', sort_order: 2, is_default: true },
    { display_text: '提示詞問題', sort_order: 3, is_default: true }
];

// 快速提問相關函數
function toggleSelectAllQuestions() {
    const selectAll = document.getElementById('selectAllQuestions');
    // 只選擇非預設項目的 checkbox，且排除狀態開關
    const checkboxes = document.querySelectorAll('#questionsList input[type="checkbox"].question-checkbox:not([disabled])');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    updateBatchDeleteButton();
}

// 批量刪除功能
async function batchDeleteQuestions() {
    try {
        // 只選擇問題列表中被選中的 checkbox（排除全選框和狀態切換開關）
        const selectedIds = Array.from(
            document.querySelectorAll('#questionsList .question-checkbox:checked')
        ).filter(checkbox => {
            // 獲取該行的顯示文字
            const questionText = checkbox.closest('tr').querySelector('td:nth-child(2)').textContent;
            // 檢查是否為預設問題
            const isDefault = DEFAULT_QUESTIONS.some(q => q.display_text === questionText);
            // 只返回非預設問題
            return !isDefault;
        }).map(checkbox => checkbox.value);

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

            const data = await response.json();

            if (response.ok && data.success) {
                await Swal.fire('成功', '批量刪除成功', 'success');
                // 重置全選框和批量刪除按鈕
                const selectAllCheckbox = document.getElementById('selectAllQuestions');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
                updateBatchDeleteButton();
                // 重新載入頁面
                window.location.reload();
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
                window.location.reload();
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
            
            // 顯示成功消息後重新載入頁面
            await Swal.fire('成功', currentEditId ? '更新成功' : '新增成功', 'success');
            window.location.reload();
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

        // 檢查是否有資料
        if (!questions || questions.length === 0) {
            const emptyMessage = document.createElement('tr');
            emptyMessage.className = 'empty-message';
            emptyMessage.innerHTML = `
                <td colspan="6">
                    <div class="text-center py-4">
                        <i class="fas fa-comments fa-3x mb-3 text-muted"></i>
                        <h4>尚未建立快速提問</h4>
                        <p class="text-muted">建立快速提問可以幫助使用者更快找到常見問題的解答</p>
                        <button class="btn btn-primary" onclick="openAddQuestionModal()">
                            <i class="fas fa-plus"></i>
                            <span>建立第一個快速提問</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(emptyMessage);
            return;
        }
        
        // 如果有資料，則顯示資料列表
        questions.forEach(question => {
            const isDefault = DEFAULT_QUESTIONS.some(dq => dq.display_text === question.display_text);
            
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
            tr.className = isDefault ? 'default-question' : '';
            tr.innerHTML = `
                <td>
                    <input type="checkbox" class="question-checkbox" value="${question.id}" 
                           ${isDefault ? 'disabled style="display:none;"' : ''}>
                </td>
                <td>${question.display_text}</td>
                <td>${question.sort_order}</td>
                <td>
                    <div class="form-check form-switch">
                        <input type="checkbox" class="form-check-input status-toggle" 
                               id="status_${question.id}"
                               ${question.status ? 'checked' : ''} 
                               ${isDefault ? 'checked disabled' : ''}
                               onchange="updateQuestionStatus(${question.id}, this.checked)">
                        <label class="form-check-label" for="status_${question.id}">
                            ${question.status ? '啟用' : '停用'}
                        </label>
                    </div>
                </td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-2" 
                            onclick="editQuestion(${question.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" 
                            onclick="deleteQuestion(${question.id})"
                            ${isDefault ? 'disabled style="opacity: 0.5;"' : ''}>
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 更新所有開關的標籤文字
        document.querySelectorAll('.status-toggle').forEach(toggle => {
            const label = toggle.nextElementSibling;
            toggle.addEventListener('change', function() {
                label.textContent = this.checked ? '啟用' : '停用';
            });
        });
    } catch (error) {
        console.error('Error loading questions:', error);
        await Swal.fire('錯誤', '載入快速提問失敗', 'error');
    }
}

// 更新快速提問狀態
async function updateQuestionStatus(id, status) {
    try {
        // 檢查是否為預設問題
        const questionText = document.querySelector(`#status_${id}`).closest('tr').querySelector('td:nth-child(2)').textContent;
        const isDefault = DEFAULT_QUESTIONS.some(q => q.display_text === questionText);
        
        if (isDefault) {
            // 如果是預設問題，保持啟用狀態
            const toggle = document.getElementById(`status_${id}`);
            if (toggle) {
                toggle.checked = true;
            }
            return;
        }

        // 修改 API 請求
        const response = await fetch(`/api/quick-questions/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                display_text: questionText,  // 保持原有的顯示文字
                status: status ? 1 : 0,      // 狀態值轉換為數字
                sort_order: parseInt(document.querySelector(`#status_${id}`).closest('tr').querySelector('td:nth-child(3)').textContent)  // 保持原有的排序
            })
        });

        if (!response.ok) {
            throw new Error('更新狀態失敗');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || '更新狀態失敗');
        }

        // 更新標籤文字
        const label = document.querySelector(`label[for="status_${id}"]`);
        if (label) {
            label.textContent = status ? '啟用' : '停用';
        }

        // 更新成功後重新載入頁面
        window.location.reload();

    } catch (error) {
        console.error('Error:', error);
        // 恢復開關狀態
        const toggle = document.getElementById(`status_${id}`);
        if (toggle) {
            toggle.checked = !status;
        }
        await Swal.fire('錯誤', error.message || '更新狀態失敗', 'error');
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

});

// 修改刪除確認函數
function deleteQuestion(id) {
    // 檢查是否為預設問題
    const isDefault = DEFAULT_QUESTIONS.some(q => q.display_text === 
        document.querySelector(`input[value="${id}"]`)?.closest('tr')?.querySelector('td:nth-child(2)')?.textContent
    );
    
    if (isDefault) {
        Swal.fire('提示', '預設問題無法刪除', 'warning');
        return;
    }

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
        window.location.reload();
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('錯誤', '刪除失敗', 'error');
    }
}

// 提示詞相關函數
function toggleSelectAllPrompts() {
    const selectAll = document.getElementById('select-all');
    // 只選擇提示詞表格中的 checkbox
    const checkboxes = document.querySelectorAll('#prompts-table-body input[type="checkbox"].prompt-checkbox');
    
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

    // 只選擇提示詞表格中的 checkbox
    const checkedBoxes = document.querySelectorAll('#prompts-table-body input[type="checkbox"].prompt-checkbox:checked');
    
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
        // 只選擇提示詞表格中被選中的 checkbox
        const selectedIds = Array.from(
            document.querySelectorAll('#prompts-table-body input[type="checkbox"].prompt-checkbox:checked')
        ).map(checkbox => checkbox.value);

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
                // 重置全選框
                const selectAllCheckbox = document.getElementById('select-all');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
                updateBatchDeletePromptsButton();
                
                await Swal.fire('成功', '批量刪除成功', 'success');
                window.location.reload();
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
        const order = parseInt(document.getElementById('promptOrder').value);

        // 驗證必填欄位
        if (!name || !category || !content || !order) {
            await Swal.fire('提示', '請填寫所有必填欄位', 'warning');
            return;
        }

        // 驗證排序值
        if (order < 1) {
            await Swal.fire('提示', '排序值不能小於1', 'warning');
            return;
        }

        // 檢查排序值是否重複
        if (!isEditing) {
            try {
                const checkResponse = await fetch(`/api/prompts/check-sort-order?order=${order}`);
                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    if (checkData.exists) {
                        await Swal.fire('提示', '此排序值已存在，請使用其他值', 'warning');
                        return;
                    }
                }
            } catch (error) {
                console.error('Error checking sort order:', error);
                await Swal.fire('錯誤', '檢查排序值時發生錯誤', 'error');
                return;
            }
        }

        const url = isEditing ? `/api/prompts/${currentEditId}` : '/api/prompts';
        const method = isEditing ? 'PUT' : 'POST';

        const saveResponse = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                category: category,
                content: content,
                sort_order: order,
                status: false
            })
        });

        const data = await saveResponse.json();

        if (!saveResponse.ok || !data.success) {
            throw new Error(data.message || '保存失敗');
        }

        // 關閉模態框
        const modal = document.getElementById('addPromptModal');
        const modalInstance = bootstrap.Modal.getInstance(modal);
        if (modalInstance) {
            modalInstance.hide();
        }

        // 重置表單
        resetPromptForm();
        
        // 顯示成功消息並重新載入頁面
        await Swal.fire({
            title: '成功',
            text: isEditing ? '更新成功' : '新增成功',
            icon: 'success',
            confirmButtonText: '確定'
        });
        
        window.location.reload();
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire({
            title: '錯誤',
            text: error.message || '保存失敗，請稍後再試',
            icon: 'error',
            confirmButtonText: '確定'
        });
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
    document.getElementById('promptOrder').value = '1';
    document.getElementById('promptContent').value = '';
    currentEditId = null;
    isEditing = false;
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
        const prompts = await response.json();
        
        const tbody = document.getElementById('prompts-table-body');
        tbody.innerHTML = '';

        // 檢查是否有資料
        if (!prompts || prompts.length === 0) {
            const emptyMessage = document.createElement('tr');
            emptyMessage.className = 'empty-message';
            emptyMessage.innerHTML = `
                <td colspan="7">
                    <div class="text-center py-4">
                        <i class="fas fa-lightbulb fa-3x mb-3 text-muted"></i>
                        <h4>尚未建立提示詞</h4>
                        <p class="text-muted">提示詞可以幫助AI更準確地理解並回答使用者的問題</p>
                        <button class="btn btn-primary" onclick="openAddPromptModal()">
                            <i class="fas fa-plus"></i>
                            <span>建立第一個提示詞</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(emptyMessage);
            return;
        }

        const isSinglePrompt = prompts.length === 1;

        // 如果有資料，則顯示資料列表
        prompts.forEach(prompt => {
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

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <input type="checkbox" class="prompt-checkbox" value="${prompt.id}">
                </td>
                <td>${prompt.name}</td>
                <td>${getCategoryName(prompt.category)}</td>
                <td>${prompt.sort_order}</td>
                <td>
                    <div class="form-check form-switch">
                        <input type="checkbox" class="form-check-input status-toggle" 
                               id="prompt_status_${prompt.id}"
                               ${prompt.status ? 'checked' : ''} 
                               ${isSinglePrompt ? 'disabled' : ''}
                               onchange="updatePromptStatus(${prompt.id}, this.checked)">
                        <label class="form-check-label" for="prompt_status_${prompt.id}">
                            ${prompt.status ? '啟用' : '停用'}
                        </label>
                    </div>
                </td>
                <td>${createdAt}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-2" onclick="editPrompt(${prompt.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deletePrompt(${prompt.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', '載入提示詞列表失敗', 'error');
    }
}

// 更新提示詞狀態
async function updatePromptStatus(id, status) {
    try {
        // 檢查是否為唯一啟用的提示詞
        const activePrompts = document.querySelectorAll('#prompts-table-body .status-toggle:checked');
        if (activePrompts.length === 1 && !status) {
            // 如果是最後一個啟用的提示詞，且要停用它
            const toggle = document.getElementById(`prompt_status_${id}`);
            if (toggle) {
                toggle.checked = true; // 恢復開關狀態
            }
            await Swal.fire({
                title: '無法停用',
                text: '必須保持至少一個提示詞為啟用狀態',
                icon: 'warning',
                confirmButtonText: '確定'
            });
            return;
        }

        const response = await fetch(`/api/prompts/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: status })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || '更新狀態失敗');
        }

        // 如果啟用成功，更新所有其他提示詞的狀態顯示
        if (status) {
            document.querySelectorAll('#prompts-table-body .status-toggle').forEach(toggle => {
                if (toggle.id !== `prompt_status_${id}`) {
                    toggle.checked = false;
                    const label = toggle.nextElementSibling;
                    if (label) {
                        label.textContent = '停用';
                    }
                }
            });
        }

        // 更新當前提示詞的標籤文字
        const label = document.querySelector(`label[for="prompt_status_${id}"]`);
        if (label) {
            label.textContent = status ? '啟用' : '停用';
        }
    } catch (error) {
        console.error('Error:', error);
        // 恢復開關狀態
        const toggle = document.getElementById(`prompt_status_${id}`);
        if (toggle) {
            toggle.checked = !status;
        }
        await Swal.fire('錯誤', error.message || '更新狀態失敗', 'error');
    }
}

// 分類名稱對照表
function getCategoryName(category) {
    const categories = {
        'general': '一般對話',
        'analysis': '數據分析',
        'tutorial': '教學指導',
        // 可以根據需求添加更多分類
    };
    return categories[category] || category;
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
                window.location.reload();
            } else {
                throw new Error(data.message || '刪除失敗');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire('錯誤', error.message || '刪除失敗', 'error');
    }
}

// 修改批量刪除按鈕狀態的函數
function updateBatchDeleteButton() {
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (!batchDeleteBtn) return;

    // 只計算問題的 checkbox，排除狀態開關
    const checkedBoxes = document.querySelectorAll('#questionsList input[type="checkbox"].question-checkbox:checked:not([disabled])');
    
    batchDeleteBtn.disabled = checkedBoxes.length === 0;
    if (checkedBoxes.length === 0) {
        batchDeleteBtn.classList.add('btn-secondary');
        batchDeleteBtn.classList.remove('btn-danger');
    } else {
        batchDeleteBtn.classList.add('btn-danger');
        batchDeleteBtn.classList.remove('btn-secondary');
    }
}

// 修改全選功能
function toggleSelectAllPrompts() {
    const selectAll = document.getElementById('select-all');
    // 只選擇提示詞表格中的 checkbox
    const checkboxes = document.querySelectorAll('#prompts-table-body input[type="checkbox"].prompt-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    // 更新批量刪除按鈕狀態
    updateBatchDeletePromptsButton();
}

// 編輯提示詞
async function editPrompt(id) {
    try {
        currentEditId = id;
        isEditing = true;
        
        document.getElementById('promptModalTitle').textContent = '編輯提示詞';
        
        const response = await fetch(`/api/prompts/${id}`);
        if (!response.ok) {
            throw new Error('載入數據失敗');
        }
        
        const data = await response.json();
        
        // 填充表單數據
        document.getElementById('promptName').value = data.name || '';
        document.getElementById('promptCategory').value = data.category || 'general';
        document.getElementById('promptOrder').value = data.sort_order || 1;
        
        // 更新提示詞內容，預設為收合狀態
        const content = data.content || '';
        const textarea = document.getElementById('promptContent');
        const expandBtn = document.querySelector('.prompt-expand-btn');
        
        textarea.value = content;
        textarea.rows = "6"; // 預設為 6 行
        textarea.classList.remove('expanded');
        
        if (expandBtn) {
            expandBtn.innerHTML = '<i class="fas fa-expand-alt"></i> 展開編輯';
            expandBtn.classList.remove('expanded');
        }
        
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
    // 檢查是否為預設問題
    const isDefault = DEFAULT_QUESTIONS.some(q => q.id === id);
    if (isDefault) {
        Swal.fire('提示', '預設問題無法編輯', 'warning');
        return;
    }

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

// 切換提示詞內容的展開/收合
function togglePromptContent() {
    const textarea = document.getElementById('promptContent');
    const btn = document.querySelector('.prompt-expand-btn');
    
    // 保存當前滾動位置
    const scrollTop = textarea.scrollTop;
    
    if (textarea.classList.contains('expanded')) {
        // 收合
        textarea.classList.remove('expanded');
        textarea.rows = "6"; // 收合時設為 6 行
        btn.innerHTML = '<i class="fas fa-expand-alt"></i> 展開編輯';
        btn.classList.remove('expanded');
    } else {
        // 展開
        textarea.classList.add('expanded');
        textarea.rows = "20"; // 展開時設為 20 行
        btn.innerHTML = '<i class="fas fa-compress-alt"></i> 收合';
        btn.classList.add('expanded');
    }
    
    // 恢復滾動位置
    textarea.scrollTop = scrollTop;
}

