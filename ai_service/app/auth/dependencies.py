from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.auth.jwt_verifier import verify_token
from app.auth.models import CurrentUser

logger = logging.getLogger(__name__)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def current_user(token: Optional[str] = Depends(oauth2_scheme)) -> CurrentUser:
    """Extract and verify the bearer token, return the authenticated caller.

    Raises 401 if the header is missing, malformed, or the token fails
    any verification rule from ``docs/jwt-contract.md``.
    """
    if not token:
        raise _unauthorized("Missing bearer token")

    claims = verify_token(token)

    try:
        user_id = UUID(claims["sub"])
    except (KeyError, ValueError):
        logger.warning("jwt: sub missing or not a UUID: %r", claims.get("sub"))
        raise _unauthorized("Malformed token subject")

    email = claims.get("email")
    if not email:
        logger.warning("jwt: email claim missing")
        raise _unauthorized("Malformed token claims")

    roles = claims.get("roles") or []
    if not isinstance(roles, list):
        roles = []

    return CurrentUser(
        id=user_id,
        email=email,
        roles=list(roles),
        raw_claims=claims,
    )


def require_role(role: str):
    """Build a dependency that allows only callers with the given role.

    Usage::

        @router.delete("/users/{id}",
                       dependencies=[Depends(require_role("ADMIN"))])
        def delete_user(...): ...

    Returns 403 (not 401) on role mismatch — the caller IS authenticated,
    just not authorized for this action.
    """
    def _check(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if role not in user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' required",
            )
        return user

    return _check


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": 'Bearer realm="api"'},
    )
