
import pandas as pd
import requests
from bs4 import BeautifulSoup
import os
import json
import time

import requests
from bs4 import BeautifulSoup
import time

# 對網站發出GET請求
url = 'https://textdata.cn/blog/'
headers = {'User-Agent': 'Mozilla/5.0'}
response = requests.get(url, headers=headers)

# 如果請求成功，才能對頁面內容進行解析
if response.status_code == 200:
    soup = BeautifulSoup(response.text, 'lxml')

    # 找到所有文章的標題和鏈接
    articles = soup.find_all('article')
    
    for article in articles:
        title = article.find('h2').text.strip()
        date = article.find('span', class_='date').text.strip()
        link = article.find('a')['href']

        print(f"標題：{title}\n日期：{date}\n鏈接：https://textdata.cn/{link}")
        
        # 休眠一下，以免連續請求導致被拒絕
        time.sleep(1)
else:
    print("網站內容不存在")

# 確保輸出目錄存在
os.makedirs(os.path.dirname('e:\\Project\\AI\\RAG\\code\\20250110_scrapegraphai\\temp\\a.csv'), exist_ok=True)

# 將資料保存為 CSV
if 'df' in locals():
    df.to_csv('e:\\Project\\AI\\RAG\\code\\20250110_scrapegraphai\\temp\\a.csv', index=False, encoding='utf-8-sig')
elif 'data' in locals():
    pd.DataFrame(data).to_csv('e:\\Project\\AI\\RAG\\code\\20250110_scrapegraphai\\temp\\a.csv', index=False, encoding='utf-8-sig')
