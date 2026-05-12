"""Public auth surface for backend controllers.

Always import from ``app.auth`` — never from the deeper modules.
This indirection is what makes the future API-gateway migration a
one-file change instead of a project-wide refactor.

Public names:
    - :class:`CurrentUser`  — the authenticated caller's identity
    - :func:`current_user`  — FastAPI dependency yielding ``CurrentUser``
    - :func:`require_role`  — dependency factory for role-gated routes
"""

from app.auth.dependencies import current_user, require_role
from app.auth.models import CurrentUser
from app.auth.ownership import assert_upload_owned

__all__ = ["CurrentUser", "current_user", "require_role", "assert_upload_owned"]
