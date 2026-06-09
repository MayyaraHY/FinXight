from uuid import UUID as PyUUID

from sqlalchemy.orm import Session

from app.repositories.timeline_repository import get_timeline_data


def get_company_timeline(db: Session, company_id: int, user_id: PyUUID) -> list[dict]:
    return get_timeline_data(db, company_id, user_id)


def compare_periods(
    db: Session,
    company_id: int,
    user_id: PyUUID,
    year_a: int,
    year_b: int,
    month_a: int | None = None,
    month_b: int | None = None,
) -> dict | None:
    data = get_timeline_data(db, company_id, user_id)

    def match(entry: dict, year: int, month: int | None) -> bool:
        if entry["period_year"] != year:
            return False
        if month is not None and entry["period_month"] != month:
            return False
        return True

    period_a = next((d for d in data if match(d, year_a, month_a)), None)
    period_b = next((d for d in data if match(d, year_b, month_b)), None)

    if not period_a or not period_b:
        return None

    keys = [
        "total_actif",
        "actifs_non_courants",
        "actifs_courants",
        "total_passif",
        "capitaux_propres",
        "passifs_non_courants",
        "passifs_courants",
        "resultat_net",
    ]

    comparison = {}
    for key in keys:
        a = period_a.get(key)
        b = period_b.get(key)
        if a is not None and b is not None and a != 0:
            pct = round((b - a) / abs(a) * 100, 2)
        else:
            pct = None
        comparison[key] = {"a": a, "b": b, "delta": (b - a) if a is not None and b is not None else None, "pct": pct}

    return {"period_a": period_a, "period_b": period_b, "comparison": comparison}
