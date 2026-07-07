import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import get_db
from app.models.account import Account
from app.repositories.anomaly_repository import get_anomalies, save_anomalies
from app.repositories.correction_repository import get_corrections, save_correction
from app.repositories.anomaly_status_repository import get_statuses, set_status, clear_status
from app.services.account_service import update_account_with_bilan
from app.ai.anomaly_service import build_anomalies_pdf

logger = logging.getLogger(__name__)

ALLOWED_CORRECTION_FIELDS = frozenset({
    "account_code",
    "solde_final",
    "solde_final_debit",
    "solde_final_credit",
    "solde_debit",
    "solde_credit",
    "debit",
    "credit",
    "label",
})

# Fields that hold text (not numeric) — kept as-is instead of being cast to float.
TEXT_CORRECTION_FIELDS = frozenset({"account_code", "label"})

router = APIRouter(
    prefix="/ai",
    tags=["Anomalies"],
    dependencies=[Depends(current_user)],
)


class SaveAnomaliesRequest(BaseModel):
    anomalies: list[dict]


class ApplyCorrectionRequest(BaseModel):
    anomaly_id: str
    compte_code: str | None = None
    field: str | None = None
    new_value: str | None = None
    note: str | None = None


# UI status for a single anomaly. "active" clears any stored status.
ANOMALY_STATUSES = frozenset({"ignored", "deleted", "active"})


class SetStatusRequest(BaseModel):
    anomaly_id: str
    status: str


@router.get("/anomalies/{upload_id}")
def get_upload_anomalies(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)
    anomalies = get_anomalies(db, upload_id)
    return {
        "success": True,
        "upload_id": upload_id,
        "count": len(anomalies),
        "anomalies": anomalies,
    }


@router.post("/anomalies/{upload_id}")
def save_upload_anomalies(
    upload_id: int,
    request: SaveAnomaliesRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    logger.info("save anomalies upload_id=%s count=%s", upload_id, len(request.anomalies))
    assert_upload_owned(db, upload_id, user)
    save_anomalies(db, upload_id, request.anomalies)
    return {"success": True, "upload_id": upload_id, "count": len(request.anomalies)}


@router.get("/anomalies/{upload_id}/pdf")
def export_anomalies_pdf(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)
    anomalies = get_anomalies(db, upload_id)
    if not anomalies:
        raise HTTPException(
            status_code=404,
            detail="Aucune anomalie enregistree pour cet upload.",
        )
    buf = build_anomalies_pdf(upload_id, anomalies)
    headers = {"Content-Disposition": f"attachment; filename=anomalies_{upload_id}.pdf"}
    return StreamingResponse(buf, media_type="application/pdf", headers=headers)


@router.get("/anomalies/{upload_id}/corrections")
def get_upload_corrections(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)
    corrections = get_corrections(db, upload_id)
    return {
        "success": True,
        "upload_id": upload_id,
        "corrections": [
            {
                "id": c.id,
                "anomaly_id": c.anomaly_id,
                "compte_code": c.compte_code,
                "field": c.field,
                "old_value": c.old_value,
                "new_value": c.new_value,
                "note": c.note,
                "corrected_at": c.corrected_at.isoformat() if c.corrected_at else None,
            }
            for c in corrections
        ],
    }


@router.post("/anomalies/{upload_id}/corrections")
def apply_correction(
    upload_id: int,
    request: ApplyCorrectionRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)

    old_value: str | None = None

    # If a compte_code and field are provided, update the account.
    if request.compte_code and request.field:
        if request.field not in ALLOWED_CORRECTION_FIELDS:
            raise HTTPException(
                status_code=400,
                detail=f"Champ '{request.field}' non modifiable. Champs autorisés : {sorted(ALLOWED_CORRECTION_FIELDS)}",
            )

        account = (
            db.query(Account)
            .filter(Account.upload_id == upload_id, Account.account_code == request.compte_code)
            .first()
        )
        if not account:
            raise HTTPException(
                status_code=404,
                detail=f"Compte '{request.compte_code}' introuvable pour cet upload.",
            )

        raw_old = getattr(account, request.field)
        old_value = str(raw_old) if raw_old is not None else None

        if request.new_value is None:
            raise HTTPException(status_code=400, detail="new_value est requis pour corriger un champ de compte.")

        if request.field in TEXT_CORRECTION_FIELDS:
            new_val: float | str = request.new_value
        else:
            try:
                new_val = float(request.new_value)
            except ValueError:
                raise HTTPException(status_code=400, detail="new_value doit être un nombre pour ce champ.")

        try:
            update_account_with_bilan(db, account.id, **{request.field: new_val})
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # Always persist the correction log entry.
    entry = save_correction(
        db=db,
        upload_id=upload_id,
        anomaly_id=request.anomaly_id,
        compte_code=request.compte_code,
        field=request.field,
        old_value=old_value,
        new_value=request.new_value,
        note=request.note,
    )

    logger.info(
        "correction saved upload_id=%s anomaly_id=%s compte=%s field=%s old=%s new=%s",
        upload_id, request.anomaly_id, request.compte_code, request.field, old_value, request.new_value,
    )

    return {
        "success": True,
        "correction": {
            "id": entry.id,
            "anomaly_id": entry.anomaly_id,
            "compte_code": entry.compte_code,
            "field": entry.field,
            "old_value": entry.old_value,
            "new_value": entry.new_value,
            "note": entry.note,
            "corrected_at": entry.corrected_at.isoformat() if entry.corrected_at else None,
        },
    }


@router.get("/anomalies/{upload_id}/statuses")
def get_upload_statuses(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)
    statuses = get_statuses(db, upload_id)
    return {
        "success": True,
        "upload_id": upload_id,
        "statuses": [
            {"anomaly_id": s.anomaly_id, "status": s.status} for s in statuses
        ],
    }


@router.post("/anomalies/{upload_id}/statuses")
def set_upload_status(
    upload_id: int,
    request: SetStatusRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)

    if request.status not in ANOMALY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Statut '{request.status}' invalide. Valeurs autorisées : {sorted(ANOMALY_STATUSES)}",
        )

    if request.status == "active":
        clear_status(db, upload_id, request.anomaly_id)
    else:
        set_status(db, upload_id, request.anomaly_id, request.status)

    logger.info(
        "anomaly status set upload_id=%s anomaly_id=%s status=%s",
        upload_id, request.anomaly_id, request.status,
    )
    return {"success": True, "upload_id": upload_id, "anomaly_id": request.anomaly_id, "status": request.status}
