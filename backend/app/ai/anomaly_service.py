"""
Background-task entry point for anomaly detection.

This runs AFTER a CSV upload has been parsed and accounts saved.
FastAPI closes the request's DB session as soon as the response is sent,
so this task opens its own SessionLocal — never reuse the request's `db`.
"""
import logging
from datetime import date
from io import BytesIO

from fpdf import FPDF

from app.db.cnx import SessionLocal
from app.models.account import Account
from app.repositories.anomaly_repository import save_anomalies
from app.ai.ai_service_client import detect_anomalies

logger = logging.getLogger(__name__)

_SEVERITY_LABELS = {
    "critique": "Critique",
    "avertissement": "Avertissement",
    "info": "PCGT",
}

_UNICODE_REPLACEMENTS = {
    "—": "-",   # em dash
    "–": "-",   # en dash
    "‘": "'",   # left single quote
    "’": "'",   # right single quote
    "“": '"',   # left double quote
    "”": '"',   # right double quote
    "…": "...", # ellipsis
    " ": " ",   # non-breaking space
}


def _safe(text: str) -> str:
    for char, replacement in _UNICODE_REPLACEMENTS.items():
        text = text.replace(char, replacement)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def build_anomalies_pdf(upload_id: int, anomalies: list[dict]) -> BytesIO:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, f"Rapport d'Anomalies - Upload #{upload_id}", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 8, f"Genere le {date.today().strftime('%d/%m/%Y')}", ln=True)
    pdf.ln(4)

    counts: dict[str, int] = {"critique": 0, "avertissement": 0, "info": 0}
    for a in anomalies:
        sev = a.get("severity", "info")
        if sev in counts:
            counts[sev] += 1

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(
        0, 8,
        f"Resume : {counts['critique']} critique(s)  |  "
        f"{counts['avertissement']} avertissement(s)  |  "
        f"{counts['info']} PCGT",
        ln=True,
    )
    pdf.ln(4)

    col_w = {"sev": 28, "src": 38, "compte": 22, "probleme": 72, "suggestion": 30}
    pdf.set_fill_color(240, 240, 240)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(col_w["sev"], 7, "Severite", border=1, fill=True)
    pdf.cell(col_w["src"], 7, "Source", border=1, fill=True)
    pdf.cell(col_w["compte"], 7, "Compte", border=1, fill=True)
    pdf.cell(col_w["probleme"], 7, "Probleme", border=1, fill=True)
    pdf.cell(col_w["suggestion"], 7, "Suggestion", border=1, fill=True, ln=True)

    pdf.set_font("Helvetica", "", 8)
    for a in anomalies:
        raw_sev = a.get("severity", "")
        sev_label = _safe(_SEVERITY_LABELS.get(raw_sev, raw_sev))
        src = _safe(a.get("source", ""))
        compte = _safe((a.get("compte") or "")[:20])
        probleme = _safe((a.get("probleme") or "")[:110])
        suggestion = _safe((a.get("suggestion") or "")[:55])
        pdf.cell(col_w["sev"], 6, sev_label, border=1)
        pdf.cell(col_w["src"], 6, src, border=1)
        pdf.cell(col_w["compte"], 6, compte, border=1)
        pdf.cell(col_w["probleme"], 6, probleme, border=1)
        pdf.cell(col_w["suggestion"], 6, suggestion, border=1, ln=True)

    buf = BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf


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
