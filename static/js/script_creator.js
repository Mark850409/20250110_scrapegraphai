document.addEventListener('DOMContentLoaded', function() {
    // 获取所有需要的 DOM 元素
    const modelTypeInputs = document.querySelectorAll('input[name="graph-name"]');
    const modelSelect = document.querySelector('select[name="model-name"]');
    const apiKeyField = document.querySelector('.api-key-field');
    const ollamaServerSection = document.getElementById('ollamaServerSection');
    const ollamaModelSection = document.getElementById('ollamaModelSection');
    const ollamaModel = document.getElementById('ollamaModel');
    const scriptForm = document.getElementById('script-gen-form');
    const testOllamaBtn = document.getElementById('testOllamaConnection');
    const ollamaServerInput = document.getElementById('ollamaServerUrl');
    const apiKeyInput = document.querySelector('input[name="api-key"]');
    
    // 添加連線狀態標記
    let ollamaConnectionStatus = false;

    // 初始化界面
    function init() {
        const initialModel = document.querySelector('input[name="graph-name"]:checked')?.value;
        if (initialModel === 'chatgpt' || initialModel === 'gemini') {
            apiKeyInput?.setAttribute('required', '');
        }
        handleModelTypeChange(initialModel);
    }

    // 监听模型类型选择变更
    if (modelTypeInputs) {
        modelTypeInputs.forEach(input => {
            input.addEventListener('change', function() {
                if (this.value === 'chatgpt' || this.value === 'gemini') {
                    apiKeyInput?.setAttribute('required', '');
                } else {
                    apiKeyInput?.removeAttribute('required');
                }
                handleModelTypeChange(this.value);
            });
        });
    }

    // 處理模型類型變更的函數
    function handleModelTypeChange(modelType) {
        if (!modelType) return;  // 添加空值检查
        
        if (modelType === 'ollama') {
            apiKeyField.style.display = 'none';
            ollamaServerSection.style.display = 'block';
            modelSelect.parentElement.style.display = 'none';
            ollamaModelSection.style.display = 'none';
            if (ollamaModel) {
                ollamaModel.innerHTML = '<option value="" selected disabled>請選擇模型</option>';
            }
            ollamaConnectionStatus = false;
        } else {
            apiKeyField.style.display = 'block';
            ollamaServerSection.style.display = 'none';
            ollamaModelSection.style.display = 'none';
            modelSelect.parentElement.style.display = 'block';
            updateModelOptions(modelSelect, modelType);
        }
    }

    // 更新模型選項
    function updateModelOptions(select, modelType) {
        if (!select) return;  // 添加空值检查
        
        select.innerHTML = '';
        switch(modelType) {
            case 'chatgpt':
                const chatgptOptions = ['gpt-4', 'gpt-3.5-turbo'];
                chatgptOptions.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option;
                    opt.textContent = option;
                    select.appendChild(opt);
                });
                break;
            case 'gemini':
                const opt = document.createElement('option');
                opt.value = 'gemini-pro';
                opt.textContent = 'gemini-pro';
                select.appendChild(opt);
                break;
        }
    }

    // 測試連線按鈕點擊事件
    if (testOllamaBtn && ollamaModel) {  // 确保两个元素都存在
        testOllamaBtn.addEventListener('click', async function() {
            const serverUrl = ollamaServerInput?.value.trim() || '';
            
            if (!serverUrl) {
                Swal.fire({
                    icon: 'error',
                    title: '錯誤',
                    text: '請輸入伺服器網址'
                });
                return;
            }

            this.disabled = true;
            const originalContent = this.innerHTML;
            this.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>測試中...';

            try {
                const response = await fetch('/api/test-ollama-connection', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        server_url: serverUrl
                    })
                });

                const result = await response.json();

                if (result.success && result.models) {
                    console.log('Received models from server:', result.models);
                    ollamaConnectionStatus = true;
                    ollamaModelSection.style.display = 'block';
                    
                    ollamaModel.innerHTML = '<option value="" selected disabled>請選擇模型</option>';
                    result.models.forEach(model => {
                        console.log('Adding model to selector:', model);
                        const option = document.createElement('option');
                        option.value = model;
                        option.textContent = model;
                        ollamaModel.appendChild(option);
                    });

                    Swal.fire({
                        icon: 'success',
                        title: '成功',
                        text: '連線成功！'
                    });
                } else {
                    throw new Error(result.error || '連線失敗');
                }
            } catch (error) {
                ollamaConnectionStatus = false;
                ollamaModelSection.style.display = 'none';
                
                Swal.fire({
                    icon: 'error',
                    title: '錯誤',
                    text: error.message || '連線失敗，請檢查伺服器網址'
                });
            } finally {
                this.disabled = false;
                this.innerHTML = originalContent;
            }
        });
    }

    // 添加表单验证函数
    function validateForm(showAlert = true) {
        const modelType = document.querySelector('input[name="graph-name"]:checked').value;
        const url = document.querySelector('input[name="url"]').value.trim();
        const prompt = document.querySelector('textarea[name="prompt"]').value.trim();
        const apiKey = document.querySelector('input[name="api-key"]').value.trim();
        const ollamaUrl = document.getElementById('ollamaServerUrl')?.value.trim();
        
        let isValid = true;

        // 验证 URL
        if (!url) {
            document.querySelector('input[name="url"]').classList.add('is-invalid');
            isValid = false;
        } else {
            document.querySelector('input[name="url"]').classList.remove('is-invalid');
            document.querySelector('input[name="url"]').classList.add('is-valid');
        }

        // 验证提示词
        if (!prompt) {
            document.querySelector('textarea[name="prompt"]').classList.add('is-invalid');
            isValid = false;
        } else {
            document.querySelector('textarea[name="prompt"]').classList.remove('is-invalid');
            document.querySelector('textarea[name="prompt"]').classList.add('is-valid');
        }

        // 根据模型类型验证
        if (modelType === 'chatgpt' || modelType === 'gemini') {
            if (!apiKey) {
                document.querySelector('input[name="api-key"]').classList.add('is-invalid');
                isValid = false;
            } else {
                document.querySelector('input[name="api-key"]').classList.remove('is-invalid');
                document.querySelector('input[name="api-key"]').classList.add('is-valid');
            }
        } else if (modelType === 'ollama') {
            if (!ollamaUrl) {
                document.getElementById('ollamaServerUrl').classList.add('is-invalid');
                isValid = false;
            } else {
                document.getElementById('ollamaServerUrl').classList.remove('is-invalid');
                document.getElementById('ollamaServerUrl').classList.add('is-valid');
            }
        }

        return isValid;
    }

    // 添加单字段验证函数
    function validateSingleField(element) {
        const value = element.value.trim();
        const modelType = document.querySelector('input[name="graph-name"]:checked').value;
        const fieldName = element.name || element.id;

        // 根据字段类型和模型类型判断是否需要验证
        const shouldValidate = 
            fieldName === 'url' || 
            fieldName === 'prompt' || 
            (fieldName === 'api-key' && (modelType === 'chatgpt' || modelType === 'gemini')) ||
            (fieldName === 'ollamaServerUrl' && modelType === 'ollama');

        // 移除之前的验证状态
        element.classList.remove('is-invalid', 'is-valid');

        // 如果需要验证的字段
        if (shouldValidate) {
            if (!value) {
                element.classList.add('is-invalid');
                return false;
            } else {
                // 只有在有值的情况下才添加 valid 类
                element.classList.add('is-valid');
                return true;
            }
        }
        return true;
    }

    // 添加失焦验证监听器
    document.querySelector('input[name="url"]')?.addEventListener('blur', function() {
        validateSingleField(this);
    });

    document.querySelector('textarea[name="prompt"]')?.addEventListener('blur', function() {
        validateSingleField(this);
    });

    document.querySelector('input[name="api-key"]')?.addEventListener('blur', function() {
        validateSingleField(this);
    });

    document.getElementById('ollamaServerUrl')?.addEventListener('blur', function() {
        validateSingleField(this);
    });

    // 修改表单提交处理
    if (scriptForm) {
        scriptForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // 验证表单
            if (!validateForm(true)) {
                return;
            }

            const modelType = document.querySelector('input[name="graph-name"]:checked').value;
            
            // 添加 Ollama 连接状态验证
            if (modelType === 'ollama') {
                const serverUrl = document.getElementById('ollamaServerUrl')?.value.trim();
                if (!ollamaConnectionStatus || !serverUrl) {
                    Swal.fire({
                        title: '請先測試連線',
                        text: '使用 Ollama 模型前，請先測試並確認伺服器連線狀態',
                        icon: 'warning',
                        confirmButtonText: '確定'
                    });
                    return;
                }
            }

            try {
                const url = document.querySelector('input[name="url"]').value.trim();
                const prompt = document.querySelector('textarea[name="prompt"]').value.trim();
                let formData = {};

                // 通用欄位驗證
                if (!url) {
                    throw new Error('請輸入目標網址');
                }
                if (!prompt) {
                    throw new Error('請輸入提示詞');
                }

                // 根據不同模型類型進行驗證
                if (modelType === 'ollama') {
                    const serverUrl = ollamaServerUrl.value.trim();
                    if (!serverUrl) {
                        throw new Error('請輸入 Ollama 伺服器網址');
                    }
                    const selectedModel = ollamaModel.value;
                    if (!selectedModel) {
                        throw new Error('請選擇 Ollama 模型');
                    }

                    formData = {
                        model_type: modelType,
                        server_url: serverUrl,
                        model: selectedModel,
                        url: url,
                        prompt: prompt
                    };
                } else {
                    // ChatGPT 或 Gemini
                    const apiKey = document.querySelector('input[name="api-key"]').value.trim();
                    if (!apiKey) {
                        throw new Error('請輸入 API Key');
                    }
                    const selectedModel = document.querySelector('select[name="model-name"]').value;
                    if (!selectedModel) {
                        throw new Error('請選擇模型');
                    }

                    formData = {
                        model_type: modelType,
                        model: selectedModel,
                        api_key: apiKey,
                        url: url,
                        prompt: prompt
                    };
                }

                // 記錄開始時間
                const startTime = performance.now();

                // 顯示載入中提示
                const loadingAlert = Swal.fire({
                    title: '處理中...',
                    text: '正在生成腳本',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                // 發送請求
                const response = await fetch('/api/generate-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                const data = await response.json();
                loadingAlert.close();

                if (!data.success) {
                    throw new Error(data.message || '生成腳本失敗');
                }

                // 計算實際執行時間
                const endTime = performance.now();
                const duration = ((endTime - startTime) / 1000).toFixed(2);

                // 在模態框中顯示結果
                Swal.fire({
                    title: '生成的腳本',
                    html: `
                        <div class="mb-3">
                            <strong>執行時間：</strong> ${duration} 秒
                        </div>
                        <div class="position-relative">
                            <pre><code>${data.script.replace(/```python\n|\n```/g, '')}</code></pre>
                        </div>
                        <div class="script-actions mt-3">
                            <button class="btn btn-secondary copy-btn" onclick="copyScript()">
                                <i class="fas fa-copy"></i> 複製腳本
                            </button>
                            <a href="/script-records" class="btn btn-success">
                                <i class="fas fa-list"></i> 查看腳本生成紀錄
                            </a>
                        </div>
                    `,
                    width: '80%',
                    showConfirmButton: false,
                    showCloseButton: true,
                    customClass: {
                        container: 'script-result-modal'
                    },
                    didOpen: () => {
                        // 初始化 highlight.js
                        document.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                        });

                        // 添加複製功能
                        window.copyScript = async () => {
                            // 移除 markdown 語法後再複製
                            const cleanScript = data.script.replace(/```python\n|\n```/g, '');
                            const success = await copyToClipboard(cleanScript);
                            if (success) {
                                Swal.fire({
                                    title: '複製成功',
                                    text: '腳本已複製到剪貼板',
                                    icon: 'success',
                                    timer: 1500,
                                    showConfirmButton: false
                                });
                            } else {
                                Swal.fire({
                                    title: '複製失敗',
                                    text: '請手動複製腳本',
                                    icon: 'error'
                                });
                            }
                        };
                    }
                });

            } catch (error) {
                console.error('Error:', error);
                Swal.fire({
                    title: '錯誤',
                    text: error.message,
                    icon: 'error'
                });
            }
        });
    }

    // 添加 copyToClipboard 函数
    async function copyToClipboard(text) {
        try {
            // 尝试使用现代 Clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
            
            // 回退方案：使用传统方法
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                textArea.remove();
                return true;
            } catch (error) {
                console.error('Copy failed:', error);
                textArea.remove();
                return false;
            }
        } catch (error) {
            console.error('Copy failed:', error);
            return false;
        }
    }

    // 复制按钮点击事件
    document.getElementById('copyScript')?.addEventListener('click', async function() {
        const scriptContent = document.getElementById('scriptContent')?.textContent;
        if (!scriptContent) {
            Swal.fire({
                icon: 'error',
                title: '錯誤',
                text: '沒有可複製的腳本內容'
            });
            return;
        }

        const success = await copyToClipboard(scriptContent);
        
        if (success) {
            Swal.fire({
                icon: 'success',
                title: '成功',
                text: '腳本已複製到剪貼簿',
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: '錯誤',
                text: '複製失敗，請手動複製'
            });
        }
    });

    // 初始化
    init();
});