document.addEventListener('DOMContentLoaded', function() {
    // 確保 highlight.js 已載入
    if (typeof hljs === 'undefined') {
        console.error('Highlight.js is not loaded');
        return;
    }

    loadRecords();
    
    // 綁定清除按鈕事件
    const clearBtn = document.getElementById('clearRecordsBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            Swal.fire({
                title: '確認清除',
                text: '確定要清除所有腳本生成紀錄嗎？此操作無法復原。',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: '確定清除',
                cancelButtonText: '取消'
            }).then((result) => {
                if (result.isConfirmed) {
                    clearRecords();
                }
            });
        });
    }
});

function loadRecords() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const noRecordsMsg = document.getElementById('noRecordsMsg');
    const recordsTable = document.getElementById('recordsTable');
    const clearBtn = document.getElementById('clearRecordsBtn');

    loadingIndicator.style.display = 'block';
    noRecordsMsg.style.display = 'none';
    recordsTable.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';

    fetch('/api/script-records')
        .then(response => response.json())
        .then(data => {
            loadingIndicator.style.display = 'none';
            
            if (!data.records || data.records.length === 0) {
                noRecordsMsg.style.display = 'block';
                recordsTable.style.display = 'none';
                if (clearBtn) clearBtn.style.display = 'none';
                return;
            }

            noRecordsMsg.style.display = 'none';
            recordsTable.style.display = 'table';
            if (clearBtn) clearBtn.style.display = 'block';

            const tbody = recordsTable.querySelector('tbody');
            tbody.innerHTML = '';

            data.records.forEach(record => {
                const escapedScript = record.script
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="text-nowrap">${formatDate(record.timestamp)}</td>
                    <td>
                        <a href="${record.url}" 
                           class="text-truncate d-inline-block" 
                           style="max-width: 300px;"
                           target="_blank" 
                           title="${record.url}">
                            ${record.url}
                        </a>
                    </td>
                    <td>
                        <span class="text-truncate d-inline-block" 
                              style="max-width: 300px;"
                              title="${record.prompt}">
                            ${record.prompt}
                        </span>
                    </td>
                    <td class="text-center">
                        <span class="badge bg-light text-dark">
                            ${Number(record.duration).toFixed(2)}秒
                        </span>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-primary btn-sm view-script-btn" 
                                data-script="${escapedScript}">
                            <i class="fas fa-code me-1"></i>查看腳本
                        </button>
                    </td>
                `;

                tbody.appendChild(row);
            });

            // 為所有查看腳本按鈕添加事件監聽器
            document.querySelectorAll('.view-script-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    viewScript(this.getAttribute('data-script'));
                });
            });
        })
        .catch(error => {
            console.error('Error:', error);
            loadingIndicator.style.display = 'none';
            Swal.fire({
                icon: 'error',
                title: '錯誤',
                text: '載入記錄時發生錯誤'
            });
        });
}

function viewScript(encodedScript) {
    try {
        const script = decodeHTMLEntities(encodedScript);
        const row = event.target.closest('tr');
        const timestamp = row.cells[0].textContent;
        const url = row.cells[1].querySelector('a').href;
        const prompt = row.cells[2].querySelector('span').textContent;
        const duration = row.cells[3].querySelector('.badge').textContent;

        const modalContent = `
            <div class="script-content">
                <div class="accordion" id="scriptAccordion">
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button" type="button" data-bs-toggle="collapse" 
                                    data-bs-target="#infoCollapse" aria-expanded="true" aria-controls="infoCollapse">
                                基本資訊
                            </button>
                        </h2>
                        <div id="infoCollapse" class="accordion-collapse collapse show" 
                             data-bs-parent="#scriptAccordion">
                            <div class="accordion-body">
                                <div class="info-grid">
                                    <div class="info-item">
                                        <i class="fas fa-clock text-primary"></i>
                                        <div class="info-content">
                                            <label>生成時間</label>
                                            <span>${timestamp}</span>
                                        </div>
                                    </div>
                                    <div class="info-item">
                                        <i class="fas fa-stopwatch text-primary"></i>
                                        <div class="info-content">
                                            <label>執行耗時</label>
                                            <span>${duration}</span>
                                        </div>
                                    </div>
                                    <div class="info-item">
                                        <i class="fas fa-link text-primary"></i>
                                        <div class="info-content">
                                            <label>目標網址</label>
                                            <a href="${url}" target="_blank">${url}</a>
                                        </div>
                                    </div>
                                    <div class="info-item">
                                        <i class="fas fa-comment text-primary"></i>
                                        <div class="info-content">
                                            <label>提示詞</label>
                                            <span>${prompt}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button" type="button" data-bs-toggle="collapse" 
                                    data-bs-target="#codeCollapse" aria-expanded="true" aria-controls="codeCollapse">
                                Python 程式碼
                            </button>
                        </h2>
                        <div id="codeCollapse" class="accordion-collapse collapse show" 
                             data-bs-parent="#scriptAccordion">
                            <div class="position-relative">
                                <pre class="m-0"><code class="language-python">${extractPythonCode(script)}</code></pre>
                                <button class="btn btn-sm btn-primary position-absolute top-0 end-0 m-2 copy-script-btn" 
                                        title="複製程式碼">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        Swal.fire({
            title: '腳本內容',
            html: modalContent,
            width: '80%',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                popup: 'swal-wide',
                content: 'text-start',
                title: 'script-title',
                htmlContainer: 'p-0'
            },
            didOpen: () => {
                // 確保 highlight.js 已載入
                if (typeof hljs !== 'undefined') {
                    document.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                }

                // 綁定複製按鈕事件
                const copyBtn = document.querySelector('.copy-script-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        const code = document.querySelector('pre code').textContent;
                        navigator.clipboard.writeText(code)
                            .then(() => {
                                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                                copyBtn.classList.add('btn-success');
                                copyBtn.classList.remove('btn-primary');
                                setTimeout(() => {
                                    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                                    copyBtn.classList.remove('btn-success');
                                    copyBtn.classList.add('btn-primary');
                                }, 2000);
                            })
                            .catch(err => {
                                console.error('Copy failed:', err);
                                Swal.fire({
                                    icon: 'error',
                                    title: '複製失敗',
                                    text: '無法複製到剪貼簿'
                                });
                            });
                    });
                }
            }
        });
    } catch (error) {
        console.error('Error showing script:', error);
        Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: '載入腳本失敗'
        });
    }
}

function extractPythonCode(script) {
    return script.replace(/```python\n?|\n?```/g, '').trim();
}

function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function formatDate(timestamp) {
    if (!timestamp) return '未提供';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch (e) {
        console.error('Date formatting error:', e);
        return timestamp;
    }
}

function clearRecords() {
    const clearBtn = document.getElementById('clearRecordsBtn');
    if (!clearBtn) return;

    clearBtn.disabled = true;
    const originalContent = clearBtn.innerHTML;
    clearBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>清除中...';

    fetch('/api/script-records', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(response.statusText || '清除記錄失敗');
        }
        return response.json();
    })
    .then(data => {
        loadRecords();
        Swal.fire({
            icon: 'success',
            title: '已清除',
            text: data.message || '所有記錄已成功清除'
        });
    })
    .catch(error => {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: '錯誤',
            text: '清除記錄時發生錯誤：' + error.message
        });
    })
    .finally(() => {
        clearBtn.disabled = false;
        clearBtn.innerHTML = originalContent;
    });
}
