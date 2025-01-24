// 添加 debounce 函數定義
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 將函數移到全局作用域
function toggleScheduleTimeOptions() {
    const frequency = document.getElementById('scheduleFrequency').value;
    
    // 隱藏所有時間選擇區域
    document.getElementById('onceTimeGroup').style.display = 'none';
    document.getElementById('dailyTimeGroup').style.display = 'none';
    document.getElementById('weeklyTimeGroup').style.display = 'none';
    document.getElementById('monthlyTimeGroup').style.display = 'none';
    
    // 根據選擇的頻率顯示對應的時間選擇
    switch (frequency) {
        case 'once':
            document.getElementById('onceTimeGroup').style.display = 'block';
            break;
        case 'daily':
            document.getElementById('dailyTimeGroup').style.display = 'block';
            break;
        case 'weekly':
            document.getElementById('weeklyTimeGroup').style.display = 'block';
            break;
        case 'monthly':
            document.getElementById('monthlyTimeGroup').style.display = 'block';
            break;
    }
}

// 將函數移到全局作用域
let currentScheduleId = null;
let scriptContent = '';

// 添加定時更新功能
let updateInterval;

// 添加分頁和搜尋相關變數
let scheduleCurrentPage = 1;
let schedulePageSize = 10;
let scheduleSearchKeyword = '';
let totalSchedules = []; // 添加總數據存儲

// 在文件開頭添加一個重置表單的函數
function resetScheduleForm() {
    // 重置表單基本欄位
    document.getElementById('scheduleForm').reset();
    document.getElementById('scheduleModalTitle').textContent = '新增排程任務';
    
    // 重置腳本內容區域
    document.getElementById('sourceText').checked = true;
    document.getElementById('scriptTextArea').style.display = 'block';
    document.getElementById('scriptFileArea').style.display = 'none';
    document.getElementById('scriptContent').value = '';
    document.getElementById('scriptFile').value = '';
    document.getElementById('scriptFileList').innerHTML = '';
    
    // 先隱藏所有時間選擇區塊
    document.getElementById('onceTimeGroup').style.display = 'none';
    document.getElementById('dailyTimeGroup').style.display = 'none';
    document.getElementById('weeklyTimeGroup').style.display = 'none';
    document.getElementById('monthlyTimeGroup').style.display = 'none';
    
    // 重置週期選擇
    document.querySelectorAll('.weekday-select').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.querySelectorAll('.monthly-day-select').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // 重置全局變數
    currentScheduleId = null;
    scriptContent = '';

    // 根據當前選擇的頻率顯示對應的時間選擇區塊
    const frequency = document.getElementById('scheduleFrequency').value;
    switch (frequency) {
        case 'once':
            document.getElementById('onceTimeGroup').style.display = 'block';
            break;
        case 'daily':
            document.getElementById('dailyTimeGroup').style.display = 'block';
            break;
        case 'weekly':
            document.getElementById('weeklyTimeGroup').style.display = 'block';
            break;
        case 'monthly':
            document.getElementById('monthlyTimeGroup').style.display = 'block';
            break;
    }
}

// 修改 openAddScheduleModal 函數
function openAddScheduleModal() {
    resetScheduleForm();
    const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
    modal.show();
}

// 在模態框關閉時重置表單
document.getElementById('scheduleModal').addEventListener('hidden.bs.modal', function () {
    resetScheduleForm();
});

// 初始化腳本來源切換和拖放功能
function initScriptSourceToggle() {
    const scriptSourceRadios = document.getElementsByName('scriptSource');
    const scriptTextArea = document.getElementById('scriptTextArea');
    const scriptFileArea = document.getElementById('scriptFileArea');
    const scriptContentTextarea = document.getElementById('scriptContent');
    const dropZone = document.getElementById('scriptDropZone');
    const fileInput = document.getElementById('scriptFile');
    const fileList = document.getElementById('scriptFileList');
    
    // 確保初始狀態
    scriptTextArea.style.display = 'block';
    scriptFileArea.style.display = 'none';
    document.getElementById('sourceText').checked = true;
    
    // 切換腳本來源
    scriptSourceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'text') {
                scriptTextArea.style.display = 'block';
                scriptFileArea.style.display = 'none';
                // 確保顯示腳本內容
                scriptContentTextarea.value = scriptContent;
                console.log('Switch to text mode, content:', scriptContentTextarea.value); // 調試用
            } else {
                scriptTextArea.style.display = 'none';
                scriptFileArea.style.display = 'block';
            }
        });
    });

    // 拖放功能
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        dropZone.classList.add('dragover');
    }

    function unhighlight(e) {
        dropZone.classList.remove('dragover');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }

    function handleFile(file) {
        if (!file) return;

        // 檢查檔案類型
        const fileType = file.name.split('.').pop().toLowerCase();
        const scriptType = document.getElementById('scheduleType').value;
        
        if (!isValidFileType(fileType, scriptType)) {
            Swal.fire({
                icon: 'error',
                title: '錯誤',
                text: `請上傳與執行類型相符的檔案（${scriptType}）`
            });
            return;
        }

        // 更新檔案列表顯示
        fileList.innerHTML = `
            <div class="file-item">
                <i class="fas fa-file-code"></i>
                <span class="file-name">${file.name}</span>
                <i class="fas fa-times remove-file" onclick="removeScriptFile()"></i>
            </div>
        `;

        // 讀取檔案內容
        const reader = new FileReader();
        reader.onload = async (e) => {
            scriptContent = e.target.result;
            if (!await validateScript(scriptContent, scriptType)) {
                fileList.innerHTML = '';
                scriptContent = '';
            }
        };
        reader.readAsText(file);
    }
}

// 移除上傳的腳本檔案
function removeScriptFile() {
    document.getElementById('scriptFile').value = '';
    document.getElementById('scriptFileList').innerHTML = '';
    // 不要清空 scriptContent，保留原始內容
    document.getElementById('sourceText').click(); // 切換回直接輸入模式
}

// 驗證檔案類型
function isValidFileType(fileType, scriptType) {
    const typeMap = {
        'python': 'py',
        'shell': 'sh',
        'bat': 'bat'
    };
    return fileType === typeMap[scriptType];
}

// 驗證腳本內容
async function validateScript(content, type) {
    try {
        // 根據不同類型進行語法檢查
        switch (type) {
            case 'python':
                // 使用 Python 的語法檢查
                const response = await fetch('/api/validate_python', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ script: content })
                });
                
                if (!response.ok) {
                    throw new Error('Python 語法錯誤');
                }
                break;

            case 'shell':
                // Shell 腳本基本檢查
                if (!content.trim().startsWith('#!/bin/sh') && 
                    !content.trim().startsWith('#!/bin/bash')) {
                    throw new Error('Shell 腳本必須以 #!/bin/sh 或 #!/bin/bash 開頭');
                }
                break;

            case 'bat':
                // Batch 腳本基本檢查
                if (!content.trim().startsWith('@echo off') && 
                    !content.includes('exit /b')) {
                    throw new Error('Batch 腳本建議包含 @echo off 和 exit /b');
                }
                break;
        }
        return true;
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: '語法錯誤',
            text: error.message
        });
        return false;
    }
}

// 修改腳本內容安全檢查函數
function isScriptContentSafe(content, scriptType) {
    // 定義危險關鍵字列表
    const dangerousKeywords = [
        'rm -rf', 'rmdir /s', 'del /f', 'format',  // 刪除和格式化命令
        'shutdown', 'reboot', 'init 0',          // 系統關機命令
        'chmod 777', 'chmod -R',                 // 權限修改
        ':(){:|:&};:',                          // Fork 炸彈
        'eval(',                                // 危險的程式碼執行
        'exec(',                                // 系統命令執行
        'os.system',                           // Python 系統命令
        'subprocess.call',                      // Python 子進程
        'socket',                              // 網路操作
    ];

    // 根據腳本類型定義允許的關鍵字
    const allowedKeywords = {
        'python': [
            'requests', 'beautifulsoup', 'selenium',
            'urllib', 'scrapy', 'aiohttp',
            'pandas', 'csv', 'json',
            'time.sleep', 'datetime',
            'print', 'logging'
        ],
        'bat': [
            '@echo off', 'powershell', 'invoke-webrequest',
            'findstr', 'type', 'find',
            'echo', 'exit /b',
            'set', 'if', 'for'
        ],
        'shell': [
            'curl', 'wget', 'grep',
            'awk', 'sed', 'cat',
            'echo', 'exit'
        ]
    };

    // 檢查是否包含危險關鍵字
    const hasDangerousCode = dangerousKeywords.some(keyword => 
        content.toLowerCase().includes(keyword.toLowerCase())
    );

    // 根據腳本類型檢查是否包含允許的關鍵字
    const scriptAllowedKeywords = allowedKeywords[scriptType] || allowedKeywords.python;
    const hasAllowedCode = scriptAllowedKeywords.some(keyword => 
        content.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasDangerousCode || !hasAllowedCode) {
        return {
            safe: false,
            message: hasDangerousCode ? 
                '腳本包含危險的系統命令，僅允許網頁爬蟲相關操作。' : 
                '腳本必須包含允許的程式碼。'
        };
    }

    return { safe: true };
}

// 保存排程
async function saveSchedule() {
    try {
        const name = document.getElementById('scheduleName').value;
        const type = document.getElementById('scheduleType').value;
        const frequency = document.getElementById('scheduleFrequency').value;
        let scheduleTime = '';
        let selectedDays = [];

        // 檢查必填欄位
        if (!name || !type || !frequency) {
            throw new Error('請填寫所有必填欄位');
        }

        // 獲取腳本內容和來源
        const scriptSource = document.querySelector('input[name="scriptSource"]:checked').value;
        let scriptContent = '';
        let fileName = null;

        // 檢查腳本來源
        if (scriptSource === 'file') {
            const fileInput = document.getElementById('scriptFile');
            const scriptFileList = document.getElementById('scriptFileList');
            
            // 檢查是否有新上傳的檔案
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                fileName = file.name;
                scriptContent = await file.text();
                
                // 檢查腳本內容安全性
                const securityCheck = isScriptContentSafe(scriptContent, type);  // 添加 type 參數
                if (!securityCheck.safe) {
                    throw new Error(securityCheck.message);
                }
            } 
            // 檢查是否有已上傳的檔案
            else if (scriptFileList && scriptFileList.querySelector('.file-item')) {
                const fileItem = scriptFileList.querySelector('.file-item');
                fileName = fileItem.textContent.trim();
                scriptContent = fileName;
            }
            // 檢查是否有顯示的檔案名稱
            else if (scriptFileList && scriptFileList.textContent.trim()) {
                fileName = scriptFileList.textContent.trim();
                scriptContent = fileName;
            }
            // 如果是編輯模式，檢查是否有已存在的檔案
            else if (currentScheduleId) {
                const existingFile = document.querySelector('.uploaded-file');
                if (existingFile) {
                    fileName = existingFile.textContent.trim();
                    scriptContent = fileName;
                } else {
                    throw new Error('請上傳腳本檔案');
                }
            } else {
                throw new Error('請上傳腳本檔案');
            }
        } else if (scriptSource === 'text') {
            scriptContent = document.getElementById('scriptContent').value.trim();
            if (!scriptContent) {
                throw new Error('請輸入腳本內容');
            }
            
            // 檢查腳本內容安全性
            const securityCheck = isScriptContentSafe(scriptContent, type);  // 添加 type 參數
            if (!securityCheck.safe) {
                throw new Error(securityCheck.message);
            }
        }

        // 根據頻率獲取時間和日期
        switch (frequency) {
            case 'once':
                scheduleTime = document.getElementById('onceDateTime').value;
                if (!scheduleTime) throw new Error('請選擇執行時間');
                // 轉換日期時間格式
                scheduleTime = scheduleTime.replace('T', ' ');
                break;

            case 'daily':
                scheduleTime = document.getElementById('dailyTime').value;
                if (!scheduleTime) throw new Error('請選擇執行時間');
                // 確保時間格式正確
                if (!/^\d{2}:\d{2}$/.test(scheduleTime)) {
                    throw new Error('無效的時間格式');
                }
                break;

            case 'weekly':
                scheduleTime = document.getElementById('weeklyTime').value;
                if (!scheduleTime) throw new Error('請選擇執行時間');
                // 確保時間格式正確
                if (!/^\d{2}:\d{2}$/.test(scheduleTime)) {
                    throw new Error('無效的時間格式');
                }
                
                selectedDays = Array.from(document.querySelectorAll('#weeklyTimeGroup .weekday-select:checked'))
                    .map(cb => parseInt(cb.value));
                if (selectedDays.length === 0) {
                    throw new Error('請選擇每週執行日期');
                }
                break;

            case 'monthly':
                scheduleTime = document.getElementById('monthlyTime').value;
                if (!scheduleTime) throw new Error('請選擇執行時間');
                // 確保時間格式正確
                if (!/^\d{2}:\d{2}$/.test(scheduleTime)) {
                    throw new Error('無效的時間格式');
                }
                
                selectedDays = Array.from(document.querySelectorAll('#monthlyTimeGroup .monthly-day-select:checked'))
                    .map(cb => parseInt(cb.value));
                if (selectedDays.length === 0) {
                    throw new Error('請選擇每月執行日期');
                }
                break;
        }

        console.log('Sending schedule data:', {
            frequency,
            scheduleTime,
            selectedDays
        });

        const data = {
            name: name,
            type: type,
            script_source: scriptSource,
            script_content: scriptContent,
            file_name: fileName,
            schedule_time: scheduleTime,
            frequency: frequency,
            selected_days: selectedDays,
            status: 'stopped'
        };

        // 發送請求
        const url = currentScheduleId ? 
            `/api/schedules/${currentScheduleId}` : 
            '/api/schedules';
        const method = currentScheduleId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '保存失敗');
        }

        // 關閉模態框
        const modal = bootstrap.Modal.getInstance(document.getElementById('scheduleModal'));
        modal.hide();

        // 顯示成功訊息
        await Swal.fire({
            icon: 'success',
            title: '成功',
            text: currentScheduleId ? '排程更新成功' : '排程新增成功',
            timer: 1500
        });

        // 重新載入排程列表
        loadScheduleList(true);

    } catch (error) {
        console.error('Save Error:', error);
        await Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: error.message
        });
    }
}



// 載入排程列表
async function loadScheduleList(forceUpdate = false) {
    try {
        console.log('Loading schedule list' + (forceUpdate ? ' (forced)' : ''));
        
        const timestamp = forceUpdate ? `?t=${Date.now()}` : '';
        const response = await fetch('/api/schedules' + timestamp);
        if (!response.ok) {
            throw new Error('載入排程列表失敗');
        }
        const schedules = await response.json();
        
        // 保存完整的排程列表
        totalSchedules = schedules;
        
        // 獲取當前顯示的排程狀態
        const tbody = document.getElementById('schedule-list');
        if (tbody) {
            const currentSchedules = {};
            tbody.querySelectorAll('tr').forEach(tr => {
                const id = tr.getAttribute('data-id');
                if (id) {
                    const statusBadge = tr.querySelector('.badge');
                    currentSchedules[id] = {
                        id: id,
                        name: tr.querySelector('td:nth-child(1)').textContent.trim(),
                        status: statusBadge ? statusBadge.textContent.trim() : '',
                        lastRun: tr.querySelector('td:nth-child(5)').textContent.trim()
                    };
                }
            });

            // 檢查狀態變化
            schedules.forEach(schedule => {
                const currentSchedule = currentSchedules[schedule.id];
                if (currentSchedule) {
                    const statusMap = {
                        'active': '執行中',
                        'pending': '等待中',
                        'completed': '已完成',
                        'stopped': '已停止',
                        'failed': '失敗'
                    };
                    
                    const newStatus = statusMap[schedule.status];
                    if (currentSchedule.status !== newStatus) {
                        // 只在完成或失敗時顯示一次通知
                        if (newStatus === '已完成' || newStatus === '失敗') {
                            showStatusChangeNotification(
                                schedule.name,
                                currentSchedule.status,
                                newStatus,
                                schedule.result,
                                schedule.error_message
                            );
                        }
                    }
                }
            });
        }
        
        // 應用搜尋過濾
        let filteredSchedules = schedules;
        if (scheduleSearchKeyword) {
            const keyword = scheduleSearchKeyword.toLowerCase();
            filteredSchedules = schedules.filter(schedule => 
                schedule.name.toLowerCase().includes(keyword) ||
                getScheduleTypeName(schedule.type).toLowerCase().includes(keyword) ||
                getScheduleFrequencyName(schedule.frequency).toLowerCase().includes(keyword)
            );
        }

        // 計算分頁
        const totalPages = Math.ceil(filteredSchedules.length / schedulePageSize);
        const start = (scheduleCurrentPage - 1) * schedulePageSize;
        const end = Math.min(start + schedulePageSize, filteredSchedules.length);
        const pageSchedules = filteredSchedules.slice(start, end);

        // 更新分頁控制
        updatePaginationControls(scheduleCurrentPage, totalPages, filteredSchedules.length);

        // 更新表格內容
        updateScheduleTable(pageSchedules);

        // 在更新表格後添加 log
        console.log('Schedule list updated');
    } catch (error) {
        console.error('Error loading schedules:', error);
        await Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: error.message || '載入排程列表失敗'
        });
    }
}

// 修改 updatePaginationControls 函數
function updatePaginationControls(currentPage, totalPages, totalItems) {
    // 修改選擇器，確保能找到正確的分頁容器
    const pagination = document.querySelector('#schedule-list').closest('.card-body').querySelector('.pagination');
    if (!pagination) {
        console.error('Pagination container not found');
        return;
    }

    // 清空分頁容器
    pagination.innerHTML = '';
    
    // 添加上一頁按鈕
    pagination.innerHTML += `
        <li class="page-item ${currentPage <= 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" id="schedulePrevPage">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;

    // 生成所有頁碼按鈕
    for (let i = 1; i <= totalPages; i++) {
        pagination.innerHTML += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }

    // 添加下一頁按鈕
    pagination.innerHTML += `
        <li class="page-item ${currentPage >= totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" id="scheduleNextPage">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;

    // 綁定事件處理
    bindPaginationEvents(pagination, currentPage, totalPages);
}

// 新增一個函數來處理分頁事件綁定
function bindPaginationEvents(pagination, currentPage, totalPages) {
    // 綁定頁碼點擊事件
    pagination.querySelectorAll('.page-link[data-page]').forEach(link => {
        link.onclick = function(e) {
            e.preventDefault();
            const page = parseInt(this.dataset.page);
            if (page !== currentPage) {
                scheduleCurrentPage = page;
                loadScheduleList(true);
            }
        };
    });

    // 綁定上一頁/下一頁按鈕事件
    const prevPageBtn = pagination.querySelector('#schedulePrevPage');
    const nextPageBtn = pagination.querySelector('#scheduleNextPage');
    
    if (prevPageBtn) {
        prevPageBtn.onclick = function(e) {
            e.preventDefault();
            if (currentPage > 1) {
                scheduleCurrentPage--;
                loadScheduleList(true);
            }
        };
    }
    
    if (nextPageBtn) {
        nextPageBtn.onclick = function(e) {
            e.preventDefault();
            if (currentPage < totalPages) {
                scheduleCurrentPage++;
                loadScheduleList(true);
            }
        };
    }
}

// 添加生成頁碼的輔助函數
function generatePageNumbers(currentPage, totalPages) {
    let pages = '';
    
    // 如果總頁數小於等於 1，不顯示額外的頁碼
    if (totalPages <= 1) return '';
    
    // 生成中間的頁碼
    for (let i = 2; i <= totalPages; i++) {
        pages += `
            <li class="page-item ${currentPage === i ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }
    
    return pages;
}

// 將 updateBatchDeleteButton 函數移到文件頂部
function updateBatchDeleteButton() {
    const checkedBoxes = document.querySelectorAll('input[name="scheduleSelect"]:checked');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.disabled = checkedBoxes.length === 0;
    }
}

// 修改 updateScheduleTable 函數，添加分頁控制
function updateScheduleTable(schedules) {
    const tbody = document.getElementById('schedule-list');
    if (!tbody) return;

    // 清空表格內容
    tbody.innerHTML = '';

    // 如果沒有排程，顯示空狀態
    if (schedules.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5">
                    <div class="empty-state">
                        <i class="fas fa-clipboard-list fa-3x mb-3 text-muted"></i>
                        <h5 class="text-muted mb-2">目前沒有排程任務</h5>
                        <p class="text-muted mb-3">點擊右上角的「新增排程」按鈕來建立新的排程任務</p>
                        <button class="btn btn-primary" onclick="openAddScheduleModal()">
                            <i class="fas fa-plus me-2"></i>新增排程
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // 添加排程列表
    schedules.forEach(schedule => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', schedule.id);
        tr.innerHTML = `
            <td>
                <input type="checkbox" class="form-check-input" name="scheduleSelect" value="${schedule.id}">
            </td>
            <td>${escapeHtml(schedule.name)}</td>
            <td>${getScheduleTypeName(schedule.type)}</td>
            <td>${formatScheduleTime(schedule)}</td>
            <td>
                ${getStatusBadge(schedule.status)}
                ${schedule.error_message ? 
                    `<span class="text-danger ms-2" title="${escapeHtml(schedule.error_message)}">
                        <i class="fas fa-exclamation-circle"></i>
                    </span>` : 
                    ''}
            </td>
            <td>${schedule.last_run ? formatScheduleTime(schedule) : '-'}</td>
            <td>${createActionButtons(schedule)}</td>
        `;
        tbody.appendChild(tr);
    });

    // 更新分頁控制區域
    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer) {
        paginationContainer.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <!-- 左側的每頁顯示選項 -->
                <div class="d-flex align-items-center me-3">
                    <span class="me-2">每頁顯示:</span>
                    <select class="form-select form-select-sm" id="pageSizeSelect" style="width: 70px;">
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>

                <!-- 右側的分頁控制 -->
                <nav aria-label="Page navigation">
                    <ul class="pagination pagination-sm mb-0">
                        <li class="page-item ${scheduleCurrentPage <= 1 ? 'disabled' : ''}">
                            <a class="page-link" href="#" id="schedulePrevPage">
                                <i class="fas fa-chevron-left"></i>
                            </a>
                        </li>
                        <li class="page-item ${scheduleCurrentPage === 1 ? 'active' : ''}">
                            <a class="page-link" href="#" data-page="1">1</a>
                        </li>
                        ${generatePageNumbers(scheduleCurrentPage, Math.ceil(totalSchedules.length / schedulePageSize))}
                        <li class="page-item ${scheduleCurrentPage >= Math.ceil(totalSchedules.length / schedulePageSize) ? 'disabled' : ''}">
                            <a class="page-link" href="#" id="scheduleNextPage">
                                <i class="fas fa-chevron-right"></i>
                            </a>
                        </li>
                    </ul>
                </nav>
            </div>
        `;

        // 綁定每頁顯示選項的事件
        const pageSizeSelect = document.getElementById('pageSizeSelect');
        if (pageSizeSelect) {
            pageSizeSelect.value = schedulePageSize;
            pageSizeSelect.onchange = function() {
                schedulePageSize = parseInt(this.value);
                scheduleCurrentPage = 1;  // 重置到第一頁
                loadScheduleList(true);
            };
        }
    }
}

// 輔助函數
function getScheduleTypeName(type) {
    const types = {
        'python': 'Python 腳本',
        'shell': 'Shell 腳本',
        'bat': 'Batch 腳本'
    };
    return types[type] || type;
}

function getScheduleFrequencyName(frequency) {
    const frequencies = {
        'once': '單次執行',
        'daily': '每日執行',
        'weekly': '每週執行',
        'monthly': '每月執行'
    };
    return frequencies[frequency] || frequency;
}

// 格式化時間顯示
function formatScheduleTime(schedule) {
    let timeStr = schedule.schedule_time;
    let frequency = schedule.frequency;
    
    // 如果已經包含描述文字，直接返回
    if (timeStr.includes('執行)')) {
        return timeStr;
    }

    // 根據頻率添加描述
    switch (frequency) {
        case 'once':
            return `${timeStr} (單次執行)`;
        case 'daily':
            return timeStr;
        case 'weekly':
            if (schedule.selected_days && schedule.selected_days.length > 0) {
                const weekdays = schedule.selected_days.map(day => {
                    const weekdayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
                    return weekdayNames[day];
                });
                return `${timeStr} (${weekdays.join(',')}執行)`;
            }
            return timeStr;
        case 'monthly':
            if (schedule.selected_days && schedule.selected_days.length > 0) {
                return `${timeStr} (每月${schedule.selected_days.join(',')}日執行)`;
            }
            return timeStr;
        default:
            return timeStr;
    }
}

function getStatusBadge(status) {
    const badges = {
        'active': '<span class="badge bg-warning">執行中</span>',
        'pending': '<span class="badge bg-info">等待中</span>',
        'completed': '<span class="badge bg-success">已完成</span>',
        'stopped': '<span class="badge bg-secondary">已停止</span>',
        'failed': '<span class="badge bg-danger">失敗</span>'
    };
    return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
}

// 防止 XSS 攻擊的輔助函數
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 編輯排程
async function editSchedule(scheduleId) {
    try {
        resetScheduleForm();  // 保持原有的表單重置
        
        const response = await fetch(`/api/schedules/${scheduleId}`);
        if (!response.ok) throw new Error('載入排程詳情失敗');
        
        const schedule = await response.json();
        currentScheduleId = schedule.id;
        
        // 填充基本資訊
        document.getElementById('scheduleModalTitle').textContent = '編輯排程任務';
        document.getElementById('scheduleName').value = schedule.name;
        document.getElementById('scheduleType').value = schedule.type;
        document.getElementById('scheduleFrequency').value = schedule.frequency;
        
        // 處理腳本來源和內容
        if (schedule.file_name) {
            // 如果有檔案名稱，選擇檔案上傳選項
            document.getElementById('sourceFile').checked = true;
            document.getElementById('scriptTextArea').style.display = 'none';
            document.getElementById('scriptFileArea').style.display = 'block';
            
            // 顯示已上傳的檔案名稱，添加移除按鈕
            const fileListDiv = document.getElementById('scriptFileList');
            fileListDiv.innerHTML = `
                <div class="alert alert-info mb-0">
                    <div class="file-info">
                        <i class="fas fa-file-code"></i>
                        ${schedule.file_name}
                    </div>
                    <button type="button" class="remove-file btn btn-link p-0" onclick="removeUploadedFile()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            // 保存腳本內容
            document.getElementById('scriptContent').value = schedule.script_content;
        } else {
            // 如果沒有檔案名稱，選擇直接輸入選項
            document.getElementById('sourceText').checked = true;
            document.getElementById('scriptTextArea').style.display = 'block';
            document.getElementById('scriptFileArea').style.display = 'none';
            document.getElementById('scriptContent').value = schedule.script_content;
            document.getElementById('scriptFileList').innerHTML = '';
        }

        // 設置執行時間（保持原有邏輯）
        if (schedule.frequency === 'once') {
            document.getElementById('onceDateTime').value = schedule.schedule_time.split(' ').join('T');
        } else {
            const timeMatch = schedule.schedule_time.match(/\d{2}:\d{2}/);
            if (timeMatch) {
                const time = timeMatch[0];
                if (schedule.frequency === 'daily') {
                    document.getElementById('dailyTime').value = time;
                } else if (schedule.frequency === 'weekly') {
                    document.getElementById('weeklyTime').value = time;
                } else if (schedule.frequency === 'monthly') {
                    document.getElementById('monthlyTime').value = time;
                }
            }
        }

        // 設置選擇的日期（保持原有邏輯）
        if (schedule.selected_days) {
            if (schedule.frequency === 'weekly') {
                document.querySelectorAll('.weekday-select').forEach(checkbox => {
                    checkbox.checked = schedule.selected_days.includes(parseInt(checkbox.value));
                });
            } else if (schedule.frequency === 'monthly') {
                document.querySelectorAll('.monthly-day-select').forEach(checkbox => {
                    checkbox.checked = schedule.selected_days.includes(parseInt(checkbox.value));
                });
            }
        }

        // 顯示對應的時間選擇區域（保持原有邏輯）
        toggleScheduleTimeOptions();
        
        // 顯示模態框
        const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
        modal.show();
        
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: error.message
        });
    }
}

// 添加一個時間格式化輔助函數
function formatTaiwanDateTime(dateString) {
    const date = new Date(dateString);
    // 調整為台灣時間 (GMT+8)
    const twTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    
    // 格式化年月日時分
    const year = twTime.getFullYear();
    const month = String(twTime.getMonth() + 1).padStart(2, '0');
    const day = String(twTime.getDate()).padStart(2, '0');
    const hours = String(twTime.getHours()).padStart(2, '0');
    const minutes = String(twTime.getMinutes()).padStart(2, '0');
    
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

// 停止排程
async function stopSchedule(id) {
    try {
        const result = await Swal.fire({
            title: '確認停止',
            text: '確定要停止這個排程嗎？',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '確定',
            cancelButtonText: '取消'
        });

        if (result.isConfirmed) {
            const response = await fetch(`/api/schedules/${id}/stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '停止排程失敗');
            }

            // 顯示 toast 提示
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: '排程已停止',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            await loadScheduleList(true);  // 強制更新列表
        }
    } catch (error) {
        console.error('Stop Error:', error);
        await Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: '停止排程失敗: ' + error.message
        });
    }
}

// 刪除排程
async function deleteSchedule(id) {
    try {
        const result = await Swal.fire({
            title: '確認刪除',
            text: '確定要刪除這個排程嗎？',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '確定',
            cancelButtonText: '取消'
        });

        if (result.isConfirmed) {
            // 直接刪除排程
            const response = await fetch(`/api/schedules/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '刪除失敗');
            }

            await Swal.fire({
                icon: 'success',
                title: '成功',
                text: '排程已刪除'
            });
            
            await loadScheduleList(true);  // 強制更新列表
        }
    } catch (error) {
        console.error('Delete Error:', error);
        await Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: '刪除排程失敗: ' + error.message
        });
    }
}

// 修改定時更新函數
function startAutoUpdate(seconds) {
    console.log(`Starting auto update with interval: ${seconds} seconds`);
    stopAutoUpdate(); // 先停止現有的更新
    if (seconds >= 5) {
        autoUpdateInterval = setInterval(() => {
            console.log('Auto update triggered');
            loadScheduleList(true); // 添加 true 參數強制更新
        }, seconds * 1000);
        console.log('Auto update interval set');
    }
}

// 修改 stopAutoUpdate 函數
function stopAutoUpdate() {
    if (autoUpdateInterval) {
        console.log('Stopping auto update');
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
    }
}

// 修改狀態變化通知函數
function showStatusChangeNotification(name, oldStatus, newStatus, result, error) {
    const statusMessages = {
        '等待中': '等待中',
        '執行中': '執行中',
        '已完成': '已完成',
        '失敗': '執行失敗'
    };

    let icon = 'info';
    let message = `任務 "${name}" `;

    if (newStatus === '已完成' || newStatus === '失敗') {
        if (newStatus === '已完成') {
            icon = 'success';
            if (result) {
                message += `執行完成`;
            }
        } else {
            icon = 'error';
            if (error) {
                message += `執行失敗`;
            }
        }

        // 當任務完成或失敗時，顯示通知後重新整理頁面
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: icon,
            title: '排程狀態更新',
            text: message,
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        })
    } else {
        // 其他狀態只顯示通知，不重新整理
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: icon,
            title: '排程狀態更新',
            text: message,
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        });
    }
}

// 修改 restartSchedule 函數，添加狀態檢查
async function restartSchedule(id) {
    try {
        // 先檢查當前狀態
        const response = await fetch(`/api/schedules/${id}`);
        if (!response.ok) {
            throw new Error('獲取排程資訊失敗');
        }
        const schedule = await response.json();
        
        if (schedule.status === 'failed') {
            await Swal.fire({
                icon: 'error',
                title: '無法啟用',
                text: '失敗的排程無法啟用，請編輯修正後再試'
            });
            return;
        }

        // 原有的確認邏輯
        const result = await Swal.fire({
            title: '確認啟用',
            text: '確定要啟用這個排程嗎？',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '確定',
            cancelButtonText: '取消'
        });

        if (result.isConfirmed) {
            const response = await fetch(`/api/schedules/${id}/restart`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '啟用排程失敗');
            }

            // 顯示 toast 提示
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: '排程已啟用',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            await loadScheduleList(true);  // 強制更新列表
        }
    } catch (error) {
        console.error('Restart Error:', error);
        await Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: '啟用排程失敗: ' + error.message
        });
    }
}

// 修改 runScheduleNow 函數
async function runScheduleNow(scheduleId) {
    try {
        // 顯示執行提示
        Swal.fire({
            title: '執行中...',
            text: '正在執行排程任務',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            willOpen: () => {
                Swal.showLoading();
            }
        });

        // 執行排程
        const response = await fetch(`/api/schedules/${scheduleId}/run`, {
            method: 'POST'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '執行失敗');
        }

        // 顯示成功訊息
        Swal.fire({
            icon: 'success',
            title: '執行成功',
            text: '排程任務已完成',
            timer: 2000,
            showConfirmButton: false
        });

        // 重新載入排程列表
        await loadScheduleList(true);

    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: error.message,
            timer: 3000,
            showConfirmButton: false
        });
    }
}

// 查看執行日誌
async function viewLogs(scheduleId) {
    try {
        const response = await fetch(`/api/schedules/${scheduleId}/logs`);
        if (!response.ok) {
            throw new Error('獲取日誌失敗');
        }
        
        const logs = await response.json();
        const tbody = document.getElementById('logsTableBody');
        tbody.innerHTML = '';
        
        if (logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">尚無執行記錄</td>
                </tr>
            `;
        } else {
            logs.forEach(log => {
                tbody.innerHTML += `
                    <tr class="${getStatusClass(log.status)}">
                        <td>${formatDateTime(log.execution_time)}</td>
                        <td>
                            <span class="badge ${getStatusBadgeClass(log.status)}">
                                ${getStatusText(log.status)}
                            </span>
                        </td>
                        <td>
                            <pre class="mb-0"><code>${escapeHtml(log.content)}</code></pre>
                        </td>
                        <td>${formatDuration(log.duration)}</td>
                        <td>${log.error_message ? `<pre class="text-danger mb-0"><code>${escapeHtml(log.error_message)}</code></pre>` : '-'}</td>
                    </tr>
                `;
            });
        }
        
        // 顯示模態框
        const modal = new bootstrap.Modal(document.getElementById('logsModal'));
        modal.show();
        
    } catch (error) {
        console.error('View Logs Error:', error);
        await Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: '獲取日誌失敗: ' + error.message
        });
    }
}

// 格式化日期時間 (用於執行日誌)
function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false // 使用24小時制
    });
}

// 格式化執行時長
function formatDuration(duration) {
    if (!duration) return '-';
    return `${duration.toFixed(2)}秒`;
}

// 獲取狀態對應的樣式
function getStatusClass(status) {
    switch (status) {
        case 'success': return 'table-success';
        case 'failed': return 'table-danger';
        case 'running': return 'table-warning';
        default: return '';
    }
}

// 獲取狀態標籤的樣式
function getStatusBadgeClass(status) {
    switch (status) {
        case 'success': return 'bg-success';
        case 'failed': return 'bg-danger';
        case 'running': return 'bg-warning';
        default: return 'bg-secondary';
    }
}

// 獲取狀態文字
function getStatusText(status) {
    switch (status) {
        case 'success': return '成功';
        case 'failed': return '失敗';
        case 'running': return '執行中';
        default: return status;
    }
}

function createActionButtons(schedule) {
    const { id, status } = schedule;
    const isActive = status === 'active' || status === 'running';
    const isPending = status === 'pending';
    const isStopped = status === 'stopped';
    const isCompleted = status === 'completed';
    const isFailed = status === 'failed';

    // 按鈕啟用邏輯
    const canEdit = isFailed||isStopped;  // 只有已停止狀態可以編輯
    const canDelete = isStopped || isFailed ||isPending;  // 已停止和失敗可以刪除
    const canRestart = isStopped ||isCompleted;  // 已停止和已完成可以啟用
    const canRun = isStopped || isCompleted ||isPending ||isActive;  // 已停止和已完成可以執行
    const canStop = isActive || isCompleted ||isPending;  // 運行中和已完成可以停止

    return `
        <div class="d-flex gap-2">
            <button class="btn btn-sm btn-primary" onclick="editSchedule(${id})" 
                ${canEdit ? '' : 'disabled'} title="編輯">
                <i class="fas fa-edit"></i>
            </button>
            ${canStop ? `
                <button class="btn btn-sm btn-dark" onclick="stopSchedule(${id})"
                    title="停止">
                    <i class="fas fa-square"></i>
                </button>
            ` : `
                <button class="btn btn-sm btn-success" onclick="restartSchedule(${id})"
                    ${canRestart ? '' : 'disabled'} title="啟用">
                    <i class="fas fa-play"></i>
                </button>
            `}
            <button class="btn btn-sm btn-info" onclick="runScheduleNow(${id})"
                ${canRun ? '' : 'disabled'} title="立即執行">
                <i class="fas fa-play-circle"></i>
            </button>
            <button class="btn btn-sm btn-secondary" onclick="viewLogs(${id})" 
                title="查看日誌">
                <i class="fas fa-list-alt"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${id})"
                ${canDelete ? '' : 'disabled'} title="刪除">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

// 修改移除檔案的函數
function removeUploadedFile() {
    // 清空檔案列表
    document.getElementById('scriptFileList').innerHTML = '';
    // 清空檔案輸入
    document.getElementById('scriptFile').value = '';
    // 清空腳本內容
    document.getElementById('scriptContent').value = '';
}

// 在文件最頂部定義全局變數
let autoUpdateInterval = null;

// 修改 DOMContentLoaded 事件處理，確保只註冊一次
document.addEventListener('DOMContentLoaded', function() {
    // 初始化自動更新控制
    initAutoUpdate();

    // 為下拉選單添加視覺提示
    const scheduleTypeSelect = document.getElementById('scheduleType');
    if (scheduleTypeSelect) {
        scheduleTypeSelect.classList.add('form-select');
    }

    const scheduleFrequency = document.getElementById('scheduleFrequency');
    if (scheduleFrequency) {
        scheduleFrequency.classList.add('form-select');
    }

    // 添加分頁大小選擇事件
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', function() {
            schedulePageSize = parseInt(this.value);
            scheduleCurrentPage = 1;  // 重置到第一頁
            loadScheduleList(true);
        });
    }

    // 添加分頁控制事件
    const prevPageBtn = document.getElementById('schedulePrevPage');
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (scheduleCurrentPage > 1) {
                scheduleCurrentPage--;
                loadScheduleList(true);
            }
        });
    }

    const nextPageBtn = document.getElementById('scheduleNextPage');
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const totalPages = Math.ceil(totalSchedules.length / schedulePageSize);
            if (scheduleCurrentPage < totalPages) {
                scheduleCurrentPage++;
                loadScheduleList(true);
            }
        });
    }
});

// 將自動更新初始化邏輯抽取為獨立函數
function initAutoUpdate() {
    const autoUpdateToggle = document.getElementById('autoUpdateToggle');
    const updateInterval = document.getElementById('updateInterval');

    if (autoUpdateToggle && updateInterval) {
        console.log('Initializing auto update controls');
        
        // 確保初始狀態是關閉的
        autoUpdateToggle.checked = false;
        
        // 切換自動更新
        autoUpdateToggle.addEventListener('change', function() {
            console.log(`Auto update toggle changed: ${this.checked}`);
            if (this.checked) {
                const seconds = parseInt(updateInterval.value);
                console.log(`Starting auto update with ${seconds} seconds`);
                if (seconds >= 5 && seconds <= 300) {
                    startAutoUpdate(seconds);
                } else {
                    // 如果值無效，設定為預設值並提示用戶
                    updateInterval.value = '30';
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'warning',
                        title: '更新間隔必須在 5-300 秒之間',
                        showConfirmButton: false,
                        timer: 2000
                    });
                    autoUpdateToggle.checked = false;
                }
            } else {
                stopAutoUpdate();
            }
        });

        // 更新間隔變更
        updateInterval.addEventListener('input', function() {
            // 允許空值和部分輸入
            if (this.value === '' || this.value === '-') {
                return;
            }

            let value = parseInt(this.value);
            
            // 只在有效的數字輸入時更新
            if (!isNaN(value)) {
                // 如果自動更新已開啟，檢查範圍並應用
                if (autoUpdateToggle.checked) {
                    if (value < 5 || value > 300) {
                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'warning',
                            title: '更新間隔必須在 5-300 秒之間',
                            showConfirmButton: false,
                            timer: 2000
                        });
                        autoUpdateToggle.checked = false;
                        stopAutoUpdate();
                    } else {
                        console.log(`Restarting auto update with new interval: ${value}`);
                        startAutoUpdate(value);
                    }
                }
            }
        });

        // 處理失去焦點時的最終檢查
        updateInterval.addEventListener('blur', function() {
            let value = parseInt(this.value);
            
            // 如果輸入無效或超出範圍，重置為預設值
            if (isNaN(value) || value < 5 || value > 300) {
                this.value = '30';
                if (autoUpdateToggle.checked) {
                    autoUpdateToggle.checked = false;
                    stopAutoUpdate();
                }
            }
        });
    }
}

// 修改 startAutoUpdate 函數，確保使用全局的 autoUpdateInterval
function startAutoUpdate(seconds) {
    console.log(`Starting auto update with interval: ${seconds} seconds`);
    stopAutoUpdate(); // 先停止現有的更新
    if (seconds >= 5) {
        autoUpdateInterval = setInterval(() => {
            console.log('Auto update triggered');
            loadScheduleList(true); // 添加 true 參數強制更新
        }, seconds * 1000);
        console.log('Auto update interval set');
    }
}

// 修改 stopAutoUpdate 函數，確保使用全局的 autoUpdateInterval
function stopAutoUpdate() {
    if (autoUpdateInterval) {
        console.log('Stopping auto update');
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const uploadForm = document.getElementById('uploadForm');
    const uploadButton = document.getElementById('uploadButton');
    const uploadSpinner = uploadButton.querySelector('.spinner-border');
    const clearButton = document.getElementById('clearButton');
    
    // 初始化清空按鈕為禁用狀態
    clearButton.disabled = true;
    
    const allowedTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/pdf',
        'text/markdown',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ];
    const files = new Set();

    // 點擊上傳區域觸發文件選擇
    dropZone.addEventListener('click', () => fileInput.click());

    // 拖曳效果
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        });
    });

    // 處理檔案拖放
    dropZone.addEventListener('drop', (e) => {
        const droppedFiles = e.dataTransfer.files;
        handleFiles(droppedFiles);
    });

    // 處理檔案選擇
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // 清空按鈕點擊事件
    clearButton.addEventListener('click', () => {
        if (files.size > 0) {
            Swal.fire({
                title: '確定要清空所有檔案？',
                text: '此操作無法復原',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: '確定清空',
                cancelButtonText: '取消'
            }).then((result) => {
                if (result.isConfirmed) {
                    files.clear();
                    updateFileList();
                    updateControlsVisibility();
                }
            });
        }
    });

    function getFileIcon(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        const iconMap = {
            'csv': 'fa-file-csv',
            'xlsx': 'fa-file-excel',
            'xls': 'fa-file-excel',
            'pdf': 'fa-file-pdf',
            'md': 'fa-file-alt',
            'docx': 'fa-file-word',
            'txt': 'fa-file-alt'
        };
        return iconMap[extension] || 'fa-file';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function handleFiles(newFiles) {
        Array.from(newFiles).forEach(file => {
            // 檢查檔案類型
            if (!allowedTypes.includes(file.type)) {
                Swal.fire({
                    icon: 'error',
                    title: '不支援的檔案類型',
                    text: `檔案 ${file.name} 的類型不被支援`
                });
                return;
            }

            // 檢查檔案是否已存在（使用檔名作為唯一標識）
            const isDuplicate = Array.from(files).some(existingFile => 
                existingFile.name === file.name
            );

            if (isDuplicate) {
                // 如果檔案已存在，詢問用戶是否要替換
                Swal.fire({
                    title: '檔案已存在',
                    text: `是否要替換已存在的檔案 "${file.name}"？`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: '是，替換檔案',
                    cancelButtonText: '取消'
                }).then((result) => {
                    if (result.isConfirmed) {
                        // 移除舊檔案
                        files.forEach(existingFile => {
                            if (existingFile.name === file.name) {
                                files.delete(existingFile);
                            }
                        });
                        // 添加新檔案
                        files.add(file);
                        updateFileList();
                        updateControlsVisibility();
                    }
                });
            } else {
                // 如果檔案不存在，直接添加
                files.add(file);
                updateFileList();
                updateControlsVisibility();
            }
        });

        // 更新清空按鈕狀態
        clearButton.disabled = files.size === 0;
    }

    // 設置預設視圖為卡片視圖
    fileList.className = 'file-list grid-view';

    // 添加視圖切換功能
    const viewToggleButtons = document.querySelectorAll('.view-toggle .btn');
    
    viewToggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 更新按鈕狀態
            viewToggleButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-pressed', 'false');
            });
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
            
            // 更新視圖
            const viewType = button.dataset.view;
            fileList.className = `file-list ${viewType}-view`;
        });
    });

    // 修改 updateFileList 函數
    function updateFileList() {
        fileList.innerHTML = '';
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            // 根據檔案類型選擇圖標
            let fileIcon = 'fa-file-alt'; // 預設圖標
            if (file.type.includes('pdf')) {
                fileIcon = 'fa-file-pdf';
            } else if (file.type.includes('excel') || file.type.includes('spreadsheetml')) {
                fileIcon = 'fa-file-excel';
            } else if (file.type.includes('word') || file.type.includes('document')) {
                fileIcon = 'fa-file-word';
            }

            fileItem.innerHTML = `
                <i class="fas ${fileIcon} file-icon"></i>
                <span class="file-name" title="${file.name}">${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
                <i class="fas fa-times remove-file" title="移除檔案"></i>
            `;

            // 添加移除檔案的事件監聽
            const removeButton = fileItem.querySelector('.remove-file');
            removeButton.addEventListener('click', () => {
                files.delete(file);
                updateFileList();
                updateControlsVisibility();
            });

            fileList.appendChild(fileItem);
        });
    }

    function resetForm() {
        document.getElementById('knowledgeBaseUrl').value = '';
        document.getElementById('processId').value = '';
        files.clear();
        updateFileList();
    }

    // 上傳檔案
    async function uploadFiles(url, processId, files) {
        let failedFiles = [];
        
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('file', file, file.name);

                const response = await fetch(`${url}/api/v1/files/upload/${processId}`, {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json'
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                await response.json();
            } catch (error) {
                console.error('Upload failed:', error);
                failedFiles.push({
                    name: file.name,
                    error: error.message
                });
            }
        }

        if (failedFiles.length > 0) {
            const errorMessages = failedFiles.map(f => `${f.name}: ${f.error}`);
            Swal.fire({
                icon: 'error',
                title: '上傳失敗',
                html: errorMessages.join('<br>')
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: '上傳完成',
                text: `成功上傳 ${files.length} 個檔案`
            });
        }
    }

    // 表單提交處理
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = document.getElementById('knowledgeBaseUrl').value;
        const processId = document.getElementById('processId').value;

        // 驗證必填欄位
        if (!url || !processId || files.size === 0) {
            Swal.fire({
                icon: 'error',
                title: '驗證錯誤',
                text: '請填寫所有必填欄位並至少上傳一個檔案'
            });
            return;
        }

        try {
            // 禁用上傳按鈕並顯示載入動畫
            uploadButton.disabled = true;
            uploadSpinner.classList.remove('d-none');

            // 開始上傳
            await uploadFiles(url, processId, Array.from(files));

            // 清空表單
            resetForm();
            
        } catch (error) {
            console.error('Upload error:', error);
            Swal.fire({
                icon: 'error',
                title: '上傳失敗',
                text: error.message
            });
        } finally {
            // 清空表單
            resetForm();
            // 啟用上傳按鈕並隱藏載入動畫
            uploadButton.disabled = false;
            uploadSpinner.classList.add('d-none');
        }
    });

    // 知識庫管理相關程式碼
    const searchForm = document.getElementById('searchForm');
    const searchProcessId = document.getElementById('searchProcessId');
    const tableContainer = document.getElementById('tableContainer');
    const tableSearch = document.getElementById('tableSearch');
    const pageSize = document.getElementById('pageSize');
    const pagination = document.getElementById('pagination');
    const knowledgeTable = document.getElementById('knowledgeTable');
    
    let currentData = [];
    let filteredData = [];
    let currentPage = 1;
    
    // 表單驗證和提交
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = document.getElementById('searchKnowledgeBaseUrl').value.trim();
        const processId = searchProcessId.value.trim();
        const searchButton = document.getElementById('searchButton');
        
        // 檢查每個必填欄位
        let emptyFields = [];
        if (!url) emptyFields.push('知識庫網址');
        if (!processId) emptyFields.push('知識庫流程ID');
        
        if (emptyFields.length > 0) {
            Swal.fire({
                icon: 'error',
                title: '驗證錯誤',
                text: `請填寫以下必填欄位：${emptyFields.join('、')}`
            });
            return;
        }
        
        try {
            // 禁用按鈕並顯示載入狀態
            searchButton.disabled = true;
            searchButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>查詢中...';
            
            const response = await fetch(`${url}/api/v1/files/list/${processId}`, {
                method: 'GET',
                headers: {
                    'accept': 'application/json'
                }
            });
            
            // 重設按鈕狀態
            searchButton.disabled = false;
            searchButton.innerHTML = '<i class="fas fa-search me-2"></i>查詢';
            
            if (!response.ok) {
                if (response.status === 404) {
                    Swal.fire({
                        icon: 'warning',
                        title: '找不到資料',
                        text: '指定的知識庫網址或是知識庫流程ID不存在'
                    });
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                tableContainer.style.display = 'none';
                return;
            }
            
            const data = await response.json();
            if (data && data.files && data.files.length > 0) {
                // 修改時間格式化函數，轉換為 GMT+8
                function formatDateTime(dateTimeStr) {
                    const date = new Date(dateTimeStr);
                    // 調整為 GMT+8
                    date.setHours(date.getHours() + 8);
                    return date.toLocaleString('zh-TW', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    });
                }

                // 修改資料轉換部分
                currentData = data.files.map(fileName => {
                    // 從檔案名稱解析時間
                    const [date, time] = fileName.split('_').slice(0, 2);
                    const formattedDate = date.replace(/-/g, '-');
                    const formattedTime = time.replace(/-/g, ':');
                    const uploadTime = formatDateTime(`${formattedDate} ${formattedTime}`);
                    
                    return {
                        file_name: fileName,
                        upload_time: uploadTime,
                        status: '已上傳'
                    };
                });
                filteredData = [...currentData];
                tableContainer.style.display = 'block';
                updateTable();
            } else {
                Swal.fire({
                    icon: 'info',
                    title: '查無資料',
                    text: '該知識庫流程目前沒有任何檔案'
                });
                tableContainer.style.display = 'none';
            }
        } catch (error) {
            console.error('Search failed:', error);
            // 重設按鈕狀態
            searchButton.disabled = false;
            searchButton.innerHTML = '<i class="fas fa-search me-2"></i>查詢';
            
            Swal.fire({
                icon: 'error',
                title: '查詢失敗',
                html: '連線發生錯誤，請確認知識庫網址是否正確<br><br>如確認無誤，請檢查是否有上傳檔案!!!',
            });
            tableContainer.style.display = 'none';
        }
    });
    
    // 表格搜尋功能
    tableSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filteredData = currentData.filter(item => 
            item.file_name.toLowerCase().includes(searchTerm) ||
            item.status.toLowerCase().includes(searchTerm)
        );
        currentPage = 1;
        updateTable();
    });
    
    // 每頁顯示筆數變更
    pageSize.addEventListener('change', () => {
        currentPage = 1;
        updateTable();
    });
    
    // 更新表格和分頁
    function updateTable() {
        const pageCount = Math.ceil(filteredData.length / parseInt(pageSize.value));
        const start = (currentPage - 1) * parseInt(pageSize.value);
        const end = start + parseInt(pageSize.value);
        const pageData = filteredData.slice(start, end);
        
        // 更新表格內容
        const tbody = knowledgeTable.querySelector('tbody');
        tbody.innerHTML = '';
        pageData.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.file_name}</td>
                <td>${item.upload_time}</td>
                <td class="status-uploaded">${item.status}</td>
                <td class="text-center">
                    <button class="btn btn-link btn-sm p-0 delete-file" 
                            data-filename="${item.file_name}" 
                            title="刪除檔案">
                        <i class="fas fa-trash-alt text-danger"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
            
            // 添加刪除按鈕事件監聽
            const deleteBtn = tr.querySelector('.delete-file');
            deleteBtn.addEventListener('click', async () => {
                await handleDeleteFile(item.file_name);
            });
        });
        
        // 更新分頁
        updatePagination(pageCount);
    }
    
    // 更新分頁按鈕
    function updatePagination(pageCount) {
        pagination.innerHTML = '';
        
        // 上一頁
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#">上一頁</a>`;
        prevLi.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentPage--;
                updateTable();
            }
        });
        pagination.appendChild(prevLi);
        
        // 頁碼
        for (let i = 1; i <= pageCount; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${currentPage === i ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            li.addEventListener('click', (e) => {
                e.preventDefault();
                currentPage = i;
                updateTable();
            });
            pagination.appendChild(li);
        }
        
        // 下一頁
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${currentPage === pageCount ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#">下一頁</a>`;
        nextLi.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage < pageCount) {
                currentPage++;
                updateTable();
            }
        });
        pagination.appendChild(nextLi);
    }

    // 添加刪除檔案處理函數
    async function handleDeleteFile(fileName) {
        try {
            const result = await Swal.fire({
                title: '確定要刪除檔案？',
                text: `確定要刪除 ${fileName} 嗎？`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: '確定刪除',
                cancelButtonText: '取消'
            });

            if (result.isConfirmed) {
                const url = document.getElementById('searchKnowledgeBaseUrl').value.trim();
                const processId = document.getElementById('searchProcessId').value.trim();
                
                const response = await fetch(`${url}/api/v1/files/delete/${processId}/${fileName}`, {
                    method: 'DELETE',
                    headers: {
                        'accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                // 從當前數據中移除該檔案
                currentData = currentData.filter(item => item.file_name !== fileName);
                filteredData = filteredData.filter(item => item.file_name !== fileName);
                
                // 更新表格
                updateTable();

                Swal.fire(
                    '刪除成功',
                    '檔案已成功刪除',
                    'success'
                );
            }
        } catch (error) {
            console.error('Delete failed:', error);
            Swal.fire({
                icon: 'error',
                title: '刪除失敗',
                text: '刪除檔案時發生錯誤，請稍後再試'
            });
        }
    }

    // 添加控制元素顯示的函數
    function updateControlsVisibility() {
        const controlsContainer = document.getElementById('fileControlsContainer');
        controlsContainer.style.display = files.size > 0 ? 'block' : 'none';
    }

    // 初始化時設置控制元素的顯示狀態
    updateControlsVisibility();

    // 移除原本的頁籤監聽，改為直接載入
    loadScheduleList();  // 直接載入排程列表

    // 檢查當前頁面是否在知識庫爬取頁面
    function isInCrawlerPage() {
        const activeTab = document.querySelector('button#crawler-tab.nav-link.active');
        return window.location.pathname.includes('/knowledge_base_manage') && activeTab !== null;
    }

    // 使用 Bootstrap 的 tab 事件
    const tabs = document.querySelectorAll('button[data-bs-toggle="tab"]');
    tabs.forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(event) {
            const targetTab = event.target.getAttribute('data-bs-target');
            console.log('Tab shown:', targetTab);
            
            // 停止當前的自動更新
            stopAutoUpdate();
            
            // 檢查是否切換到知識庫爬取頁籤
            if (targetTab === '#crawler') {
                console.log('Starting auto update for crawler tab');
                loadScheduleList();
                startAutoUpdate();
            }
        });
    });

    // 在頁面載入時檢查並啟動自動更新
    console.log('Initial page check:', isInCrawlerPage());
    if (isInCrawlerPage()) {
        console.log('Starting auto update on page load');
        loadScheduleList();
        startAutoUpdate();
    }

    // 初始化腳本來源切換功能
    initScriptSourceToggle();
    
    // 綁定搜尋輸入框事件
    const searchInput = document.getElementById('scheduleSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function(e) {
            scheduleSearchKeyword = e.target.value;
            scheduleCurrentPage = 1; // 重置到第一頁
            loadScheduleList(true);
        }, 300));
    }

    // 綁定每頁筆數選擇事件
    const pageSizeSelect = document.getElementById('schedulePageSize');
    if (pageSizeSelect) {
        pageSizeSelect.value = schedulePageSize.toString();
        pageSizeSelect.addEventListener('change', function(e) {
            schedulePageSize = parseInt(e.target.value);
            scheduleCurrentPage = 1;
            loadScheduleList(true);
        });
    }

    // 綁定分頁按鈕事件
    const prevPageBtn = document.getElementById('schedulePrevPage');
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (scheduleCurrentPage > 1) {
                scheduleCurrentPage--;
                loadScheduleList(true);
            }
        });
    }

    const nextPageBtn = document.getElementById('scheduleNextPage');
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const totalPages = Math.ceil(totalSchedules.length / schedulePageSize);
            if (scheduleCurrentPage < totalPages) {
                scheduleCurrentPage++;
                loadScheduleList(true);
            }
        });
    }

    // 初始化月份日期選擇器
    function initMonthlyDayPicker() {
        const container = document.querySelector('#monthlyTimeGroup .btn-group');
        container.innerHTML = '';
        
        // 生成1-31日的選項
        for (let i = 1; i <= 31; i++) {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'btn-check monthly-day-select';
            input.id = `monthDay${i}`;
            input.value = i;

            const label = document.createElement('label');
            label.className = 'btn btn-outline-primary';
            label.htmlFor = `monthDay${i}`;
            label.textContent = i + '日';

            container.appendChild(input);
            container.appendChild(label);
        }
    }

    // 初始化月份日期選擇器
    initMonthlyDayPicker();

    // 綁定頻率選擇變更事件
    const frequencySelect = document.getElementById('scheduleFrequency');
    if (frequencySelect) {
        frequencySelect.addEventListener('change', toggleScheduleTimeOptions);
    }

    // 初始化時間選擇器
    toggleScheduleTimeOptions();

    // 添加批量刪除功能
    function updateBatchDeleteButton() {
        const checkedBoxes = document.querySelectorAll('input[name="scheduleSelect"]:checked');
        const batchDeleteBtn = document.getElementById('batchDeleteBtn');
        batchDeleteBtn.disabled = checkedBoxes.length === 0;
    }

    // 添加全選功能
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('input[name="scheduleSelect"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateBatchDeleteButton();
        });
    }

    // 添加批量刪除按鈕事件監聽
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', async function() {
            const checkedBoxes = document.querySelectorAll('input[name="scheduleSelect"]:checked');
            const ids = Array.from(checkedBoxes).map(cb => cb.value);
            
            if (ids.length === 0) return;

            const result = await Swal.fire({
                title: '確定要刪除選中的排程嗎？',
                text: "此操作無法復原！",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: '確定刪除',
                cancelButtonText: '取消'
            });

            if (result.isConfirmed) {
                try {
                    const response = await fetch('/api/schedules/batch', {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ ids })
                    });

                    if (!response.ok) throw new Error('刪除失敗');

                    await Swal.fire(
                        '刪除成功！',
                        '選中的排程已被刪除',
                        'success'
                    );

                    // 重新載入排程列表
                    loadScheduleList();
                } catch (error) {
                    console.error('Batch delete error:', error);
                    Swal.fire(
                        '錯誤',
                        '刪除排程時發生錯誤',
                        'error'
                    );
                }
            }
        });
    }
});