"""JWT signature + claim verification.

Hardcoded constants
-------------------
``ISSUER``, ``AUDIENCE``, and ``ALGORITHMS`` are intentionally not driven
by environment variables. They are part of the cross-service integration
contract documented in ``user-service/docs/jwt-contract.md`` and must
change in lockstep with that document — never via a stray env-var override
that could silently relax the security model.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from jose import jwt
from jose.exceptions import JWTError

from app.auth.jwks_client import jwks_client

logger = logging.getLogger(__name__)

# These three values mirror the Step-1 JWT contract and the
# Spring decoder validators in user-service/JwtConfig.java.
ISSUER = "user-service"
AUDIENCE = "financial-engine"
ALGORITHMS = ["RS256"]

# Tolerance for clock drift between user-service and backend, in seconds.
CLOCK_SKEW_LEEWAY = 30


def verify_token(token: str) -> dict[str, Any]:
    """Verify a JWT and return its claims.

    Validates: signature (via JWKS), algorithm (RS256 only), issuer,
    audience, and expiration.

    Raises:
        HTTPException(401): on any failure. The exception detail is a
            generic ``"Invalid or expired token"`` — never the underlying
            error message, which could help an attacker probe.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        logger.debug("jwt: malformed header: %s", exc)
        raise _unauthorized()

    kid = unverified_header.get("kid")
    if not kid:
        logger.debug("jwt: missing kid in header")
        raise _unauthorized()

    try:
        jwk_dict = jwks_client.get_key(kid)
    except KeyError as exc:
        logger.warning("jwt: %s", exc)
        raise _unauthorized()

    try:
        claims = jwt.decode(
            token,
            key=jwk_dict,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            issuer=ISSUER,
            options={"leeway": CLOCK_SKEW_LEEWAY},
        )
    except JWTError as exc:
        logger.debug("jwt: decode failed: %s", exc)
        raise _unauthorized()

    return claims


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": 'Bearer realm="api"'},
    )
