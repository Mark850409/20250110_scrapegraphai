// 等待 jQuery 和所有相依套件載入完成
$(document).ready(function() {
    // 確保 jQuery 已正確載入
    if (typeof jQuery === 'undefined') {
        console.error('jQuery is not loaded');
        return;
    }

    let dataTable = null;

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

        // 顯示載入中提示
        const loadingSwal = Swal.fire({
            title: '執行中...',
            html: `
                <div class="text-center">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">執行中...</span>
                    </div>
                    <div>正在執行腳本，請稍候</div>
                    <div class="small text-muted mt-2">這可能需要一些時間</div>
                </div>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false
        });

        // 發送 API 請求
        $.ajax({
            url: '/api/execute-script',
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({
                script: script,
                csv_name: csvName
            }),
            timeout: 300000, // 5分鐘超時
            success: function(response) {
                loadingSwal.close();

                if (response.success) {
                    // 如果表格已存在，先銷毀它
                    if (dataTable) {
                        dataTable.destroy();
                        $('#table-container').empty();
                    }

                    // 創建表格元素
                    const table = $('<table>').addClass('table table-striped table-bordered')
                                            .attr('id', 'result-table')
                                            .width('100%');
                    $('#table-container').append(table);

                    // 初始化 DataTable
                    dataTable = $('#result-table').DataTable({
                        data: response.data,
                        columns: response.columns.map(column => ({
                            title: column,
                            data: null,
                            render: function(data, type, row, meta) {
                                const value = row[meta.col];
                                if (value === null || value === undefined) {
                                    return '';
                                }
                                return value;
                            }
                        })),
                        dom: 'Bfrtip',
                        buttons: [
                            {
                                extend: 'csv',
                                text: '下載 CSV',
                                className: 'btn btn-primary',
                                filename: csvName.replace(/\.csv$/, '')
                            }
                        ],
                        language: {
                            url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/zh-HANT.json'
                        },
                        pageLength: 10,
                        responsive: true,
                        scrollX: true,
                        scrollCollapse: true,
                        processing: true
                    });

                    Swal.fire({
                        icon: 'success',
                        title: '成功',
                        text: '腳本執行成功！'
                    });
                } else {
                    let errorMessage = response.message || '執行腳本時發生錯誤';
                    if (errorMessage.includes('ModuleNotFoundError')) {
                        errorMessage = '缺少必要的 Python 套件，請確認已安裝所需套件';
                    }

                    Swal.fire({
                        icon: 'error',
                        title: '錯誤',
                        text: errorMessage
                    });
                }
            },
            error: function(xhr, status, error) {
                console.error('AJAX Error:', {xhr, status, error});
                loadingSwal.close();
                
                let errorMessage = '請求失敗';
                
                if (status === 'timeout') {
                    errorMessage = '請求超時，請檢查腳本是否包含無限循環或耗時過長的操作';
                } else if (xhr.status === 0) {
                    errorMessage = '無法連接到伺服器，請檢查網路連接';
                } else if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                } else if (error) {
                    errorMessage = error;
                }

                Swal.fire({
                    icon: 'error',
                    title: '錯誤',
                    text: errorMessage,
                    footer: '<small class="text-muted">如果問題持續發生，請聯繫系統管理員</small>'
                });
            }
        });
    });
});
