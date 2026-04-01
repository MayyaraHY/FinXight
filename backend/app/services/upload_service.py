import os
from app.core.config import settings
from app.repositories.upload_repository import create_upload

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

def save_file_and_register(db, file):
    file_path = os.path.join(settings.UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as f:
        f.write(file.file.read())

    upload = create_upload(
        db=db,
        filename=file.filename,
        file_path=file_path
    )

    return upload