"""Identity types passed from the auth layer to controllers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class CurrentUser:
    """The authenticated caller, derived from a verified JWT.

    Frozen so controllers cannot mutate identity mid-request. If a controller
    needs a derived value (e.g. an email domain), it computes it locally —
    never by reaching back into this object and rewriting it.

    Fields:
        id:         The user's stable UUID. The same value lives in
                    ``users.id`` in user-service's database, and is the
                    soft FK used by ``backend`` and ``ai-service`` when
                    persisting per-user data.
        email:      Point-in-time email at the moment the token was minted.
                    Use it for display only. If the user changes their
                    email, the next access token carries the new value.
        roles:      Names of roles granted (e.g. ``["VIEWER"]``,
                    ``["ADMIN", "ACCOUNTANT"]``). May be empty, never None.
        raw_claims: The full decoded claims dict. Kept for advanced cases
                    (audit logging, debugging). Most code should use the
                    typed fields above.
    """

    id: UUID
    email: str
    roles: list[str]
    raw_claims: dict[str, Any] = field(default_factory=dict)
