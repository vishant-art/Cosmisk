#!/usr/bin/env python3
"""
AI-powered web scraper using ScrapeGraphAI
Usage: python scripts/scrape.py <url> "<prompt>"
Example: python scripts/scrape.py "https://instagram.com/p/xyz" "extract caption, username, hashtags"
"""
import sys
import os
import json
from scrapegraphai.graphs import SmartScraperGraph

# Use OpenAI (or set ANTHROPIC_API_KEY for Claude)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

def scrape(url: str, prompt: str) -> dict:
    """Scrape a URL with an AI prompt."""

    # Configure the graph
    if ANTHROPIC_API_KEY:
        graph_config = {
            "llm": {
                "api_key": ANTHROPIC_API_KEY,
                "model": "anthropic/claude-sonnet-4-20250514",
            },
            "headless": True,
        }
    elif OPENAI_API_KEY:
        graph_config = {
            "llm": {
                "api_key": OPENAI_API_KEY,
                "model": "openai/gpt-4o-mini",
            },
            "headless": True,
        }
    else:
        print("Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY")
        sys.exit(1)

    # Create and run the scraper
    scraper = SmartScraperGraph(
        prompt=prompt,
        source=url,
        config=graph_config
    )

    result = scraper.run()
    return result

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/scrape.py <url> \"<prompt>\"")
        print("Example: python scripts/scrape.py \"https://example.com\" \"extract all product names and prices\"")
        sys.exit(1)

    url = sys.argv[1]
    prompt = sys.argv[2]

    print(f"Scraping: {url}")
    print(f"Prompt: {prompt}\n")

    result = scrape(url, prompt)
    print(json.dumps(result, indent=2, ensure_ascii=False))
