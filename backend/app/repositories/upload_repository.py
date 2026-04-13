from app.models.upload import Upload
from app.models.account import Account

def create_upload(db, filename: str, file_path: str, display_filename: str = None):
    upload = Upload(
        filename=filename,
        file_path=file_path,
        display_filename=display_filename,  # Optional custom display name
        status="uploaded"
    )

    db.add(upload)
    db.commit()
    db.refresh(upload)

    return upload

# 🔹 READ (one)
def get_upload_by_id(db, upload_id: int):
    return db.query(Upload).filter(Upload.id == upload_id).first()


# 🔹 READ (all)
def get_all_uploads(db):
    return db.query(Upload).all()


# 🔹 UPDATE
def update_upload(db, upload_id: int, display_filename: str = None):
    upload = get_upload_by_id(db, upload_id)

    if not upload:
        return None

    if display_filename:
        upload.display_filename = display_filename

    db.commit()
    db.refresh(upload)
    return upload


# 🔹 DELETE (one)
def delete_upload(db, upload_id: int):
    db.query(Upload).filter(Upload.id == upload_id).delete()
    db.commit()


# 🔹 DELETE (all)
def delete_all_uploads(db):
    db.query(Upload).delete()
    db.commit()