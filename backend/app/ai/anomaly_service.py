import json
import logging
from app.db.cnx import SessionLocal
from app.models.account import Account
from app.ai.gemini_client import ask_gemini_anomaly_detection
from app.repositories.anomaly_repository import save_anomalies

logger = logging.getLogger(__name__)


def run_anomaly_detection(upload_id: int) -> None:
    """
    Background task: fetch accounts for upload_id, ask Gemini to detect anomalies,
    and persist results. Creates its own DB session since the request session
    will be closed before this runs.
    """
    db = SessionLocal()
    try:
        accounts = db.query(Account).filter(Account.upload_id == upload_id).all()
        if not accounts:
            logger.warning(f"No accounts found for anomaly detection on upload {upload_id}")
            return

        accounts_data = [
            {
                "account_code": a.account_code,
                "label": a.label,
                "debit": float(a.debit or 0),
                "credit": float(a.credit or 0),
                "solde_final": float(a.solde_final or 0),
            }
            for a in accounts
        ]

        raw = ask_gemini_anomaly_detection(accounts_data)

        try:
            anomalies = json.loads(raw) if raw.strip().startswith("[") else []
        except json.JSONDecodeError:
            logger.warning(f"Gemini returned non-JSON anomaly response for upload {upload_id}")
            anomalies = []

        save_anomalies(db, upload_id, anomalies)
        logger.info(
            f"Anomaly detection complete for upload {upload_id}: {len(anomalies)} anomalies found"
        )

    except Exception as e:
        logger.error(f"Anomaly detection background task failed for upload {upload_id}: {e}", exc_info=True)
    finally:
        db.close()
