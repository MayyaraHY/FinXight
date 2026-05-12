"""In-memory JWKS cache.

Backend fetches user-service's public keys once, caches them in memory,
and uses them to verify JWT signatures locally. No per-request round-trip.

Cache strategy
--------------
- TTL refresh: re-fetch every ``ttl_seconds`` (default 1 hour).
- Force-refresh on cache miss: if a token's ``kid`` isn't in the current
  cache, refresh once before failing — handles the "user-service rotated
  keys mid-flight" case without requiring backend redeploy.

Threading
---------
The module-level ``jwks_client`` instance is shared across all FastAPI
worker threads. ``httpx.Client`` is thread-safe for sequential reads;
the dict swap (`self._cache = ...`) is atomic in CPython, so no lock
is needed for the typical read-mostly access pattern.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

JWKS_PATH = "/.well-known/jwks.json"


class JwksClient:
    def __init__(self, jwks_url: str, ttl_seconds: int = 3600) -> None:
        self._jwks_url = jwks_url
        self._ttl = ttl_seconds
        self._cache: dict[str, dict[str, Any]] = {}
        self._cache_expires_at: float = 0.0

    # ----- public API -----

    def get_key(self, kid: str) -> dict[str, Any]:
        """Return the JWK dict for the given ``kid``.

        Refreshes the cache if expired or if ``kid`` is unknown.
        Raises ``KeyError`` if the kid is still unknown after a forced refresh.
        """
        if self._is_expired():
            self._refresh()

        key = self._cache.get(kid)
        if key is not None:
            return key

        # Unknown kid — could be a freshly rotated key. Force one refresh.
        logger.info("jwks: kid=%s not in cache, forcing refresh", kid)
        self._refresh()
        key = self._cache.get(kid)
        if key is None:
            raise KeyError(f"Signing key with kid={kid!r} not found in JWKS")
        return key

    def get_signing_keys(self) -> dict[str, dict[str, Any]]:
        """Return the full {kid: jwk} mapping. Used by tests / diagnostics."""
        if self._is_expired():
            self._refresh()
        return dict(self._cache)

    # ----- internal -----

    def _is_expired(self) -> bool:
        return time.monotonic() >= self._cache_expires_at

    def _refresh(self) -> None:
        logger.debug("jwks: fetching %s", self._jwks_url)
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(self._jwks_url)
                resp.raise_for_status()
                doc = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Don't wipe the existing cache on transient failures — let stale
            # keys keep verifying while user-service recovers.
            logger.warning("jwks: refresh failed (%s); keeping stale cache", exc)
            # Push the next refresh attempt out a bit so we don't hammer
            # a struggling user-service on every request.
            self._cache_expires_at = time.monotonic() + min(60, self._ttl)
            return

        new_cache: dict[str, dict[str, Any]] = {}
        for jwk in doc.get("keys", []):
            kid = jwk.get("kid")
            if kid:
                new_cache[kid] = jwk

        self._cache = new_cache
        self._cache_expires_at = time.monotonic() + self._ttl
        logger.info("jwks: cached %d key(s): %s", len(new_cache), list(new_cache))


# Module-level singleton — one cache shared across the whole process.
jwks_client = JwksClient(jwks_url=f"{settings.USER_SERVICE_URL.rstrip('/')}{JWKS_PATH}")
