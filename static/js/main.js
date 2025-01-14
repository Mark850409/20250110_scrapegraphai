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
});
