document.addEventListener('DOMContentLoaded', function() {
    const modelTypeInputs = document.querySelectorAll('input[name="graph-name"]');
    const modelSelect = document.querySelector('select[name="model-name"]');
    const apiKeyField = document.querySelector('.api-key-field');
    const ollamaServerSection = document.getElementById('ollamaServerSection');
    const ollamaModelSection = document.getElementById('ollamaModelSection');
    const testOllamaConnection = document.getElementById('testOllamaConnection');
    const ollamaServerUrl = document.getElementById('ollamaServerUrl');
    const ollamaModel = document.getElementById('ollamaModel');
    const scriptForm = document.getElementById('script-gen-form');
    
    // 添加連線狀態標記
    let ollamaConnectionStatus = false;

    // 處理模型類型變更的函數
    function handleModelTypeChange(modelType) {
        if (modelType === 'ollama') {
            apiKeyField.style.display = 'none';
            ollamaServerSection.style.display = 'block';
            modelSelect.parentElement.style.display = 'none';
            ollamaModelSection.style.display = 'none';
            ollamaModel.innerHTML = '<option value="" selected disabled>請選擇模型</option>';
            ollamaConnectionStatus = false;
        } else {
            apiKeyField.style.display = 'block';
            ollamaServerSection.style.display = 'none';
            ollamaModelSection.style.display = 'none';
            modelSelect.parentElement.style.display = 'block';
            updateModelOptions(modelSelect, modelType);
        }
    }

    // 監聽模型類型選擇
    modelTypeInputs.forEach(input => {
        input.addEventListener('change', function() {
            handleModelTypeChange(this.value);
        });
    });

    // 監聽伺服器網址變更
    ollamaServerUrl.addEventListener('input', function() {
        ollamaConnectionStatus = false;
        ollamaModelSection.style.display = 'none';
    });

    // 更新模型選項
    function updateModelOptions(select, modelType) {
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

    // 複製腳本到剪貼板
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy text: ', err);
            return false;
        }
    }

    // 測試 Ollama 伺服器連線
    testOllamaConnection.addEventListener('click', async function() {
        const serverUrl = ollamaServerUrl.value.trim();
        if (!serverUrl) {
            Swal.fire({
                title: '錯誤',
                text: '請輸入 Ollama 伺服器網址',
                icon: 'error'
            });
            return;
        }

        testOllamaConnection.disabled = true;
        testOllamaConnection.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>測試中...';

        try {
            const response = await fetch('/api/test-ollama-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ server_url: serverUrl })
            });

            if (!response.ok) {
                throw new Error('連線失敗');
            }

            const data = await response.json();
            
            if (data.success) {
                ollamaConnectionStatus = true;
                ollamaModelSection.style.display = 'block';
                
                // 更新模型選項
                ollamaModel.innerHTML = '<option value="" selected disabled>請選擇模型</option>';
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    ollamaModel.appendChild(option);
                });

                Swal.fire({
                    title: '成功',
                    text: '成功連線到 Ollama 伺服器',
                    icon: 'success'
                });
            } else {
                throw new Error(data.error || '連線失敗');
            }
        } catch (error) {
            ollamaConnectionStatus = false;
            ollamaModelSection.style.display = 'none';
            console.error('Error:', error);
            Swal.fire({
                title: '錯誤',
                text: `連線失敗: ${error.message}`,
                icon: 'error'
            });
        } finally {
            testOllamaConnection.disabled = false;
            testOllamaConnection.innerHTML = '<i class="fas fa-plug me-1"></i>測試連線';
        }
    });

    // 表單提交處理
    if (scriptForm) {
        scriptForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const modelType = document.querySelector('input[name="graph-name"]:checked').value;
            
            // 如果是 Ollama 模式，需要檢查連線狀態和模型選擇
            if (modelType === 'ollama') {
                if (!ollamaConnectionStatus) {
                    Swal.fire({
                        title: '錯誤',
                        text: '請先測試並確認 Ollama 伺服器連線',
                        icon: 'error'
                    });
                    return;
                }

                const selectedModel = ollamaModel.value;
                if (!selectedModel) {
                    Swal.fire({
                        title: '錯誤',
                        text: '請選擇 Ollama 模型',
                        icon: 'error'
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

    // 初始化頁面
    handleModelTypeChange(document.querySelector('input[name="graph-name"]:checked').value);
});