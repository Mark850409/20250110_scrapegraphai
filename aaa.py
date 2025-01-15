import requests
from bs4 import BeautifulSoup

def crawl_data():
    try:
        url = "https://perinim.github.io/projects"
        response = requests.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        articles = []
        
        for item in soup.find_all('article'):
            title = item.find('h2').text
            link = item.find('a')['href']
            
            article = {
                "title": title,
                "link": link
            }
            articles.append(article)
        
        return articles
    
    except Exception as e:
        print(f"Error: {e}")
        return []

articles = crawl_data()
print(articles)