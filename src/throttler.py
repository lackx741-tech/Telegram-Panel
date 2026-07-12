"""
Per-account and global rate limiting for outbound messages.

Telegram bans accounts that send too fast, so every send should pass through a
throttle that enforces a sustainable pace. This module provides:

* :class:`RateLimiter` -- a sliding-window (token-bucket-style) limiter that
  allows at most ``max_count`` events per ``window_seconds``.
* :class:`Throttler` -- per-account limiters for the minute / hour / day
  windows plus a global limiter, per-account and global concurrency
  semaphores, and configurable random jitter between sends.

The clock is injectable (``time_func``) and the jitter RNG is injectable
(``rng``) so behaviour can be unit-tested deterministically without real
waiting. The async ``acquire_*`` helpers use an injectable ``sleep`` for the
same reason.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from collections import deque
from typing import Awaitable, Callable, Deque, Dict, Optional

from src.constants import (
    DEFAULT_JITTER_SECONDS,
    DEFAULT_PER_ACCOUNT_CONCURRENCY,
    DEFAULT_RATE_PER_DAY,
    DEFAULT_RATE_PER_HOUR,
    DEFAULT_RATE_PER_MINUTE,
    GLOBAL_MAX_CONCURRENCY,
)

logger = logging.getLogger(__name__)


class RateLimiter:
    """Sliding-window rate limiter.

    Records a timestamp per accepted event and allows a new event only when
    fewer than ``max_count`` events fall within the trailing
    ``window_seconds``.
    """

    def __init__(
        self,
        max_count: int,
        window_seconds: float,
        time_func: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_count = max_count
        self.window_seconds = window_seconds
        self._time = time_func
        self._events: Deque[float] = deque()

    def _prune(self, now: Optional[float] = None) -> float:
        now = self._time() if now is None else now
        cutoff = now - self.window_seconds
        while self._events and self._events[0] <= cutoff:
            self._events.popleft()
        return now

    def acquire(self) -> bool:
        """Try to record one event. Returns True if it fit within the limit.

        A non-positive ``max_count`` disables the limiter (always allows).
        """
        if self.max_count <= 0:
            return True
        now = self._prune()
        if len(self._events) < self.max_count:
            self._events.append(now)
            return True
        return False

    def get_wait_time(self) -> float:
        """Seconds until the next event would be allowed (0 if allowed now)."""
        if self.max_count <= 0:
            return 0.0
        now = self._prune()
        if len(self._events) < self.max_count:
            return 0.0
        oldest = self._events[0]
        return max(0.0, oldest + self.window_seconds - now)

    @property
    def current_count(self) -> int:
        """Number of events currently inside the window."""
        self._prune()
        return len(self._events)

    def reset(self) -> None:
        self._events.clear()


class _AccountLimiters:
    """The minute / hour / day limiters that gate a single account."""

    def __init__(
        self,
        per_minute: int,
        per_hour: int,
        per_day: int,
        time_func: Callable[[], float],
    ) -> None:
        self.minute = RateLimiter(per_minute, 60, time_func)
        self.hour = RateLimiter(per_hour, 3600, time_func)
        self.day = RateLimiter(per_day, 86400, time_func)

    def all(self):
        return (self.minute, self.hour, self.day)

    def wait_time(self) -> float:
        return max(limiter.get_wait_time() for limiter in self.all())

    def try_acquire(self) -> bool:
        """Acquire from all three windows atomically.

        Only records on every window when *all* of them have room, so a send
        blocked by one window does not consume budget from the others.
        """
        if any(limiter.get_wait_time() > 0 for limiter in self.all()):
            return False
        for limiter in self.all():
            limiter.acquire()
        return True


AsyncSleep = Callable[[float], Awaitable[None]]


class Throttler:
    """Coordinates per-account and global rate limits, concurrency, jitter."""

    def __init__(
        self,
        per_minute: int = DEFAULT_RATE_PER_MINUTE,
        per_hour: int = DEFAULT_RATE_PER_HOUR,
        per_day: int = DEFAULT_RATE_PER_DAY,
        global_max_concurrency: int = GLOBAL_MAX_CONCURRENCY,
        per_account_concurrency: int = DEFAULT_PER_ACCOUNT_CONCURRENCY,
        jitter_seconds: float = DEFAULT_JITTER_SECONDS,
        time_func: Callable[[], float] = time.monotonic,
        rng: Optional[random.Random] = None,
    ) -> None:
        self._default_per_minute = per_minute
        self._default_per_hour = per_hour
        self._default_per_day = per_day
        self._per_account_concurrency = max(1, per_account_concurrency)
        self._jitter_seconds = max(0.0, jitter_seconds)
        self._time = time_func
        self._rng = rng if rng is not None else random

        self._accounts: Dict[object, _AccountLimiters] = {}
        self._account_semaphores: Dict[object, asyncio.Semaphore] = {}
        self._global = RateLimiter(
            per_minute * max(1, global_max_concurrency), 60, time_func
        )
        self._global_semaphore = asyncio.Semaphore(max(1, global_max_concurrency))

    # -- configuration -----------------------------------------------------

    def set_account_limits(
        self,
        account_id: object,
        per_minute: Optional[int] = None,
        per_hour: Optional[int] = None,
        per_day: Optional[int] = None,
    ) -> None:
        """Set (or reset) the minute/hour/day limits for one account."""
        self._accounts[account_id] = _AccountLimiters(
            per_minute if per_minute is not None else self._default_per_minute,
            per_hour if per_hour is not None else self._default_per_hour,
            per_day if per_day is not None else self._default_per_day,
            self._time,
        )

    def _limiters(self, account_id: object) -> _AccountLimiters:
        if account_id not in self._accounts:
            self.set_account_limits(account_id)
        return self._accounts[account_id]

    def _semaphore(self, account_id: object) -> asyncio.Semaphore:
        if account_id not in self._account_semaphores:
            self._account_semaphores[account_id] = asyncio.Semaphore(
                self._per_account_concurrency
            )
        return self._account_semaphores[account_id]

    # -- non-blocking primitives ------------------------------------------

    def try_acquire(self, account_id: object) -> bool:
        """Try to reserve a send slot for ``account_id`` without waiting.

        Both the account windows and the global window must have room; budget
        is only consumed when the whole reservation succeeds.
        """
        limiters = self._limiters(account_id)
        if limiters.wait_time() > 0 or self._global.get_wait_time() > 0:
            return False
        limiters.try_acquire()
        self._global.acquire()
        return True

    def get_wait_time(self, account_id: object) -> float:
        """Seconds to wait before ``account_id`` may send again."""
        return max(
            self._limiters(account_id).wait_time(), self._global.get_wait_time()
        )

    def get_jitter(self) -> float:
        """A random delay in ``[0, jitter_seconds]`` to spread out sends."""
        if self._jitter_seconds <= 0:
            return 0.0
        return self._rng.uniform(0.0, self._jitter_seconds)

    # -- async helpers -----------------------------------------------------

    async def acquire_account_token(
        self, account_id: object, sleep: AsyncSleep = asyncio.sleep
    ) -> None:
        """Block until a send slot is available for ``account_id``."""
        while not self.try_acquire(account_id):
            wait = self.get_wait_time(account_id)
            await sleep(max(wait, 0.01))

    async def apply_jitter(self, sleep: AsyncSleep = asyncio.sleep) -> None:
        """Sleep for a random jitter interval."""
        delay = self.get_jitter()
        if delay > 0:
            await sleep(delay)

    def account_semaphore(self, account_id: object) -> asyncio.Semaphore:
        """The concurrency semaphore for one account (default 3 slots)."""
        return self._semaphore(account_id)

    @property
    def global_semaphore(self) -> asyncio.Semaphore:
        """The global concurrency semaphore (default 5 slots)."""
        return self._global_semaphore

    # -- stats -------------------------------------------------------------

    def get_account_stats(self, account_id: object) -> Dict[str, object]:
        limiters = self._limiters(account_id)
        semaphore = self._semaphore(account_id)
        return {
            "per_minute_used": limiters.minute.current_count,
            "per_minute_max": limiters.minute.max_count,
            "per_hour_used": limiters.hour.current_count,
            "per_day_used": limiters.day.current_count,
            "wait_time": limiters.wait_time(),
            "semaphore_available": semaphore._value,  # best-effort snapshot
        }

    def get_global_stats(self) -> Dict[str, object]:
        return {
            "current_count": self._global.current_count,
            "wait_time": self._global.get_wait_time(),
            "semaphore_available": self._global_semaphore._value,
            "tracked_accounts": len(self._accounts),
        }
