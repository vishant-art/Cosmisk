#!/usr/bin/env python3
"""
FREE AI-Powered Web Scraper using Crawl4AI + Gemini

100% Free Stack:
- Crawl4AI: LLM-friendly web crawler (no API needed)
- Gemini: 1M tokens/month free tier

Rate Limits (Free Tier):
- 15 requests/minute
- 1,500 requests/day
- 1,000,000 tokens/month

Usage:
  python scripts/crawl-free.py <url> "<prompt>"
  python scripts/crawl-free.py --batch urls.txt "<prompt>"
  python scripts/crawl-free.py --stats

Examples:
  python scripts/crawl-free.py "https://instagram.com/p/xyz" "extract caption, username, hashtags"
  python scripts/crawl-free.py "https://example.com/product" "extract product name, price, features"
  python scripts/crawl-free.py --batch competitor_urls.txt "extract product name and price"

Setup:
  1. Get free Gemini API key: https://makersuite.google.com/app/apikey
  2. export GEMINI_API_KEY="your-key-here"
"""
import sys
import os
import json
import asyncio
import time
from datetime import datetime, date
from pathlib import Path
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

# Gemini setup (using new google.genai package)
try:
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Rate limit constants (Gemini free tier)
RATE_LIMIT_PER_MINUTE = 15
RATE_LIMIT_PER_DAY = 1500
TOKEN_LIMIT_PER_MONTH = 1_000_000

# Usage tracking file
USAGE_FILE = Path(__file__).parent / ".gemini_usage.json"


class RateLimiter:
    """Track and enforce Gemini API rate limits."""

    def __init__(self):
        self.usage = self._load_usage()
        self.minute_requests = []  # timestamps of requests in current minute

    def _load_usage(self) -> dict:
        """Load usage data from file."""
        if USAGE_FILE.exists():
            try:
                with open(USAGE_FILE) as f:
                    return json.load(f)
            except:
                pass
        return {
            "daily": {},  # date -> count
            "monthly": {},  # month -> tokens
            "last_reset": str(date.today())
        }

    def _save_usage(self):
        """Save usage data to file."""
        with open(USAGE_FILE, "w") as f:
            json.dump(self.usage, f, indent=2)

    def _cleanup_minute_requests(self):
        """Remove requests older than 1 minute."""
        now = time.time()
        self.minute_requests = [t for t in self.minute_requests if now - t < 60]

    def get_daily_count(self) -> int:
        """Get today's request count."""
        today = str(date.today())
        return self.usage["daily"].get(today, 0)

    def get_monthly_tokens(self) -> int:
        """Get this month's token usage."""
        month = datetime.now().strftime("%Y-%m")
        return self.usage["monthly"].get(month, 0)

    def can_make_request(self) -> tuple[bool, str]:
        """Check if we can make a request. Returns (allowed, reason)."""
        self._cleanup_minute_requests()

        # Check per-minute limit
        if len(self.minute_requests) >= RATE_LIMIT_PER_MINUTE:
            wait_time = 60 - (time.time() - self.minute_requests[0])
            return False, f"Rate limit: {RATE_LIMIT_PER_MINUTE}/min. Wait {wait_time:.0f}s"

        # Check daily limit
        daily_count = self.get_daily_count()
        if daily_count >= RATE_LIMIT_PER_DAY:
            return False, f"Daily limit reached: {daily_count}/{RATE_LIMIT_PER_DAY}"

        # Check monthly token limit (estimate)
        monthly_tokens = self.get_monthly_tokens()
        if monthly_tokens >= TOKEN_LIMIT_PER_MONTH:
            return False, f"Monthly token limit reached: {monthly_tokens:,}/{TOKEN_LIMIT_PER_MONTH:,}"

        return True, "OK"

    def wait_if_needed(self):
        """Wait if rate limited, with countdown."""
        self._cleanup_minute_requests()

        if len(self.minute_requests) >= RATE_LIMIT_PER_MINUTE:
            wait_time = 61 - (time.time() - self.minute_requests[0])
            if wait_time > 0:
                print(f"Rate limit reached. Waiting {wait_time:.0f}s...")
                time.sleep(wait_time)
                self._cleanup_minute_requests()

    def record_request(self, tokens_used: int = 7000):
        """Record a request and its token usage."""
        # Record minute timestamp
        self.minute_requests.append(time.time())

        # Record daily count
        today = str(date.today())
        self.usage["daily"][today] = self.usage["daily"].get(today, 0) + 1

        # Record monthly tokens
        month = datetime.now().strftime("%Y-%m")
        self.usage["monthly"][month] = self.usage["monthly"].get(month, 0) + tokens_used

        self._save_usage()

    def get_stats(self) -> dict:
        """Get current usage statistics."""
        today = str(date.today())
        month = datetime.now().strftime("%Y-%m")

        daily_used = self.usage["daily"].get(today, 0)
        monthly_tokens = self.usage["monthly"].get(month, 0)

        return {
            "daily": {
                "used": daily_used,
                "limit": RATE_LIMIT_PER_DAY,
                "remaining": RATE_LIMIT_PER_DAY - daily_used,
                "percent": round(daily_used / RATE_LIMIT_PER_DAY * 100, 1)
            },
            "monthly_tokens": {
                "used": monthly_tokens,
                "limit": TOKEN_LIMIT_PER_MONTH,
                "remaining": TOKEN_LIMIT_PER_MONTH - monthly_tokens,
                "percent": round(monthly_tokens / TOKEN_LIMIT_PER_MONTH * 100, 1)
            },
            "per_minute": {
                "limit": RATE_LIMIT_PER_MINUTE
            }
        }


# Global rate limiter
rate_limiter = RateLimiter()


async def crawl_url(url: str) -> str:
    """Crawl URL and return markdown content."""
    browser_config = BrowserConfig(
        headless=True,
        verbose=False
    )

    crawler_config = CrawlerRunConfig(
        word_count_threshold=10,
        remove_overlay_elements=True,
        process_iframes=True
    )

    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(
            url=url,
            config=crawler_config
        )

        if result.success:
            return result.markdown
        else:
            return f"Error crawling: {result.error_message}"


def extract_with_gemini(content: str, prompt: str) -> dict:
    """Use Gemini to extract structured data from content."""
    if not GEMINI_API_KEY:
        return {
            "error": "GEMINI_API_KEY not set",
            "hint": "Get free key at: https://makersuite.google.com/app/apikey",
            "raw_content": content[:2000]
        }

    # Check rate limits
    can_request, reason = rate_limiter.can_make_request()
    if not can_request:
        return {"error": f"Rate limited: {reason}"}

    # Wait if approaching per-minute limit
    rate_limiter.wait_if_needed()

    client = genai.Client(api_key=GEMINI_API_KEY)

    extraction_prompt = f"""Extract the following information from this web page content.
Return ONLY valid JSON, no markdown formatting.

USER REQUEST: {prompt}

WEB PAGE CONTENT:
{content[:15000]}

Respond with a JSON object containing the extracted data. If information is not found, use null."""

    # Try multiple models in case of demand issues
    models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-lite-latest"]

    # Estimate tokens (rough: 1 token ≈ 4 chars)
    tokens_estimate = (len(extraction_prompt) + 1000) // 4

    for model_name in models:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=extraction_prompt
            )
            text = response.text.strip()

            # Record the request
            rate_limiter.record_request(tokens_estimate)

            # Clean up markdown code blocks if present
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            text = text.strip()

            return json.loads(text)
        except json.JSONDecodeError:
            rate_limiter.record_request(tokens_estimate)
            return {
                "raw_response": response.text,
                "note": "Could not parse as JSON"
            }
        except Exception as e:
            if "503" in str(e) or "UNAVAILABLE" in str(e):
                continue  # Try next model
            return {"error": str(e)}

    return {"error": "All models unavailable due to high demand. Try again in a few minutes."}


async def scrape_smart(url: str, prompt: str) -> dict:
    """Crawl URL and extract data with AI."""
    print(f"Crawling: {url}")
    content = await crawl_url(url)

    if content.startswith("Error"):
        return {"error": content}

    print(f"Got {len(content)} chars, extracting with Gemini...")
    result = extract_with_gemini(content, prompt)

    return {
        "url": url,
        "prompt": prompt,
        "data": result,
        "content_length": len(content)
    }


async def scrape_raw(url: str) -> dict:
    """Just crawl and return markdown (no AI extraction)."""
    content = await crawl_url(url)
    return {
        "url": url,
        "markdown": content,
        "length": len(content)
    }


async def scrape_batch(urls_file: str, prompt: str) -> list:
    """Scrape multiple URLs from a file with rate limiting."""
    with open(urls_file) as f:
        urls = [line.strip() for line in f if line.strip() and not line.startswith("#")]

    print(f"Batch scraping {len(urls)} URLs...")
    stats = rate_limiter.get_stats()
    print(f"Daily usage: {stats['daily']['used']}/{stats['daily']['limit']} ({stats['daily']['percent']}%)")
    print(f"Monthly tokens: {stats['monthly_tokens']['used']:,}/{stats['monthly_tokens']['limit']:,}")
    print()

    results = []
    for i, url in enumerate(urls, 1):
        print(f"[{i}/{len(urls)}] ", end="")

        # Check if we can continue
        can_request, reason = rate_limiter.can_make_request()
        if not can_request:
            print(f"\nStopping batch: {reason}")
            print(f"Completed {i-1}/{len(urls)} URLs")
            break

        result = await scrape_smart(url, prompt)
        results.append(result)

        # Small delay between requests to be nice
        if i < len(urls):
            await asyncio.sleep(1)

    return results


def print_stats():
    """Print current usage statistics."""
    stats = rate_limiter.get_stats()

    print("\n=== Gemini API Usage (Free Tier) ===\n")

    print(f"Today's Requests:")
    print(f"  Used: {stats['daily']['used']} / {stats['daily']['limit']}")
    print(f"  Remaining: {stats['daily']['remaining']}")
    print(f"  Usage: {stats['daily']['percent']}%")
    print()

    print(f"Monthly Tokens:")
    print(f"  Used: {stats['monthly_tokens']['used']:,} / {stats['monthly_tokens']['limit']:,}")
    print(f"  Remaining: {stats['monthly_tokens']['remaining']:,}")
    print(f"  Usage: {stats['monthly_tokens']['percent']}%")
    print()

    print(f"Rate Limits:")
    print(f"  Per minute: {stats['per_minute']['limit']} requests")
    print(f"  Per day: {stats['daily']['limit']} requests")
    print(f"  Per month: {stats['monthly_tokens']['limit']:,} tokens")
    print()

    # Estimate items remaining
    items_remaining = stats['daily']['remaining']
    print(f"Estimated items you can scrape today: ~{items_remaining}")


def print_usage():
    print("""
FREE AI Web Scraper (Crawl4AI + Gemini) — with Rate Limiting

Usage:
  python scripts/crawl-free.py <url> "<prompt>"       # Single URL
  python scripts/crawl-free.py --batch <file> "<prompt>"  # Multiple URLs
  python scripts/crawl-free.py --stats                # Check usage
  python scripts/crawl-free.py <url> --raw            # Just get markdown

Examples:
  python scripts/crawl-free.py "https://example.com" "extract product name and price"
  python scripts/crawl-free.py --batch urls.txt "extract product name, price, description"
  python scripts/crawl-free.py --stats

Rate Limits (Free Tier):
  - 15 requests/minute
  - 1,500 requests/day
  - 1,000,000 tokens/month

Setup (one-time):
  1. Get free API key: https://makersuite.google.com/app/apikey
  2. Add to .env or export: GEMINI_API_KEY="your-key"
""")


async def main():
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)

    # Stats command
    if sys.argv[1] == "--stats":
        print_stats()
        sys.exit(0)

    # Batch mode
    if sys.argv[1] == "--batch":
        if len(sys.argv) < 4:
            print("Usage: python scripts/crawl-free.py --batch <urls_file> \"<prompt>\"")
            sys.exit(1)
        urls_file = sys.argv[2]
        prompt = sys.argv[3]
        results = await scrape_batch(urls_file, prompt)

        # Save results
        output_file = f"batch_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"\nResults saved to: {output_file}")
        sys.exit(0)

    url = sys.argv[1]

    if len(sys.argv) == 2 or sys.argv[2] == "--raw":
        # Raw mode - just crawl (no rate limiting needed)
        print(f"Crawling (raw mode): {url}")
        result = await scrape_raw(url)
        print(result["markdown"][:3000])
        print(f"\n--- Total: {result['length']} chars ---")
    else:
        # AI extraction mode
        prompt = sys.argv[2]
        result = await scrape_smart(url, prompt)
        print(json.dumps(result, indent=2, ensure_ascii=False))

        # Show remaining quota
        stats = rate_limiter.get_stats()
        print(f"\n--- Daily: {stats['daily']['used']}/{stats['daily']['limit']} | Monthly tokens: {stats['monthly_tokens']['percent']}% ---")


if __name__ == "__main__":
    asyncio.run(main())
