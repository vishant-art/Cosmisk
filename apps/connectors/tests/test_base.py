import asyncio
import time

from connectors.base import CircuitBreaker, RateLimiter, host_allowed
from connectors.config import Settings


def test_host_allowlist_accepts_known_cdns_rejects_others():
    al = Settings().asset_host_allowlist
    assert host_allowed("https://scontent.xx.fbcdn.net/v/abc.jpg", al)
    assert host_allowed("https://cdn.shopify.com/s/files/1/x.png", al)
    assert host_allowed("https://lh3.googleusercontent.com/x", al)
    # SSRF guards
    assert not host_allowed("http://169.254.169.254/latest/meta-data", al)
    assert not host_allowed("https://evil.com/fbcdn.net.jpg", al)
    assert not host_allowed("https://fbcdn.net.evil.com/x", al)


def test_circuit_breaker_opens_after_threshold_and_resets():
    cb = CircuitBreaker(threshold=3)
    cb.record_failure(); cb.record_failure()
    assert not cb.is_open
    cb.record_failure()
    assert cb.is_open
    cb.record_success()
    assert not cb.is_open


def test_rate_limiter_throttles_beyond_capacity():
    # capacity 2, rate 10/s: 4 ops => the 3rd/4th must wait ~ (n-cap)/rate.
    rl = RateLimiter(rate=10.0, capacity=2.0)

    async def run():
        t0 = time.monotonic()
        for _ in range(4):
            await rl.acquire()
        return time.monotonic() - t0

    elapsed = asyncio.run(run())
    assert elapsed >= 0.15      # 2 immediate + 2 throttled at 10/s ≈ 0.2s
