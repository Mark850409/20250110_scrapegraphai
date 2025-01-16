document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('smart-scrape-form');
    const modelSelect = form.querySelector('select[name="model-name"]');
    const apiKeyField = form.querySelector('.api-key-field');
    const graphRadios = form.querySelectorAll('input[name="graph-name"]');
    const resultDiv = document.getElementById('smart-scrape-result');
    const downloadBtn = resultDiv.querySelector('.download-btn');
    let ollamaServerUrl = '';
    let ollamaConnectionStatus = false;  // 添加连接状态标记
    
    // 新增 Ollama 伺服器 URL 輸入欄位
    const ollamaServerField = document.createElement('div');
    ollamaServerField.className = 'mb-3 ollama-server-field';
    ollamaServerField.innerHTML = `
        <label class="form-label">Ollama 伺服器網址</label>
        <div class="input-group">
            <input type="text" class="form-control" name="ollama-server" id="ollama-server" placeholder="例如: http://localhost:11434">
            <button class="btn btn-outline-info" type="button" id="testConnection">
                <i class="fas fa-plug me-2"></i>測試連線
            </button>
        </div>
    `;
    
    // 插入到模型選擇下拉選單之前
    const modelSelectContainer = modelSelect.parentElement;
    modelSelectContainer.style.display = 'none'; // 預設隱藏模型選擇
    modelSelectContainer.parentElement.insertBefore(ollamaServerField, modelSelectContainer);
    ollamaServerField.style.display = 'none'; // 預設隱藏

    // 缓存模型列表
    const modelListCache = new Map();

    // 更新模型列表
    async function updateModelList(graphName) {
        // 如果缓存中已有数据，直接使用缓存
        if (modelListCache.has(graphName)) {
            const cachedModels = modelListCache.get(graphName);
            updateModelSelectOptions(cachedModels);
            return;
        }
        
        modelSelect.innerHTML = '<option value="">請選擇模型...</option>';
        
        try {
            const response = await fetch(`/api/models/${graphName}`);
            if (!response.ok) {
                throw new Error('載入模型列表失敗');
            }
            
            const models = await response.json();
            if (Array.isArray(models)) {
                // 更新缓存
                modelListCache.set(graphName, models);
                updateModelSelectOptions(models);
            }
        } catch (error) {
            console.error('Error:', error);
            showError('載入模型列表失敗');
        }
    }

    // 更新选择框选项
    function updateModelSelectOptions(models) {
        modelSelect.innerHTML = '<option value="">請選擇模型...</option>';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
    }

    // 初始化界面显示
    function initializeInterface(graphName) {
        const ollamaFields = document.querySelector('.ollama-server-field');
        const ollamaServerInput = document.querySelector('#ollama-server');
        const modelSelectContainer = modelSelect.parentElement;
        
        // 重置所有字段
        if (ollamaFields) {
            ollamaFields.style.display = 'none';
        }
        if (ollamaServerInput) {
            ollamaServerInput.removeAttribute('required');
        }
        apiKeyField.style.display = 'none';
        modelSelectContainer.style.display = 'none';
        
        // 根据选择显示相应字段
        if (graphName === 'ollama') {
            if (ollamaFields) {
                ollamaFields.style.display = 'block';
            }
            // 重置 Ollama 相关状态
            ollamaConnectionStatus = false;
            ollamaServerUrl = '';
            
            // 重置模型选择器
            modelSelect.innerHTML = '<option value="" selected disabled>請先測試 Ollama 伺服器連線...</option>';
            modelSelect.classList.remove('is-invalid');  // 移除错误状态
            
            // 清空并隐藏模型选择器
            const modelSelectContainer = modelSelect.parentElement;
            modelSelectContainer.style.display = 'none';
            
            // 清空服务器地址输入框
            const ollamaInput = form.querySelector('input[name="ollama-server"]');
            if (ollamaInput) {
                ollamaInput.value = '';
                ollamaInput.classList.remove('is-invalid');
            }
        } else if (graphName === 'chatgpt' || graphName === 'gemini') {
            apiKeyField.style.display = 'block';
            modelSelectContainer.style.display = 'block';
            updateModelList(graphName);
        }
    }

    // 处理模型类型选择变更
    graphRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            // 清除当前选择的模型类型的缓存
            modelListCache.delete(this.value);
            
            // 清空结果区域
            resultDiv.style.display = 'none';
            resultDiv.innerHTML = '';
            
            // 重置数据
            originalData = [];
            filteredData = [];
            currentPage = 1;
            
            // 重置 Ollama 相关状态
            if (this.value === 'ollama') {
                ollamaConnectionStatus = false;
                ollamaServerUrl = '';
                
                // 重置模型选择器
                modelSelect.innerHTML = '<option value="" selected disabled>請先測試 Ollama 伺服器連線...</option>';
                modelSelect.classList.remove('is-invalid');  // 移除错误状态
                
                // 清空并隐藏模型选择器
                const modelSelectContainer = modelSelect.parentElement;
                modelSelectContainer.style.display = 'none';
                
                // 清空服务器地址输入框
                const ollamaInput = form.querySelector('input[name="ollama-server"]');
                if (ollamaInput) {
                    ollamaInput.value = '';
                    ollamaInput.classList.remove('is-invalid');
                }
            }
            
            // 初始化界面
            initializeInterface(this.value);
        });
    });

    // 页面加载时初始化
    const defaultGraphName = form.querySelector('input[name="graph-name"]:checked').value;
    initializeInterface(defaultGraphName);

    // 測試連線按鈕點擊事件
    const testConnectionBtn = document.getElementById('testConnection');
    testConnectionBtn?.addEventListener('click', async () => {
        const serverUrl = form.querySelector('input[name="ollama-server"]').value.trim();
        if (!serverUrl) {
            showError('請輸入伺服器網址');
            return;
        }

        testConnectionBtn.disabled = true;
        testConnectionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>測試中...';

        try {
            const response = await fetch('/api/test-ollama-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ server_url: serverUrl })
            });

            const result = await response.json();
            
            if (result.success && result.models) {
                console.log('Received models from server:', result.models);
                showSuccess('連線成功！');
                ollamaServerUrl = serverUrl;
                ollamaConnectionStatus = true;  // 设置连接状态
                modelSelectContainer.style.display = 'block';
                
                // 更新模型选择器
                modelSelect.innerHTML = '<option value="">請選擇模型...</option>';
                result.models.forEach(model => {
                    console.log('Adding model to selector:', model);
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    modelSelect.appendChild(option);
                });
            } else {
                ollamaConnectionStatus = false;  // 重置连接状态
                showError(result.error || '連線失敗，請檢查伺服器網址');
                modelSelectContainer.style.display = 'none';
            }
        } catch (error) {
            ollamaConnectionStatus = false;  // 重置连接状态
            showError('連線失敗，請檢查伺服器網址');
            modelSelectContainer.style.display = 'none';
        } finally {
            testConnectionBtn.disabled = false;
            testConnectionBtn.innerHTML = '<i class="fas fa-plug me-2"></i>測試連線';
        }
    });

    // 全局變數，用於追踪 Ollama 伺服器連線狀態
    let ollamaServerTested = false;

    // 測試 Ollama 伺服器連線
    async function testOllamaConnection(serverUrl) {
        try {
            const response = await fetch('/api/test-ollama-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ server_url: serverUrl })
            });
            
            const result = await response.json();
            
            if (result.success) {
                ollamaServerTested = true;  // 先設置狀態
                console.log('連線測試成功，ollamaServerTested =', ollamaServerTested);
                
                Swal.fire({
                    icon: 'success',
                    title: '連線成功',
                    text: 'Ollama 伺服器連線測試成功',
                    timer: 1500,
                    showConfirmButton: false
                });
                
                // 連線成功後更新模型列表
                updateModelList('ollama');
            } else {
                ollamaServerTested = false;
                console.log('連線測試失敗，ollamaServerTested =', ollamaServerTested);
                
                Swal.fire({
                    icon: 'error',
                    title: '連線失敗',
                    text: '無法連接到 Ollama 伺服器，請檢查伺服器網址是否正確'
                });
            }
        } catch (error) {
            ollamaServerTested = false;
            console.log('連線測試錯誤，ollamaServerTested =', ollamaServerTested);
            
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: '連線失敗',
                text: '測試連線時發生錯誤，請稍後再試'
            });
        }
    }

    // Ollama 測試連線按鈕事件處理
    const testOllamaButton = form.querySelector('button[data-action="test-ollama"]');
    if (testOllamaButton) {
        testOllamaButton.addEventListener('click', async function(e) {
            e.preventDefault();
            const serverUrl = form.querySelector('input[name="ollama-server"]').value.trim();
            if (!serverUrl) {
                showError('請輸入 Ollama 伺服器網址');
                return;
            }
            await testOllamaConnection(serverUrl);
        });
    }

    // 修改主要的表单提交处理
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const graphName = form.querySelector('input[name="graph-name"]:checked').value;
        
        // 添加 Ollama 连接状态验证
        if (graphName === 'ollama') {
            const ollamaInput = form.querySelector('input[name="ollama-server"]');
            const serverUrl = ollamaInput?.value.trim();
            
            // 检查是否已填写服务器地址
            if (!serverUrl) {
                await Swal.fire({
                    icon: 'warning',
                    title: '請填寫伺服器網址',
                    text: '請輸入 Ollama 伺服器網址',
                    confirmButtonText: '確定'
                });
                ollamaInput?.focus();
                return;
            }

            // 检查是否已测试连接
            if (!ollamaConnectionStatus) {
                await Swal.fire({
                    icon: 'warning',
                    title: '請先測試連線',
                    text: '使用 Ollama 模型前，請先點擊測試連線按鈕',
                    confirmButtonText: '確定'
                });
                const testConnectionBtn = document.getElementById('testConnection');
                testConnectionBtn?.focus();
                return;
            }

            // 检查连接的服务器地址是否匹配
            if (ollamaServerUrl !== serverUrl) {
                await Swal.fire({
                    icon: 'warning',
                    title: '請重新測試連線',
                    text: '伺服器網址已變更，請重新測試連線',
                    confirmButtonText: '確定'
                });
                return;
            }

            // 检查是否已选择模型
            const currentModelSelect = form.querySelector('select[name="model-name"]');
            if (!currentModelSelect?.value) {
                await Swal.fire({
                    icon: 'warning',
                    title: '請選擇模型',
                    text: '請在測試連線成功後，選擇要使用的模型',
                    confirmButtonText: '確定'
                });
                currentModelSelect?.focus();
                return;
            }
        }

        const url = form.querySelector('input[name="url"]').value.trim();
        const prompt = form.querySelector('textarea[name="prompt"]').value.trim();
        const fileName = form.querySelector('input[name="file-name"]').value.trim();
        const modelSelect = form.querySelector('select[name="model-name"]');
        const modelName = modelSelect ? modelSelect.value : '';
        const ollamaInput = form.querySelector('input[name="ollama-server"]');
        
        // 清除所有錯誤狀態
        form.querySelectorAll('.is-invalid').forEach(el => {
            el.classList.remove('is-invalid');
        });
        
        try {
            // 检查必填字段
            const errorMessages = [];
            
            // 验证 URL
            if (!url) {
                errorMessages.push('請輸入網址');
                form.querySelector('input[name="url"]').classList.add('is-invalid');
            }
            
            // 验证提示词
            if (!prompt) {
                errorMessages.push('請輸入提示詞');
                form.querySelector('textarea[name="prompt"]').classList.add('is-invalid');
            }
            
            // 验证文件名
            if (!fileName) {
                errorMessages.push('請輸入檔案名稱');
                form.querySelector('input[name="file-name"]').classList.add('is-invalid');
            }
            
            // 根据选择的模型类型进行验证
            if (graphName === 'chatgpt' || graphName === 'gemini') {
                const apiKey = form.querySelector('input[name="api-key"]').value.trim();
                if (!apiKey) {
                    errorMessages.push('請輸入 API Key');
                    form.querySelector('input[name="api-key"]').classList.add('is-invalid');
                }
                if (!modelName) {
                    errorMessages.push('請選擇模型');
                    modelSelect.classList.add('is-invalid');
                }
            } else if (graphName === 'ollama') {
                if (!ollamaInput || !ollamaInput.value.trim()) {
                    errorMessages.push('請輸入 Ollama 伺服器網址');
                    ollamaInput.classList.add('is-invalid');
                }
                if (!modelName) {
                    errorMessages.push('請選擇模型');
                    modelSelect.classList.add('is-invalid');
                }
            }
            
            if (errorMessages.length > 0) {
                await Swal.fire({
                    icon: 'warning',
                    title: '請檢查以下欄位',
                    html: errorMessages.join('<br>'),
                    confirmButtonText: '確定',
                    confirmButtonColor: '#3085d6'
                });
                return;
            }

            // 显示处理中的 SweetAlert2
            Swal.fire({
                title: '處理中...',
                html: '正在進行智能爬取，請稍候',
                allowOutsideClick: false,
                allowEscapeKey: false,
                allowEnterKey: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            submitBtn.disabled = true;

            // 发送请求
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    graph_name: graphName,
                    url: url,
                    prompt: prompt,
                    file_name: fileName,
                    model_name: modelName,
                    api_key: graphName === 'chatgpt' || graphName === 'gemini' ? 
                        form.querySelector('input[name="api-key"]').value.trim() : undefined,
                    ollama_server: graphName === 'ollama' ? ollamaInput.value.trim() : undefined
                })
            });

            const result = await response.json();
            
            if (!response.ok) {
                // API 错误处理
                let errorTitle = '錯誤';
                let errorMessage = '發生錯誤，請稍後再試';
                let errorIcon = 'error';
                
                if (result.error) {
                    if (result.error.includes('API key not valid') || 
                        result.error.includes('API_KEY_INVALID')) {
                        errorTitle = 'API Key 錯誤';
                        errorMessage = '您輸入的 API Key 無效，請檢查是否輸入正確';
                        errorIcon = 'warning';
                    } else if (result.error.includes('quota exceeded') || 
                              result.error.includes('rate limit')) {
                        errorTitle = 'API 配額超限';
                        errorMessage = 'API 使用次數已達上限，請稍後再試';
                        errorIcon = 'warning';
                    } else {
                        errorMessage = result.error;
                    }
                }
                
                await Swal.fire({
                    icon: errorIcon,
                    title: errorTitle,
                    text: errorMessage,
                    confirmButtonText: '確定',
                    confirmButtonColor: '#3085d6'
                });
                
                throw new Error(errorMessage);
            }

            // 关闭处理中的 SweetAlert2
            Swal.close();
            
            if (result.success) {
                // 检查是否有实际的资料内容
                const hasData = Array.isArray(result.data) && result.data.length > 0 && 
                              result.data.some(row => Object.values(row).some(value => value));
                
                if (hasData) {
                    // 先显示成功消息
                    await Swal.fire({
                        icon: 'success',
                        title: '爬取成功！',
                        text: '資料已成功爬取完成',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    
                    // 等待消息显示完毕后再更新界面
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    const downloadBtn = displayResults(result.data);
                    downloadBtn.href = `static/downloads/${result.file_name}`;
                    downloadBtn.style.display = 'inline-block';
                    resultDiv.style.display = 'block';
                } else {
                    // 如果查无资料，使用 SweetAlert2 显示提示
                    await Swal.fire({
                        icon: 'info',
                        title: '查無資料',
                        text: '沒有找到符合條件的資料',
                        confirmButtonText: '確定'
                    });
                    resultDiv.style.display = 'none';
                }
            } else {
                showError(result.error || '爬取失敗，請稍後再試');
            }
        } catch (error) {
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: '錯誤',
                text: error.message || '發生錯誤，請稍後再試',
                confirmButtonText: '確定'
            });
        } finally {
            submitBtn.disabled = false;
            Swal.close();
        }
    });

    // 修改验证函数
    function validateInput(input) {
        // 移除现有的验证状态
        input.classList.remove('is-invalid', 'is-valid');
        
        // 如果是文件名输入框
        if (input.name === 'file-name') {
            let fileName = input.value.trim();
            
            // 如果文件名为空，显示错误状态
            if (!fileName) {
                input.classList.add('is-invalid');
                return false;
            }
            
            // 自动添加 .csv 后缀
            if (!fileName.endsWith('.csv')) {
                fileName += '.csv';
                input.value = fileName;
            }
            
            // 检查文件名是否包含非法字符
            if (/[<>:"/\\|?*]/.test(fileName)) {
                input.classList.add('is-invalid');
                return false;
            }
            
            // 验证通过，添加成功状态
            input.classList.add('is-valid');
            return true;
        }

        // 如果是 API Key 输入框
        if (input.name === 'api-key') {
            const graphName = form.querySelector('input[name="graph-name"]:checked').value;
            if ((graphName === 'chatgpt' || graphName === 'gemini') && !input.value.trim()) {
                input.classList.add('is-invalid');
                return false;
            }
        }

        // 如果是 Ollama 服务器地址输入框
        if (input.name === 'ollama-server') {
            const serverUrl = input.value.trim();
            if (!serverUrl) {
                input.classList.add('is-invalid');
                ollamaConnectionStatus = false;
                const modelSelectContainer = modelSelect.parentElement;
                modelSelectContainer.style.display = 'none';
                return false;
            }
        }

        // 其他必填输入框的验证
        if (input.hasAttribute('required') && !input.value.trim()) {
            input.classList.add('is-invalid');
            return false;
        }

        // 验证通过
        input.classList.add('is-valid');
        return true;
    }

    // 添加失焦验证
    function addBlurValidation(input) {
        input.addEventListener('blur', function() {
            validateInput(this);
            this.dataset.hasBlurred = 'true';
        });

        // 添加输入事件监听，在输入时移除错误状态
        input.addEventListener('input', function() {
            if (this.classList.contains('is-invalid')) {
                validateInput(this);
            }
        });
    }

    // 初始化表单验证
    function initFormValidation() {
        // 获取所有需要验证的输入框，包括文件名输入框
        const inputs = form.querySelectorAll('input[required], textarea[required], select[required], input[name="api-key"], input[name="ollama-server"], input[name="file-name"]');
        
        // 为每个输入框添加验证
        inputs.forEach(input => {
            addBlurValidation(input);
        });

        // 监听模型类型切换
        form.querySelectorAll('input[name="graph-name"]').forEach(radio => {
            radio.addEventListener('change', function() {
                // 清除所有验证状态
                form.querySelectorAll('.is-invalid, .is-valid').forEach(el => {
                    el.classList.remove('is-invalid', 'is-valid');
                    const parent = el.closest('.input-group') || el.parentElement;
                    const icon = parent.querySelector('.validation-icon');
                    if (icon) icon.remove();
                });

                // 重新验证已经失焦过的字段
                inputs.forEach(input => {
                    if (input.dataset.hasBlurred) {
                        validateInput(input);
                    }
                });
            });
        });
    }

    // 立即初始化表单验证
    initFormValidation();

    // 初始化按鈕樣式和檔案名稱輸入框
    document.addEventListener('DOMContentLoaded', function() {
        // 美化開始爬取按鈕
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.className = 'btn btn-primary d-block mx-auto';
        submitBtn.style.width = 'fit-content';
        submitBtn.innerHTML = '<i class="fas fa-spider me-2"></i>開始爬取';
        
        // 美化測試連線按鈕
        const testBtn = document.querySelector('button[data-test-connection]');
        if (testBtn) {
            testBtn.className = 'btn btn-outline-info';
            testBtn.style.width = 'fit-content';
            testBtn.innerHTML = '<i class="fas fa-plug me-2"></i>測試連線';
        }
        
        // 設置檔案名稱輸入框
        const fileNameInput = form.querySelector('input[name="file-name"]');
        if (fileNameInput) {
            fileNameInput.value = '';
            fileNameInput.placeholder = '檔案名稱 (選填，預設為 output.csv)';
        }
    });

    // 顯示錯誤訊息
    function showError(message) {
        Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: message
        });
    }

    // 顯示成功訊息
    function showSuccess(message) {
        Swal.fire({
            icon: 'success',
            title: '成功',
            text: message
        });
    }

    // 初始觸發一次 change 事件來設置初始狀態
    document.querySelector('input[name="graph-name"]:checked').dispatchEvent(new Event('change'));

    // 初始化分頁和搜尋相關變數
    let currentPage = 1;
    const rowsPerPageOptions = [5, 10, 20, 50];
    let currentRowsPerPage = 10;
    let originalData = [];
    let filteredData = [];
    
    // 更新分頁控制
    function updatePagination(totalItems) {
        const totalPages = Math.ceil(totalItems / currentRowsPerPage);
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'd-flex justify-content-between align-items-center mt-3';
        
        // 下載 CSV 按鈕 (靠左)
        const downloadBtnContainer = document.createElement('div');
        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'btn btn-success download-btn';
        downloadBtn.style.display = 'none';
        downloadBtn.innerHTML = '<i class="fas fa-download me-2"></i>下載 CSV';
        downloadBtnContainer.appendChild(downloadBtn);
        
        // 分頁控制 (靠右)
        const paginationNav = document.createElement('nav');
        const ul = document.createElement('ul');
        ul.className = 'pagination mb-0';
        
        // 上一頁
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#"><i class="fas fa-chevron-left"></i></a>`;
        prevLi.onclick = () => currentPage > 1 && goToPage(currentPage - 1);
        
        // 頁碼
        ul.appendChild(prevLi);
        for (let i = 1; i <= totalPages; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${currentPage === i ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            li.onclick = () => goToPage(i);
            ul.appendChild(li);
        }
        
        // 下一頁
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#"><i class="fas fa-chevron-right"></i></a>`;
        nextLi.onclick = () => currentPage < totalPages && goToPage(currentPage + 1);
        ul.appendChild(nextLi);
        
        paginationNav.appendChild(ul);
        paginationContainer.appendChild(downloadBtnContainer);
        paginationContainer.appendChild(paginationNav);
        
        const resultDiv = document.getElementById('smart-scrape-result');
        const oldPagination = resultDiv.querySelector('.pagination-container');
        if (oldPagination) {
            oldPagination.remove();
        }
        paginationContainer.className = 'pagination-container ' + paginationContainer.className;
        resultDiv.appendChild(paginationContainer);
        
        return downloadBtn;
    }
    
    // 更新表格控制項
    function updateTableControls() {
        const resultDiv = document.getElementById('smart-scrape-result');
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'd-flex justify-content-between align-items-center mb-3';
        
        // 每頁顯示筆數選擇 (靠左)
        const rowsPerPageSelect = document.createElement('select');
        rowsPerPageSelect.className = 'form-select w-auto';
        rowsPerPageOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.text = `每頁顯示 ${option} 筆`;
            if (option === currentRowsPerPage) {
                optionElement.selected = true;
            }
            rowsPerPageSelect.appendChild(optionElement);
        });
        rowsPerPageSelect.onchange = (e) => {
            currentRowsPerPage = parseInt(e.target.value);
            currentPage = 1;
            displayResults(filteredData);
        };
        
        // 搜尋框 (靠右)
        const searchContainer = document.createElement('div');
        searchContainer.className = 'input-group w-auto';
        searchContainer.innerHTML = `
            <span class="input-group-text"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control" placeholder="搜尋...">
        `;
        const searchInput = searchContainer.querySelector('input');
        searchInput.oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filteredData = originalData.filter(row => 
                Object.values(row).some(value => 
                    String(value).toLowerCase().includes(searchTerm)
                )
            );
            currentPage = 1;
            displayResults(filteredData);
        };
        
        controlsContainer.appendChild(rowsPerPageSelect);
        controlsContainer.appendChild(searchContainer);
        
        const oldControls = resultDiv.querySelector('.table-controls');
        if (oldControls) {
            oldControls.remove();
        }
        controlsContainer.className = 'table-controls ' + controlsContainer.className;
        resultDiv.insertBefore(controlsContainer, resultDiv.firstChild);
    }

    // 顯示結果
    function displayResults(data) {
        // 檢查是否有實際的資料內容
        const hasData = Array.isArray(data) && data.length > 0 && 
                       data.some(row => Object.values(row).some(value => value));
        
        if (!hasData) {
            // 如果查無資料，使用 SweetAlert2 顯示提示
            Swal.fire({
                icon: 'info',
                title: '查無資料',
                text: '沒有找到符合條件的資料',
                confirmButtonText: '確定'
            });
            resultDiv.style.display = 'none';
            return;
        }

        originalData = data;
        filteredData = [...data];
        const resultDiv = document.getElementById('smart-scrape-result');
        
        // 更新表格控制項
        updateTableControls();
        
        // 创建表格结构（如果不存在）
        if (!resultDiv.querySelector('table')) {
            const table = document.createElement('table');
            table.className = 'table table-hover';
            table.innerHTML = '<thead><tr></tr></thead><tbody></tbody>';
            resultDiv.appendChild(table);
        }

        const tableBody = resultDiv.querySelector('tbody');
        const tableHead = resultDiv.querySelector('thead tr');
        
        // 清空現有內容
        tableBody.innerHTML = '';
        tableHead.innerHTML = '';
        
        // 收集所有可能的字段
        const allColumns = new Set();
        data.forEach(item => {
            if (typeof item === 'object') {
                Object.keys(item).forEach(key => allColumns.add(key));
            }
        });
        const columns = Array.from(allColumns);

        // 生成表頭
        columns.forEach(column => {
            const th = document.createElement('th');
            th.textContent = column;
            th.style.padding = '12px';
            th.style.backgroundColor = '#f8f9fa';
            th.style.borderBottom = '2px solid #dee2e6';
            th.style.fontWeight = '600';
            th.style.textAlign = 'left';
            tableHead.appendChild(th);
        });

        // 計算分頁
        const startIndex = (currentPage - 1) * currentRowsPerPage;
        const endIndex = startIndex + currentRowsPerPage;
        const paginatedData = filteredData.slice(startIndex, endIndex);

        // 生成表格內容
        paginatedData.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
            tr.style.transition = 'background-color 0.3s';
            
            tr.addEventListener('mouseover', () => {
                tr.style.backgroundColor = '#e9ecef';
            });
            
            tr.addEventListener('mouseout', () => {
                tr.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
            });

            columns.forEach(column => {
                const td = document.createElement('td');
                td.textContent = row[column] || '';
                td.style.padding = '12px';
                td.style.borderBottom = '1px solid #dee2e6';
                td.style.maxWidth = '300px';
                td.style.overflow = 'hidden';
                td.style.textOverflow = 'ellipsis';
                td.style.whiteSpace = 'nowrap';
                tr.appendChild(td);
            });
            
            tableBody.appendChild(tr);
        });

        // 更新分頁控制
        const downloadBtn = updatePagination(filteredData.length);
        
        // 調整表格樣式
        const table = resultDiv.querySelector('table');
        table.className = 'table table-hover';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginBottom = '1rem';
        table.style.backgroundColor = '#fff';
        table.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        table.style.borderRadius = '4px';

        return downloadBtn;
    }

    // 跳轉到指定頁碼
    function goToPage(page) {
        currentPage = page;
        displayResults(originalData);
    }
});
