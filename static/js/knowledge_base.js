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
});