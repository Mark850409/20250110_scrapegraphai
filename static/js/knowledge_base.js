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
                    Swal.fire('已清空', '所有檔案已被清空', 'success');
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

    function handleFiles(fileList) {
        Array.from(fileList).forEach(file => {
            if (allowedTypes.includes(file.type) || 
                file.name.endsWith('.md') || 
                file.name.endsWith('.docx') ||
                file.name.endsWith('.txt')) {
                files.add(file);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: '不支援的檔案類型',
                    text: `${file.name} 不是支援的檔案類型`
                });
            }
        });
        updateFileList();
    }

    function updateFileList() {
        fileList.innerHTML = '';
        files.forEach(file => {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-item';
            fileDiv.innerHTML = `
                <i class="fas ${getFileIcon(file.name)}"></i>
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
                <button type="button" class="btn btn-link btn-remove" data-filename="${file.name}">
                    <i class="fas fa-times"></i>
                </button>
            `;
            fileList.appendChild(fileDiv);
        });

        // 根據檔案數量啟用/禁用清空按鈕
        clearButton.disabled = files.size === 0;
        
        // 為每個移除按鈕添加事件監聽器
        document.querySelectorAll('.btn-remove').forEach(button => {
            button.addEventListener('click', () => {
                const fileName = button.getAttribute('data-filename');
                files.forEach(file => {
                    if (file.name === fileName) {
                        files.delete(file);
                    }
                });
                updateFileList();
            });
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
                // 將檔案資料轉換為所需格式
                currentData = data.files.map(fileName => {
                    // 從檔案名稱解析時間
                    const [date, time] = fileName.split('_').slice(0, 2);
                    const formattedDate = date.replace(/-/g, '-');
                    const formattedTime = time.replace(/-/g, ':');
                    const uploadTime = `${formattedDate} ${formattedTime}`;
                    
                    return {
                        file_name: fileName,
                        upload_time: uploadTime,
                        file_size: '-',
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
                text: '連線發生錯誤，請確認知識庫網址是否正確'
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
                <td>${item.file_size || '-'}</td>
                <td class="status-uploaded">${item.status}</td>
            `;
            tbody.appendChild(tr);
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
});