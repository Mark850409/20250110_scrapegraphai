from serpapi import GoogleSearch

params = {
    "engine": "google_scholar",
    "q": "deep learning",
    "api_key": "146c3c27961f912818f22169d5ab2d2ea2b2853f4d232a39e6204557cf41c062"
}

search = GoogleSearch(params)
results = search.get_dict()

print(results)