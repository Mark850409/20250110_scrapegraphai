import os
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import random

# 設定 Chromium 運行時的 User-Agent
options = Options()
options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3")

# 初始化 WebDriver
driver = webdriver.Chrome(ChromeDriverManager().install(), options=options)

try:
    # 打開 Google 搜尋頁面
    driver.get("https://www.google.com/search?q=perinim.github.io/projects&num=10")
    
    # 等待搜尋結果元素載入
    search_results = WebDriverWait(driver, 10).until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div.g")))
    
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
    
    # 處理彈出視窗和 Cookie 提示
    driver.switch_to.alert.accept()
    
    # 儲存結果到檔案
    with open("articles.json", "w") as f:
        f.write(str(articles))
    
except WebDriverException as e:
    print(f"WebDriver 異常: {str(e)}")
except TimeoutException:
    print("超時錯誤：元素載入超時")
except Exception as e:
    print(f"未知錯誤: {str(e)}")

# 關閉 WebDriver
finally:
    driver.quit()