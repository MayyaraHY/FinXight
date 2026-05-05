"""
Background-task entry point for anomaly detection.

This runs AFTER a CSV upload has been parsed and accounts saved.
FastAPI closes the request's DB session as soon as the response is sent,
so this task opens its own SessionLocal — never reuse the request's `db`.
"""
import logging

from app.db.cnx import SessionLocal
from app.models.account import Account
from app.repositories.anomaly_repository import save_anomalies
from app.ai.ai_service_client import detect_anomalies

logger = logging.getLogger(__name__)


def run_anomaly_detection(upload_id: int) -> None:
    """
    Fetch accounts for an upload, ask the AI microservice to detect anomalies,
    and persist the result.

    Failures are swallowed and logged — this runs in a background task and
    must never crash the request that scheduled it. If detection fails, the
    user simply sees an empty anomaly list on the frontend.
    """
    db = SessionLocal()
    try:
        accounts = (
            db.query(Account)
            .filter(Account.upload_id == upload_id)
            .all()
        )
        if not accounts:
            logger.info(f"Anomaly detection: no accounts for upload {upload_id}")
            return

        accounts_data = [
            {
                "code": a.account_code,
                "label": a.label,
                "solde_debit": float(a.solde_debit or 0),
                "solde_credit": float(a.solde_credit or 0),
                "solde_final": float(a.solde_final or 0),
            }
            for a in accounts
        ]

        logger.info(
            f"Anomaly detection: sending {len(accounts_data)} accounts "
            f"for upload {upload_id} to AI service"
        )

        anomalies = detect_anomalies(accounts_data)

        save_anomalies(db, upload_id, anomalies)

        logger.info(
            f"Anomaly detection complete for upload {upload_id}: "
            f"{len(anomalies)} anomaly/anomalies found"
        )

    except Exception as e:
        # Background task — never re-raise. Just log so operators can investigate.
        logger.error(
            f"Anomaly detection failed for upload {upload_id}: {e}",
            exc_info=True,
        )
    finally:
        db.close()
