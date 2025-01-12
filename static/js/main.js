document.addEventListener('DOMContentLoaded', function() {
    // 複製按鈕功能
    document.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', async function() {
            const codeElement = this.closest('.card-body').querySelector('code');
            try {
                await navigator.clipboard.writeText(codeElement.textContent);
                Swal.fire({
                    icon: 'success',
                    title: '複製成功',
                    text: '腳本已複製到剪貼簿',
                    timer: 1500,
                    showConfirmButton: false
                });
            } catch (err) {
                // 如果 navigator.clipboard 不可用，使用傳統方法
                const textArea = document.createElement('textarea');
                textArea.value = codeElement.textContent;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    Swal.fire({
                        icon: 'success',
                        title: '複製成功',
                        text: '腳本已複製到剪貼簿',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } catch (err) {
                    Swal.fire({
                        icon: 'error',
                        title: '複製失敗',
                        text: '請手動複製腳本',
                    });
                }
                document.body.removeChild(textArea);
            }
        });
    });

    // 模型選擇功能
    const modelSelects = document.querySelectorAll('select[name="model-name"]');
    const apiKeyFields = document.querySelectorAll('.api-key-field');
    const radioButtons = document.querySelectorAll('input[name="graph-name"]');

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
                select.closest('form').querySelector('.api-key-field').style.display = 'block';
                break;
            case 'gemini':
                const opt = document.createElement('option');
                opt.value = 'gemini-pro';
                opt.textContent = 'gemini-pro';
                select.appendChild(opt);
                select.closest('form').querySelector('.api-key-field').style.display = 'block';
                break;
            case 'ollama':
                // 動態獲取 Ollama 模型列表
                fetch('/api/ollama-models')
                    .then(response => response.json())
                    .then(data => {
                        data.models.forEach(model => {
                            const opt = document.createElement('option');
                            opt.value = model;
                            opt.textContent = model;
                            select.appendChild(opt);
                        });
                    })
                    .catch(error => {
                        console.error('Error fetching Ollama models:', error);
                        // 如果獲取失敗，使用默認模型
                        const defaultModels = ['mistral:7b', 'llama3.1:8b'];
                        defaultModels.forEach(model => {
                            const opt = document.createElement('option');
                            opt.value = model;
                            opt.textContent = model;
                            select.appendChild(opt);
                        });
                    });
                select.closest('form').querySelector('.api-key-field').style.display = 'none';
                break;
        }
    }

    radioButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            const form = this.closest('form');
            const select = form.querySelector('select[name="model-name"]');
            updateModelOptions(select, this.value);
        });
    });

    // 初始化模型選項
    modelSelects.forEach(select => {
        const form = select.closest('form');
        const checkedRadio = form.querySelector('input[name="graph-name"]:checked');
        if (checkedRadio) {
            updateModelOptions(select, checkedRadio.value);
        }
    });

    // 功能切換
    const functionLinks = document.querySelectorAll('[data-function]');
    const functionCards = document.querySelectorAll('.function-card');

    functionLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetFunction = this.dataset.function;
            
            functionCards.forEach(card => {
                if (card.id === targetFunction + '-card') {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // 顯示第一個功能卡片
    if (functionCards.length > 0) {
        functionCards[0].style.display = 'block';
    }

    // 腳本生成表單提交
    const scriptGenForm = document.getElementById('script-gen-form');
    if (scriptGenForm) {
        scriptGenForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // 顯示腳本生成中的 loading 對話框
            const loadingSwal = Swal.fire({
                title: '腳本生成中...',
                html: '請稍候，正在為您生成爬蟲腳本',
                allowOutsideClick: false,
                allowEscapeKey: false,
                allowEnterKey: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const formData = new FormData(this);
            const data = {
                graph_name: formData.get('graph-name'),
                model_name: formData.get('model-name'),
                url: formData.get('url'),
                prompt: formData.get('prompt'),
                api_key: formData.get('api-key')
            };

            try {
                const response = await fetch('/api/generate-script', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();
                
                // 關閉 loading 對話框
                loadingSwal.close();

                if (result.error) {
                    Swal.fire({
                        icon: 'error',
                        title: '生成失敗',
                        text: result.error
                    });
                    return;
                }

                // 顯示生成的腳本
                const modalHtml = `
                    <div class="modal fade" id="scriptModal" tabindex="-1" aria-labelledby="scriptModalLabel" aria-hidden="true">
                        <div class="modal-dialog modal-lg">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title" id="scriptModalLabel">生成的爬蟲腳本</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>
                                <div class="modal-body">
                                    <div class="alert alert-info">
                                        <strong>執行時間：</strong> ${result.duration} 秒
                                    </div>
                                    <div class="position-relative">
                                        <pre class="bg-light p-3 rounded"><code class="python">${result.script}</code></pre>
                                        <button class="btn btn-sm btn-primary position-absolute top-0 end-0 m-2 copy-script-btn">
                                            <i class="fas fa-copy"></i> 複製
                                        </button>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">關閉</button>
                                    <button type="button" class="btn btn-primary execute-script-btn">執行腳本</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                // 移除舊的 modal（如果存在）
                const oldModal = document.getElementById('scriptModal');
                if (oldModal) {
                    oldModal.remove();
                }

                // 添加新的 modal 到 body
                document.body.insertAdjacentHTML('beforeend', modalHtml);

                // 獲取 modal 元素
                const modalElement = document.getElementById('scriptModal');
                const scriptModal = new bootstrap.Modal(modalElement);

                // 添加複製按鈕功能
                modalElement.querySelector('.copy-script-btn').addEventListener('click', async function() {
                    const code = modalElement.querySelector('code').textContent;
                    try {
                        await navigator.clipboard.writeText(code);
                        Swal.fire({
                            icon: 'success',
                            title: '複製成功',
                            text: '腳本已複製到剪貼簿',
                            timer: 1500,
                            showConfirmButton: false
                        });
                    } catch (err) {
                        Swal.fire({
                            icon: 'error',
                            title: '複製失敗',
                            text: '請手動複製腳本'
                        });
                    }
                });

                // 添加執行腳本按鈕功能
                modalElement.querySelector('.execute-script-btn').addEventListener('click', function() {
                    // 關閉當前 modal
                    scriptModal.hide();
                    // 切換到執行腳本頁面
                    document.querySelector('[data-function="execute-script"]').click();
                    // 將腳本填入執行表單
                    const executeForm = document.getElementById('execute-script-form');
                    if (executeForm) {
                        executeForm.querySelector('textarea[name="script"]').value = result.script;
                    }
                });

                // 顯示 modal
                scriptModal.show();

            } catch (error) {
                loadingSwal.close();
                Swal.fire({
                    icon: 'error',
                    title: '發生錯誤',
                    text: '請稍後再試'
                });
                console.error('Error:', error);
            }
        });
    }
});
