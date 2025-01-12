import os
import requests
import subprocess
import pandas as pd
from scrapegraphai.graphs import SmartScraperGraph, ScriptCreatorGraph
import gradio as gr
from dotenv import load_dotenv
import json
from typing import List

# 加載環境變數
load_dotenv()

# 獲取環境變數
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL")

# 獲取可用的 Ollama 模型
def get_ollama_models() -> List[str]:
    try:
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        response = requests.get(f"{base_url}/api/tags")
        
        if response.status_code != 200:
            print(f"獲取模型列表失敗: {response.status_code}")
            return ["llama3.1:8b"]
            
        models = response.json().get('models', [])
        filtered_models = [
            model['name'] 
            for model in models 
            if not any(embed_keyword in model['name'].lower() 
                      for embed_keyword in ['embed', 'embedding', 'nomic'])
        ]
        
        if not filtered_models:
            return ["llama3.1:8b"]
            
        return filtered_models
        
    except Exception as e:
        print(f"獲取模型列表時出錯: {str(e)}")
        return ["llama3.1:8b"]

def get_chatgpt_models():
    return ["gpt-3.5-turbo", "gpt-4"]

def get_gemini_models():
    return ["gemini-pro"]

def get_graph_config(graph_name, model_name, user_api_key):
    if graph_name == "chatgpt":
        if not user_api_key:
            raise ValueError("ChatGPT 模型需要提供 API Key")
        return {
            "llm": {
                "api_key": user_api_key,
                "model": model_name
            },
        }
    elif graph_name == "gemini":
        if not user_api_key:
            raise ValueError("Gemini 模型需要提供 API Key")
        return {
            "llm": {
                "api_key": user_api_key,
                "model": model_name,
            },
        }
    elif graph_name == "ollama":
        if not OLLAMA_BASE_URL:
            raise ValueError("Ollama 模型需要配置 Base URL")
        return {
            "llm": {
                "model": model_name,
                "temperature": 0,
                "format": "json",
                "base_url": OLLAMA_BASE_URL,
            },
            "embeddings": {
                "model": "nomic-embed-text:latest",
                "base_url": OLLAMA_BASE_URL,
            },
            "verbose": True,
        }
    else:
        raise ValueError(f"無效的模型類型: {graph_name}")

def parse_scraper_result(result):
    parsed_data = []
    for debut_year, details in result.items():
        if isinstance(details, dict):
            group_names = details.get("團體名稱", [])
            for group_name in group_names:
                parsed_data.append([group_name, debut_year])
    return parsed_data

def run_scraper(graph_name, url, prompt, user_api_key, model_name):
    graph_config = get_graph_config(graph_name, model_name, user_api_key)
    smart_scraper_graph = SmartScraperGraph(
        prompt=prompt,
        source=url,
        config=graph_config
    )
    result = smart_scraper_graph.run()
    
    if not result:
        raise ValueError("爬取結果為空，請檢查 URL 或提示詞是否正確。")
        
    parsed_data = parse_scraper_result(result)
    return parsed_data

def run_script_creator(graph_name, url, prompt, user_api_key, model_name):
    try:
        config = {
            "llm": {
                "model": model_name,
                "api_key": user_api_key
            },
            "library": "BeautifulSoup"
        }
        script_creator = ScriptCreatorGraph(
            prompt=prompt,
            source=url,
            config=config
        )
        result = script_creator.run()
        if not result.strip():
            raise ValueError("生成的腳本為空")
        return result.strip()
    except Exception as e:
        raise ValueError(f"腳本生成失敗: {str(e)}")

def export_file(parsed_data, file_name="kpop_groups.csv"):
    try:
        df = pd.DataFrame(parsed_data, columns=["團體名稱", "出道年份"])
        file_path = file_name
        df.to_csv(file_path, index=False, encoding="utf-8-sig")
        if os.path.exists(file_path):
            return file_path
        else:
            raise ValueError("文件未成功生成")
    except Exception as e:
        raise ValueError(f"檔案匯出失敗: {str(e)}")

def execute_script_and_save(script, csv_filename):
    try:
        imports = """
import pandas as pd
import os
"""
        complete_script = imports + "\n" + script

        if not csv_filename.endswith('.csv'):
            csv_filename += '.csv'
            
        script_file = "user_script.py"
        with open(script_file, "w", encoding="utf-8") as f:
            f.write(complete_script)
            
        process = subprocess.run(
            ["python", script_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        if process.returncode != 0:
            error_msg = f"腳本執行失敗:\n標準輸出: {process.stdout}\n錯誤輸出: {process.stderr}"
            return error_msg, None
            
        if os.path.exists(csv_filename):
            return "腳本執行成功", csv_filename
        else:
            return "腳本執行成功，但找不到生成的CSV文件", None
            
    except Exception as e:
        return f"腳本執行出錯: {str(e)}", None
    finally:
        if os.path.exists(script_file):
            os.remove(script_file)

def preview_csv(file_path, page=1, rows_per_page=10):
    try:
        df = pd.read_csv(file_path)
        total_rows = len(df)
        total_pages = (total_rows + rows_per_page - 1) // rows_per_page
        
        start_idx = (page - 1) * rows_per_page
        end_idx = min(start_idx + rows_per_page, total_rows)
        
        return df.iloc[start_idx:end_idx], total_pages
    except Exception as e:
        print(f"預覽CSV時出錯: {str(e)}")
        return pd.DataFrame(), 0

css = """
/* Bootstrap 5 風格 */
.nav-link { color: #333 !important; }
.nav-link:hover { color: #0d6efd !important; }
.nav-link.active { color: #0d6efd !important; font-weight: bold; }

.card {
    border-radius: 15px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    margin: 15px 0;
    padding: 20px;
}

.footer {
    background-color: #f8f9fa;
    padding: 40px 0;
    margin-top: 50px;
}

.navbar {
    background-color: #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    padding: 15px 0;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 15px;
}

/* 自動關閉提示視窗 */
.modal {
    animation: fadeOut 0.5s ease-in-out forwards;
    animation-delay: 3s;
}

@keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; display: none; }
}
"""

with gr.Blocks(css=css) as demo:
    # Navbar
    gr.HTML("""
    <nav class="navbar navbar-expand-lg navbar-light">
        <div class="container">
            <a class="navbar-brand" href="#">AI大語言模型爬蟲工具</a>
            <div class="navbar-nav">
                <a class="nav-link" href="#" onclick='switchTab("tutorial")'>提示詞生成教學</a>
                <a class="nav-link" href="#" onclick='switchTab("templates")'>提示詞生成範本下載</a>
            </div>
        </div>
    </nav>
    """)

    with gr.Tabs() as tabs:
        with gr.TabItem("主功能", id="main"):
            gr.Markdown("### 請選擇功能")
            function_select = gr.Radio(
                choices=["智能爬取", "腳本生成", "執行腳本"],
                value="智能爬取",
                label="功能選擇"
            )

            # 智能爬取卡片
            with gr.Group(visible=True) as smart_scrape_group:
                with gr.Box(elem_classes="card"):
                    gr.Markdown("### 智能爬取")
                    graph_name = gr.Radio(
                        choices=["chatgpt", "gemini", "ollama"],
                        value="chatgpt",
                        label="選擇模型類型"
                    )
                    model_name = gr.Dropdown(
                        choices=get_chatgpt_models(),
                        value="gpt-3.5-turbo",
                        label="選擇模型"
                    )
                    url = gr.Textbox(label="網址")
                    prompt = gr.Textbox(label="提示詞", lines=3)
                    user_api_key = gr.Textbox(label="API Key", type="password")
                    file_name = gr.Textbox(label="檔案名稱", value="output.csv")
                    scrape_button = gr.Button("開始爬取")

            # 腳本生成卡片
            with gr.Group(visible=False) as script_gen_group:
                with gr.Box(elem_classes="card"):
                    gr.Markdown("### 腳本生成")
                    script_graph_name = gr.Radio(
                        choices=["chatgpt", "gemini", "ollama"],
                        value="chatgpt",
                        label="選擇模型類型"
                    )
                    script_model = gr.Dropdown(
                        choices=get_chatgpt_models(),
                        value="gpt-3.5-turbo",
                        label="選擇模型"
                    )
                    script_url = gr.Textbox(label="網址")
                    script_prompt = gr.Textbox(label="提示詞", lines=3)
                    script_api_key = gr.Textbox(label="API Key", type="password")
                    generate_button = gr.Button("生成腳本")
                    script_output = gr.Code(label="生成的腳本", language="python")

            # 執行腳本卡片
            with gr.Group(visible=False) as execute_group:
                with gr.Box(elem_classes="card"):
                    gr.Markdown("### 執行腳本")
                    script_input = gr.Code(label="輸入腳本", language="python")
                    csv_filename_input = gr.Textbox(label="CSV檔案名稱")
                    execute_button = gr.Button("執行腳本")
                    status_output = gr.Textbox(label="執行狀態")
                    download_button = gr.File(label="下載CSV")
                    
                    with gr.Row():
                        file_input = gr.Textbox(label="CSV檔案路徑", visible=False)
                        page_input = gr.Number(value=1, label="頁碼", minimum=1)
                        rows_input = gr.Number(value=10, label="每頁行數", minimum=1)
                    
                    with gr.Row():
                        table_output = gr.DataFrame(label="預覽")
                        total_pages_output = gr.Number(label="總頁數")

    # Footer
    gr.HTML("""
    <footer class="footer">
        <div class="container">
            <div class="row">
                <div class="col-md-4">
                    <h5>關於平台</h5>
                    <p>AI大語言模型爬蟲工具是一個強大的網路爬蟲自動化平台，
                    結合了最新的AI技術，幫助用戶輕鬆完成網路資料收集工作。</p>
                </div>
                <div class="col-md-4">
                    <h5>快速連結</h5>
                    <ul class="list-unstyled">
                        <li><a href="#">首頁</a></li>
                        <li><a href="#">使用教學</a></li>
                        <li><a href="#">API文件</a></li>
                        <li><a href="#">常見問題</a></li>
                    </ul>
                </div>
                <div class="col-md-4">
                    <h5>聯絡我們</h5>
                    <ul class="list-unstyled">
                        <li>Email: support@example.com</li>
                        <li>電話: (02) 1234-5678</li>
                        <li>地址: 台北市信義區信義路五段7號</li>
                    </ul>
                </div>
            </div>
            <hr>
            <div class="text-center">
                <p>&copy; 2025 AI大語言模型爬蟲工具. All rights reserved.</p>
            </div>
        </div>
    </footer>
    """)

    def handle_preview(file_path, page, rows):
        df, total_pages = preview_csv(file_path, page, rows)
        return df, total_pages

    def handle_script_execution(script, csv_filename):
        status, file_path = execute_script_and_save(script, csv_filename)
        if file_path:
            df, total_pages = preview_csv(file_path)
            return status, file_path, file_path, 1, 10, df, total_pages
        return status, None, None, 1, 10, None, 0

    def update_ui(selected_graph):
        if selected_graph == "chatgpt":
            return gr.Dropdown(choices=get_chatgpt_models(), value="gpt-3.5-turbo")
        elif selected_graph == "gemini":
            return gr.Dropdown(choices=get_gemini_models(), value="gemini-pro")
        else:
            return gr.Dropdown(choices=get_ollama_models(), value="llama2:latest")

    def scraper_interface(graph_name, model_name, url, prompt, user_api_key, file_name):
        try:
            parsed_data = run_scraper(graph_name, model_name, url, prompt, user_api_key)
            file_path = export_file(parsed_data, file_name)
            df, total_pages = preview_csv(file_path)
            return "爬取成功", file_path, file_path, 1, 10, df, total_pages
        except Exception as e:
            return str(e), None, None, 1, 10, None, 0

    def script_creator_interface(graph_name, model_name, url, prompt, api_key):
        try:
            script = run_script_creator(graph_name, model_name, url, prompt, api_key)
            return script
        except Exception as e:
            return str(e)

    def update_visibility(choice):
        return (
            choice == "智能爬取",
            choice == "腳本生成",
            choice == "執行腳本"
        )

    # 事件綁定
    function_select.change(
        update_visibility,
        inputs=[function_select],
        outputs=[smart_scrape_group, script_gen_group, execute_group]
    )

    graph_name.change(
        update_ui,
        inputs=[graph_name],
        outputs=[model_name]
    )

    script_graph_name.change(
        update_ui,
        inputs=[script_graph_name],
        outputs=[script_model]
    )

    scrape_button.click(
        scraper_interface,
        inputs=[graph_name, model_name, url, prompt, user_api_key, file_name],
        outputs=[status_output, download_button, file_input, page_input, rows_input, table_output, total_pages_output]
    )

    generate_button.click(
        script_creator_interface,
        inputs=[script_graph_name, script_model, script_url, script_prompt, script_api_key],
        outputs=[script_output]
    )

    execute_button.click(
        handle_script_execution,
        inputs=[script_input, csv_filename_input],
        outputs=[status_output, download_button, file_input, page_input, rows_input, table_output, total_pages_output]
    )

    page_input.change(
        handle_preview,
        inputs=[file_input, page_input, rows_input],
        outputs=[table_output, total_pages_output]
    )

    rows_input.change(
        handle_preview,
        inputs=[file_input, page_input, rows_input],
        outputs=[table_output, total_pages_output]
    )

demo.launch()
