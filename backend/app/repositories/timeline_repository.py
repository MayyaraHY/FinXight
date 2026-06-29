from uuid import UUID as PyUUID

from sqlalchemy.orm import Session

from app.models.bilan import Bilan
from app.models.compte_resultat import CompteResultat
from app.models.upload import Upload


def _flatten_bilan(nested: dict) -> dict[str, float]:
    """Flatten the bilan tree to {"<parent>.<leaf>": amount} (parent = immediate
    parent key, spaces → underscores), so leaves can be looked up by a stable key."""
    flat: dict[str, float] = {}

    def walk(node: dict, parent_key: str | None) -> None:
        for key, value in node.items():
            if not isinstance(value, dict):
                continue
            if "amount" in value:  # leaf
                if parent_key is not None:
                    flat[f"{parent_key.replace(' ', '_')}.{key}"] = value["amount"]
            else:
                walk(value, key)

    walk(nested, None)
    return flat


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

        # Named bilan leaves (for custom-metric formula variables).
        leaves = (
            _flatten_bilan(bilan.data.get("bilan", {}))
            if bilan and bilan.data else {}
        )

        cr_totals = cr.data.get("totals", {}) if cr and cr.data else {}

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
                "resultat_net": cr_totals.get("resultat_net"),
                # CR lines (named statement variables)
                "produits_exploitation": cr_totals.get("total_produits_exploitation"),
                "charges_exploitation": cr_totals.get("total_charges_exploitation"),
                "resultat_exploitation": cr_totals.get("resultat_exploitation"),
                # Bilan leaves (named statement variables)
                "stocks": leaves.get("actifs_courants.stocks"),
                "clients": leaves.get("actifs_courants.clients_et_comptes_rattaches"),
                "fournisseurs": leaves.get("passifs_courant.fournisseurs_et_comptes_rattaches"),
                "autres_actifs_courants": leaves.get("actifs_courants.autres_actifs_courants"),
                "autres_passifs_courants": leaves.get("passifs_courant.autres_passifs_courants"),
                "liquidites": leaves.get("actifs_courants.liquidites_et_equivalents_de_liquidites"),
                "concours_bancaires": leaves.get(
                    "passifs_courant.conours_bancaires_et_autres_passif_financier"
                ),
                "has_bilan": bilan is not None,
                "has_cr": cr is not None,
            }
        )
    return result
