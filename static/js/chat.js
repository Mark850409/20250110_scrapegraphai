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
            updateScrollButtons();
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
    let isExpanded = true;  // 追蹤展開/折疊狀態
    
    // 設置初始狀態（展開）
    quickQuestionsContent.style.maxHeight = '200px';
    chevronIcon.style.transform = 'rotate(180deg)';
    
    // 添加折疊/展開功能
    quickQuestionsHeader.addEventListener('click', () => {
        isExpanded = !isExpanded;
        const wrapper = document.querySelector('.quick-questions-wrapper');
        const scrollButtons = wrapper.querySelectorAll('.scroll-button');
        
        if (isExpanded) {
            quickQuestionsContent.style.maxHeight = '50px';
            quickQuestionsContent.classList.remove('collapsed');
            wrapper.classList.remove('collapsed');
            chevronIcon.style.transform = 'rotate(180deg)';
            // 展開時檢查是否需要顯示滾動按鈕
            updateScrollButtons();
        } else {
            quickQuestionsContent.style.maxHeight = '0';
            quickQuestionsContent.classList.add('collapsed');
            wrapper.classList.add('collapsed');
            chevronIcon.style.transform = 'rotate(0deg)';
            // 摺疊時隱藏滾動按鈕
            scrollButtons.forEach(button => {
                button.style.display = 'none';
            });
        }
    });

    // 創建包裝容器
    const wrapper = document.createElement('div');
    wrapper.className = 'quick-questions-wrapper';
    quickQuestionsContent.parentNode.insertBefore(wrapper, quickQuestionsContent);
    wrapper.appendChild(quickQuestionsContent);
    
    // 創建左右滾動按鈕
    const scrollLeftBtn = document.createElement('button');
    scrollLeftBtn.className = 'scroll-button scroll-left';
    scrollLeftBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    
    const scrollRightBtn = document.createElement('button');
    scrollRightBtn.className = 'scroll-button scroll-right';
    scrollRightBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    
    wrapper.insertBefore(scrollLeftBtn, quickQuestionsContent);
    wrapper.appendChild(scrollRightBtn);
    
    // 更新滾動按鈕狀態的函數
    function updateScrollButtons() {
        if (!isExpanded) {
            return; // 如果是摺疊狀態，直接返回
        }
        
        const isAtStart = quickQuestionsContent.scrollLeft <= 0;
        const isAtEnd = quickQuestionsContent.scrollLeft + quickQuestionsContent.clientWidth >= quickQuestionsContent.scrollWidth;
        const needsScroll = quickQuestionsContent.scrollWidth > quickQuestionsContent.clientWidth;
        
        scrollLeftBtn.style.display = needsScroll ? 'flex' : 'none';
        scrollRightBtn.style.display = needsScroll ? 'flex' : 'none';
        scrollLeftBtn.classList.toggle('disabled', isAtStart);
        scrollRightBtn.classList.toggle('disabled', isAtEnd);
    }
    
    // 添加滾動按鈕事件監聽
    scrollLeftBtn.addEventListener('click', () => {
        quickQuestionsContent.scrollBy({ left: -200, behavior: 'smooth' });
    });
    
    scrollRightBtn.addEventListener('click', () => {
        quickQuestionsContent.scrollBy({ left: 200, behavior: 'smooth' });
    });
    
    // 監聽滾動事件
    quickQuestionsContent.addEventListener('scroll', updateScrollButtons);
    
    // 監聽視窗大小變化
    window.addEventListener('resize', updateScrollButtons);
    
    // 載入初始快速問題
    await updateAIAssistantQuestions();
    
    // 初始化按鈕狀態
    updateScrollButtons();
    
    // 將 updateScrollButtons 函數添加到全局範圍
    window.updateScrollButtons = updateScrollButtons;
}

// 定義問題對應的實際文字
const QUESTION_MAPPINGS = {
    '常見問題': '如何串接LLM?',
    '爬蟲問題': '如何使用AI爬蟲?',
    '提示詞問題': '如何撰寫好的提示詞?'
};

// 修改 updateAIAssistantQuestions 函數
async function updateAIAssistantQuestions() {
    try {
        const response = await fetch('/api/active-quick-questions');
        if (!response.ok) throw new Error('Failed to fetch quick questions');
        
        const questions = await response.json();
        const quickQuestionsContent = document.querySelector('.quick-questions-content');
        if (!quickQuestionsContent) return;

        // 清空現有選單
        quickQuestionsContent.innerHTML = '';

        // 添加快速提問選項
        questions.forEach(question => {
            const button = document.createElement('button');
            button.className = 'quick-question-btn';
            button.textContent = question.display_text;
            // 修改點擊事件處理
            button.onclick = () => {
                const mappedText = QUESTION_MAPPINGS[question.display_text] || question.display_text;
                const input = document.querySelector('.chat-input');
                if (input) {
                    input.value = mappedText;
                    input.focus();
                }
            };
            quickQuestionsContent.appendChild(button);
        });

        // 確保在內容更新後更新滾動按鈕狀態
        if (window.updateScrollButtons) {
            setTimeout(window.updateScrollButtons, 100);
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

// 修改添加思考中訊息的函數
function addThinkingMessage() {
    const messagesContainer = document.getElementById('chatMessages');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message thinking';
    
    // 添加 AI 頭像
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = '<i class="fas fa-robot"></i>';
    
    // 添加動畫點點
    const dots = document.createElement('div');
    dots.className = 'thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    
    thinkingDiv.appendChild(avatar);
    thinkingDiv.appendChild(dots);
    
    messagesContainer.appendChild(thinkingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return thinkingDiv;
}

// 修改获取提示词的函数
async function getSystemPrompt() {
    try {
        // 添加时间戳或随机数以避免缓存
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/prompts/system?t=${timestamp}`);
        if (!response.ok) {
            throw new Error('Failed to fetch system prompt');
        }
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to get system prompt');
        }
        
        // 打印获取到的提示词，方便调试
        console.log('Current system prompt:', data.content);
        
        return data.content || '';
    } catch (error) {
        console.error('Error fetching system prompt:', error);
        return ''; // 返回空字符串作为默认值
    }
}

// 添加刷新提示词的函数
async function refreshSystemPrompt() {
    try {
        const systemPrompt = await getSystemPrompt();
        console.log('System prompt refreshed:', systemPrompt);
        return systemPrompt;
    } catch (error) {
        console.error('Error refreshing system prompt:', error);
        return '';
    }
}

// 添加获取配置的函数
async function getConfig() {
    try {
        const response = await fetch('/api/config/chat');
        if (!response.ok) {
            throw new Error('Failed to fetch config');
        }
        const config = await response.json();
        return config;
    } catch (error) {
        console.error('Error fetching config:', error);
        throw error;
    }
}

// 修改 sendToServer 函数
async function sendToServer(message) {
    const thinkingDiv = addThinkingMessage();
    try {
        const [config, systemPrompt] = await Promise.all([
            getConfig(),
            refreshSystemPrompt()
        ]);
        
        const requestBody = {
            input_value: message,  // 只在頂層設置 input_value
            output_type: "chat",
            input_type: "chat",
            tweaks: {
                "ChatInput-lg44S": {
                    "background_color": "",
                    "chat_icon": "",
                    "files": "",
                    // 移除 input_value
                    "sender": "User",
                    "sender_name": "User",
                    "session_id": "",
                    "should_store_message": true,
                    "text_color": ""
                },
                "Prompt-EF0ZF": {
                    "context": message,
                    "question": message,
                    "template": "{context}\n\n---\n\nGiven the context above, answer the question as best as possible.\n\nQuestion: {question}\n\nAnswer: "
                },
                "OpenAIModel-7rz2d": {
                    "api_key": config.OPENAI_API_KEY,
                    "model_name": "gpt-4o-mini",
                    "system_message": systemPrompt,
                    "temperature": 0.5
                },
                "Chroma-B2dAI": {
                    "collection_name": "myai",
                    "number_of_results": 10,
                    "persist_directory": "ai_0119_4",
                    "search_query": message,
                    "search_type": "Similarity"
                },
                "ParseData-vPZnv": {
                    "sep": "\n",
                    "template": "{text}"
                },
                "SplitText-nwhoY": {
                    "chunk_overlap": 200,
                    "chunk_size": 1000,
                    "separator": "\n"
                },
                "ChatOutput-J5E4r": {
                    "background_color": "",
                    "chat_icon": "",
                    "data_template": "{text}",
                    "input_value": "",
                    "sender": "Machine",
                    "sender_name": "AI",
                    "session_id": "",
                    "should_store_message": true,
                    "text_color": ""
                },
                "OpenAIEmbeddings-fk8d2": {
                    "chunk_size": 1000,
                    "client": "",
                    "default_headers": {},
                    "default_query": {},
                    "deployment": "",
                    "dimensions": null,
                    "embedding_ctx_length": 1536,
                    "max_retries": 3,
                    "model": "text-embedding-3-small",
                    "model_kwargs": {},
                    "openai_api_base": "",
                    "openai_api_key": config.OPENAI_API_KEY,
                    "openai_api_type": "",
                    "openai_api_version": "",
                    "openai_organization": "",
                    "openai_proxy": "",
                    "request_timeout": null,
                    "show_progress_bar": false,
                    "skip_empty": false,
                    "tiktoken_enable": true,
                    "tiktoken_model_name": ""
                },
                "OpenAIEmbeddings-qricR": {
                    "chunk_size": 1000,
                    "client": "",
                    "default_headers": {},
                    "default_query": {},
                    "deployment": "",
                    "dimensions": null,
                    "embedding_ctx_length": 1536,
                    "max_retries": 3,
                    "model": "text-embedding-3-small",
                    "model_kwargs": {},
                    "openai_api_base": "",
                    "openai_api_key": config.OPENAI_API_KEY,
                    "openai_api_type": "",
                    "openai_api_version": "",
                    "openai_organization": "",
                    "openai_proxy": "",
                    "request_timeout": null,
                    "show_progress_bar": false,
                    "skip_empty": false,
                    "tiktoken_enable": true,
                    "tiktoken_model_name": ""
                },
                "Directory-02blE": {
                    "depth": 0,
                    "load_hidden": false,
                    "max_concurrency": 2,
                    "path": "/root/.cache/langflow/ae94aa3d-ca48-4d32-afca-3913d1f1669c/",
                    "recursive": false,
                    "silent_errors": false,
                    "types": "",
                    "use_multithreading": false
                },
                "Chroma-kMCGf": {
                    "allow_duplicates": false,
                    "chroma_server_cors_allow_origins": "",
                    "chroma_server_grpc_port": null,
                    "chroma_server_host": "",
                    "chroma_server_http_port": null,
                    "chroma_server_ssl_enabled": false,
                    "collection_name": "myai",
                    "limit": null,
                    "number_of_results": 10,
                    "persist_directory": "ai_0119_4",
                    "search_query": message,
                    "search_type": "Similarity"
                }
            }
        };

        console.log('Sending request:', requestBody);  // 添加請求日誌

        const response = await fetch(config.LANGFLOW_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + config.LANGFLOW_API_TOKEN,
                'Content-Type': 'application/json',
                'x-api-key': config.LANGFLOW_API_KEY
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        console.log('Langflow response:', data);  // 添加回應日誌
        
        thinkingDiv.remove();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        const botResponse = data.result?.output || 
                           data.result?.response || 
                           data.outputs?.[0]?.output || 
                           data.outputs?.[0]?.outputs?.[0]?.artifacts?.message || 
                           '抱歉，我無法理解您的問題。';
        
        addMessage('bot', botResponse);
    } catch (error) {
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
