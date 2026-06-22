from uuid import UUID as PyUUID

from sqlalchemy.orm import Session

from app.models.bilan import Bilan
from app.models.compte_resultat import CompteResultat
from app.models.upload import Upload


def get_timeline_data(db: Session, company_id: int, user_id: PyUUID) -> list[dict]:
    rows = (
        db.query(Upload, Bilan, CompteResultat)
        .outerjoin(Bilan, Bilan.upload_id == Upload.id)
        .outerjoin(CompteResultat, CompteResultat.upload_id == Upload.id)
        .filter(Upload.company_id == company_id, Upload.user_id == user_id)
        .order_by(
            Upload.period_year.asc().nullslast(),
            Upload.period_month.asc().nullslast(),
            # Tiebreaker: when an upload has duplicate bilan rows (no unique
            # constraint on Bilan.upload_id), the newest one wins after dedup.
            Bilan.created_at.desc().nullslast(),
        )
        .all()
    )

    result = []
    seen_uploads: set[int] = set()
    for upload, bilan, cr in rows:
        # The double outer join fans out when an upload has >1 bilan row; keep
        # only the first occurrence per upload (the most recent bilan).
        if upload.id in seen_uploads:
            continue
        seen_uploads.add(upload.id)

        totals = bilan.data.get("totals", {}) if bilan and bilan.data else {}
        actif = totals.get("actif", {})
        passif = totals.get("passif", {})

        resultat_net = None
        if cr and cr.data:
            cr_totals = cr.data.get("totals", {})
            resultat_net = cr_totals.get("resultat_net")

        result.append(
            {
                "upload_id": upload.id,
                "period_year": upload.period_year,
                "period_month": upload.period_month,
                "display_filename": upload.display_filename or upload.filename,
                "total_actif": actif.get("total_actif"),
                "actifs_non_courants": actif.get("actifs_non_courants"),
                "actifs_courants": actif.get("actifs_courants"),
                "total_passif": passif.get("total_passif"),
                "capitaux_propres": passif.get("capitaux_propres"),
                "passifs_non_courants": passif.get("passifs_non_courants"),
                "passifs_courants": passif.get("passifs_courants"),
                "resultat_net": resultat_net,
                "has_bilan": bilan is not None,
                "has_cr": cr is not None,
            }
        )
    return result
