import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import get_db
from app.services.bilan_service import BilanService
from app.services.compte_resultat_service import CompteResultatService
from app.services.export_service import build_statements_workbook

logger = logging.getLogger(__name__)

XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

router = APIRouter(
    prefix="/export",
    tags=["Export"],
    dependencies=[Depends(current_user)],
)


# =====================================================
# EXPORT BILAN / COMPTE DE RÉSULTAT / BOTH  AS .xlsx
# =====================================================
@router.get("/{upload_id}")
def export_statements(
    upload_id: int,
    content: str = Query(
        "both",
        enum=["bilan", "cr", "both"],
        description="Which statement(s) to export: 'bilan', 'cr', or 'both'.",
    ),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Download an Excel workbook of the SAVED bilan and/or compte de résultat.
    'both' produces one workbook with two sheets (Bilan + Compte de Résultat).
    Returns 404 if a requested statement hasn't been generated yet.
    """
    logger.info("export upload_id=%s content=%s by user_id=%s", upload_id, content, user.id)
    assert_upload_owned(db, upload_id, user)

    bilan_data = None
    cr_data = None

    if content in ("bilan", "both"):
        bilan = BilanService(db).repo.get_by_upload_id(upload_id)
        if not bilan:
            raise HTTPException(
                status_code=404,
                detail=f"Bilan not generated yet — POST /bilan/generate/{upload_id} first.",
            )
        bilan_data = bilan.data

    if content in ("cr", "both"):
        cr = CompteResultatService(db).repo.get_by_upload_id(upload_id)
        if not cr:
            raise HTTPException(
                status_code=404,
                detail=f"Compte de résultat not generated yet — POST /cr/generate/{upload_id} first.",
            )
        cr_data = cr.data

    workbook = build_statements_workbook(bilan_data, cr_data)
    filename = (
        f"statements_{upload_id}.xlsx"
        if content == "both"
        else f"{content}_{upload_id}.xlsx"
    )

    return StreamingResponse(
        workbook,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
