import requests
from bs4 import BeautifulSoup
import csv
import pandas as pd

def crawl_articles(url):
    try:
        print(f"開始爬取網頁: {url}")
        
        # Send a GET request to the website
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        print(f"HTTP 狀態碼: {response.status_code}")

        # Check if the response status code is 200 (OK)
        if response.status_code == 200:
            # Get the content of the response
            page_content = response.content
            
            # Create a BeautifulSoup object and specify the parser
            soup = BeautifulSoup(page_content, 'html.parser')
            
            # 打印頁面標題，確認內容正確
            print(f"頁面標題: {soup.title.string if soup.title else '無標題'}")

            # 創建文章列表
            article_list = []
            
            # 找到所有的新聞項目
            news_items = soup.find_all('div', class_='news-item')
            if news_items:
                print(f"找到 {len(news_items)} 個新聞項目")
                for item in news_items:
                    article_data = {}
                    
                    # 獲取標題
                    title = item.find('h2')
                    if title:
                        article_data['title'] = title.text.strip()
                    else:
                        continue
                    
                    # 獲取日期
                    date = item.find('time')
                    if date:
                        article_data['date'] = date.text.strip()
                    
                    # 獲取摘要
                    summary = item.find('p')
                    if summary:
                        article_data['summary'] = summary.text.strip()
                    
                    article_list.append(article_data)
                    print(f"處理文章: {article_data.get('title', 'No title')}")
            else:
                print("未找到新聞項目，嘗試其他選擇器...")
                # 尋找所有標題元素
                headings = soup.find_all(['h1', 'h2', 'h3'])
                print(f"找到 {len(headings)} 個標題元素")
                
                for heading in headings:
                    article_data = {
                        'title': heading.text.strip()
                    }
                    
                    # 尋找相關的段落
                    next_p = heading.find_next('p')
                    if next_p:
                        article_data['summary'] = next_p.text.strip()
                    
                    article_list.append(article_data)
                    print(f"處理標題: {article_data['title']}")

            print(f"成功提取 {len(article_list)} 篇文章")
            return article_list

        else:
            print(f"無法獲取網頁。狀態碼: {response.status_code}")
            return []

    except requests.exceptions.RequestException as e:
        print(f"請求錯誤: {str(e)}")
        return []
    except Exception as e:
        print(f"發生錯誤: {str(e)}")
        return []

# 使用 Python 官方網站作為測試
url = "https://www.python.org/blogs/"

# Call the function to crawl articles
print("\n開始爬取文章...")
articles = crawl_articles(url)

# 打印結果
print("\n爬取結果:")
if articles:
    print(f"總共找到 {len(articles)} 篇文章:")
    for i, article in enumerate(articles, 1):
        print(f"{i}. 標題: {article.get('title', 'No title')}")
        if 'date' in article:
            print(f"   日期: {article['date']}")
        if 'summary' in article:
            print(f"   摘要: {article['summary']}")
        print("---")
else:
    print("沒有找到任何文章。")
