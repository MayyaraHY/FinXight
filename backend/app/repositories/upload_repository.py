from app.models.upload import Upload

def create_upload(db, filename: str, file_path: str):
    upload = Upload(
        filename=filename,
        file_path=file_path,
        status="uploaded"
    )

    db.add(upload)
    db.commit()
    db.refresh(upload)

    return upload