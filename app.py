from flask import Flask, render_template, request, jsonify, send_file
import os
import requests
import subprocess
import pandas as pd
import sqlite3
import json
import traceback
from datetime import datetime
from scrapegraphai.graphs import SmartScraperGraph, ScriptCreatorGraph
from dotenv import load_dotenv
from typing import List
import time
import google.generativeai as genai

app = Flask(__name__)
load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# 設置 Gemini API
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-pro')

# 初始化資料庫
def init_db():
    conn = sqlite3.connect('scripts.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS script_records
        (id INTEGER PRIMARY KEY AUTOINCREMENT,
         timestamp TEXT NOT NULL,
         duration REAL NOT NULL,
         script TEXT NOT NULL,
         url TEXT NOT NULL,
         prompt TEXT NOT NULL)
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS quick_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_text TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            status INTEGER DEFAULT 1
        )
    ''')
    conn.commit()
    conn.close()

# 在應用啟動時初始化資料庫
with app.app_context():
    init_db()

# 初始化提示詞資料表
def init_prompt_db():
    try:
        conn = sqlite3.connect('prompts.db')
        c = conn.cursor()
        
        # 提示詞表
        c.execute('''
            CREATE TABLE IF NOT EXISTS prompts
            (id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL,
             content TEXT NOT NULL,
             category TEXT NOT NULL,
             created_at DATETIME NOT NULL)
        ''')
        
        # 快速提問表
        c.execute('''
            CREATE TABLE IF NOT EXISTS quick_questions
            (id INTEGER PRIMARY KEY AUTOINCREMENT,
             text TEXT NOT NULL,
             order_num INTEGER DEFAULT 0,
             is_active BOOLEAN DEFAULT 1)
        ''')
        
        conn.commit()
    except Exception as e:
        app.logger.error(f"Error initializing prompts database: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

# 在應用啟動時初始化資料庫
with app.app_context():
    init_prompt_db()

# 獲取可用的 Ollama 模型
def get_ollama_models() -> List[str]:
    """
    動態獲取 Ollama 本地模型列表
    Returns:
        List[str]: 可用的 LLM 模型列表
    """
    try:
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        response = requests.get(f"{base_url}/api/tags")
        
        if response.status_code != 200:
            app.logger.error(f"獲取模型列表失敗: {response.status_code} - {response.text}")
            return ["mistral:7b", "llama3.1:8b"]
            
        models_data = response.json().get('models', [])
        
        # 獲取所有模型名稱
        model_names = [
            model['name'] 
            for model in models_data
        ]
        
        # 如果沒有找到任何模型，返回默認模型
        if not model_names:
            app.logger.warning("未找到可用的模型，使用默認模型")
            return ["mistral:7b", "llama3.1:8b"]
            
        # 按照模型名稱排序
        model_names.sort()
        
        app.logger.info(f"找到的模型列表: {model_names}")
        return model_names
        
    except Exception as e:
        app.logger.error(f"獲取模型列表時出錯: {str(e)}")
        return ["mistral:7b", "llama3.1:8b"]

def get_chatgpt_models():
    return ["gpt-3.5-turbo", "gpt-4"]

def get_gemini_models():
    return ["gemini-pro"]

def get_graph_config(graph_name, model_name, user_api_key):
    try:
        base_config = {
            "library": "BeautifulSoup",
            "verbose": True
        }
        
        if graph_name == "chatgpt":
            if not user_api_key:
                raise ValueError("ChatGPT 模型需要提供 API Key")
            base_config.update({
                "llm": {
                    "api_key": user_api_key,
                    "model": model_name
                },
            })
        elif graph_name == "gemini":
            if not user_api_key:
                raise ValueError("Gemini 模型需要提供 API Key")
            base_config.update({
                "llm": {
                    "api_key": user_api_key,
                    "model": model_name,
                },
            })
        elif graph_name == "ollama":
            base_config.update({
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
            })
        else:
            raise ValueError(f"無效的模型類型: {graph_name}")
            
        return base_config
    except Exception as e:
        app.logger.error(f"Error in get_graph_config: {str(e)}")
        raise

def parse_scraper_result(result):
    try:
        parsed_data = []
        for debut_year, details in result.items():
            if isinstance(details, dict):
                group_names = details.get("團體名稱", [])
                for group_name in group_names:
                    parsed_data.append([group_name, debut_year])
        return parsed_data
    except Exception as e:
        app.logger.error(f"Error parsing scraper result: {str(e)}")
        raise ValueError("解析爬取結果時出錯")

def run_scraper(graph_name, url, prompt, user_api_key, model_name):
    try:
        app.logger.info(f"Starting scraper with model: {graph_name} - {model_name}")
        graph_config = get_graph_config(graph_name, model_name, user_api_key)
        
        app.logger.debug(f"Graph config: {json.dumps(graph_config)}")
        
        smart_scraper_graph = SmartScraperGraph(
            prompt=prompt,
            source=url,
            config=graph_config
        )
        
        result = smart_scraper_graph.run()
        
        if not result:
            raise ValueError("爬取結果為空，請檢查 URL 或提示詞是否正確。")
            
        app.logger.info("Scraper completed successfully")
        return parse_scraper_result(result)
    except Exception as e:
        app.logger.error(f"Scraper error: {str(e)}\n{traceback.format_exc()}")
        raise ValueError(f"爬取失敗: {str(e)}")

def run_script_creator(graph_name, url, prompt, user_api_key, model_name):
    try:
        app.logger.info(f"Starting script creator with model: {graph_name} - {model_name}")
        app.logger.info(f"URL: {url}")
        app.logger.info(f"Prompt: {prompt}")
        start_time = time.time()
        
        config = get_graph_config(graph_name, model_name, user_api_key)
        app.logger.info(f"Generated config: {json.dumps(config)}")
        
        script_creator = ScriptCreatorGraph(
            prompt=prompt,
            source=url,
            config=config
        )
        
        app.logger.info("Running script creator...")
        result = script_creator.run()
        app.logger.info(f"Script creator result length: {len(result) if result else 0}")
        
        if not result or not result.strip():
            raise ValueError("生成的腳本為空")
            
        duration = time.time() - start_time
        
        # 儲存腳本記錄
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        current_time = datetime.now().isoformat()
        c.execute('''
            INSERT INTO script_records (timestamp, duration, script, url, prompt)
            VALUES (?, ?, ?, ?, ?)
        ''', (current_time, duration, result.strip(), url, prompt))
        conn.commit()
        conn.close()
        
        app.logger.info(f"Script creator completed successfully in {duration:.2f} seconds")
        return result.strip(), duration
    except Exception as e:
        app.logger.error(f"Script creator error: {str(e)}\n{traceback.format_exc()}")
        raise ValueError(f"腳本生成失敗: {str(e)}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/smart-scraper')
def smart_scraper():
    return render_template('smart_scraper.html')

@app.route('/script-creator')
def script_creator():
    return render_template('script_creator.html')

@app.route('/script-records')
def script_records():
    return render_template('script_records.html')

@app.route('/execute-script')
def execute_script_page():
    return render_template('execute_script.html')

@app.route('/learning-center')
def learning_center():
    return render_template('learning_center.html')

@app.route('/prompt-management')
def prompt_management():
    return render_template('prompt_management.html')

@app.route('/pricing')
def pricing():
    return render_template('pricing.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        message = data.get('message')
        
        # 獲取相關提示詞
        conn = sqlite3.connect('prompts.db')
        c = conn.cursor()
        c.execute('SELECT content FROM prompts WHERE category = ? LIMIT 1', ('general',))
        prompt_row = c.fetchone()
        conn.close()
        
        if prompt_row:
            # 將提示詞與用戶訊息組合
            full_prompt = f"{prompt_row[0]}\n\nUser: {message}"
        else:
            full_prompt = message
        
        # 調用 Gemini API
        response = model.generate_content(full_prompt)
        
        return jsonify({
            'response': response.text
        })
    except Exception as e:
        app.logger.error(f"Chat error: {str(e)}")
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/api/script-records')
def get_script_records():
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('SELECT * FROM script_records ORDER BY timestamp DESC')
        records = c.fetchall()
        conn.close()
        
        def format_timestamp(ts):
            try:
                # 解析 ISO 格式時間戳
                dt = datetime.fromisoformat(ts)
                # 轉換為前端期望的格式
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            except:
                return ts
        
        return jsonify({
            'records': [{
                'id': r[0],
                'timestamp': format_timestamp(r[1]),
                'duration': r[2],
                'script': r[3],
                'url': r[4],
                'prompt': r[5]
            } for r in records]
        })
    except Exception as e:
        app.logger.error(f"Error getting script records: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/script-records', methods=['DELETE'])
def clear_script_records():
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('DELETE FROM script_records')
        conn.commit()
        conn.close()
        app.logger.info("All script records cleared")
        return jsonify({'status': 'success', 'message': '所有記錄已清除'}), 200
    except Exception as e:
        app.logger.error(f"Error clearing script records: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/<graph_type>')
def get_models(graph_type):
    try:
        if graph_type == 'chatgpt':
            return jsonify(get_chatgpt_models())
        elif graph_type == 'gemini':
            return jsonify(get_gemini_models())
        elif graph_type == 'ollama':
            return jsonify(get_ollama_models())
        else:
            return jsonify([])
    except Exception as e:
        app.logger.error(f"Error getting models for {graph_type}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ollama-models')
def get_ollama_models_api():
    """API endpoint to get available Ollama models"""
    try:
        models = get_ollama_models()
        return jsonify({'models': models})
    except Exception as e:
        app.logger.error(f"Error in /api/ollama-models: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/scrape', methods=['POST'])
def scrape():
    try:
        data = request.json
        app.logger.info(f"Received scrape request: {json.dumps(data)}")
        
        result = run_scraper(
            data['graph_name'],
            data['url'],
            data['prompt'],
            data['api_key'],
            data['model_name']
        )
        
        # Save to CSV
        df = pd.DataFrame(result, columns=["團體名稱", "出道年份"])
        output_file = f"static/downloads/{data.get('file_name', 'output.csv')}"
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        df.to_csv(output_file, index=False, encoding="utf-8-sig")
        
        return jsonify({
            'status': 'success',
            'data': result,
            'file_url': output_file
        })
    except Exception as e:
        app.logger.error(f"Scrape error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400

@app.route('/api/generate-script', methods=['POST'])
def generate_script():
    try:
        data = request.json
        app.logger.info(f"Received data for script generation: {json.dumps(data)}")
        
        # 驗證必要的參數
        required_fields = ['graph_name', 'model_name', 'url', 'prompt']
        for field in required_fields:
            if field not in data:
                error_msg = f"缺少必要參數: {field}"
                app.logger.error(error_msg)
                return jsonify({'status': 'error', 'message': error_msg}), 400
        
        # 檢查 API Key
        if data['graph_name'] in ['chatgpt', 'gemini'] and not data.get('api_key'):
            error_msg = f"{data['graph_name'].upper()} 需要 API Key"
            app.logger.error(error_msg)
            return jsonify({'status': 'error', 'message': error_msg}), 400
            
        app.logger.info(f"Starting script generation with model: {data['graph_name']} - {data['model_name']}")
        
        script, duration = run_script_creator(
            data['graph_name'],
            data['url'],
            data['prompt'],
            data.get('api_key', ''),  # 對於 Ollama，API key 可以為空
            data['model_name']
        )
        
        app.logger.info(f"Script generated successfully in {duration:.2f} seconds")
        
        # 保存記錄到數據庫
        try:
            conn = sqlite3.connect('scripts.db')
            c = conn.cursor()
            current_time = datetime.now().isoformat()
            c.execute('''
                INSERT INTO script_records (timestamp, duration, script, url, prompt)
                VALUES (?, ?, ?, ?, ?)
            ''', (current_time, duration, script, data['url'], data['prompt']))
            conn.commit()
            conn.close()
            app.logger.info("Script record saved to database")
        except Exception as db_error:
            app.logger.error(f"Error saving to database: {str(db_error)}")
            # 即使保存失敗，我們仍然返回生成的腳本
        
        return jsonify({
            'status': 'success',
            'script': script,
            'duration': f"{duration:.2f}"
        })
    except ValueError as ve:
        error_msg = str(ve)
        app.logger.error(f"Validation error: {error_msg}")
        return jsonify({'status': 'error', 'message': error_msg}), 400
    except Exception as e:
        error_msg = f"腳本生成錯誤: {str(e)}"
        app.logger.error(f"Script generation error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': error_msg}), 500

@app.route('/api/execute-script', methods=['POST'])
def execute_script():
    try:
        data = request.json
        script = data['script']
        csv_filename = data.get('csv_filename', 'output.csv')
        
        if not csv_filename.endswith('.csv'):
            csv_filename += '.csv'
            
        complete_script = """
import pandas as pd
import os
""" + script

        script_file = "temp_script.py"
        with open(script_file, "w", encoding="utf-8") as f:
            f.write(complete_script)
            
        process = subprocess.run(
            ["python", script_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        os.remove(script_file)
        
        if process.returncode != 0:
            raise ValueError(f"腳本執行失敗:\n{process.stderr}")
            
        if os.path.exists(csv_filename):
            df = pd.read_csv(csv_filename)
            return jsonify({
                'status': 'success',
                'message': '腳本執行成功',
                'data': df.to_dict('records'),
                'file_url': csv_filename
            })
        else:
            raise ValueError("找不到生成的CSV文件")
            
    except Exception as e:
        app.logger.error(f"Script execution error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400

@app.route('/download/<path:filename>')
def download_file(filename):
    try:
        return send_file(filename, as_attachment=True)
    except Exception as e:
        app.logger.error(f"Download error: {str(e)}")
        return str(e), 404

# 修改快速提問列表路由
@app.route('/api/quick-questions-list', methods=['GET'])
def get_quick_questions_list():
    conn = None
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 檢查表是否存在
        c.execute('''
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='quick_questions'
        ''')
        if not c.fetchone():
            # 如果表不存在，創建表
            c.execute('''
                CREATE TABLE IF NOT EXISTS quick_questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_text TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    status INTEGER DEFAULT 1
                )
            ''')
            conn.commit()
            return jsonify([])  # 返回空列表
            
        # 查詢數據
        c.execute('SELECT id, display_text, sort_order, status FROM quick_questions ORDER BY sort_order')
        questions = [
            {
                'id': row[0],
                'display_text': row[1],
                'sort_order': row[2],
                'status': row[3]
            }
            for row in c.fetchall()
        ]
        return jsonify(questions)
        
    except Exception as e:
        print(f"Error in get_quick_questions_list: {str(e)}")  # 添加日誌
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

# 修改提示詞列表路由
@app.route('/api/prompts', methods=['GET'])
def get_prompts():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT id, name, category, content, status, 
                   strftime('%Y-%m-%d %H:%M:%S', created_at) as created_at
            FROM prompts 
            ORDER BY created_at DESC
        ''')
        
        prompts = []
        for row in c.fetchall():
            prompts.append({
                'id': row[0],
                'name': row[1],
                'category': row[2],
                'content': row[3],
                'status': row[4],
                'created_at': row[5]
            })
            
        return jsonify(prompts)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts', methods=['POST'])
def create_prompt():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '無效的請求數據'}), 400
            
        # 驗證必要欄位
        if not data.get('name') or not data.get('content'):
            return jsonify({'error': '缺少必要欄位 (name 或 content)'}), 400
            
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 檢查表是否存在，如果不存在創建
        c.execute('''
            CREATE TABLE IF NOT EXISTS prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                status INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 插入新提示詞
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        c.execute('''
            INSERT INTO prompts (name, category, content, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            data['name'],
            data.get('category', 'general'),
            data['content'],
            1,  # 默認啟用
            current_time
        ))
        
        conn.commit()
        
        # 獲取新插入的記錄
        c.execute('''
            SELECT id, name, category, content, status, created_at
            FROM prompts WHERE id = last_insert_rowid()
        ''')
        
        row = c.fetchone()
        
        if row:
            return jsonify({
                'success': True,
                'message': '新增成功',
                'data': {
                    'id': row[0],
                    'name': row[1],
                    'category': row[2],
                    'content': row[3],
                    'status': row[4],
                    'created_at': row[5]
                }
            })
        
        return jsonify({'error': '新增失敗'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts/<int:prompt_id>', methods=['GET'])
def get_prompt(prompt_id):
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT id, name, category, content, status
            FROM prompts 
            WHERE id = ?
        ''', (prompt_id,))
        
        row = c.fetchone()
        
        if not row:
            return jsonify({'error': '提示詞不存在'}), 404
            
        return jsonify({
            'id': row[0],
            'name': row[1],
            'category': row[2],
            'content': row[3],
            'status': row[4]
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts/<int:prompt_id>', methods=['PUT'])
def update_prompt(prompt_id):
    try:
        data = request.json
        conn = sqlite3.connect('prompts.db')
        c = conn.cursor()
        
        c.execute('''
            UPDATE prompts 
            SET name = ?, content = ?, category = ?
            WHERE id = ?
        ''', (data['name'], data['content'], data['category'], prompt_id))
        
        conn.commit()
        conn.close()
        
        if c.rowcount == 0:
            return jsonify({'error': 'Prompt not found'}), 404
            
        return jsonify({'message': 'Prompt updated successfully'})
    except Exception as e:
        app.logger.error(f"Error updating prompt: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/prompts/<int:prompt_id>', methods=['DELETE'])
def delete_prompt(prompt_id):
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 檢查記錄是否存在
        c.execute('SELECT id FROM prompts WHERE id = ?', (prompt_id,))
        if not c.fetchone():
            return jsonify({
                'success': False,
                'message': '提示詞不存在'
            }), 404
            
        # 執行刪除
        c.execute('DELETE FROM prompts WHERE id = ?', (prompt_id,))
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': '刪除成功'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'刪除失敗: {str(e)}'
        }), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts/<int:prompt_id>/toggle', methods=['PUT'])
def toggle_prompt(prompt_id):
    try:
        data = request.get_json()
        is_active = data.get('is_active', False)
        
        conn = sqlite3.connect('prompts.db')
        c = conn.cursor()
        
        if is_active:
            # 先將所有提示詞設為非啟用
            c.execute('UPDATE prompts SET is_active = 0')
            
        # 更新指定提示詞的狀態
        c.execute('UPDATE prompts SET is_active = ? WHERE id = ?', 
                 (1 if is_active else 0, prompt_id))
        
        conn.commit()
        
        # 獲取更新後的狀態
        c.execute('SELECT is_active FROM prompts WHERE id = ?', (prompt_id,))
        result = c.fetchone()
        conn.close()
        
        if result is None:
            return jsonify({'error': 'Prompt not found'}), 404
            
        return jsonify({
            'success': True,
            'is_active': bool(result[0])
        })
        
    except Exception as e:
        app.logger.error(f"Error toggling prompt: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/save_prompt', methods=['POST'])
def save_prompt():
    try:
        data = request.get_json()
        # 這裡添加保存提示詞的邏輯
        # 例如保存到數據庫
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

def migrate_prompts_db():
    try:
        conn = sqlite3.connect('prompts.db')
        c = conn.cursor()
        
        # 檢查表是否存在
        c.execute('''
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='prompts'
        ''')
        if not c.fetchone():
            init_prompt_db()
        
        # 檢查是否需要添加 is_active 欄位
        c.execute('PRAGMA table_info(prompts)')
        columns = [column[1] for column in c.fetchall()]
        
        if 'is_active' not in columns:
            # 添加 is_active 欄位
            c.execute('ALTER TABLE prompts ADD COLUMN is_active BOOLEAN DEFAULT 0')
            conn.commit()
            app.logger.info("Added is_active column to prompts table")
            
    except Exception as e:
        app.logger.error(f"Error migrating database: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

# 在應用啟動時初始化和遷移資料庫
with app.app_context():
    migrate_prompts_db()

# 快速提問相關 API
@app.route('/api/quick-questions', methods=['GET'])
def get_quick_questions():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT 
                id, 
                display_text, 
                sort_order, 
                status,
                strftime('%Y-%m-%d %H:%M:%S', created_at) as created_at
            FROM quick_questions 
            ORDER BY sort_order
        ''')
        
        questions = []
        for row in c.fetchall():
            questions.append({
                'id': row[0],
                'display_text': row[1],
                'sort_order': row[2],
                'status': row[3],
                'created_at': row[4] if row[4] else None
            })
        
        return jsonify(questions)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/quick-questions', methods=['POST'])
def add_quick_question():
    try:
        data = request.get_json()
        
        # 驗證必要欄位
        if not data or 'display_text' not in data or 'sort_order' not in data:
            return jsonify({
                'success': False,
                'message': '缺少必要欄位'
            }), 400

        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 插入數據，讓 SQLite 自動設置 created_at
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        c.execute('''
            INSERT INTO quick_questions (display_text, sort_order, status, created_at)
            VALUES (?, ?, ?, ?)
        ''', (
            data['display_text'],
            int(data['sort_order']),
            data.get('status', 1),
            current_time
        ))
        
        conn.commit()
        
        # 獲取新插入的記錄
        c.execute('''
            SELECT id, display_text, sort_order, status, 
                   strftime('%Y-%m-%d %H:%M:%S', created_at) as created_at
            FROM quick_questions WHERE id = last_insert_rowid()
        ''')
        
        row = c.fetchone()
        
        if row:
            return jsonify({
                'success': True,
                'message': '新增成功',
                'data': {
                    'id': row[0],
                    'display_text': row[1],
                    'sort_order': row[2],
                    'status': row[3],
                    'created_at': row[4]
                }
            })
        
        return jsonify({
            'success': True,
            'message': '新增成功'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/quick-questions/<int:id>', methods=['DELETE'])
def delete_quick_question(id):
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 確認記錄是否存在
        c.execute('SELECT id FROM quick_questions WHERE id = ?', (id,))
        if not c.fetchone():
            return jsonify({
                'success': False,
                'message': '記錄不存在'
            }), 404
            
        # 執行刪除
        c.execute('DELETE FROM quick_questions WHERE id = ?', (id,))
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': '刪除成功'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'刪除失敗: {str(e)}'
        }), 500
    finally:
        if 'conn' in locals():
            conn.close()

# 批量刪除
@app.route('/api/quick-questions/batch', methods=['DELETE'])
def batch_delete_quick_questions():
    try:
        data = request.get_json()
        if not data or 'ids' not in data or not data['ids']:
            return jsonify({
                'success': False,
                'message': '未提供要刪除的ID列表'
            }), 400
            
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 將 ID 列表轉換為 SQL 安全的格式
        id_list = ','.join('?' * len(data['ids']))
        
        # 執行批量刪除
        c.execute(f'DELETE FROM quick_questions WHERE id IN ({id_list})', data['ids'])
        conn.commit()
        
        if c.rowcount > 0:
            return jsonify({
                'success': True,
                'message': f'成功刪除 {c.rowcount} 筆記錄'
            })
        else:
            return jsonify({
                'success': False,
                'message': '沒有記錄被刪除'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'批量刪除失敗: {str(e)}'
        }), 500
    finally:
        if 'conn' in locals():
            conn.close()

# 快速提問管理路由
@app.route('/api/questions', methods=['GET'])
def get_questions():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('SELECT id, display_text, sort_order FROM quick_questions ORDER BY sort_order')
    questions = [{'id': row[0], 'display_text': row[1], 'sort_order': row[2]} for row in c.fetchall()]
    conn.close()
    return jsonify(questions)

@app.route('/api/questions/<int:id>', methods=['GET'])
def get_question(id):
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('SELECT id, display_text, sort_order FROM quick_questions WHERE id = ?', (id,))
    row = c.fetchone()
    conn.close()
    if row:
        return jsonify({'id': row[0], 'display_text': row[1], 'sort_order': row[2]})
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/questions', methods=['POST'])
def add_question():
    data = request.json
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute('INSERT INTO quick_questions (display_text, sort_order) VALUES (?, ?)',
                 (data['display_text'], data['sort_order']))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/questions/<int:id>', methods=['PUT'])
def update_question(id):
    data = request.json
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute('UPDATE quick_questions SET display_text = ?, sort_order = ? WHERE id = ?',
                 (data['display_text'], data['sort_order'], id))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/questions/<int:id>', methods=['DELETE'])
def delete_question(id):
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        c.execute('DELETE FROM quick_questions WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/batch-delete-questions', methods=['POST'])
def batch_delete_questions():
    data = request.json
    if not data or 'ids' not in data:
        return jsonify({'success': False, 'message': 'No ids provided'})
    
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    try:
        ids = ','.join('?' * len(data['ids']))
        c.execute(f'DELETE FROM quick_questions WHERE id IN ({ids})', data['ids'])
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/quick-questions/check-sort-order', methods=['GET'])
def check_sort_order():
    order = request.args.get('order', type=int)
    exclude_id = request.args.get('exclude_id', type=int)
    
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    
    query = 'SELECT 1 FROM quick_questions WHERE sort_order = ?'
    params = [order]
    
    if exclude_id:
        query += ' AND id != ?'
        params.append(exclude_id)
    
    c.execute(query, params)
    exists = c.fetchone() is not None
    
    conn.close()
    return jsonify({'exists': exists})

def migrate_quick_questions_db():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 檢查表是否存在
        c.execute('''
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='quick_questions'
        ''')
        
        if not c.fetchone():
            # 如果表不存在，創建新表
            c.execute('''
                CREATE TABLE quick_questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_text TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    status INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        else:
            # 如果表存在，檢查是否有 created_at 列
            c.execute('PRAGMA table_info(quick_questions)')
            columns = [column[1] for column in c.fetchall()]
            
            if 'created_at' not in columns:
                # 備份現有數據
                c.execute('ALTER TABLE quick_questions RENAME TO quick_questions_backup')
                
                # 創建新表
                c.execute('''
                    CREATE TABLE quick_questions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        display_text TEXT NOT NULL,
                        sort_order INTEGER NOT NULL,
                        status INTEGER DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                
                # 恢復數據
                c.execute('''
                    INSERT INTO quick_questions (display_text, sort_order, status, created_at)
                    SELECT display_text, sort_order, status, CURRENT_TIMESTAMP
                    FROM quick_questions_backup
                ''')
                
                # 刪除備份表
                c.execute('DROP TABLE quick_questions_backup')
        
        conn.commit()
        app.logger.info("Successfully migrated quick_questions table")
        
    except Exception as e:
        app.logger.error(f"Error migrating database: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

# 在應用啟動時執行遷移
with app.app_context():
    migrate_quick_questions_db()

@app.route('/api/quick-questions/<int:id>', methods=['GET'])
def get_quick_question(id):
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT id, display_text, sort_order, status
            FROM quick_questions 
            WHERE id = ?
        ''', (id,))
        
        row = c.fetchone()
        
        if not row:
            return jsonify({'error': '記錄不存在'}), 404
            
        return jsonify({
            'id': row[0],
            'display_text': row[1],
            'sort_order': row[2],
            'status': row[3]
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/quick-questions/<int:id>', methods=['PUT'])
def update_quick_question(id):
    try:
        data = request.get_json()
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        c.execute('''
            UPDATE quick_questions 
            SET display_text = ?, sort_order = ?, status = ?
            WHERE id = ?
        ''', (
            data['display_text'],
            data['sort_order'],
            data['status'],
            id
        ))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': '更新成功'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts/batch', methods=['DELETE'])
def batch_delete_prompts():
    try:
        data = request.get_json()
        if not data or 'ids' not in data or not data['ids']:
            return jsonify({
                'success': False,
                'message': '未提供要刪除的ID列表'
            }), 400
            
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 將 ID 列表轉換為 SQL 安全的格式
        id_list = ','.join('?' * len(data['ids']))
        
        # 執行批量刪除
        c.execute(f'DELETE FROM prompts WHERE id IN ({id_list})', data['ids'])
        conn.commit()
        
        if c.rowcount > 0:
            return jsonify({
                'success': True,
                'message': f'成功刪除 {c.rowcount} 筆記錄'
            })
        else:
            return jsonify({
                'success': False,
                'message': '沒有記錄被刪除'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'批量刪除失敗: {str(e)}'
        }), 500
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    app.run(debug=True)
