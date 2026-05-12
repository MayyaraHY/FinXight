"""Row-level ownership checks.

The Step-5 router-level ``Depends(current_user)`` enforces *authentication*
(do you have a valid JWT?). It does NOT enforce *authorization* (do you
own this specific row?). These helpers bridge that gap.

Pattern
-------
Every endpoint that operates on a resource identified by an ``upload_id``
calls :func:`assert_upload_owned` early, before touching the resource::

    @router.post("/parse/{upload_id}")
    def parse(upload_id: int, db = Depends(get_db),
              user: CurrentUser = Depends(current_user)):
        assert_upload_owned(db, upload_id, user)
        ...

This produces:
- ``404`` if the upload does not exist OR belongs to someone else
  (intentional — never reveal whether a stranger's ID is valid).
- The owned :class:`Upload` row on success, so callers can use it without
  a second DB hit if they need fields off it.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.models import CurrentUser


def assert_upload_owned(db, upload_id: int, user: CurrentUser):
    """Return the upload row if owned by ``user``, else raise 404.

    Rationale for 404 (not 403): returning 403 would confirm to an attacker
    that the upload ID exists. 404 reveals nothing.

    ``Upload`` is imported lazily here to avoid a circular import:
    ``app.auth`` is loaded very early (the FastAPI startup hook touches
    ``jwks_client``), while ``app.db.cnx`` registers domain models at the
    bottom of its module — the auth layer must not depend on the domain
    layer at import time.
    """
    from app.models.upload import Upload  # local import — see docstring

    upload = (
        db.query(Upload)
        .filter(Upload.id == upload_id, Upload.user_id == user.id)
        .first()
    )
    if upload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload {upload_id} not found",
        )
    return upload
