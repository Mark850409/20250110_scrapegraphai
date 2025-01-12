from scrapegraphai.graphs import SmartScraperGraph
OPENAI_API_KEY = ""

graph_config = {
    "llm": {
        "api_key": OPENAI_API_KEY,
        "model": "gpt-4o-mini",
    },
}

smart_scraper_graph = SmartScraperGraph(
    prompt="返回该网站所有文章的标题、日期、文章链接",
    # 也可以使用已下载的 HTML 代码的字符串
    source="https://textdata.cn/blog/",
    config=graph_config
)

result = smart_scraper_graph.run()
print(result)