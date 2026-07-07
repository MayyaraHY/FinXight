from sqlalchemy.orm import Session
from app.models.correction_log import CorrectionLog


def save_correction(
    db: Session,
    upload_id: int,
    anomaly_id: str,
    compte_code: str | None,
    field: str | None,
    old_value: str | None,
    new_value: str | None,
    note: str | None,
) -> CorrectionLog:
    entry = CorrectionLog(
        upload_id=upload_id,
        anomaly_id=anomaly_id,
        compte_code=compte_code,
        field=field,
        old_value=old_value,
        new_value=new_value,
        note=note,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_corrections(db: Session, upload_id: int) -> list[CorrectionLog]:
    return (
        db.query(CorrectionLog)
        .filter(CorrectionLog.upload_id == upload_id)
        .order_by(CorrectionLog.corrected_at.desc())
        .all()
    )
