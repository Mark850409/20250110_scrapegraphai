// 等待 jQuery 和所有相依套件載入完成
$(function() {
    // 確保 jQuery 已正確載入
    if (typeof jQuery === 'undefined') {
        console.error('jQuery is not loaded');
        return;
    }

    let dataTable = null;
    const MAX_RETRIES = 3;
    let retryCount = 0;

    // 先解除所有現有的事件綁定
    $('#script-executor-form').off('submit');

    // 表單提交處理
    $('#script-executor-form').on('submit', function(e) {
        e.preventDefault();
        
        // 獲取輸入值
        const script = $('#script-input').val().trim();
        const csvName = $('#csv-name').val().trim();

        // 輸入驗證
        if (!script) {
            Swal.fire({
                icon: 'error',
                title: '錯誤',
                text: '請輸入 Python 腳本'
            });
            return;
        }

        if (!csvName) {
            Swal.fire({
                icon: 'error',
                title: '錯誤',
                text: '請輸入 CSV 檔案名稱'
            });
            return;
        }

        // 防止重複提交
        $('#submit-button').prop('disabled', true);
        
        // 重置重試計數
        retryCount = 0;
        executeScript(script, csvName);
    });

    function executeScript(script, csvName) {
        // 基本的腳本驗證
        if (!script.includes('articles')) {
            Swal.fire({
                icon: 'error',
                title: '腳本錯誤',
                text: '腳本必須包含 articles 變量來存儲爬取的數據'
            });
            $('#submit-button').prop('disabled', false);
            return;
        }

        // 顯示載入中提示
        const loadingSwal = Swal.fire({
            title: '執行中...',
            html: `
                <div class="text-center">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div>正在執行腳本，請稍候...</div>
                </div>
            `,
            allowOutsideClick: false,
            showConfirmButton: false
        });

        // 發送 AJAX 請求
        $.ajax({
            url: '/api/execute-script',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                script: script,
                csv_name: csvName
            }),
            success: function(data) {
                loadingSwal.close();
                $('#submit-button').prop('disabled', false);

                if (data.success) {
                    // 成功執行腳本
                    createDataTable(data.data, data.columns);
                } else {
                    // 顯示錯誤信息
                    let errorMessage = data.error || '執行腳本時發生未知錯誤';
                    
                    // 美化錯誤信息顯示
                    if (errorMessage.includes('\n')) {
                        errorMessage = errorMessage.split('\n').join('<br>');
                        Swal.fire({
                            icon: 'error',
                            title: '執行失敗',
                            html: errorMessage
                        });
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: '執行失敗',
                            text: errorMessage
                        });
                    }
                }
            },
            error: function(xhr, status, error) {
                loadingSwal.close();
                $('#submit-button').prop('disabled', false);
                
                let errorMessage = '執行腳本時發生錯誤';
                
                // 解析錯誤信息
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMessage = xhr.responseJSON.error;
                } else if (error) {
                    errorMessage += ': ' + error;
                }
                
                // 根據 HTTP 狀態碼提供更具體的錯誤信息
                if (xhr.status === 400) {
                    errorMessage = '請求參數錯誤: ' + errorMessage;
                } else if (xhr.status === 408) {
                    errorMessage = '腳本執行超時，請簡化腳本或減少處理的數據量';
                } else if (xhr.status === 500) {
                    errorMessage = '服務器錯誤: ' + errorMessage;
                }
                
                Swal.fire({
                    icon: 'error',
                    title: '執行失敗',
                    text: errorMessage
                });
            }
        });
    }

    function createDataTable(data, columns) {
        // 如果表格已存在，先銷毀它
        if (dataTable) {
            dataTable.destroy();
            $('#table-container .table-responsive').empty();
        }

        // 顯示表格容器
        $('#table-container').show();

        // 創建表格元素
        const table = $('<table>').addClass('table table-striped')
                                .attr('id', 'result-table')
                                .width('100%');
        $('#table-container .table-responsive').append(table);

        // 初始化 DataTable
        dataTable = $('#result-table').DataTable({
            data: data,
            columns: columns.map(column => ({
                title: column,
                data: column
            })),
            dom: '<"row"<"col-sm-6"l><"col-sm-6 d-flex justify-content-end"B>><"row"<"col-sm-12"tr>><"row"<"col-sm-5"i><"col-sm-7 d-flex justify-content-end"p>>',
            buttons: [
                {
                    extend: 'csv',
                    text: '下載 CSV',
                    className: 'btn btn-primary mb-2',
                    filename: $('#csv-name').val().trim()
                }
            ],
            language: {
                "processing": "處理中...",
                "loadingRecords": "載入中...",
                "lengthMenu": "顯示 _MENU_ 項結果",
                "zeroRecords": "沒有符合的結果",
                "info": "顯示第 _START_ 至 _END_ 項結果，共 _TOTAL_ 項",
                "infoEmpty": "顯示第 0 至 0 項結果，共 0 項",
                "infoFiltered": "(從 _MAX_ 項結果中過濾)",
                "paginate": {
                    "first": "«",
                    "previous": "‹",
                    "next": "›",
                    "last": "»"
                }
            },
            pageLength: 10,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "全部"]],
            order: [[0, 'desc']],
            responsive: true
        });

        Swal.fire({
            icon: 'success',
            title: '執行成功',
            text: '腳本已成功執行並生成資料表'
        });
    }
});
