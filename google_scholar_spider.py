import os
import csv
import requests
from serpapi import GoogleSearch
from urllib.parse import urljoin

def search_scholar_with_serpapi(query, api_key, num_results=10, start_year=None, end_year=None, language="zh"):
    """
    使用 SerpAPI 搜尋 Google Scholar，並限制語言和年份範圍。

    Args:
        query (str): 搜尋關鍵字
        api_key (str): SerpAPI 的 API 金鑰
        num_results (int): 最大搜尋結果數量
        start_year (int): 篩選年份下限（可選）
        end_year (int): 篩選年份上限（可選）
        language (str): 語言過濾（例如 "zh" 表示中文）

    Returns:
        list: 包含搜尋結果的列表，每一項為字典格式
    """
    results = []
    search_params = {
        "engine": "google_scholar",
        "q": query,
        "api_key": api_key,
        "num": num_results,
        "as_ylo": start_year,
        "as_yhi": end_year,
    }

    if start_year and end_year:
        search_params["as_ylo"] = start_year  # 起始年份
        search_params["as_yhi"] = end_year  # 結束年份

    search = GoogleSearch(search_params)
    search_results = search.get_dict()

    if "organic_results" not in search_results:
        print("未找到任何搜尋結果，請檢查搜尋條件或 API 金鑰是否有效。")
        return results

    for result in search_results.get("organic_results", []):
        # 提取搜尋結果的主要欄位
        title = result.get("title", "No title")
        authors = result.get("publication_info", {}).get("authors", "No authors")
        year = result.get("publication_info", {}).get("year", "No year")
        abstract = result.get("snippet", "No abstract")
        link = result.get("link", "No link")
        citations = result.get("inline_links", {}).get("cited_by", {}).get("total", 0)
        
        # 提取 PDF 連結
        pdf_link = None
        resources = result.get("resources", [])
        for resource in resources:
            if resource.get("file_format") == "PDF":
                pdf_link = resource.get("link")
                break

        # 保存結果
        results.append({
            "title": title,
            "authors": authors,
            "year": year,
            "abstract": abstract,
            "link": link,
            "citations": citations,
            "pdf_link": pdf_link
        })

    return results

def download_pdf(pdf_url, save_path):
    """
    下載 PDF 檔案。

    Args:
        pdf_url (str): PDF 的網址
        save_path (str): 儲存 PDF 的路徑
    
    Returns:
        bool: 下載是否成功
    """
    try:
        response = requests.get(pdf_url, stream=True)
        response.raise_for_status()
        
        with open(save_path, 'wb') as pdf_file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    pdf_file.write(chunk)
        return True
    except Exception as e:
        print(f"下載 PDF 時發生錯誤: {str(e)}")
        return False

def save_to_csv(results, file_name="serpapi_results.csv"):
    """
    將結果存為 CSV 檔案。

    Args:
        results (list): 搜尋結果列表
        file_name (str): 要存儲的 CSV 檔名
    """
    keys = ["title", "authors", "year", "abstract", "link", "citations", "pdf_link"]
    with open(file_name, mode="w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=keys)
        writer.writeheader()
        writer.writerows(results)

def main():
    # 搜尋條件
    api_key = "146c3c27961f912818f22169d5ab2d2ea2b2853f4d232a39e6204557cf41c062"  # 替換為你的 SerpAPI 金鑰
    query = "推薦系統"
    num_results = 50
    start_year = 2015
    end_year = 2025

    # 建立 PDF 儲存資料夾
    pdf_folder = "downloaded_pdfs"
    os.makedirs(pdf_folder, exist_ok=True)

    # 搜尋 Google Scholar
    results = search_scholar_with_serpapi(
        query=query,
        api_key=api_key,
        num_results=num_results,
        start_year=start_year,
        end_year=end_year
    )

    # 顯示結果並下載 PDF
    print(f"共有 {len(results)} 筆文獻資料。")
    for idx, paper in enumerate(results, start=1):
        print(f"\n=== 第 {idx} 筆結果 ===")
        print("標題:", paper["title"])
        print("作者:", paper["authors"])
        print("年份:", paper["year"])
        print("摘要:", paper["abstract"])
        print("連結:", paper["link"])
        print("引用次數:", paper["citations"])
        
        # 下載 PDF（如果有的話）
        if paper["pdf_link"]:
            print("PDF 連結:", paper["pdf_link"])
            # 使用標題作為檔名（移除非法字元）
            safe_title = "".join(c for c in paper["title"] if c.isalnum() or c in (' ', '-', '_'))
            pdf_path = os.path.join(pdf_folder, f"{safe_title[:100]}.pdf")
            
            if download_pdf(paper["pdf_link"], pdf_path):
                print(f"PDF 已下載至: {pdf_path}")
            else:
                print("PDF 下載失敗")
        else:
            print("沒有可用的 PDF")

    # 儲存結果到 CSV
    save_to_csv(results, file_name="serpapi_results.csv")
    print("\n結果已儲存至 serpapi_results.csv")

if __name__ == "__main__":
    main()
