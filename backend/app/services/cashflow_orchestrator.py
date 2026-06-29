import json
import logging
from pathlib import Path
from uuid import UUID as PyUUID

from sqlalchemy.orm import Session

from app.models.upload import Upload
from app.repositories.cashflow_repository import get_cashflow_periods
from app.services.balance import signed_balance
from app.services.bilan_service import BilanService
from app.services.cashflow_service import CashFlowResult, CashFlowService
from app.services.compte_resultat_service import CompteResultatService

logger = logging.getLogger(__name__)

CASHFLOW_RULES_PATH = Path(__file__).resolve().parent.parent / "core" / "cashflow_rules.json"

# Period-movement accounts feeding the indirect-method adjustments (valeur_periode).
PERIOD_FLOW_CODES = ("681", "686", "687", "739")


class PeriodMissingError(Exception):
    """Raised when a required period (N or N-1) is absent for the company."""


def _load_rules() -> dict:
    return json.loads(CASHFLOW_RULES_PATH.read_text(encoding="utf-8"))


def _flatten_bilan(nested: dict) -> dict[str, float]:
    """Flatten a bilan tree to {"<parent>.<leaf>": amount}, where <parent> is the
    leaf's immediate parent key with spaces replaced by underscores — matching the
    `ref` spellings in cashflow_rules.json (e.g. "passifs_courant.fournisseurs...")."""
    flat: dict[str, float] = {}

    def walk(node: dict, parent_key: str | None) -> None:
        for key, value in node.items():
            if not isinstance(value, dict):
                continue
            if "amount" in value:  # leaf
                if parent_key is not None:
                    flat[f"{parent_key.replace(' ', '_')}.{key}"] = float(value["amount"])
            else:
                walk(value, key)

    walk(nested, None)
    return flat


class CashFlowOrchestrator:
    """Builds CashFlowService inputs from existing Bilan/CR/TB code and assembles
    the comparative (N / N-1) statement. Computes on demand — nothing persisted."""

    def __init__(self, db: Session):
        self.db = db
        self.rules = _load_rules()
        self.bilan_service = BilanService(db)
        self.bilan_tree = self.bilan_service.rules_loader.load_rules()["bilan_comptable_tunisien"]

    # ---- per-period engine inputs ----
    def _bilan_and_tb(self, upload: Upload) -> tuple[dict[str, float], dict[str, float]]:
        accounts = self.bilan_service.load_accounts(upload.id)
        bilan_flat = _flatten_bilan(self.bilan_service.process_tree(self.bilan_tree, accounts))
        tb = {acc.account_code: float(signed_balance(acc)) for acc in accounts}
        return bilan_flat, tb

    def _result_and_flows(
        self, upload: Upload, inventory_method: str
    ) -> tuple[float, dict[str, float]]:
        cr = CompteResultatService(self.db, inventory_method=inventory_method)
        accounts = cr.load_accounts(upload.id)
        lines, _ = cr.compute_all_lines(accounts)
        resultat_net = float(cr.compute_totals(lines)["resultat_net"])
        flows = {c: float(cr.sum_by_prefix(accounts, c)) for c in PERIOD_FLOW_CODES}
        return resultat_net, flows

    def _statement(
        self, current: Upload, previous: Upload, inventory_method: str
    ) -> CashFlowResult:
        bilan_cur, tb_cur = self._bilan_and_tb(current)
        bilan_prev, tb_prev = self._bilan_and_tb(previous)
        resultat_net, flows = self._result_and_flows(current, inventory_method)
        return CashFlowService(self.rules, self.bilan_tree).compute(
            resultat_net_n=resultat_net,
            bilan_n=bilan_cur,
            bilan_n_minus_1=bilan_prev,
            tb_balances_n=tb_cur,
            tb_balances_n_1=tb_prev,
            period_flows_n=flows,
        )

    def _missing_refs(self, bilan_flat: dict[str, float]) -> list[str]:
        """Silent-drop guard: every bilan_line_ref in the rules must resolve, else
        it contributes 0 unnoticed."""
        wanted: list[str] = []
        for section in ("flux_exploitation", "flux_investissement", "flux_financement"):
            cfg = self.rules[section]
            items = cfg.get("variations_bfr", {}) if section == "flux_exploitation" else cfg
            for key, item in items.items():
                if not isinstance(item, dict) or item.get("source") != "bilan_line_ref":
                    continue
                refs = item["ref"] if isinstance(item["ref"], list) else [item["ref"]]
                wanted.extend(refs)
        return sorted({r for r in wanted if r not in bilan_flat})

    # Bilan leaves that legitimately have no flux line: the cash target itself and
    # equity result lines (they articulate via résultat net), so don't flag them.
    _AUDIT_DENYLIST = {
        "actifs_courants.liquidites_et_equivalents_de_liquidites",
        "capitaux_propres.resultat_de_l_exercice",
        "capitaux_propres.resultat_reportes",
        # Split-handled, not dropped: its 50x go to dettes_court_terme (tb_codes),
        # its 532/537 CR are part of the treasury reconciliation.
        "passifs_courant.conours_bancaires_et_autres_passif_financier",
    }

    def _referenced_leaves(self) -> set[str]:
        """Flat bilan-leaf keys covered by some flux rule — bilan_line_ref refs plus
        each direct_accounts dot-path with its trailing '.comptes_valeurs_brutes'
        stripped (e.g. 'actifs_immobilises.immobilisations_incorporelles')."""
        refs: set[str] = set()
        for section in ("flux_exploitation", "flux_investissement", "flux_financement"):
            cfg = self.rules[section]
            items = cfg.get("variations_bfr", {}) if section == "flux_exploitation" else cfg
            for key, item in items.items():
                if not isinstance(item, dict):
                    continue
                if item.get("source") == "bilan_line_ref":
                    r = item["ref"]
                    refs.update(r if isinstance(r, list) else [r])
                elif item.get("source") == "direct_accounts":
                    for path in item.get("comptes_valeurs_brutes", []):
                        refs.add(path.rsplit(".", 1)[0])
        return refs

    def _uncaptured_movements(
        self, bilan_n_flat: dict[str, float], bilan_n_1_flat: dict[str, float]
    ) -> list[str]:
        """Audit: non-treasury bilan leaves with a nonzero period Δ that no flux rule
        captures. These are absorbed by the catch-all line; surfacing the largest
        ones explains that residual (and would have caught the dropped concours bug)."""
        referenced = self._referenced_leaves() | self._AUDIT_DENYLIST
        deltas: list[tuple[str, float]] = []
        for key in set(bilan_n_flat) | set(bilan_n_1_flat):
            if key in referenced:
                continue
            delta = bilan_n_flat.get(key, 0.0) - bilan_n_1_flat.get(key, 0.0)
            if abs(delta) > 1.0:
                deltas.append((key, delta))
        deltas.sort(key=lambda kv: abs(kv[1]), reverse=True)
        return [f"{k} (Δ {v:,.0f})" for k, v in deltas[:8]]

    # ---- public entry ----
    def build(
        self, company_id: int, user_id: PyUUID, year_n: int, inventory_method: str
    ) -> dict:
        periods = get_cashflow_periods(self.db, company_id, user_id, year_n)
        upload_n, upload_n_1, upload_n_2 = periods["n"], periods["n_1"], periods["n_2"]

        if upload_n is None or upload_n_1 is None:
            raise PeriodMissingError(
                f"Deux périodes consécutives requises : exercices {year_n} et {year_n - 1}."
            )

        stmt_n = self._statement(upload_n, upload_n_1, inventory_method)
        stmt_n_1 = (
            self._statement(upload_n_1, upload_n_2, inventory_method)
            if upload_n_2 is not None
            else None
        )

        warnings: list[str] = []
        bilan_n_flat, _ = self._bilan_and_tb(upload_n)
        bilan_n_1_flat, _ = self._bilan_and_tb(upload_n_1)

        missing = self._missing_refs(bilan_n_flat)
        if missing:
            msg = (
                "Lignes Bilan référencées mais introuvables (contribuent 0) : "
                + ", ".join(missing)
            )
            warnings.append(msg)
            logger.warning("Cashflow coverage: %s", msg)

        uncaptured = self._uncaptured_movements(bilan_n_flat, bilan_n_1_flat)
        if uncaptured:
            msg = (
                "Mouvements de bilan non ventilés (absorbés par la ligne de "
                "réconciliation) : " + " ; ".join(uncaptured)
            )
            warnings.append(msg)
            logger.info("Cashflow audit: %s", msg)

        return _to_response(
            year_n=year_n,
            upload_n=upload_n,
            upload_n_1=upload_n_1,
            stmt_n=stmt_n,
            stmt_n_1=stmt_n_1,
            warnings=warnings,
        )


def _section_pair(sec_n, sec_n_1):
    """Merge a section from statement N and (optional) N-1 line-by-line. Both come
    from the same rules, so lines align by position/label."""
    lines = []
    for i, line in enumerate(sec_n.lines):
        amt_n_1 = sec_n_1.lines[i].amount if sec_n_1 is not None else None
        lines.append({"label": line.label, "amount_n": line.amount, "amount_n_1": amt_n_1})
    return {
        "label": sec_n.label,
        "lines": lines,
        "total_n": sec_n.total,
        "total_n_1": sec_n_1.total if sec_n_1 is not None else None,
    }


def _period_label(upload: Upload, year: int) -> str:
    return f"Exercice {year}"


def _to_response(*, year_n, upload_n, upload_n_1, stmt_n, stmt_n_1, warnings) -> dict:
    has_prev = stmt_n_1 is not None
    return {
        "year_n": year_n,
        "year_n_1": year_n - 1,
        "label_n": _period_label(upload_n, year_n),
        "label_n_1": _period_label(upload_n_1, year_n - 1),
        "has_n_1_column": has_prev,
        "inventory_method": None,  # filled by controller
        "sections": [
            _section_pair(stmt_n.exploitation, stmt_n_1.exploitation if has_prev else None),
            _section_pair(stmt_n.investissement, stmt_n_1.investissement if has_prev else None),
            _section_pair(stmt_n.financement, stmt_n_1.financement if has_prev else None),
        ],
        "variation_tresorerie_n": stmt_n.variation_tresorerie,
        "variation_tresorerie_n_1": stmt_n_1.variation_tresorerie if has_prev else None,
        "tresorerie_debut_n": stmt_n.tresorerie_debut,
        "tresorerie_fin_n": stmt_n.tresorerie_fin,
        "tresorerie_debut_n_1": stmt_n_1.tresorerie_debut if has_prev else None,
        "tresorerie_fin_n_1": stmt_n_1.tresorerie_fin if has_prev else None,
        "reconciliation_ok_n": stmt_n.reconciliation_ok,
        "reconciliation_ecart_n": stmt_n.reconciliation_ecart,
        "reconciliation_ok_n_1": stmt_n_1.reconciliation_ok if has_prev else None,
        "reconciliation_ecart_n_1": stmt_n_1.reconciliation_ecart if has_prev else None,
        "warnings": warnings,
    }
