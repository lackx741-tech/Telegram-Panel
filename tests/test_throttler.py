"""
Unit tests for RateLimiter and Throttler.

A fake monotonic clock is used so the sliding windows can be exercised without
any real waiting.
"""
import asyncio

import pytest

from src.throttler import RateLimiter, Throttler


class FakeClock:
    """Controllable monotonic clock for deterministic window tests."""

    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class TestRateLimiter:
    def test_allows_up_to_limit(self):
        clock = FakeClock()
        limiter = RateLimiter(3, 60, time_func=clock)
        assert limiter.acquire() is True
        assert limiter.acquire() is True
        assert limiter.acquire() is True
        assert limiter.acquire() is False

    def test_window_slides(self):
        clock = FakeClock()
        limiter = RateLimiter(2, 60, time_func=clock)
        assert limiter.acquire() is True
        assert limiter.acquire() is True
        assert limiter.acquire() is False
        # After the window passes, old events expire and slots free up.
        clock.advance(61)
        assert limiter.acquire() is True

    def test_wait_time(self):
        clock = FakeClock()
        limiter = RateLimiter(1, 60, time_func=clock)
        limiter.acquire()
        assert limiter.get_wait_time() == pytest.approx(60.0)
        clock.advance(20)
        assert limiter.get_wait_time() == pytest.approx(40.0)

    def test_zero_max_disables(self):
        limiter = RateLimiter(0, 60)
        for _ in range(100):
            assert limiter.acquire() is True
        assert limiter.get_wait_time() == 0.0

    def test_current_count(self):
        clock = FakeClock()
        limiter = RateLimiter(5, 60, time_func=clock)
        limiter.acquire()
        limiter.acquire()
        assert limiter.current_count == 2


class TestThrottler:
    def test_per_minute_enforced(self):
        clock = FakeClock()
        throttler = Throttler(
            per_minute=2,
            per_hour=1000,
            per_day=1000,
            time_func=clock,
        )
        assert throttler.try_acquire("acct") is True
        assert throttler.try_acquire("acct") is True
        assert throttler.try_acquire("acct") is False
        assert throttler.get_wait_time("acct") == pytest.approx(60.0)

    def test_accounts_isolated(self):
        clock = FakeClock()
        throttler = Throttler(per_minute=1, per_hour=1000, per_day=1000, time_func=clock)
        assert throttler.try_acquire("a") is True
        assert throttler.try_acquire("a") is False
        # A different account has its own budget.
        assert throttler.try_acquire("b") is True

    def test_blocked_window_does_not_consume_others(self):
        clock = FakeClock()
        throttler = Throttler(per_minute=1, per_hour=5, per_day=5, time_func=clock)
        assert throttler.try_acquire("a") is True  # minute+hour+day each = 1
        assert throttler.try_acquire("a") is False  # blocked by minute
        clock.advance(61)
        # Minute freed; hour should still have 4 left (only 1 consumed total).
        stats = throttler.get_account_stats("a")
        assert stats["per_hour_used"] == 1
        assert throttler.try_acquire("a") is True

    def test_set_account_limits(self):
        clock = FakeClock()
        throttler = Throttler(per_minute=30, time_func=clock)
        throttler.set_account_limits("a", per_minute=1)
        assert throttler.try_acquire("a") is True
        assert throttler.try_acquire("a") is False

    def test_jitter_within_bounds(self):
        import random

        throttler = Throttler(jitter_seconds=5.0, rng=random.Random(1))
        for _ in range(50):
            j = throttler.get_jitter()
            assert 0.0 <= j <= 5.0

    def test_zero_jitter(self):
        throttler = Throttler(jitter_seconds=0.0)
        assert throttler.get_jitter() == 0.0

    def test_stats_shape(self):
        throttler = Throttler(per_minute=30)
        throttler.try_acquire("a")
        s = throttler.get_account_stats("a")
        assert set(
            ["per_minute_used", "per_minute_max", "per_hour_used", "wait_time"]
        ).issubset(s.keys())
        g = throttler.get_global_stats()
        assert g["tracked_accounts"] == 1

    def test_acquire_account_token_waits_then_succeeds(self):
        clock = FakeClock()
        throttler = Throttler(per_minute=1, per_hour=1000, per_day=1000, time_func=clock)
        throttler.try_acquire("a")  # exhaust the minute window

        slept = []

        async def fake_sleep(seconds):
            slept.append(seconds)
            clock.advance(seconds)  # simulate time passing during the wait

        asyncio.run(throttler.acquire_account_token("a", sleep=fake_sleep))
        assert slept  # it had to wait at least once
        assert sum(slept) >= 60.0

    def test_semaphores_default_sizes(self):
        throttler = Throttler(
            global_max_concurrency=5, per_account_concurrency=3
        )
        assert throttler.global_semaphore._value == 5
        assert throttler.account_semaphore("a")._value == 3
