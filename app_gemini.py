from scrapegraphai.graphs import SmartScraperGraph
GOOGLE_APIKEY = "AIzaSyABuw6lIbUCzeMztXCgwTBYtZwZZ3xtN9I"

# Define the configuration for the graph
graph_config = {
    "llm": {
        "api_key": GOOGLE_APIKEY,
        "model": "gemini-pro",
    },
}

# Create the SmartScraperGraph instance
smart_scraper_graph = SmartScraperGraph(
    prompt="List me all the articles",
    source="https://perinim.github.io/projects",
    config=graph_config
)

result = smart_scraper_graph.run()
print(result)