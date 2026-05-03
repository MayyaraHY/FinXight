from sqlalchemy.orm import Session
from app.models.anomaly import Anomaly


def save_anomalies(db: Session, upload_id: int, anomalies: list) -> None:
    record = db.query(Anomaly).filter(Anomaly.upload_id == upload_id).first()
    if record:
        record.anomalies = anomalies
    else:
        record = Anomaly(upload_id=upload_id, anomalies=anomalies)
        db.add(record)
    db.commit()


def get_anomalies(db: Session, upload_id: int) -> list:
    record = db.query(Anomaly).filter(Anomaly.upload_id == upload_id).first()
    return record.anomalies if record else []
