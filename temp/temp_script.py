
import pandas as pd
import requests
from bs4 import BeautifulSoup
import os
import json
import time

import requests
from bs4 import BeautifulSoup

def crawl_blog(url):
    try:
        response = requests.get(url)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            articles = soup.find_all('article')
            
            for article in articles:
                title = article.find('h2').text
                content = article.find('div', {'class': 'entry-content'}).text.strip()
                
                print(f"Title: {title}")
                print(f"Content: {content}")
                print("------------------------")
        else:
            print("Failed to retrieve the webpage.")
    except Exception as e:
        print(f"An error occurred: {e}")

url = "https://textdata.cn/blog/"
crawl_blog(url)

# 確保輸出目錄存在
os.makedirs(os.path.dirname('e:\\Project\\AI\\RAG\\code\\20250110_scrapegraphai\\temp\\a.csv'), exist_ok=True)

# 將資料保存為 CSV
if 'df' in locals():
    df.to_csv('e:\\Project\\AI\\RAG\\code\\20250110_scrapegraphai\\temp\\a.csv', index=False, encoding='utf-8-sig')
elif 'data' in locals():
    pd.DataFrame(data).to_csv('e:\\Project\\AI\\RAG\\code\\20250110_scrapegraphai\\temp\\a.csv', index=False, encoding='utf-8-sig')
