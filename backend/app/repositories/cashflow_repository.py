from uuid import UUID as PyUUID

from sqlalchemy.orm import Session

from app.models.upload import Upload


def _latest_in_year(uploads: list[Upload], year: int) -> Upload | None:
    """The representative upload for a calendar year = the latest period in
    that year (highest period_month, nulls treated as oldest), id as tiebreaker."""
    in_year = [u for u in uploads if u.period_year == year]
    if not in_year:
        return None
    return max(in_year, key=lambda u: ((u.period_month or 0), u.id))


def get_cashflow_periods(
    db: Session, company_id: int, user_id: PyUUID, year_n: int
) -> dict[str, Upload | None]:
    """Return the representative uploads for years N, N-1 and N-2 (each may be
    None). N and N-1 drive the statement for year N; N-2 enables the comparative
    N-1 column."""
    uploads = (
        db.query(Upload)
        .filter(Upload.company_id == company_id, Upload.user_id == user_id)
        .all()
    )
    return {
        "n": _latest_in_year(uploads, year_n),
        "n_1": _latest_in_year(uploads, year_n - 1),
        "n_2": _latest_in_year(uploads, year_n - 2),
    }
