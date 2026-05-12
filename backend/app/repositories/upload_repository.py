from uuid import UUID as PyUUID

from app.models.upload import Upload


# 🔹 CREATE
def create_upload(
    db,
    filename: str,
    file_path: str,
    user_id: PyUUID,
    display_filename: str = None,
):
    """Insert a new upload row owned by ``user_id``.

    ``user_id`` is mandatory — it comes from the verified JWT ``sub`` claim.
    Callers must never pass ``None`` here; the column accepts NULL only to
    preserve legacy pre-auth rows.
    """
    upload = Upload(
        filename=filename,
        file_path=file_path,
        display_filename=display_filename,
        status="uploaded",
        user_id=user_id,
    )

    db.add(upload)
    db.commit()
    db.refresh(upload)

    return upload


# 🔹 READ (one, owner-scoped)
def get_upload_by_id(db, upload_id: int, user_id: PyUUID | None = None):
    """Fetch an upload, optionally restricted to a specific owner.

    Pass ``user_id`` to enforce ownership at query time — returns ``None``
    if the row exists but belongs to someone else, indistinguishable from
    "row does not exist" (intentional, to avoid leaking IDs).

    Pass ``user_id=None`` for internal callers (e.g. the parser worker
    triggered as a background task with no JWT context) — use sparingly.
    """
    query = db.query(Upload).filter(Upload.id == upload_id)
    if user_id is not None:
        query = query.filter(Upload.user_id == user_id)
    return query.first()


# 🔹 READ (all, owner-scoped)
def get_all_uploads(db, user_id: PyUUID):
    """List uploads owned by ``user_id``. Legacy rows (user_id IS NULL)
    are not returned — they have no owner and no one should see them."""
    return db.query(Upload).filter(Upload.user_id == user_id).all()


# 🔹 UPDATE (owner-scoped)
def update_upload(db, upload_id: int, user_id: PyUUID, display_filename: str = None):
    upload = get_upload_by_id(db, upload_id, user_id=user_id)
    if not upload:
        return None

    if display_filename:
        upload.display_filename = display_filename

    db.commit()
    db.refresh(upload)
    return upload


# 🔹 DELETE (one, owner-scoped)
def delete_upload(db, upload_id: int, user_id: PyUUID):
    db.query(Upload).filter(
        Upload.id == upload_id,
        Upload.user_id == user_id,
    ).delete()
    db.commit()


# 🔹 DELETE (all owned by user)
def delete_all_uploads(db, user_id: PyUUID):
    """Delete every upload owned by ``user_id``. Does NOT touch legacy
    unowned rows or other users' data."""
    db.query(Upload).filter(Upload.user_id == user_id).delete()
    db.commit()
