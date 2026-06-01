"""
Build downloadable Excel (.xlsx) workbooks from the saved Bilan / Compte de Résultat
JSON. Used by the /export endpoint.

Layout:
  - "Bilan" sheet               — columns: Catégorie | Poste | Montant, then a TOTAUX block.
  - "Compte de Résultat" sheet  — columns: Ligne | Libellé | Montant (the 23 SCE lines),
                                  optional warnings appended at the bottom.
When both statements are requested they go in ONE workbook on the two sheets above.
"""

import io
import logging
from typing import Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)

BILAN_SHEET = "Bilan"
CR_SHEET = "Compte de Résultat"
BILAN_COLUMNS = ["Catégorie", "Poste", "Montant"]
CR_COLUMNS = ["Ligne", "Libellé", "Montant"]


def _pretty(key: str) -> str:
    """Turn a rules tree key like 'actifs_non_courants' into 'Actifs non courants'."""
    return key.replace("_", " ").strip().capitalize()


def _round(value):
    return round(value, 3) if isinstance(value, (int, float)) else value


def _flatten_bilan(bilan_data: Dict) -> List[Dict]:
    """Flatten the nested bilan tree into report rows + a totals block."""
    rows: List[Dict] = []
    tree = (bilan_data or {}).get("bilan", {})

    def walk(node: Dict, category: str) -> None:
        for key, value in node.items():
            if not isinstance(value, dict):
                continue
            # Leaf node carries an "amount" and a human "label".
            if "amount" in value and "label" in value:
                rows.append({
                    "Catégorie": category,
                    "Poste": value.get("label") or key,
                    "Montant": _round(value.get("amount", 0.0)),
                })
            else:
                # Grouping node — its key names the category for its children.
                walk(value, _pretty(key))

    walk(tree, "")

    # ── Totals block ────────────────────────────────────────────────────────
    totals = (bilan_data or {}).get("totals", {})
    actif = totals.get("actif", {})
    passif = totals.get("passif", {})
    rows.append({"Catégorie": "", "Poste": "", "Montant": ""})  # spacer
    for poste, val in [
        ("Total actifs non courants", actif.get("actifs_non_courants")),
        ("Total actifs courants",     actif.get("actifs_courants")),
        ("TOTAL ACTIF",               actif.get("total_actif")),
        ("Capitaux propres",          passif.get("capitaux_propres")),
        ("Total passifs non courants", passif.get("passifs_non_courants")),
        ("Total passifs courants",    passif.get("passifs_courants")),
        ("TOTAL PASSIF",              passif.get("total_passif")),
        ("Différence (Actif - Passif)", totals.get("difference")),
    ]:
        rows.append({"Catégorie": "TOTAUX", "Poste": poste, "Montant": _round(val)})
    rows.append({
        "Catégorie": "TOTAUX",
        "Poste": "Équilibré",
        "Montant": "Oui" if totals.get("balanced") else "Non",
    })
    return rows


def _flatten_cr(cr_data: Dict) -> List[Dict]:
    """Flatten the compte de résultat lines (sorted by line_id) into report rows."""
    rows: List[Dict] = []
    lines = (cr_data or {}).get("lines", {})

    # Stored as JSON, so keys may be strings ("1".."23"); sort numerically.
    for key in sorted(lines, key=lambda k: int(k)):
        line = lines[key]
        rows.append({
            "Ligne": line.get("line_id", key),
            "Libellé": line.get("label"),
            "Montant": _round(line.get("amount", 0.0)),
        })

    warnings = (cr_data or {}).get("warnings", [])
    if warnings:
        rows.append({"Ligne": "", "Libellé": "", "Montant": ""})  # spacer
        for w in warnings:
            rows.append({"Ligne": "⚠", "Libellé": w, "Montant": ""})
    return rows


def build_statements_workbook(
    bilan_data: Optional[Dict] = None,
    cr_data: Optional[Dict] = None,
) -> io.BytesIO:
    """
    Build an .xlsx workbook in memory. Writes only the statement(s) provided:
    a "Bilan" sheet when ``bilan_data`` is given and a "Compte de Résultat" sheet
    when ``cr_data`` is given (both → two sheets in one workbook).

    Returns a BytesIO positioned at 0, ready to stream as a download.
    """
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        wrote = False
        if bilan_data:
            pd.DataFrame(_flatten_bilan(bilan_data), columns=BILAN_COLUMNS).to_excel(
                writer, sheet_name=BILAN_SHEET, index=False
            )
            wrote = True
        if cr_data:
            pd.DataFrame(_flatten_cr(cr_data), columns=CR_COLUMNS).to_excel(
                writer, sheet_name=CR_SHEET, index=False
            )
            wrote = True
        if not wrote:
            # ExcelWriter requires at least one sheet.
            pd.DataFrame([{"Info": "Aucune donnée à exporter"}]).to_excel(
                writer, sheet_name="Vide", index=False
            )

    buf.seek(0)
    logger.info(
        "Built statements workbook (bilan=%s, cr=%s)",
        bilan_data is not None, cr_data is not None,
    )
    return buf
