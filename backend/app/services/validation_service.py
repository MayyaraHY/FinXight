"""
Background-task entry point for PCGT account validation (Phase 7).

Runs AFTER a CSV upload has been parsed and accounts saved. FastAPI closes the
request's DB session as soon as the response is sent, so this task opens its own
SessionLocal — never reuse the request's `db`.

It writes a `pending` report row first (so the Validation tab can show a
"computing…" state immediately), runs the validator over the saved accounts, then
upserts the finished report. Failures are swallowed and logged: a validation
error must never affect the upload that scheduled it.
"""

import logging

from app.db.cnx import SessionLocal
from app.models.account import Account
from app.repositories.validation_repository import ValidationRepository
from app.services.account_validator import validate_accounts_batch

logger = logging.getLogger(__name__)


def run_account_validation(upload_id: int) -> None:
    db = SessionLocal()
    repo = ValidationRepository(db)
    try:
        # Mark as in-progress up front so the UI can render a loading state.
        repo.upsert(upload_id, status="pending", data=None)

        accounts = (
            db.query(Account).filter(Account.upload_id == upload_id).all()
        )
        rows = [{"account_code": a.account_code, "label": a.label} for a in accounts]

        report = validate_accounts_batch(rows)

        repo.upsert(upload_id, status="done", data=report)

        s = report["summary"]
        logger.info(
            "Validation complete for upload %s: %d valid, %d warnings, %d errors "
            "(of %d)",
            upload_id, s["valid"], s["warnings"], s["errors"], s["total"],
        )
    except Exception as e:  # noqa: BLE001 - background task must never re-raise
        logger.error("Validation failed for upload %s: %s", upload_id, e, exc_info=True)
        try:
            repo.upsert(upload_id, status="failed", data=None)
        except Exception:  # noqa: BLE001
            logger.error("Could not record validation failure for upload %s", upload_id)
    finally:
        db.close()
