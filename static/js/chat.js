let isOpen = false;

function toggleChat() {
    const chatContainer = document.getElementById('chatContainer');
    const chatButton = document.querySelector('.chat-button');
    const chatIcon = chatButton.querySelector('i');
    isOpen = !isOpen;
    
    if (isOpen) {
        chatContainer.style.display = 'flex';
        setTimeout(() => {
            chatContainer.style.opacity = '1';
            chatContainer.style.transform = 'translateY(0)';
        }, 10);
        chatIcon.classList.remove('fa-comments');
        chatIcon.classList.add('fa-times');
    } else {
        chatContainer.style.opacity = '0';
        chatContainer.style.transform = 'translateY(20px)';
        setTimeout(() => {
            chatContainer.style.display = 'none';
        }, 300);
        chatIcon.classList.remove('fa-times');
        chatIcon.classList.add('fa-comments');
    }
}

// 在頁面載入時初始化
document.addEventListener('DOMContentLoaded', async function() {
    // 添加歡迎訊息
    addMessage('bot', '您好！我是您的 AI小助手。我可以：\n1. 協助您了解平台功能與操作方式\n2. 提供專業的數據分析建議\n\n請問有什麼我可以幫您的嗎？');
    
    // 初始化快速問題區塊
    await initializeQuickQuestions();
});

// 修改初始化快速問題函數
async function initializeQuickQuestions() {
    const quickQuestionsHeader = document.querySelector('.quick-questions-header');
    const quickQuestionsContent = document.querySelector('.quick-questions-content');
    const chevronIcon = quickQuestionsHeader.querySelector('i');
    
    // 設置初始狀態（展開）
    quickQuestionsContent.style.maxHeight = quickQuestionsContent.scrollHeight + "px";
    chevronIcon.style.transform = 'rotate(180deg)';
    
    quickQuestionsHeader.addEventListener('click', function() {
        const isExpanded = quickQuestionsContent.style.maxHeight !== '0px';
        
        if (isExpanded) {
            quickQuestionsContent.style.maxHeight = '0px';
            chevronIcon.style.transform = 'rotate(0deg)';
        } else {
            quickQuestionsContent.style.maxHeight = quickQuestionsContent.scrollHeight + "px";
            chevronIcon.style.transform = 'rotate(180deg)';
        }
    });

    // 載入初始快速問題
    await updateAIAssistantQuestions();
}

// 修改 updateAIAssistantQuestions 函數
async function updateAIAssistantQuestions() {
    try {
        const response = await fetch('/api/active-quick-questions');
        if (!response.ok) throw new Error('Failed to fetch quick questions');
        
        const questions = await response.json();
        
        // 更新 AI 小助手的快速提問選單
        const quickQuestionsContent = document.querySelector('.quick-questions-content');
        if (!quickQuestionsContent) return;

        // 清空現有選單
        quickQuestionsContent.innerHTML = '';

        // 添加快速提問選項
        questions.forEach(question => {
            const button = document.createElement('button');
            button.className = 'quick-question-btn';
            button.textContent = question.display_text;
            button.onclick = () => sendQuickQuestion(question.display_text);
            quickQuestionsContent.appendChild(button);
        });

        // 更新選單高度
        if (quickQuestionsContent.style.maxHeight !== '0px') {
            quickQuestionsContent.style.maxHeight = quickQuestionsContent.scrollHeight + "px";
        }
    } catch (error) {
        console.error('Error updating AI assistant questions:', error);
    }
}

function addMessage(type, content) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    // 處理換行符
    const formattedContent = content.replace(/\n/g, '<br>');
    messageDiv.innerHTML = formattedContent;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendMessage() {
    const input = document.querySelector('.chat-input');
    const message = input.value.trim();
    
    if (message === '') return;
    
    addMessage('user', message);
    sendToServer(message);
    input.value = '';
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function sendQuickQuestion(question) {
    if (!question) return;
    addMessage('user', question);
    sendToServer(question);
}

// 添加思考中的動畫
function addThinkingMessage() {
    const messagesContainer = document.getElementById('chatMessages');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message bot thinking';
    thinkingDiv.innerHTML = '<div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div>';
    messagesContainer.appendChild(thinkingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return thinkingDiv;
}

// 修改 sendToServer 函數
async function sendToServer(message) {
    const thinkingDiv = addThinkingMessage();
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message })
        });
        
        const data = await response.json();
        
        // 移除思考中的訊息
        thinkingDiv.remove();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        addMessage('bot', data.response);
    } catch (error) {
        // 移除思考中的訊息
        thinkingDiv.remove();
        console.error('Error:', error);
        addMessage('bot', '抱歉，發生錯誤，請稍後再試。');
    }
}

// 添加清除歷史功能
function clearHistory() {
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.innerHTML = '';
    // 重新添加歡迎訊息
    addMessage('bot', '您好！我是您的 AI小助手。我可以：\n1. 協助您了解平台功能與操作方式\n2. 提供專業的數據分析建議\n\n請問有什麼我可以幫您的嗎？');
}
