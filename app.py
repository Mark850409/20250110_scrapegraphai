from flask import Flask, render_template, request, jsonify, send_file
import os
import requests
import subprocess
import pandas as pd
import sqlite3
import json
import time
import traceback
from datetime import datetime
from scrapegraphai.graphs import SmartScraperGraph, ScriptCreatorGraph
from dotenv import load_dotenv
from typing import List
import google.generativeai as genai
from sqlalchemy import func
import openai
from openai import OpenAI

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
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 檢查表是否存在
        c.execute('''
            SELECT count(name) FROM sqlite_master 
            WHERE type='table' AND name='prompts'
        ''')
        
        # 只在表不存在時創建表
        if c.fetchone()[0] == 0:
            c.execute('''
                CREATE TABLE IF NOT EXISTS prompts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    content TEXT NOT NULL,
                    category TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    status INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            print("Successfully created prompts table")
        
        conn.commit()
    except Exception as e:
        print(f"Error initializing prompts database: {str(e)}")
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
    alert = {
        'type': 'info',
        'icon': 'fas fa-info-circle',
        'title': '使用說明',
        'message': '智能爬蟲功能可以自動分析網頁結構，智能識別關鍵資訊，並即時進行資料爬取。您只需輸入目標網址，系統就會自動完成爬蟲任務。'
    }
    return render_template('smart_scraper.html', breadcrumb_title='智能爬蟲', alert=alert)

@app.route('/script-creator')
def script_creator():
    alert = {
        'type': 'info',
        'icon': 'fas fa-info-circle',
        'title': '使用說明',
        'message': '在這裡，您可以使用AI技術來生成Python爬蟲腳本。只需提供目標網站URL和描述您想要爬取的資料，系統就會自動為您生成相應的爬蟲腳本。'
    }
    return render_template('script_creator.html', breadcrumb_title='腳本生成', alert=alert)

@app.route('/script-records')
def script_records():
    return render_template('script_records.html', breadcrumb_title='腳本生成紀錄')

@app.route('/script-executor')
def script_executor():
    alert = {
        'type': 'info',
        'icon': 'fas fa-info-circle',
        'title': '使用說明',
        'message': '在這裡您可以執行已生成的爬蟲腳本。選擇要執行的腳本，設置必要的參數，然後點擊執行按鈕開始爬取資料。您可以實時查看執行進度和結果。'
    }
    return render_template('script_executor.html', breadcrumb_title='執行腳本', alert=alert)

@app.route('/learning-center')
def learning_center():
    return render_template('learning_center.html', breadcrumb_title='學習中心')

@app.route('/prompt-management')
def prompt_management():
    alert = {
        'type': 'info',
        'icon': 'fas fa-info-circle',
        'title': '使用說明',
        'message': '在這裡您可以管理和自定義AI提示詞。良好的提示詞可以幫助系統生成更準確的爬蟲腳本。您可以新增、編輯或刪除提示詞模板。'
    }
    return render_template('prompt_management.html', breadcrumb_title='自定義提示詞', alert=alert)

@app.route('/pricing')
def pricing():
    alert = {
        'type': 'info',
        'icon': 'fas fa-info-circle',
        'title': '方案說明',
        'message': '我們提供多種靈活的付費方案，從基礎版到企業版，滿足不同規模用戶的需求。選擇適合您的方案，開始使用我們的AI爬蟲工具。'
    }
    return render_template('pricing.html', breadcrumb_title='定價', alert=alert)

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

def get_all_script_records():
    """
    從資料庫獲取所有腳本記錄
    """
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('SELECT * FROM script_records ORDER BY timestamp DESC')
        records = c.fetchall()
        
        # 將查詢結果轉換為字典格式
        formatted_records = []
        for record in records:
            formatted_records.append({
                '_id': record[0],  # id
                'timestamp': record[1],  # timestamp
                'duration': record[2],  # duration
                'script': record[3],  # script
                'url': record[4],  # url
                'prompt': record[5]  # prompt
            })
        
        return formatted_records
    except Exception as e:
        print(f"Error getting script records: {e}")
        return []
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/script-records')
def get_script_records():
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('SELECT * FROM script_records ORDER BY timestamp DESC')
        records = c.fetchall()
        
        formatted_records = []
        seen_urls = set()  # 用於追蹤已經看過的 URL
        
        for record in records:
            # 使用 URL 和時間戳作為唯一標識
            url_timestamp = (record[4], record[1])  # url 和 timestamp
            
            if url_timestamp not in seen_urls:
                seen_urls.add(url_timestamp)
                try:
                    script_content = record[3]  # 直接使用原始腳本內容
                    
                    formatted_records.append({
                        'id': record[0],
                        'timestamp': record[1],
                        'duration': float(record[2]),
                        'script': script_content,
                        'url': record[4],
                        'prompt': record[5]
                    })
                except Exception as e:
                    print(f"Error formatting record: {e}")
                    continue

        return jsonify({'records': formatted_records})
    except Exception as e:
        print(f"Error getting script records: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/script-records', methods=['DELETE'])
def clear_script_records():
    conn = None
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('DELETE FROM script_records')
        conn.commit()
        app.logger.info("All script records cleared")
        return jsonify({'status': 'success', 'message': '所有記錄已清除'}), 200
    except Exception as e:
        if conn:
            conn.rollback()
        app.logger.error(f"Error clearing script records: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            try:
                conn.close()
            except Exception as e:
                app.logger.error(f"Error closing database connection: {str(e)}")

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
    data = request.get_json()
    model_type = data.get('model_type')
    url = data.get('url')
    prompt = data.get('prompt')

    if model_type == 'ollama':
        server_url = data.get('server_url')
        model = data.get('model')
        try:
            script = generate_script_with_ollama(server_url, model, url, prompt)
            return jsonify({'success': True, 'script': script, 'duration': 0})
        except Exception as e:
            app.logger.error(f"Ollama script generation error: {str(e)}")
            return jsonify({'success': False, 'message': '生成腳本失敗: ' + str(e)}), 500

    elif model_type == 'chatgpt':
        api_key = data.get('api_key')
        try:
            script = generate_script_with_chatgpt(url, prompt, api_key)
            return jsonify({'success': True, 'script': script, 'duration': 0})
        except Exception as e:
            app.logger.error(f"ChatGPT script generation error: {str(e)}")
            return jsonify({'success': False, 'message': '生成腳本失敗: ' + str(e)}), 500

    elif model_type == 'gemini':
        try:
            script = generate_script_with_gemini(url, prompt)
            return jsonify({'success': True, 'script': script, 'duration': 0})
        except Exception as e:
            app.logger.error(f"Gemini script generation error: {str(e)}")
            return jsonify({'success': False, 'message': '生成腳本失敗: ' + str(e)}), 500

    # 處理未知的模型類型
    return jsonify({'success': False, 'message': f'不支持的模型類型: {model_type}'}), 400


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
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 修改 SQL 查詢，確保包含 created_at 欄位
        c.execute('''
            SELECT id, display_text, sort_order, status, created_at
            FROM quick_questions 
            ORDER BY sort_order
        ''')
        
        questions = [
            {
                'id': row[0],
                'display_text': row[1],
                'sort_order': row[2],
                'status': row[3],
                'created_at': row[4]  # 確保返回 created_at 欄位
            }
            for row in c.fetchall()
        ]
        
        return jsonify(questions)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

# 修改提示詞列表路由
@app.route('/api/prompts', methods=['GET'])
def get_prompts():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT id, name, category, content, sort_order, status, created_at
            FROM prompts
            ORDER BY sort_order
        ''')
        
        prompts = []
        for row in c.fetchall():
            prompts.append({
                'id': row[0],
                'name': row[1],
                'category': row[2],
                'content': row[3],
                'sort_order': row[4],  # 確保返回正確的排序值
                'status': row[5],
                'created_at': row[6]
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
            return jsonify({'success': False, 'message': '無效的請求數據'}), 400
            
        # 驗證必要欄位
        required_fields = ['name', 'content', 'category', 'sort_order']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False, 
                'message': f'缺少必要欄位: {", ".join(required_fields)}'
            }), 400

        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        try:
            # 檢查排序值是否重複
            c.execute('SELECT 1 FROM prompts WHERE sort_order = ?', (data['sort_order'],))
            if c.fetchone():
                return jsonify({
                    'success': False,
                    'message': '此排序值已存在，請使用其他值'
                }), 400
            
            # 檢查是否為第一筆資料
            c.execute('SELECT COUNT(*) FROM prompts')
            is_first_record = c.fetchone()[0] == 0
                
            # 插入新提示詞
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            c.execute('''
                INSERT INTO prompts (name, category, content, sort_order, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                data['name'],
                data['category'],
                data['content'],
                data['sort_order'],
                1 if is_first_record else 0,  # 第一筆資料預設啟用，其他預設停用
                current_time
            ))
            
            conn.commit()
            
            # 獲取新插入的記錄
            c.execute('''
                SELECT id, name, category, content, sort_order, status, created_at
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
                        'sort_order': row[4],
                        'status': row[5],
                        'created_at': row[6]
                    }
                })
            
            return jsonify({'success': False, 'message': '新增失敗'}), 500
            
        except sqlite3.Error as e:
            return jsonify({'success': False, 'message': f'資料庫錯誤: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': f'系統錯誤: {str(e)}'}), 500
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
        data = request.get_json()
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 檢查排序值是否重複（排除當前記錄）
        c.execute('SELECT 1 FROM prompts WHERE sort_order = ? AND id != ?', 
                 (data['sort_order'], prompt_id))
        if c.fetchone():
            return jsonify({
                'success': False,
                'message': '此排序值已存在，請使用其他值'
            }), 400
        
        c.execute('''
            UPDATE prompts 
            SET name = ?, content = ?, category = ?, sort_order = ?
            WHERE id = ?
        ''', (data['name'], data['content'], data['category'], data['sort_order'], prompt_id))
        
        conn.commit()
        
        if c.rowcount == 0:
            return jsonify({'success': False, 'message': '提示詞不存在'}), 404
            
        return jsonify({'success': True, 'message': '更新成功'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

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
def create_quick_question():
    try:
        data = request.get_json()
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 添加當前時間作為 created_at
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        c.execute('''
            INSERT INTO quick_questions (display_text, sort_order, status, created_at)
            VALUES (?, ?, ?, ?)
        ''', (
            data['display_text'],
            data['sort_order'],
            data['status'],
            current_time
        ))
        
        conn.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
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
    try:
        order = request.args.get('order', type=int)
        exclude_id = request.args.get('exclude_id', type=int)
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 首先檢查總記錄數
        c.execute('SELECT COUNT(*) FROM quick_questions')
        total_count = c.fetchone()[0]
        
        # 如果總記錄數小於 2，直接返回不存在
        if total_count < 2:
            conn.close()
            return jsonify({'exists': False})
        
        # 如果有兩筆以上才檢查排序
        query = 'SELECT 1 FROM quick_questions WHERE sort_order = ?'
        params = [order]
        
        if exclude_id:
            query += ' AND id != ?'
            params.append(exclude_id)
        
        c.execute(query, params)
        exists = c.fetchone() is not None
        
        conn.close()
        return jsonify({'exists': exists})
        
    except Exception as e:
        app.logger.error(f"Error checking sort order: {str(e)}")
        return jsonify({'error': str(e)}), 500

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

@app.route('/api/active-quick-questions', methods=['GET'])
def get_active_quick_questions():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 只獲取狀態為啟用的快速提問
        c.execute('''
            SELECT id, display_text
            FROM quick_questions 
            WHERE status = 1
            ORDER BY sort_order
        ''')
        
        questions = [
            {
                'id': row[0],
                'display_text': row[1]
            }
            for row in c.fetchall()
        ]
        
        app.logger.info(f"Returning active questions: {questions}")
        return jsonify(questions)
        
    except Exception as e:
        app.logger.error(f"Error getting active quick questions: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts/max-sort-order', methods=['GET'])
def get_max_sort_order():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 使用 SQLite 直接查詢最大排序值
        c.execute('SELECT MAX(sort_order) FROM prompts')
        max_order = c.fetchone()[0]
        
        return jsonify({
            'success': True,
            'max_sort_order': max_order if max_order is not None else 0
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts/check-sort-order', methods=['GET'])
def check_prompt_sort_order():
    try:
        order = request.args.get('order', type=int)
        exclude_id = request.args.get('exclude_id', type=int)
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        query = 'SELECT 1 FROM prompts WHERE sort_order = ?'
        params = [order]
        
        if exclude_id:
            query += ' AND id != ?'
            params.append(exclude_id)
        
        c.execute(query, params)
        exists = c.fetchone() is not None
        
        return jsonify({
            'success': True,
            'exists': exists
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/prompts/<int:prompt_id>/status', methods=['PUT'])
def update_prompt_status(prompt_id):
    try:
        data = request.get_json()
        new_status = data.get('status', False)
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        try:
            if new_status:
                # 如果要啟用，先將所有提示詞設為停用
                c.execute('UPDATE prompts SET status = 0')
            
            # 更新指定提示詞的狀態
            c.execute('UPDATE prompts SET status = ? WHERE id = ?', 
                     (1 if new_status else 0, prompt_id))
            
            conn.commit()
            
            return jsonify({
                'success': True,
                'message': '狀態更新成功'
            })
            
        except sqlite3.Error as e:
            return jsonify({
                'success': False,
                'message': f'資料庫錯誤: {str(e)}'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'系統錯誤: {str(e)}'
        }), 500
    finally:
        if 'conn' in locals():
            conn.close()

# 添加 ChatGPT 腳本生成函數
def generate_script_with_chatgpt(url, prompt, api_key):
    """使用 ChatGPT 生成爬蟲腳本"""
    start_time = time.time()  # 開始計時
    try:
        # 設置 OpenAI API key
        client = OpenAI(api_key=api_key)
        
        # 構建提示詞
        system_prompt = """你是一個專業的 Python 爬蟲工程師。請根據用戶提供的網址和需求，生成一個使用 Python 的爬蟲腳本。
        腳本需要包含必要的錯誤處理，並使用 requests 和 BeautifulSoup 函式庫。請只返回 Python 代碼，不需要其他解釋。"""
        
        user_prompt = f"網址：{url}\n需求：{prompt}\n請生成爬蟲腳本。"
        
        # 調用 ChatGPT API
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )
        
        # 獲取生成的腳本
        script = response.choices[0].message.content.strip()
        
        # 檢查腳本是否為空
        if not script:
            raise Exception("生成的腳本為空")
            
        # 計算執行時間（轉換為秒）
        duration = round(time.time() - start_time, 2)
            
        # 記錄到資料庫
        try:
            conn = sqlite3.connect('scripts.db')
            c = conn.cursor()
            c.execute('''
                INSERT INTO script_records (timestamp, duration, script, url, prompt)
                VALUES (?, ?, ?, ?, ?)
            ''', (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), duration, script, url, prompt))
            conn.commit()
        except Exception as e:
            app.logger.error(f"Database error: {str(e)}")
        finally:
            if conn:
                conn.close()
        
        return script
        
    except Exception as e:
        app.logger.error(f"ChatGPT script generation error: {str(e)}")
        raise Exception(f"生成腳本時發生錯誤: {str(e)}")

# 添加 Gemini 腳本生成函數
def generate_script_with_gemini(url, prompt):
    """使用 Gemini 生成爬蟲腳本"""
    start_time = time.time()  # 開始計時
    try:
        # 構建提示詞
        system_prompt = """你是一個專業的 Python 爬蟲工程師。請根據用戶提供的網址和需求，生成一個使用 Python 的爬蟲腳本。
        腳本需要包含必要的錯誤處理，並使用 requests 和 BeautifulSoup 函式庫。請只返回 Python 代碼，不需要其他解釋。"""
        
        user_prompt = f"網址：{url}\n需求：{prompt}\n請生成爬蟲腳本。"
        
        # 組合完整提示詞
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        
        # 調用 Gemini API
        response = model.generate_content(full_prompt)
        
        # 獲取生成的腳本
        script = response.text.strip()
        
        # 檢查腳本是否為空
        if not script:
            raise Exception("生成的腳本為空")
            
        # 計算執行時間（轉換為秒）
        duration = round(time.time() - start_time, 2)
            
        # 記錄到資料庫
        try:
            conn = sqlite3.connect('scripts.db')
            c = conn.cursor()
            c.execute('''
                INSERT INTO script_records (timestamp, duration, script, url, prompt)
                VALUES (?, ?, ?, ?, ?)
            ''', (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), duration, script, url, prompt))
            conn.commit()
        except Exception as e:
            app.logger.error(f"Database error: {str(e)}")
        finally:
            if conn:
                conn.close()
        
        return script
        
    except Exception as e:
        app.logger.error(f"Gemini script generation error: {str(e)}")
        raise Exception(f"生成腳本時發生錯誤: {str(e)}")

def generate_script_with_ollama(server_url, model, url, prompt):
    """使用 Ollama 生成爬蟲腳本"""
    start_time = time.time()  # 開始計時
    try:
        # 構建提示詞
        system_prompt = """你是一個專業的 Python 爬蟲工程師。請根據用戶提供的網址和需求，生成一個使用 Python 的爬蟲腳本。
        腳本需要包含必要的錯誤處理，並使用 requests 和 BeautifulSoup 函式庫。請只返回 Python 代碼，不需要其他解釋。"""
        
        user_prompt = f"網址：{url}\n需求：{prompt}\n請生成爬蟲腳本。"
        
        # 組合完整提示詞
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        
        # 調用 Ollama API
        response = requests.post(f"{server_url}/api/generate", json={
            "model": model,
            "prompt": full_prompt,
            "stream": False
        })

        if response.status_code != 200:
            raise Exception(f"Ollama 伺服器回應錯誤: {response.status_code} - {response.text}")

        # 獲取生成的腳本
        result = response.json()
        if 'response' not in result:
            raise Exception("Ollama 回應格式錯誤")
            
        script = result['response'].strip()
        
        # 檢查腳本是否為空
        if not script:
            raise Exception("生成的腳本為空")
            
        # 計算執行時間（轉換為秒）
        duration = round(time.time() - start_time, 2)
            
        # 記錄到資料庫
        try:
            conn = sqlite3.connect('scripts.db')
            c = conn.cursor()
            c.execute('''
                INSERT INTO script_records (timestamp, duration, script, url, prompt)
                VALUES (?, ?, ?, ?, ?)
            ''', (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), duration, script, url, prompt))
            conn.commit()
        except Exception as e:
            app.logger.error(f"Database error: {str(e)}")
        finally:
            if conn:
                conn.close()
        
        return script
        
    except Exception as e:
        app.logger.error(f"Ollama script generation error: {str(e)}")
        raise Exception(f"生成腳本時發生錯誤: {str(e)}")

@app.route('/api/test-ollama-connection', methods=['POST'])
def test_ollama_connection():
    try:
        data = request.get_json()
        server_url = data.get('server_url')
        
        if not server_url:
            return jsonify({
                'success': False,
                'message': '請提供伺服器網址'
            }), 400

        # 測試連線並獲取可用模型列表
        try:
            response = requests.get(f"{server_url}/api/tags")
            if response.status_code == 200:
                models = [model['name'] for model in response.json()['models']]
                return jsonify({
                    'success': True,
                    'models': models
                })
            else:
                return jsonify({
                    'success': False,
                    'message': f'伺服器回應錯誤: {response.status_code}'
                }), 400
        except requests.exceptions.RequestException as e:
            return jsonify({
                'success': False,
                'message': f'連線失敗: {str(e)}'
            }), 400

    except Exception as e:
        app.logger.error(f"Error testing Ollama connection: {str(e)}")
        return jsonify({
            'success': False,
            'message': '系統錯誤'
        }), 500

@app.route('/api/execute-script', methods=['POST'])
def execute_script():
    try:
        data = request.get_json()
        script = data.get('script')
        csv_name = data.get('csv_name')

        if not script or not csv_name:
            return jsonify({'success': False, 'message': '缺少必要參數'})

        # 確保 csv_name 有 .csv 副檔名
        if not csv_name.lower().endswith('.csv'):
            csv_name += '.csv'

        # 建立臨時目錄（如果不存在）
        temp_dir = os.path.join(app.root_path, 'temp')
        os.makedirs(temp_dir, exist_ok=True)

        # 建立臨時 Python 文件
        script_path = os.path.join(temp_dir, 'temp_script.py')
        csv_path = os.path.join(temp_dir, csv_name)

        # 添加必要的 import
        complete_script = """
import pandas as pd
import requests
from bs4 import BeautifulSoup
import os
import json
import time

""" + script + """

# 確保輸出目錄存在
os.makedirs(os.path.dirname('""" + csv_path.replace('\\', '\\\\') + """'), exist_ok=True)

# 將資料保存為 CSV
if 'df' in locals():
    df.to_csv('""" + csv_path.replace('\\', '\\\\') + """', index=False, encoding='utf-8-sig')
elif 'data' in locals():
    pd.DataFrame(data).to_csv('""" + csv_path.replace('\\', '\\\\') + """', index=False, encoding='utf-8-sig')
"""

        # 寫入腳本內容
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(complete_script)

        # 執行腳本
        result = subprocess.run(['python', script_path], 
                              capture_output=True, 
                              text=True, 
                              cwd=temp_dir)

        if result.returncode != 0:
            raise Exception(f'腳本執行錯誤: {result.stderr}')

        # 讀取生成的 CSV 文件
        if not os.path.exists(csv_path):
            raise Exception('找不到生成的 CSV 文件')

        df = pd.read_csv(csv_path, encoding='utf-8-sig')
        
        # 轉換數據為 JSON 格式
        data = df.values.tolist()
        columns = df.columns.tolist()

        return jsonify({
            'success': True,
            'data': data,
            'columns': columns,
            'message': '腳本執行成功'
        })

    except Exception as e:
        app.logger.error(f'Script execution error: {str(e)}')
        return jsonify({
            'success': False,
            'message': str(e)
        })

    finally:
        # 清理臨時文件
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except:
            pass

if __name__ == '__main__':
    init_db()
    init_prompt_db()
    app.run(debug=True)
