import requests
from bs4 import BeautifulSoup
import json

def crawl_blog_website(url):
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for HTTP errors
    except requests.exceptions.RequestException as err:
        print("Error: ", err)
        return None
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    articles = []
    
    article_cards = soup.find_all('article', class_='card')
    
    for card in article_cards:
        title = card.find('h2').text.strip()
        date = card.find('span', class_='date').text.strip()
        link = card.find('a')['href']
        
        articles.append({
            'title': title,
            'date': date,
            'link': link
        })
    
    return articles

if __name__ == "__main__":
    url = "https://textdata.cn/blog/"
    data = crawl_blog_website(url)
    
    if data:
        with open('blog_articles.json', 'w') as f:
            json.dump(data, f, indent=4)