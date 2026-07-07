from sqlalchemy.orm import Session
from app.models.anomaly_status import AnomalyStatus


def get_statuses(db: Session, upload_id: int) -> list[AnomalyStatus]:
    return (
        db.query(AnomalyStatus)
        .filter(AnomalyStatus.upload_id == upload_id)
        .all()
    )


def set_status(db: Session, upload_id: int, anomaly_id: str, status: str) -> AnomalyStatus:
    """Upsert the status for a single anomaly."""
    record = (
        db.query(AnomalyStatus)
        .filter(
            AnomalyStatus.upload_id == upload_id,
            AnomalyStatus.anomaly_id == anomaly_id,
        )
        .first()
    )
    if record:
        record.status = status
    else:
        record = AnomalyStatus(upload_id=upload_id, anomaly_id=anomaly_id, status=status)
        db.add(record)
    db.commit()
    db.refresh(record)
    return record


def clear_status(db: Session, upload_id: int, anomaly_id: str) -> None:
    """Remove any stored status for an anomaly (restores it to the default view)."""
    db.query(AnomalyStatus).filter(
        AnomalyStatus.upload_id == upload_id,
        AnomalyStatus.anomaly_id == anomaly_id,
    ).delete()
    db.commit()
