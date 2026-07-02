from collections import defaultdict
from uuid import UUID as PyUUID

from sqlalchemy.orm import Session

from app.core import metric_variables
from app.repositories.custom_metric_repository import CustomMetricRepository
from app.repositories.timeline_repository import get_timeline_data
from app.services import metric_engine


def _delta_pct(a: float | None, b: float | None) -> dict:
    """Authoritative a/b/delta/pct block, shared by base KPIs and custom metrics."""
    delta = (b - a) if a is not None and b is not None else None
    pct = round((b - a) / abs(a) * 100, 2) if a is not None and b is not None and a != 0 else None
    return {"a": a, "b": b, "delta": delta, "pct": pct}


def _attach_metric_values(period: dict, metrics: list) -> None:
    """Compute every custom metric for this period server-side and attach them as
    `metric_values: {metric_id(str): value|None}` — the authoritative values the
    frontend renders (no more client-side formula evaluation)."""
    var_map = metric_variables.build_var_map(period)
    period["metric_values"] = {
        str(m.id): metric_engine.evaluate(m.formula, var_map) for m in metrics
    }


def get_company_timeline(db: Session, company_id: int, user_id: PyUUID) -> dict:
    periods = get_timeline_data(db, company_id, user_id)
    # Global library metrics (user-scoped) computed against this company's data.
    metrics = CustomMetricRepository(db).get_by_user(user_id)
    for p in periods:
        _attach_metric_values(p, metrics)

    seen: dict[tuple, list[int]] = defaultdict(list)
    for p in periods:
        if p["period_year"] is not None and p["period_month"] is not None:
            seen[(p["period_year"], p["period_month"])].append(p["upload_id"])

    warnings = [
        {
            "type": "duplicate_period",
            "period_year": year,
            "period_month": month,
            "upload_ids": upload_ids,
        }
        for (year, month), upload_ids in seen.items()
        if len(upload_ids) > 1
    ]

    return {"periods": periods, "warnings": warnings}


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

    comparison = {key: _delta_pct(period_a.get(key), period_b.get(key)) for key in keys}

    # Custom metrics: authoritative value + delta/pct, keyed "custom:{id}".
    metrics = CustomMetricRepository(db).get_by_user(user_id)
    var_a = metric_variables.build_var_map(period_a)
    var_b = metric_variables.build_var_map(period_b)
    for m in metrics:
        va = metric_engine.evaluate(m.formula, var_a)
        vb = metric_engine.evaluate(m.formula, var_b)
        comparison[f"custom:{m.id}"] = _delta_pct(va, vb)

    _attach_metric_values(period_a, metrics)
    _attach_metric_values(period_b, metrics)

    return {"period_a": period_a, "period_b": period_b, "comparison": comparison}
