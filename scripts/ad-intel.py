#!/usr/bin/env python3
"""
Ad Intelligence Scraper - Find winning ads/content on Instagram, YouTube, Meta Ad Library

Usage:
  python scripts/ad-intel.py instagram <username> --posts 10
  python scripts/ad-intel.py youtube <channel_url> --videos 10
  python scripts/ad-intel.py meta-ads <keyword> --country IN
  python scripts/ad-intel.py hashtag <tag> --posts 20

Requires: playwright, beautifulsoup4
"""
import sys
import json
import asyncio
from typing import Optional
from playwright.async_api import async_playwright

async def scrape_instagram_profile(username: str, max_posts: int = 10) -> dict:
    """Scrape public Instagram profile for top posts."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.set_extra_http_headers({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

        url = f"https://www.instagram.com/{username}/"
        await page.goto(url, wait_until='networkidle', timeout=30000)
        await asyncio.sleep(2)

        # Close login popup
        try:
            await page.keyboard.press('Escape')
            await asyncio.sleep(0.5)
        except:
            pass

        # Extract profile info
        content = await page.content()
        text = await page.evaluate('() => document.body.innerText')

        # Get post links
        posts = await page.evaluate('''() => {
            const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
            return Array.from(links).slice(0, ''' + str(max_posts) + ''').map(a => ({
                url: a.href,
                type: a.href.includes('/reel/') ? 'reel' : 'post'
            }));
        }''')

        # Extract follower count etc from text
        lines = text.split('\n')
        stats = {}
        for line in lines:
            if 'followers' in line.lower():
                stats['followers'] = line.strip()
            if 'following' in line.lower():
                stats['following'] = line.strip()

        await browser.close()

        return {
            'username': username,
            'url': url,
            'stats': stats,
            'posts': posts,
            'post_count': len(posts)
        }

async def scrape_instagram_post(url: str) -> dict:
    """Scrape a single Instagram post for details."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.set_extra_http_headers({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

        await page.goto(url, wait_until='networkidle', timeout=30000)
        await asyncio.sleep(2)

        try:
            await page.keyboard.press('Escape')
            await asyncio.sleep(0.5)
        except:
            pass

        text = await page.evaluate('() => document.body.innerText')

        # Parse engagement
        data = {
            'url': url,
            'text': text[:3000],
            'likes': None,
            'comments': None,
            'caption': None
        }

        # Extract metrics from text
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if 'likes' in line.lower() and data['likes'] is None:
                data['likes'] = line.strip()
            if 'comments' in line.lower() and data['comments'] is None:
                data['comments'] = line.strip()

        # Caption is usually after username
        for i, line in enumerate(lines):
            if line.strip() and len(line) > 50 and not line.startswith('Log'):
                data['caption'] = line.strip()[:500]
                break

        await browser.close()
        return data

async def scrape_meta_ad_library(keyword: str, country: str = "IN") -> dict:
    """Scrape Meta Ad Library for active ads."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        url = f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country={country}&q={keyword}&media_type=all"

        await page.goto(url, wait_until='networkidle', timeout=30000)
        await asyncio.sleep(3)

        # Scroll to load more ads
        for _ in range(3):
            await page.evaluate('window.scrollBy(0, 1000)')
            await asyncio.sleep(1)

        text = await page.evaluate('() => document.body.innerText')

        # Try to extract ad cards
        ads = await page.evaluate('''() => {
            const cards = document.querySelectorAll('[class*="ad"]');
            return Array.from(cards).slice(0, 20).map(card => card.innerText.substring(0, 500));
        }''')

        await browser.close()

        return {
            'keyword': keyword,
            'country': country,
            'url': url,
            'raw_text': text[:5000],
            'ad_snippets': ads[:10]
        }

async def scrape_youtube_channel(channel_url: str, max_videos: int = 10) -> dict:
    """Scrape YouTube channel for recent videos."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Go to videos tab
        if '/videos' not in channel_url:
            channel_url = channel_url.rstrip('/') + '/videos'

        await page.goto(channel_url, wait_until='networkidle', timeout=30000)
        await asyncio.sleep(2)

        # Extract video links and titles
        videos = await page.evaluate('''() => {
            const items = document.querySelectorAll('a#video-title-link, a#video-title');
            return Array.from(items).slice(0, ''' + str(max_videos) + ''').map(a => ({
                title: a.title || a.innerText,
                url: a.href,
                views: a.closest('ytd-rich-item-renderer, ytd-grid-video-renderer')?.innerText?.match(/[\\d,.]+ views/)?.[0] || null
            }));
        }''')

        await browser.close()

        return {
            'channel_url': channel_url,
            'videos': videos,
            'video_count': len(videos)
        }

async def scrape_hashtag(tag: str, max_posts: int = 20) -> dict:
    """Scrape Instagram hashtag for top posts."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.set_extra_http_headers({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })

        tag = tag.lstrip('#')
        url = f"https://www.instagram.com/explore/tags/{tag}/"

        await page.goto(url, wait_until='networkidle', timeout=30000)
        await asyncio.sleep(2)

        try:
            await page.keyboard.press('Escape')
        except:
            pass

        # Get post links
        posts = await page.evaluate('''() => {
            const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
            return Array.from(links).slice(0, ''' + str(max_posts) + ''').map(a => a.href);
        }''')

        text = await page.evaluate('() => document.body.innerText')

        await browser.close()

        return {
            'hashtag': tag,
            'url': url,
            'posts': posts,
            'post_count': len(posts),
            'summary': text[:1000]
        }

def print_usage():
    print("""
Ad Intelligence Scraper

Usage:
  python scripts/ad-intel.py instagram <username> [--posts N]
  python scripts/ad-intel.py post <instagram_url>
  python scripts/ad-intel.py youtube <channel_url> [--videos N]
  python scripts/ad-intel.py meta-ads <keyword> [--country XX]
  python scripts/ad-intel.py hashtag <tag> [--posts N]

Examples:
  python scripts/ad-intel.py instagram aikanksha --posts 5
  python scripts/ad-intel.py post "https://instagram.com/p/DXXLWotCDe5/"
  python scripts/ad-intel.py youtube "https://youtube.com/@veritasium" --videos 10
  python scripts/ad-intel.py meta-ads "d2c fashion" --country IN
  python scripts/ad-intel.py hashtag "entrepreneurship" --posts 20
""")

async def main():
    if len(sys.argv) < 3:
        print_usage()
        sys.exit(1)

    command = sys.argv[1]
    target = sys.argv[2]

    # Parse optional args
    posts = 10
    videos = 10
    country = "IN"

    for i, arg in enumerate(sys.argv):
        if arg == '--posts' and i + 1 < len(sys.argv):
            posts = int(sys.argv[i + 1])
        if arg == '--videos' and i + 1 < len(sys.argv):
            videos = int(sys.argv[i + 1])
        if arg == '--country' and i + 1 < len(sys.argv):
            country = sys.argv[i + 1]

    result = None

    if command == 'instagram':
        print(f"Scraping Instagram profile: @{target}")
        result = await scrape_instagram_profile(target, posts)

    elif command == 'post':
        print(f"Scraping Instagram post: {target}")
        result = await scrape_instagram_post(target)

    elif command == 'youtube':
        print(f"Scraping YouTube channel: {target}")
        result = await scrape_youtube_channel(target, videos)

    elif command == 'meta-ads':
        print(f"Scraping Meta Ad Library for: {target}")
        result = await scrape_meta_ad_library(target, country)

    elif command == 'hashtag':
        print(f"Scraping hashtag: #{target}")
        result = await scrape_hashtag(target, posts)

    else:
        print(f"Unknown command: {command}")
        print_usage()
        sys.exit(1)

    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
