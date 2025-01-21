from flask import Flask, render_template, request, jsonify, send_file, Response, make_response
import os
import requests
import subprocess
import pandas as pd
import sqlite3
import json
import time
import traceback
from datetime import datetime, timedelta
from scrapegraphai.graphs import SmartScraperGraph, ScriptCreatorGraph
from dotenv import load_dotenv
from typing import List
import google.generativeai as genai
from sqlalchemy import func
from openai import OpenAI
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
import pytz
import uuid
import atexit
import re

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
    
    # 修改 schedules 表格，添加新欄位
    c.execute('''
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            script_content TEXT NOT NULL,
            schedule_time DATETIME NOT NULL,
            frequency TEXT NOT NULL,
            status TEXT DEFAULT 'stopped',
            selected_days TEXT,  -- 新增欄位，存儲 JSON 格式的選擇日期
            next_run DATETIME,   -- 新增欄位，存儲下次執行時間
            last_run DATETIME,
            result TEXT,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            file_name TEXT
        )
    ''')
    
    # 檢查是否需要添加新欄位
    c.execute("PRAGMA table_info(schedules)")
    columns = [column[1] for column in c.fetchall()]
    
    if 'selected_days' not in columns:
        c.execute('ALTER TABLE schedules ADD COLUMN selected_days TEXT')
    if 'next_run' not in columns:
        c.execute('ALTER TABLE schedules ADD COLUMN next_run DATETIME')
    
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
def get_ollama_models(server_url=None):
    """
    獲取 Ollama 可用的模型列表
    Args:
        server_url (str, optional): Ollama 伺服器網址. 如果未提供，使用環境變數或預設值
    Returns:
        List[str]: 模型名稱列表
    """
    try:
        # 如果未提供 server_url，使用環境變數或預設值
        if server_url is None:
            server_url = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
            
        # 確保 server_url 有正確的 scheme
        if not server_url.startswith(('http://', 'https://')):
            server_url = f'http://{server_url}'
        
        # 移除結尾的斜線
        server_url = server_url.rstrip('/')
        
        # 使用 urljoin 來正確拼接 URL
        tags_url = f'{server_url}/api/tags'
        
        response = requests.get(tags_url)
        response.raise_for_status()
        
        models = response.json().get('models', [])
        return [model['name'] for model in models]
    except requests.exceptions.RequestException as e:
        app.logger.error(f'Error getting Ollama models: {str(e)}')
        return []

def get_chatgpt_models():
    """Get available ChatGPT models"""
    return ["gpt-3.5-turbo", "gpt-4"]

def get_gemini_models():
    """Get available Gemini models"""
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
                    "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                },
                "embeddings": {
                    "model": "nomic-embed-text:latest",
                    "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                },
            })
        else:
            raise ValueError(f"無效的模型類型: {graph_name}")
            
        return base_config
    except Exception as e:
        app.logger.error(f"Error in get_graph_config: {str(e)}")
        raise

def run_scraper(graph_name, url, prompt, user_api_key, model_name):
    """執行智能爬取"""
    try:
        app.logger.info(f"Starting scraper with model: {graph_name} - {model_name}")
        graph_config = get_graph_config(graph_name, model_name, user_api_key)
        
        app.logger.debug(f"Graph config: {json.dumps(graph_config)}")
        
        smart_scraper_graph = SmartScraperGraph(
            prompt=prompt,
            source=url,
            config=graph_config
        )
        
        data = smart_scraper_graph.run()
        app.logger.info(f"Scraper result: {json.dumps(data)}")
        app.logger.debug(f"Data type: {type(data)}")

        def parse_data(data):
            """解析不同格式的数据"""
            try:
                # 处理字符串类型的数据
                if isinstance(data, str):
                    try:
                        data = json.loads(data)
                    except json.JSONDecodeError:
                        return [{"content": data}]

                # 处理字典类型的数据
                if isinstance(data, dict):
                    # 如果是单个项目的字典
                    if any(key in data for key in ['content', 'title', 'link', 'description']):
                        return [data]
                    # 如果包含数据列表，直接返回列表内容
                    for key in ['articles', 'items', 'results', 'data']:
                        if key in data and isinstance(data[key], list):
                            # 确保列表中的每个项目都是字典格式
                            return [
                                item if isinstance(item, dict) else {"content": str(item)}
                                for item in data[key]
                            ]
                    # 其他情况，将整个字典作为一个项目
                    return [data]

                # 如果已经是列表
                if isinstance(data, list):
                    # 确保列表中的每个项目都是字典格式
                    return [
                        item if isinstance(item, dict) else {"content": str(item)}
                        for item in data
                    ]

                # 其他类型转换为字符串
                return [{"content": str(data)}]

            except Exception as e:
                app.logger.error(f"Error parsing data: {str(e)}")
                return [{"error": str(e)}]

        def normalize_item(item):
            """标准化单个数据项"""
            try:
                if isinstance(item, str):
                    return [{"content": item.strip()}]

                if isinstance(item, dict):
                    # 检查是否有数组字段需要展开
                    array_fields = []
                    max_length = 1
                    normalized_base = {}
                    
                    # 处理每个字段
                    for key, value in item.items():
                        if value is not None:
                            if isinstance(value, list):
                                array_fields.append((key, value))
                                max_length = max(max_length, len(value))
                            else:
                                normalized_base[key] = str(value).strip()

                    # 如果没有数组字段，直接返回单个对象
                    if not array_fields:
                        return [normalized_base] if normalized_base else [{"content": str(item)}]

                    # 展开数组字段生成多行数据
                    result = []
                    for i in range(max_length):
                        row = normalized_base.copy()
                        for field, values in array_fields:
                            row[field] = str(values[i]) if i < len(values) else ""
                        result.append(row)
                    
                    return result

                return [{"content": str(item)}]

            except Exception as e:
                app.logger.error(f"Error normalizing item: {str(e)}")
                return [{"error": str(e)}]

        # 处理数据
        processed_data = parse_data(data)
        
        # 标准化所有数据项并展平结果
        normalized_data = []
        for item in processed_data:
            normalized_items = normalize_item(item)
            normalized_data.extend(normalized_items)

        # 去重
        final_data = []
        seen = set()
        for item in normalized_data:
            # 创建唯一标识
            item_values = tuple(sorted([
                (k, v) for k, v in item.items()
                if v is not None and str(v).strip()
            ]))
            
            if item_values not in seen:
                seen.add(item_values)
                final_data.append(item)

        app.logger.debug(f"Final processed data: {json.dumps(final_data)}")
        return final_data

    except Exception as e:
        app.logger.error(f"Error in run_scraper: {str(e)}")
        raise

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
    alert = {
        'type': 'info',
        'icon': 'fas fa-info-circle',
        'title': '使用說明',
        'message': '在這裡您可以查看所有已生成的腳本紀錄，包括腳本內容、執行時間、執行結果等。'
    }
    return render_template('script_records.html', breadcrumb_title='腳本生成紀錄', alert=alert)


@app.route('/knowledge_base_manage')
def knowledge_base_manage():
    """知識庫管理頁面路由"""
    return render_template('knowledge_base_manage.html', breadcrumb_title='知識庫管理')

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

@app.route('/api/models/<model_type>')
def get_models(model_type):
    """Get available models based on model type"""
    try:
        if model_type == 'chatgpt':
            models = get_chatgpt_models()
        elif model_type == 'gemini':
            models = get_gemini_models()
        elif model_type == 'ollama':
            # 直接呼叫 get_ollama_models，使用預設的 server_url
            models = get_ollama_models()
        else:
            return jsonify([])
            
        return jsonify(models)
    except Exception as e:
        app.logger.error(f"Error getting {model_type} models: {str(e)}")
        return jsonify([])

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
        data = request.get_json()
        
        # 確保檔案名稱有 .csv 副檔名
        file_name = data.get('file_name', 'output.csv')
        if not file_name.lower().endswith('.csv'):
            file_name += '.csv'
        
        # 根據不同的模型類型處理參數
        graph_name = data['graph_name']
        api_key = None
        
        if graph_name == 'ollama':
            os.environ['OLLAMA_BASE_URL'] = data.get('ollama_server', 'http://localhost:11434')
        else:
            # ChatGPT 和 Gemini 需要 API Key
            api_key = data.get('api_key')
            if not api_key:
                return jsonify({
                    'success': False,
                    'error': 'API Key is required for ChatGPT and Gemini'
                }), 400
        
        raw_result = run_scraper(
            graph_name,
            data['url'],
            data['prompt'],
            api_key,
            data['model_name']
        )

        # 確保 downloads 目錄存在
        downloads_dir = os.path.join(app.static_folder, 'downloads')
        os.makedirs(downloads_dir, exist_ok=True)
        
        # 保存為 CSV 文件
        if raw_result:
            csv_path = os.path.join(downloads_dir, file_name)
            df = pd.DataFrame(raw_result)
            df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        
        # 返回結構化的 JSON 給前端
        return jsonify({
            'success': True,
            'data': raw_result,
            'file_name': file_name
        })
    except Exception as e:
        app.logger.error(f"Scrape error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': str(e)
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
        name = data.get('name')
        category = data.get('category')
        content = data.get('content')
        sort_order = data.get('sort_order', 1)
        status = data.get('status', True)  # 預設為啟用
        
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        try:
            c.execute('''
                INSERT INTO prompts (name, category, content, sort_order, status)
                VALUES (?, ?, ?, ?, ?)
            ''', (name, category, content, sort_order, status))
            conn.commit()
            
            return jsonify({
                'success': True,
                'message': '新增成功'
            })
        finally:
            c.close()
            conn.close()
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

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

@app.route('/api/prompts/<int:id>/status', methods=['PUT'])
def update_prompt_status(id):
    try:
        data = request.get_json()
        status = data.get('status', False)
        
         
        conn = sqlite3.connect('database.db')
        cursor = conn.cursor()
        try:
            # 直接更新指定提示詞的狀態
            cursor.execute('''
                UPDATE prompts 
                SET status = ? 
                WHERE id = ?
            ''', (status, id))
            conn.commit()
            
            return jsonify({
                'success': True,
                'message': '狀態更新成功'
            })
        finally:
            cursor.close()
            conn.close()
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

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
        system_prompt = """你是一位專業的 Python 爬蟲工程師，請根據以下需求生成一個完整的爬蟲腳本：

## 任務目標
生成一個針對 Google 搜尋結果頁面的爬蟲腳本，使用 Selenium 模擬真實瀏覽器行為

## 技術要求
- 使用 Python 3.x
- 使用 selenium 和 webdriver_manager
- 使用顯式等待（explicit wait）確保元素載入
- 所有爬取的資料需存放在 articles 陣列中
- 包含完整的錯誤處理機制

## 必要功能
1. Selenium WebDriver 設定與初始化
2. 元素等待機制實現
3. 瀏覽器行為模擬（捲動、點擊等）
4. 完整的異常處理機制
   - WebDriver 異常處理
   - 元素定位失敗處理
   - 網路超時處理
   - 資料解析異常處理

## 程式碼規範
- 設置默認編碼
- 實作隨機延遲機制
- 加入詳細的註解說明
- 符合 PEP 8 規範
- 使用 try-except 確保穩定性

## 環境設定要求
- 需包含所有必要的 import 語句
- 需說明必要的套件安裝指令
- 需包含 WebDriver 管理相關設定

## 資料處理要求
- 將所有爬取的資料存入 articles 陣列
- 每筆資料需包含：
  - 標題
  - 網址
  - 摘要描述
  - 爬取時間戳記
- 實作資料清理和格式化功能

## 輸出格式範例
```python
# 搜尋結果元素定位
search_results = driver.find_elements(By.CSS_SELECTOR, "div.g")

# 儲存結果的陣列
articles = []

# 遍歷搜尋結果
for result in search_results:
    try:
        # 取得標題
        title = result.find_element(By.CSS_SELECTOR, "h3").text
        
        # 取得連結
        link = result.find_element(By.CSS_SELECTOR, "a").get_attribute("href")
        
        # 取得摘要
        snippet = result.find_element(By.CSS_SELECTOR, "div.VwiC3b").text
        
        # 加入陣列
        articles.append({
            "title": title,
            "url": link,
            "snippet": snippet,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        
    except Exception as e:
        print(f"解析錯誤: {str(e)}")
        continue
```

## 額外注意事項
- 使用 WebDriverWait 進行元素等待
- 加入隨機延遲避免被封鎖
- 處理彈出視窗和 Cookie 提示
- 確保程式可以持續運行而不會中斷

"""
        
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
        
        print(f"Testing connection to Ollama server: {server_url}")
        
        if not server_url:
            return jsonify({'success': False, 'error': '請提供伺服器網址'})

        server_url = server_url.rstrip('/')
        
        print(f"Sending request to: {server_url}/api/tags")
        response = requests.get(f'{server_url}/api/tags')
        print(f"Response status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Response data: {result}")
            models = result.get('models', [])
            model_names = []
            
            # 定义需要排除的关键词
            excluded_keywords = ['embed', 'nomic', 'text-embedding']

            for model in models:
                if isinstance(model, dict):
                    model_name = model.get('name', '').strip()  # 清理名稱
                else:
                    model_name = str(model).strip()
                
                print(f"Checking model: {model_name}")  # 調試輸出模型名稱
                
                should_exclude = any(keyword in model_name.lower() for keyword in excluded_keywords)
                
                if model_name and not should_exclude:
                    model_names.append(model_name)
            
            if not model_names:
                return jsonify({
                    'success': False,
                    'error': '未找到可用的模型'
                })
                
            print(f"Available models: {model_names}")
            return jsonify({
                'success': True,
                'models': sorted(model_names)  # 排序模型列表
            })
        else:
            error_msg = f'連線失敗: {response.status_code}'
            print(f"Error: {error_msg}")
            return jsonify({
                'success': False,
                'error': error_msg
            })
            
    except requests.exceptions.RequestException as e:
        error_msg = f'連線失敗: {str(e)}'
        print(f"Request Exception: {error_msg}")
        return jsonify({
            'success': False,
            'error': error_msg
        })
    except Exception as e:
        error_msg = f'發生錯誤: {str(e)}'
        print(f"General Exception: {error_msg}")
        return jsonify({
            'success': False,
            'error': error_msg
        })

@app.route('/api/execute-script', methods=['POST'])
def execute_script():
    try:
        data = request.get_json()
        if not data or 'script' not in data or 'csv_name' not in data:
            return jsonify({
                'success': False,
                'error': '缺少必要參數'
            }), 400
            
        script = data['script']
        csv_name = data['csv_name']
        
        # 驗證腳本
        def is_valid_python_script(script):
            """
            驗證腳本是否為有效的 Python 代碼，並進行語法和安全性檢查
            """
            import ast
            import tokenize
            from io import StringIO
            
            # 檢查是否為空
            if not script or not script.strip():
                return False, "腳本內容不能為空"
                
            # 基本語法檢查
            try:
                # 檢查是否有語法錯誤
                compile(script, '<string>', 'exec')
            except SyntaxError as e:
                line_no = e.lineno if hasattr(e, 'lineno') else '未知'
                col_no = e.offset if hasattr(e, 'offset') else '未知'
                error_msg = str(e).split('\n')[0] if str(e) else '語法錯誤'
                return False, f"Python 語法錯誤 (第 {line_no} 行，第 {col_no} 列): {error_msg}"
            except Exception as e:
                return False, f"Python 代碼錯誤: {str(e)}"
                
            # 詳細的語法分析
            try:
                ast.parse(script)
            except Exception as e:
                return False, f"Python 語法分析錯誤: {str(e)}"
                
            # 檢查是否包含危險的內容
            dangerous_keywords = [
                'exec', 'eval', 'os.system', 'subprocess.call', 
                'subprocess.run', 'subprocess.Popen', '__import__',
                'open', 'file', 'execfile', 'compile', 'input',
                'os.remove', 'os.unlink', 'shutil.rmtree', 'sys.exit',
                'os.chmod', 'os.chown', 'os.rename', 'os.renames',
                'socket', 'urllib'
            ]
            
            # 檢查每個關鍵字
            for keyword in dangerous_keywords:
                if keyword in script:
                    return False, f"腳本包含不允許的關鍵字: {keyword}"
                    
            # 檢查是否只包含基本的 Python 語法
            try:
                tree = ast.parse(script)
                for node in ast.walk(tree):
                    # 檢查是否使用了不允許的語句類型
                    if isinstance(node, (ast.Import, ast.ImportFrom)):
                        module = node.names[0].name
                        allowed_modules = {'requests','pandas', 'numpy', 'bs4','BeautifulSoup','csv','time', 'datetime', 'json', 're','webdriver','os','selenium','By','WebDriverWait','EC','ChromeDriverManager','TimeoutException','WebDriverException','Options','random','expected_conditions'}
                        if module.split('.')[0] not in allowed_modules:
                            return False, f"不允許導入模組: {module}"
                            
                    # 檢查是否使用了危險的函數調用
                    elif isinstance(node, ast.Call):
                        if isinstance(node.func, ast.Name):
                            func_name = node.func.id
                            if func_name in ['eval', 'exec', 'compile']:
                                return False, f"不允許使用函數: {func_name}"
                                
            except Exception as e:
                return False, f"腳本分析錯誤: {str(e)}"
                
            return True, ""

        is_valid, error_message = is_valid_python_script(script)
        if not is_valid:
            return jsonify({
                'success': False,
                'error': error_message
            }), 400
            
        # 確保 CSV 檔名不包含副檔名
        csv_name = csv_name.replace('.csv', '')
        
        # 獲取當前腳本的目錄
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # 建立臨時腳本文件
        script_filename = os.path.join(current_dir, f'temp_script_{int(time.time())}.py')
        
        # 在腳本中添加必要的 import
        script_with_imports = """# -*- coding: utf-8 -*-
import pandas as pd
import numpy as np
import requests
from bs4 import BeautifulSoup
import time
import os
import sys
import json

# 設置默認編碼
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

""" + script + """

# 保存數據到 CSV
if 'articles' in locals():
    try:
        if not articles:
            print('未找到任何文章數據')
            sys.exit(1)
            
        if not isinstance(articles, list):
            print('articles 不是有效的列表格式')
            sys.exit(1)
            
        # 將列表轉換為 DataFrame
        df = pd.DataFrame(articles)
        
        if df.empty:
            print('DataFrame 為空，無法保存')
            sys.exit(1)
            
        # 清理數據
        cleaned_data = []
        for _, row in df.iterrows():
            cleaned_row = {}
            for col in df.columns:
                value = row[col]
                if pd.isna(value):
                    cleaned_row[col] = None
                elif isinstance(value, (np.int64, np.int32)):
                    cleaned_row[col] = int(value)
                elif isinstance(value, (np.float64, np.float32)):
                    cleaned_row[col] = float(value)
                else:
                    cleaned_row[col] = str(value)
            cleaned_data.append(cleaned_row)
            
        # 獲取腳本所在目錄
        current_dir = os.path.dirname(os.path.abspath(__file__))
            
        # 保存 CSV
        csv_filename = '""" + csv_name + """.csv'
        csv_path = os.path.join(current_dir, csv_filename)
        
        # 將清理後的數據轉換回 DataFrame
        cleaned_df = pd.DataFrame(cleaned_data)
        cleaned_df.to_csv(csv_path, index=False, encoding='utf-8')
        
        print(f'成功保存 CSV 到：{csv_path}')
        print(f'CSV 欄位：{", ".join(cleaned_df.columns)}')
        print(f'數據條數：{len(cleaned_df)}')
        
        # 驗證文件是否存在
        if not os.path.exists(csv_path):
            print(f'CSV 文件未成功創建：{csv_path}')
            sys.exit(1)
            
        # 嘗試讀取文件以驗證
        try:
            test_df = pd.read_csv(csv_path, encoding='utf-8')
            print(f'CSV 文件驗證成功，包含 {len(test_df)} 條數據')
        except Exception as e:
            print(f'CSV 文件驗證失敗：{str(e)}')
            sys.exit(1)
            
    except Exception as e:
        print(f'保存 CSV 時發生錯誤: {str(e)}')
        sys.exit(1)
else:
    print('未找到 articles 變量')
    sys.exit(1)
"""

        print(f"Executing script with filename: {script_filename}")
        
        # 使用 utf-8 編碼寫入腳本
        with open(script_filename, 'w', encoding='utf-8') as f:
            f.write(script_with_imports)

        try:
            # 設置環境變量
            env = os.environ.copy()
            env.update({
                "PYTHONIOENCODING": "utf-8",
                "PYTHONLEGACYWINDOWSSTDIO": "utf-8",
                "PYTHONPATH": current_dir
            })
            
            # 設定執行超時時間為 60 秒
            result = subprocess.run(
                ['python', '-X', 'utf8', script_filename],
                capture_output=True,
                text=True,
                timeout=60,
                encoding='utf-8',
                env=env,
                cwd=current_dir  # 設置工作目錄
            )

            print(f"Script output: {result.stdout}")
            print(f"Script errors: {result.stderr}")

            if result.returncode != 0:
                error_msg = result.stderr if result.stderr else result.stdout
                if "未找到任何文章數據" in error_msg:
                    error_msg = "未找到任何文章數據，請確認網頁結構是否正確"
                elif "articles 不是有效的列表格式" in error_msg:
                    error_msg = "爬取的數據格式不正確，請確認返回的是文章列表"
                elif "DataFrame 為空" in error_msg:
                    error_msg = "爬取的數據為空，請確認是否成功獲取文章"
                elif "NoneType" in error_msg and "text" in error_msg:
                    error_msg = "網頁元素未找到，請確認網頁結構是否符合預期"
                elif "NameResolutionError" in error_msg or "getaddrinfo failed" in error_msg:
                    error_msg = "無法連接到目標網站，請檢查:\n1. 網路連接是否正常\n2. DNS 設置是否正確\n3. 目標網站是否可以正常訪問"
                elif "ConnectionError" in error_msg:
                    error_msg = "連接到網站時發生錯誤，請檢查:\n1. 網路連接是否正常\n2. 網站是否可以正常訪問\n3. 是否需要使用代理伺服器"
                raise Exception(f"腳本執行錯誤: {error_msg}")
            
            # 檢查 CSV 文件是否生成
            csv_filename = f"{csv_name}.csv"
            csv_path = os.path.join(current_dir, csv_filename)
            print(f"Checking for CSV file: {csv_path}")
            
            if not os.path.exists(csv_path):
                print(f"CSV file not found at: {csv_path}")
                raise Exception("未找到有效的文章數據，請確保爬取到的數據格式正確")

            # 讀取 CSV 文件
            print(f"Reading CSV file: {csv_path}")
            df = pd.read_csv(csv_path, encoding='utf-8')
            
            if df.empty:
                raise Exception("未找到有效的文章數據")
            
            # 轉換數據為 JSON 格式，處理特殊值
            records = []
            for _, row in df.iterrows():
                record = {}
                for col in df.columns:
                    value = row[col]
                    if pd.isna(value):
                        record[col] = None
                    else:
                        record[col] = str(value)
                records.append(record)

            # 清理臨時文件
            if os.path.exists(script_filename):
                os.remove(script_filename)
            if os.path.exists(csv_path):
                os.remove(csv_path)

            return jsonify({
                'success': True,
                'data': records,
                'columns': df.columns.tolist()
            })

        except subprocess.TimeoutExpired:
            if os.path.exists(script_filename):
                os.remove(script_filename)
            return jsonify({
                'success': False,
                'error': '腳本執行超時'
            }), 408

        except Exception as e:
            if os.path.exists(script_filename):
                os.remove(script_filename)
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'請求處理錯誤: {str(e)}'
        }), 500

@app.route('/knowledge-base')
def knowledge_base():
    return render_template('knowledge_base.html')

@app.route('/api/knowledge-base/list')
def list_knowledge_base():
    try:
        # 這裡應該從數據庫或文件系統中獲取知識庫文件列表
        # 這是一個示例響應
        files = [
            {
                'id': '1',
                'filename': 'example.csv',
                'uploadTime': '2025-01-14T15:30:00',
                'size': 1024,
                'status': 'uploaded'
            }
        ]
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/knowledge-base/delete', methods=['POST'])
def delete_knowledge_base():
    try:
        data = request.get_json()
        file_ids = data.get('ids', [])
        
        # 這裡應該實現實際的文件刪除邏輯
        # 從數據庫和文件系統中刪除文件
        
        return jsonify({'message': 'Files deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/prompts/system', methods=['GET'])
def get_system_prompt():
    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        
        # 獲取聊天智能客服分類中最新的啟用提示詞
        c.execute('''
            SELECT content 
            FROM prompts 
            WHERE category = 'chat' 
            AND status = 1 
            ORDER BY created_at DESC 
            LIMIT 1
        ''')
        
        result = c.fetchone()
        print(result)
        
        # 添加緩存控制頭
        response = make_response(jsonify({
            'success': True,
            'content': result[0] if result else ''
        }))
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/config/chat')
def get_chat_config():
    try:
        return jsonify({
            'LANGFLOW_API_URL': os.getenv('LANGFLOW_API_URL'),
            'LANGFLOW_API_TOKEN': os.getenv('LANGFLOW_API_TOKEN'),
            'LANGFLOW_API_KEY': os.getenv('LANGFLOW_API_KEY'),
            'OPENAI_API_KEY': os.getenv('OPENAI_API_KEY')
        })
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

# 初始化排程器
scheduler = BackgroundScheduler(timezone=pytz.timezone('Asia/Taipei'))
scheduler.start()

# 在應用關閉時關閉排程器
atexit.register(lambda: scheduler.shutdown())

# API 路由
@app.route('/api/schedules', methods=['GET'])
def get_schedules():
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('''
            SELECT id, name, type, script_content, schedule_time, frequency, 
                   status, selected_days, next_run, last_run, result, error_message,
                   created_at, file_name
            FROM schedules
            ORDER BY created_at DESC
        ''')
        rows = c.fetchall()
        
        schedules = []
        for row in rows:
            schedule_time = row[4]
            try:
                # 先移除所有現有的描述文字
                clean_time = re.sub(r'\([^)]*\)', '', schedule_time).strip()
                print("清理後的時間:", clean_time)
                
                # 統一時間格式處理
                if ':' in clean_time:
                    # 如果包含完整日期
                    if re.search(r'\d{4}[-/]\d{2}[-/]\d{2}', clean_time):
                        date_match = re.search(r'(\d{4}[-/]\d{2}[-/]\d{2})', clean_time)
                        time_match = re.search(r'(\d{2}:\d{2}(?::\d{2})?)', clean_time)
                        
                        if date_match and time_match:
                            date_str = date_match.group(1).replace('/', '-')
                            time_str = time_match.group(1)
                            if time_str.count(':') == 1:
                                time_str += ':00'
                            formatted_time = f"{date_str} {time_str}"
                        else:
                            formatted_time = schedule_time
                    else:
                        time_str = re.search(r'(\d{2}:\d{2})', clean_time).group(1)
                        today = datetime.now().strftime('%Y-%m-%d')
                        formatted_time = f"{today} {time_str}:00"
                else:
                    formatted_time = schedule_time

                # 根據頻率類型添加描述
                if row[5] == 'once':
                    formatted_time = f"{formatted_time} (單次執行)"
                elif row[5] == 'daily':
                    formatted_time = f"{formatted_time} (每日執行)"
                elif row[5] == 'weekly' and row[7]:
                    weekday_names = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
                    selected_days = json.loads(row[7]) if row[7] else []
                    weekdays = [weekday_names[day] for day in selected_days]
                    formatted_time = f"{formatted_time} (每{','.join(weekdays)}執行)"
                elif row[5] == 'monthly' and row[7]:
                    selected_days = json.loads(row[7]) if row[7] else []
                    days = [str(day) for day in selected_days]
                    formatted_time = f"{formatted_time} (每月{','.join(days)}日執行)"

            except Exception as e:
                print(f"Error formatting time: {e}, original time: {schedule_time}")
                formatted_time = schedule_time

            try:
                schedule = {
                    'id': row[0],
                    'name': row[1],
                    'type': row[2],
                    'script_content': row[3],
                    'schedule_time': formatted_time,
                    'frequency': row[5],
                    'status': row[6],
                    'selected_days': json.loads(row[7]) if row[7] and row[7].strip() else [],
                    'next_run': row[8],
                    'last_run': row[9],
                    'result': row[10],
                    'error_message': row[11],
                    'created_at': row[12],
                    'file_name': row[13] if len(row) > 13 else None
                }
                schedules.append(schedule)
            except Exception as e:
                print(f"Error processing row: {e}, row data: {row}")
                continue
            
        return jsonify(schedules)
        
    except Exception as e:
        print(f"Error fetching schedules: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/schedules', methods=['POST'])
def create_schedule():
    try:
        data = request.get_json()
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        
        try:
            # 驗證必要欄位
            required_fields = ['name', 'type', 'frequency', 'schedule_time']
            for field in required_fields:
                if field not in data:
                    return jsonify({'error': f'缺少必要欄位: {field}'}), 400

            # 檢查腳本來源和內容
            script_source = data.get('script_source')
            script_content = data.get('script_content', '')
            file_name = data.get('file_name')

            if script_source == 'file':
                if not file_name or not script_content:
                    return jsonify({'error': '請上傳腳本檔案'}), 400
            elif script_source == 'text':
                if not script_content.strip():
                    return jsonify({'error': '請輸入腳本內容'}), 400
                file_name = None
            else:
                return jsonify({'error': '無效的腳本來源'}), 400

            # 獲取選擇的執行日期（如果有）
            selected_days = data.get('selected_days', [])
            frequency = data['frequency']
            
            # 其他驗證邏輯保持不變...
            if frequency == 'weekly' and not selected_days:
                return jsonify({'error': '每週執行必須選擇執行日期'}), 400
            elif frequency == 'monthly' and not selected_days:
                return jsonify({'error': '每月執行必須選擇執行日期'}), 400

            next_run = calculate_next_run(frequency, data['schedule_time'], selected_days)
            selected_days_json = json.dumps(selected_days)

            c.execute('''
                INSERT INTO schedules 
                (name, type, script_content, schedule_time, frequency, status, 
                 selected_days, next_run, created_at, file_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data['name'],
                data['type'],
                script_content,
                data['schedule_time'],
                frequency,
                'pending',
                selected_days_json,
                next_run,
                datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                file_name
            ))
            
            schedule_id = c.lastrowid
            conn.commit()

            add_schedule_job(schedule_id, frequency, data['schedule_time'], selected_days)
            return jsonify({'message': '排程創建成功', 'id': schedule_id}), 201
            
        except Exception as e:
            conn.rollback()
            raise e
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

def calculate_next_run(frequency, schedule_time, selected_days=None):
    """計算下次執行時間"""
    try:
        print(f"Calculating next run for: frequency={frequency}, time={schedule_time}, days={selected_days}")
        now = datetime.now()
        
        if frequency == 'once':
            try:
                # 確保時間格式正確
                return datetime.strptime(schedule_time, '%Y-%m-%d %H:%M').strftime('%Y-%m-%d %H:%M:%S')
            except ValueError as e:
                print(f"Error parsing once schedule time: {e}")
                return None
        
        # 解析時間
        try:
            if ':' not in schedule_time:
                raise ValueError('無效的時間格式')
            
            time_parts = schedule_time.split(':')
            hour = int(time_parts[0])
            minute = int(time_parts[1])
            
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError('無效的時間值')
                
            # 創建當天的目標時間
            target_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                
        except (ValueError, IndexError) as e:
            print(f"Error parsing time parts: {e}")
            raise ValueError('無效的時間格式')
        
        if frequency == 'daily':
            next_run = target_time
            if next_run <= now:
                next_run += timedelta(days=1)
                
        elif frequency == 'weekly':
            if not selected_days:
                raise ValueError('未選擇執行日期')
            
            # 找到下一個符合的週幾
            current_weekday = now.weekday()
            days_ahead = 7
            for day in selected_days:
                days_until = (day - current_weekday) % 7
                if days_until < days_ahead and (days_until > 0 or (days_until == 0 and now < target_time)):
                    days_ahead = days_until
            
            next_run = target_time + timedelta(days=days_ahead)
            
        elif frequency == 'monthly':
            if not selected_days:
                raise ValueError('未選擇執行日期')
            
            # 找到下一個符合的日期
            current_day = now.day
            next_month = now
            if now >= target_time:
                next_month = (now + timedelta(days=32)).replace(day=1)
            
            valid_days = sorted(selected_days)
            next_day = None
            for day in valid_days:
                if day > current_day or (day == current_day and now < target_time):
                    next_day = day
                    break
            
            if next_day is None:
                next_day = valid_days[0]
                next_month = (now + timedelta(days=32)).replace(day=1)
            
            try:
                next_run = next_month.replace(day=next_day, hour=hour, minute=minute, second=0, microsecond=0)
            except ValueError:
                # 處理無效日期（如2月30日）
                next_month = (next_month + timedelta(days=32)).replace(day=1)
                next_run = next_month.replace(day=valid_days[0], hour=hour, minute=minute, second=0, microsecond=0)
        
        return next_run.strftime('%Y-%m-%d %H:%M:%S')
        
    except Exception as e:
        print(f"Error calculating next run: {e}")
        return None

@app.route('/api/schedules/<int:schedule_id>', methods=['PUT'])
def save_schedule(schedule_id=None):
    try:
        data = request.get_json()
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        
        try:
            # 獲取選擇的執行日期
            selected_days = data.get('selected_days', [])
            
            # 計算下次執行時間
            next_run = calculate_next_run(
                data['frequency'],
                data['schedule_time'],
                selected_days
            )

            # 將 selected_days 轉換為 JSON 字符串
            selected_days_json = json.dumps(selected_days)

            if schedule_id:  # 更新現有排程
                # 如果沒有特別指定狀態，則設為 pending
                status = data.get('status', 'pending')
                
                c.execute('''
                    UPDATE schedules 
                    SET name = ?, type = ?, script_content = ?, 
                        schedule_time = ?, frequency = ?, status = ?,
                        selected_days = ?, next_run = ?
                    WHERE id = ?
                ''', (
                    data['name'], data['type'], data['script_content'],
                    data['schedule_time'], data['frequency'], 
                    status,
                    selected_days_json, next_run,
                    schedule_id
                ))
            else:  # 新增排程
                c.execute('''
                    INSERT INTO schedules 
                    (name, type, script_content, schedule_time, frequency, 
                     status, selected_days, next_run)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    data['name'], data['type'], data['script_content'],
                    data['schedule_time'], data['frequency'], 'pending',
                    selected_days_json, next_run
                ))

            conn.commit()
            return jsonify({'message': '保存成功'}), 200

        except Exception as e:
            conn.rollback()
            raise e
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/schedules/<int:schedule_id>', methods=['GET'])
def get_schedule(schedule_id):
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('''
            SELECT id, name, type, script_content, schedule_time, frequency, 
                   status, created_at, last_run, result, error_message, selected_days,
                   file_name
            FROM schedules 
            WHERE id = ?
        ''', (schedule_id,))
        row = c.fetchone()
        
        if row:
            schedule = {
                'id': row[0],
                'name': row[1],
                'type': row[2],
                'script_content': row[3],
                'schedule_time': row[4],
                'frequency': row[5],
                'status': row[6],
                'created_at': row[7],
                'last_run': row[8],
                'result': row[9],
                'error_message': row[10],
                'selected_days': json.loads(row[11]) if row[11] else [],  # 解析 JSON 字符串
                'file_name': row[12]  # 添加 file_name 字段
            }
            return jsonify(schedule)
        else:
            return jsonify({'error': 'Schedule not found'}), 404
            
    except Exception as e:
        print(f"Error fetching schedule: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/schedules/<int:id>', methods=['PUT'])
def update_schedule(id):
    try:
        data = request.get_json()
        name = data['name']
        type = data['type']
        script_content = data['script_content']
        schedule_time = datetime.fromisoformat(data['schedule_time'].replace('Z', '+00:00'))
        frequency = data['frequency']
        file_name = data.get('file_name', '')  # 獲取檔案名稱，預設為空字串
        
        # 轉換為台灣時間
        tw = pytz.timezone('Asia/Taipei')
        schedule_time = schedule_time.astimezone(tw)
        
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        c.execute('''
            UPDATE schedules 
            SET name = ?, type = ?, script_content = ?, 
                schedule_time = ?, frequency = ?, file_name = ?
            WHERE id = ?
        ''', (name, type, script_content, schedule_time, frequency, file_name, id))
        conn.commit()
        
        # 更新排程器
        job_id = f'schedule_{id}'
        if job_id in scheduler:
            scheduler.remove_job(job_id)
            
        if frequency == 'once':
            scheduler.add_job(
                execute_script,
                'date',
                run_date=schedule_time,
                args=[id, type, script_content],
                id=job_id
            )
        else:
            trigger = {
                'daily': {'trigger': 'cron', 'hour': schedule_time.hour, 'minute': schedule_time.minute},
                'weekly': {'trigger': 'cron', 'day_of_week': schedule_time.weekday(), 'hour': schedule_time.hour, 'minute': schedule_time.minute},
                'monthly': {'trigger': 'cron', 'day': schedule_time.day, 'hour': schedule_time.hour, 'minute': schedule_time.minute}
            }[frequency]
            
            scheduler.add_job(
                execute_script,
                **trigger,
                args=[id, type, script_content],
                id=job_id
            )
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/schedules/<int:id>', methods=['DELETE'])
def delete_schedule(id):
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        
        # 先檢查排程是否存在
        c.execute('SELECT status FROM schedules WHERE id = ?', (id,))
        schedule = c.fetchone()
        if not schedule:
            return jsonify({'error': '找不到排程'}), 404

        # 刪除資料庫中的排程
        c.execute('DELETE FROM schedules WHERE id = ?', (id,))
        conn.commit()
        
        # 嘗試從排程器中移除任務
        try:
            job_id = f'schedule_{id}'
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
        except Exception as e:
            print(f"Warning: Could not remove job from scheduler: {e}")
            # 繼續執行，因為資料庫記錄已經刪除
        
        return jsonify({'success': True, 'message': '排程已刪除'})
    
    except Exception as e:
        print(f"Error deleting schedule: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

# 添加台灣時區設定
tw_tz = pytz.timezone('Asia/Taipei')

# 修改執行日誌記錄部分
def execute_script(schedule_id, script_type, script_content):
    """執行排程腳本"""
    db_conn = None  # 改名以避免與其他 conn 混淆
    try:
        execution_start = time.time()  # 改名以更清楚表達用途
        db_conn = sqlite3.connect('scripts.db')
        cursor = db_conn.cursor()
        
        # 取得台灣時間
        tw_tz = pytz.timezone('Asia/Taipei')
        current_time = datetime.now(tw_tz)
        time_str = current_time.strftime('%Y-%m-%d %H:%M:%S')
        
        try:
            # 更新排程狀態為執行中
            cursor.execute('''
                UPDATE schedules 
                SET status = 'active', last_run = ?
                WHERE id = ?
            ''', (time_str, schedule_id))
            
            # 記錄開始執行的日誌
            cursor.execute('''
                INSERT INTO schedule_logs (schedule_id, execution_time, status, content)
                VALUES (?, ?, 'active', ?)
            ''', (schedule_id, time_str, "開始執行排程任務"))
            
            log_id = cursor.lastrowid
            db_conn.commit()
            
            # 創建臨時腳本文件
            script_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
            if not os.path.exists(script_dir):
                os.makedirs(script_dir)
            
            temp_script = os.path.join(script_dir, f'temp_script_{schedule_id}.py')
            
            # 確保輸出目錄存在
            output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
            
            # 修改腳本內容
            modified_script = f"""
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')
{script_content}
"""
            
            with open(temp_script, 'w', encoding='utf-8-sig') as f:
                f.write(modified_script)
            
            try:
                # 執行腳本
                process = subprocess.Popen(
                    ['python', temp_script],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    cwd=script_dir
                )
                stdout, stderr = process.communicate()
                
                if process.returncode == 0:
                    # 執行成功
                    duration = time.time() - execution_start
                    end_time = datetime.now(tw_tz)
                    end_time_str = end_time.strftime('%Y-%m-%d %H:%M:%S')
                    
                    # 更新日誌
                    cursor.execute('''
                        UPDATE schedule_logs 
                        SET status = 'success', duration = ?, error_message = NULL,
                            execution_time = ?, content = ?
                        WHERE id = ?
                    ''', (duration, end_time_str, "排程任務執行成功", log_id))
                    
                    # 更新排程狀態
                    cursor.execute('''
                        UPDATE schedules 
                        SET status = 'completed', result = ?, error_message = NULL
                        WHERE id = ?
                    ''', (stdout.strip(), schedule_id))
                else:
                    error_msg = stderr.strip() if stderr else "未知錯誤"
                    raise Exception(error_msg)
                    
            except Exception as e:
                error = str(e)
                duration = time.time() - execution_start
                end_time = datetime.now(tw_tz)
                end_time_str = end_time.strftime('%Y-%m-%d %H:%M:%S')
                
                error_message = f"執行失敗: {error}"
                cursor.execute('''
                    UPDATE schedule_logs 
                    SET status = 'failed', duration = ?, error_message = ?,
                        execution_time = ?, content = ?
                    WHERE id = ?
                ''', (duration, error_message, end_time_str, "排程任務執行失敗", log_id))
                
                cursor.execute('''
                    UPDATE schedules 
                    SET status = 'failed', error_message = ?
                    WHERE id = ?
                ''', (error_message, schedule_id))
                
            finally:
                if os.path.exists(temp_script):
                    os.remove(temp_script)
                    
            db_conn.commit()
            
        except Exception as e:
            print(f"Database error: {e}")
            if db_conn:
                db_conn.rollback()
            raise
            
    except Exception as e:
        print(f"Error executing script: {e}")
        if db_conn:
            try:
                error_time = datetime.now(tw_tz).strftime('%Y-%m-%d %H:%M:%S')
                cursor.execute('''
                    UPDATE schedules 
                    SET status = 'failed', error_message = ?, last_run = ?
                    WHERE id = ?
                ''', (str(e), error_time, schedule_id))
                db_conn.commit()
            except Exception as inner_e:
                print(f"Error updating error status: {inner_e}")
    finally:
        if db_conn:
            db_conn.close()

@app.route('/api/validate_python', methods=['POST'])
def validate_python():
    try:
        data = request.get_json()
        script = data.get('script', '')
        
        # 使用 ast.parse 進行語法檢查
        import ast
        ast.parse(script)
        
        return jsonify({'success': True})
    except SyntaxError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# 添加 SSE 端點
@app.route('/api/sse')
def sse():
    def generate():
        while True:
            # 檢查是否有需要重新整理的信號
            yield 'data: {"reload": false}\n\n'
            time.sleep(1)
    
    return Response(generate(), mimetype='text/event-stream')

# 添加停止排程的端點
@app.route('/api/schedules/<int:schedule_id>/stop', methods=['POST'])
def stop_schedule(schedule_id):
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        
        # 檢查排程是否存在
        c.execute('SELECT status FROM schedules WHERE id = ?', (schedule_id,))
        schedule = c.fetchone()
        if not schedule:
            return jsonify({'error': '找不到排程'}), 404

        # 更新排程狀態為已停止
        now = datetime.now(pytz.timezone('Asia/Taipei'))
        c.execute('''
            UPDATE schedules 
            SET status = 'stopped', 
                last_run = ?,
                result = '手動停止'
            WHERE id = ?
        ''', (now, schedule_id))
        
        conn.commit()

        # 嘗試從排程器中移除任務
        try:
            job_id = f'schedule_{schedule_id}'
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)
        except Exception as e:
            print(f"Warning: Could not remove job from scheduler: {e}")

        return jsonify({'success': True, 'message': '排程已停止', 'status': 'stopped'})

    except Exception as e:
        print(f"Error stopping schedule: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/schedules/<int:schedule_id>/restart', methods=['POST'])
def restart_schedule(schedule_id):
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        
        # 檢查排程是否存在
        c.execute('SELECT type, script_content FROM schedules WHERE id = ?', (schedule_id,))
        schedule = c.fetchone()
        if not schedule:
            return jsonify({'error': '找不到排程'}), 404

        # 只更新排程狀態為執行中，不執行腳本
        now = datetime.now(pytz.timezone('Asia/Taipei'))
        c.execute('''
            UPDATE schedules 
            SET status = 'active', 
                last_run = ?,
                result = NULL,
                error_message = NULL
            WHERE id = ?
        ''', (now, schedule_id))
        
        conn.commit()

        # 返回成功訊息
        return jsonify({
            'success': True, 
            'message': '排程已啟用', 
            'status': 'active'
        })

    except Exception as e:
        print(f"Error restarting schedule: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/schedules/<int:schedule_id>/run', methods=['POST'])
def run_schedule_now(schedule_id):
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        
        # 檢查排程是否存在
        c.execute('SELECT type, script_content, status FROM schedules WHERE id = ?', (schedule_id,))
        schedule = c.fetchone()
        if not schedule:
            return jsonify({'error': '找不到排程'}), 404

        script_type, script_content, status = schedule
        
        # 檢查是否已在運行中
        if status == 'active':
            return jsonify({'error': '排程已在運行中'}), 400

        # 立即執行排程
        execute_script(schedule_id, script_type, script_content)

        return jsonify({'success': True, 'message': '排程已開始執行'})

    except Exception as e:
        print(f"Error running schedule: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

# 添加獲取日誌的 API
@app.route('/api/schedules/<int:schedule_id>/logs', methods=['GET'])
def get_schedule_logs(schedule_id):
    try:
        conn = sqlite3.connect('scripts.db')
        c = conn.cursor()
        
        # 獲取排程的所有日誌
        c.execute('''
            SELECT l.*, s.name as schedule_name 
            FROM schedule_logs l
            JOIN schedules s ON l.schedule_id = s.id
            WHERE l.schedule_id = ?
            ORDER BY l.execution_time DESC
        ''', (schedule_id,))
        
        logs = []
        for row in c.fetchall():
            logs.append({
                'id': row[0],
                'schedule_id': row[1],
                'execution_time': row[2],
                'status': row[3],
                'content': row[4],
                'duration': row[5],
                'error_message': row[6],
                'created_at': row[7],
                'schedule_name': row[8]
            })
        
        return jsonify(logs)
        
    except Exception as e:
        print(f"Error fetching logs: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if conn:
            conn.close()

def add_schedule_job(schedule_id, frequency, schedule_time, selected_days=None):
    """添加排程任務到 APScheduler"""
    try:
        # 移除現有的任務（如果存在）
        job_id = f'schedule_{schedule_id}'
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)

        # 根據頻率設置觸發器
        if frequency == 'once':
            trigger = DateTrigger(
                run_date=datetime.strptime(schedule_time, '%Y-%m-%d %H:%M'),
                timezone=pytz.timezone('Asia/Taipei')
            )
        elif frequency == 'daily':
            time_parts = schedule_time.split(':')
            trigger = CronTrigger(
                hour=int(time_parts[0]),
                minute=int(time_parts[1]),
                timezone=pytz.timezone('Asia/Taipei')
            )
        elif frequency == 'weekly':
            time_parts = schedule_time.split(':')
            # 修改這裡：將星期幾的數字轉換為對應的字符串
            weekdays = []
            for day in selected_days:
                if day == 0:
                    weekdays.append('sun')
                elif day == 1:
                    weekdays.append('mon')
                elif day == 2:
                    weekdays.append('tue')
                elif day == 3:
                    weekdays.append('wed')
                elif day == 4:
                    weekdays.append('thu')
                elif day == 5:
                    weekdays.append('fri')
                elif day == 6:
                    weekdays.append('sat')
            
            trigger = CronTrigger(
                day_of_week=','.join(weekdays),  # 使用英文縮寫
                hour=int(time_parts[0]),
                minute=int(time_parts[1]),
                timezone=pytz.timezone('Asia/Taipei')
            )
        elif frequency == 'monthly':
            time_parts = schedule_time.split(':')
            trigger = CronTrigger(
                day=','.join(str(day) for day in selected_days),
                hour=int(time_parts[0]),
                minute=int(time_parts[1]),
                timezone=pytz.timezone('Asia/Taipei')
            )
        else:
            raise ValueError(f'不支援的頻率類型: {frequency}')

        # 修改執行函數，確保數據庫連接在函數內部處理
        def job_function(schedule_id=schedule_id):
            conn = None
            try:
                conn = sqlite3.connect('scripts.db')
                c = conn.cursor()
                c.execute('''
                    SELECT type, script_content
                    FROM schedules
                    WHERE id = ?
                ''', (schedule_id,))
                row = c.fetchone()
                if row:
                    script_type, script_content = row
                    execute_script(schedule_id, script_type, script_content)
                else:
                    print(f"無法獲取排程 {schedule_id} 的資訊")
            except Exception as e:
                print(f"Error in job execution: {e}")
            finally:
                if conn:
                    conn.close()

        # 添加任務到排程器
        scheduler.add_job(
            job_function,
            trigger=trigger,
            id=job_id,
            replace_existing=True,
            args=[]  # 不需要傳遞參數，因為已經在閉包中捕獲
        )

        print(f"Successfully added schedule job: {job_id}")
        return True

    except Exception as e:
        print(f"Error adding schedule job: {e}")
        return False

if __name__ == '__main__':
    app.run(debug=True)
