document.addEventListener('DOMContentLoaded', function() {
    // Load script records
    loadScriptRecords();

    // Handle clear records button
    document.getElementById('clearRecords').addEventListener('click', function() {
        Swal.fire({
            title: '確定要清除所有紀錄嗎？',
            text: "此操作無法復原！",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '是的，清除！',
            cancelButtonText: '取消'
        }).then((result) => {
            if (result.isConfirmed) {
                clearRecords();
            }
        });
    });
});

async function loadScriptRecords() {
    try {
        const response = await fetch('/api/script-records');
        const records = await response.json();
        
        const container = document.getElementById('records-container');
        if (records.length === 0) {
            container.innerHTML = '<div class="alert alert-info">目前沒有腳本生成紀錄</div>';
            return;
        }

        container.innerHTML = records.map(record => `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="card-title">生成時間: ${formatDateTime(record.timestamp)}</h5>
                            <p class="card-text">生成秒數: ${record.duration.toFixed(2)}秒</p>
                            <p class="card-text">網址: ${record.url}</p>
                            <p class="card-text">提示詞: ${record.prompt}</p>
                        </div>
                        <button class="btn btn-primary view-script-btn" 
                                data-script="${encodeURIComponent(record.script)}"
                                data-bs-toggle="modal" 
                                data-bs-target="#scriptModal">
                            查看程式碼
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // Add event listeners to view buttons
        document.querySelectorAll('.view-script-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                try {
                    const script = decodeURIComponent(this.dataset.script);
                    document.querySelector('.script-content').textContent = script;
                } catch (error) {
                    console.error('Error decoding script:', error);
                }
            });
        });

        // Add copy functionality to modal
        document.querySelector('.copy-btn').addEventListener('click', function() {
            const scriptContent = document.querySelector('.script-content').textContent;
            navigator.clipboard.writeText(scriptContent).then(() => {
                this.innerHTML = '<i class="fas fa-check me-1"></i>已複製';
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-copy me-1"></i>複製程式碼';
                }, 2000);
            });
        });

    } catch (error) {
        console.error('Error loading script records:', error);
        Swal.fire({
            icon: 'error',
            title: '載入失敗',
            text: '無法載入腳本記錄，請稍後再試'
        });
    }
}

async function clearRecords() {
    try {
        const response = await fetch('/api/script-records/clear', {
            method: 'POST'
        });
        const result = await response.json();

        if (result.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: '清除成功',
                text: '所有腳本生成紀錄已被清除',
                timer: 1500,
                showConfirmButton: false
            });
            loadScriptRecords(); // Reload the empty records
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error clearing records:', error);
        Swal.fire({
            icon: 'error',
            title: '清除失敗',
            text: '無法清除腳本記錄，請稍後再試'
        });
    }
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}
