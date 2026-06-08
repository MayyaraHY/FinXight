import logging
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import json
from sqlalchemy.orm import Session

from app.models.account import Account
from app.repositories.compte_resultat_repository import CompteResultatRepository
from app.services.balance import signed_balance

logger = logging.getLogger(__name__)

CR_RULES_PATH = Path(__file__).resolve().parent.parent / "core" / "cr_rules.json"

# CR-relevant classes. An account in these classes that maps to no line is a
# real gap (rule missing or bad code) and must be surfaced, never dropped.
CR_CLASSES = ("6", "7")


class CompteResultatService:

    def __init__(self, db: Session, inventory_method: str = "permanent"):
        self.db = db
        self.repo = CompteResultatRepository(db)
        self.inventory_method = inventory_method
        self._rules: Optional[List[Dict]] = None
        self._index: Optional[List[Tuple[str, Decimal, int]]] = None

    # =====================================================
    # RULES LOADER
    # =====================================================
    def load_rules(self) -> List[Dict]:
        if self._rules is not None:
            return self._rules
        with open(CR_RULES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._rules = data["compte_resultat_tunisien"]["lines"]
        logger.info(f"CR rules loaded: {len(self._rules)} lines")
        return self._rules

    # =====================================================
    # PREFIX INDEX  (longest-match-wins)
    # =====================================================
    def build_index(self) -> List[Tuple[str, Decimal, int]]:
        """
        Flatten every computed/stock_variation rule account into
        (prefix, sign, line_id), sorted longest-prefix-first so a specific
        account (6861) wins over a broad one (681). Built once, cached.

        Inventory-method lines (L6/L7) contribute the account set for the
        ACTIVE method only, so the index never mixes permanent/intermittent.
        """
        if self._index is not None:
            return self._index

        index: List[Tuple[str, Decimal, int]] = []
        for rule in self.load_rules():
            if rule["type"] not in ("computed", "stock_variation"):
                continue

            if "comptes_permanent" in rule:
                if self.inventory_method == "permanent":
                    codes = list(rule.get("comptes_permanent", []))
                    # fallback accounts also belong to this line; they only
                    # contribute if the primary accounts net to zero, which
                    # compute_all_lines handles — keep them OUT of the index
                    # to avoid double counting here.
                else:
                    codes = list(rule.get("comptes_intermittent", []))
            else:
                codes = list(rule.get("comptes", []))

            for entry in codes:
                sign = Decimal("-1") if entry.startswith("-") else Decimal("1")
                index.append((entry.lstrip("-"), sign, rule["line_id"]))

        index.sort(key=lambda x: len(x[0]), reverse=True)
        self._index = index
        return index

    # =====================================================
    # ACCOUNTS LOADER
    # =====================================================
    def load_accounts(self, upload_id: int) -> List[Account]:
        accounts = (
            self.db.query(Account)
            .filter(Account.upload_id == upload_id)
            .all()
        )
        if not accounts:
            raise ValueError(f"No accounts found for upload {upload_id}")
        logger.info(f"Loaded {len(accounts)} accounts for upload {upload_id}")
        return accounts

    # =====================================================
    # BALANCE EXTRACTION  (sign-by-class)
    # =====================================================
    def get_balance(self, acc: Account) -> Decimal:
        """
        Sign-by-class convention for the income statement.

        signed_balance() is canonical DEBIT-POSITIVE. We flip class 7
        (produits, naturally credit) so revenues come out POSITIVE and charges
        (class 6, naturally debit) stay POSITIVE. Any account carrying the
        WRONG sign for its class then surfaces as a negative value instead of
        being masked — this is intentional: sign-masking was the core failure
        mode, so we no longer use abs().
        """
        bal = signed_balance(acc)
        if acc.account_code.startswith("7"):
            return -bal
        return bal

    # =====================================================
    # SUM BY EXACT PREFIX  (used by fallback + check_account only)
    # =====================================================
    def sum_by_prefix(self, accounts: List[Account], prefix: str) -> Decimal:
        """Raw prefix sum. Used for fallback/check computations where the
        longest-match index does not apply."""
        return sum(
            (
                self.get_balance(acc)
                for acc in accounts
                if acc.account_code.startswith(prefix)
            ),
            Decimal("0"),
        )

    def compute_from_comptes(
        self, comptes: List[str], accounts: List[Account]
    ) -> Decimal:
        """Apply explicit sign-prefix list (used only for L6/L7 fallback)."""
        total = Decimal("0")
        for entry in comptes:
            sign = Decimal("-1") if entry.startswith("-") else Decimal("1")
            prefix = entry.lstrip("-")
            total += sign * self.sum_by_prefix(accounts, prefix)
        return total

    # =====================================================
    # FORMULA EVALUATOR  e.g. [4, "-", 11]  or  [1, 2, 3]
    # =====================================================
    def _eval_formula(
        self, formula: List, computed: Dict[int, Decimal]
    ) -> Decimal:
        total = Decimal("0")
        sign = Decimal("1")
        for token in formula:
            if token == "+":
                sign = Decimal("1")
            elif token == "-":
                sign = Decimal("-1")
            else:
                total += sign * computed.get(int(token), Decimal("0"))
                sign = Decimal("1")
        return total

    # =====================================================
    # COMPUTE ALL 23 LINES
    # =====================================================
    def compute_all_lines(
        self, accounts: List[Account]
    ) -> Tuple[Dict[int, Dict], List[str]]:
        rules = self.load_rules()
        index = self.build_index()

        computed: Dict[int, Decimal] = {r["line_id"]: Decimal("0") for r in rules}
        matched_codes: Dict[int, List[str]] = {r["line_id"]: [] for r in rules}

        # ---- Pass 1: assign each account to its single best line ----------
        unmapped: List[str] = []
        for acc in accounts:
            code = acc.account_code
            hit = None
            for prefix, sign, line_id in index:
                if code.startswith(prefix):
                    hit = (sign, line_id)
                    break
            if hit is None:
                if code[:1] in CR_CLASSES:
                    unmapped.append(code)
                continue

            sign, line_id = hit
            rule = next(r for r in rules if r["line_id"] == line_id)

            # Stock variation keeps the SIGNED balance (its direction matters).
            if rule["type"] == "stock_variation":
                val = signed_balance(acc)
            else:
                val = self.get_balance(acc)

            computed[line_id] += sign * val
            matched_codes[line_id].append(code)

        # ---- L6 / L7 fallback: only when primary accounts netted to zero --
        for rule in rules:
            if "comptes_permanent" not in rule:
                continue
            if self.inventory_method != "permanent":
                continue
            line_id = rule["line_id"]
            if computed[line_id] == 0 and "fallback_permanent" in rule:
                computed[line_id] = self.compute_from_comptes(
                    rule["fallback_permanent"], accounts
                )
                matched_codes[line_id].append("(fallback)")

        # ---- Pass 2: formula lines (rules are ordered) --------------------
        for rule in rules:
            if rule["type"] == "formula":
                computed[rule["line_id"]] = self._eval_formula(
                    rule["formula"], computed
                )

        # ---- Serialise -----------------------------------------------------
        lines_output: Dict[int, Dict] = {}
        for rule in rules:
            line_id = rule["line_id"]
            lines_output[line_id] = {
                "line_id": line_id,
                "label": rule["label"],
                "amount": float(round(computed[line_id], 3)),
                "accounts": matched_codes[line_id],
            }

        return lines_output, unmapped

    # =====================================================
    # TOTALS
    # =====================================================
    def compute_totals(self, lines: Dict[int, Dict]) -> Dict:
        def amt(line_id: int) -> float:
            return lines.get(line_id, {}).get("amount", 0.0)

        return {
            "total_produits_exploitation":    amt(4),
            "total_charges_exploitation":     amt(11),
            "resultat_exploitation":          amt(12),
            "resultat_ordinaire_avant_impot": amt(17),
            "resultat_ordinaire_apres_impot": amt(19),
            "resultat_net":                   amt(21),
            "resultat_apres_modifications":   amt(23),
        }

    # =====================================================
    # VALIDATION
    # =====================================================
    def validate(
        self,
        lines: Dict[int, Dict],
        accounts: List[Account],
        unmapped: List[str],
    ) -> List[str]:
        warnings: List[str] = []

        # ── Unmapped class 6/7 accounts (silent-drop guard) ─────────────────
        if unmapped:
            warnings.append(
                f"{len(unmapped)} compte(s) de charges/produits non affecté(s) à "
                f"une ligne du CR (lacune de règle ou code invalide) : "
                f"{', '.join(sorted(set(unmapped)))}."
            )

        # ── Per-line check_account (e.g. L21 vs compte 13) ──────────────────
        for rule in self.load_rules():
            check_accounts = rule.get("check_account")
            if not check_accounts:
                continue

            line_id = rule["line_id"]
            calculated = lines.get(line_id, {}).get("amount", 0.0)

            # 131 (bénéfice) / 135 (perte) are class-1 equity accounts.
            # get_balance leaves class 1 debit-positive, so a credit-balance
            # profit on 131 returns NEGATIVE. The CR résultat net is positive
            # for a profit. We therefore compare against the NEGATED bilan
            # figure: -(131_debit_positive) = credit balance = profit > 0.
            bilan_raw = Decimal("0")
            labels: List[str] = []
            for entry in check_accounts:
                sign = Decimal("-1") if entry.startswith("-") else Decimal("1")
                prefix = entry.lstrip("-")
                bilan_raw += sign * self.sum_by_prefix(accounts, prefix)
                labels.append(prefix)

            # Flip to the income-statement sign (credit profit -> positive).
            bilan_result = float(-bilan_raw)

            if bilan_result != 0 and abs(calculated - bilan_result) > 1.0:
                label = rule.get("label", f"Ligne {line_id}")
                accs = "/".join(labels)
                warnings.append(
                    f"{label} calculé ({calculated:,.3f} DT) ≠ "
                    f"Compte(s) {accs} au bilan ({bilan_result:,.3f} DT). "
                    f"Vérifiez les comptes {accs} (solde pré-clôture possible)."
                )

        return warnings

    # =====================================================
    # MAIN ENTRY POINT
    # =====================================================
    def calculate_and_save(self, upload_id: int) -> Dict:
        logger.info(f"Starting CR calculation for upload {upload_id}")
        try:
            accounts = self.load_accounts(upload_id)

            for acc in accounts[:5]:
                logger.info(
                    "DIAG account=%s solde_final=%s sfd=%s sfc=%s → balance=%s",
                    acc.account_code, acc.solde_final,
                    acc.solde_final_debit, acc.solde_final_credit,
                    self.get_balance(acc),
                )

            lines, unmapped = self.compute_all_lines(accounts)
            totals   = self.compute_totals(lines)
            warnings = self.validate(lines, accounts, unmapped)

            final_result = {
                "lines":    lines,
                "totals":   totals,
                "warnings": warnings,
            }

            self.repo.update(upload_id, final_result)
            logger.info(f"✓ Compte de résultat saved for upload {upload_id}")
            return final_result

        except Exception as e:
            logger.error(
                f"CR calculation failed for upload {upload_id}: {e}",
                exc_info=True,
            )
            raise

    # =====================================================
    # AI ANALYSIS
    # =====================================================
    def analyze(self, upload_id: int) -> dict:
        cr = self.repo.get_by_upload_id(upload_id)
        if not cr or not cr.data:
            raise ValueError("Aucun compte de résultat trouvé. Générez d'abord le CR.")

        warnings = cr.data.get("warnings", [])
        if not warnings:
            return {"cr_diagnosis": None}

        from app.ai.groq_client import ask_groq, KnowledgeScope
        from app.ai.prompts import CR_DIAGNOSIS_PROMPT
        import json as _json

        context = {
            "cr_lines": cr.data.get("lines", {}),
            "totals":   cr.data.get("totals", {}),
            "warnings": warnings,
        }
        prompt = CR_DIAGNOSIS_PROMPT.replace(
            "{warnings}", _json.dumps(warnings, ensure_ascii=False, indent=2)
        )
        cr_diagnosis = ask_groq(prompt, context=context, scope=KnowledgeScope.NONE)
        result = {"cr_diagnosis": cr_diagnosis}

        updated_data = dict(cr.data)
        updated_data.update(result)
        self.repo.update(upload_id, updated_data)
        return result

    # =====================================================
    # UPDATE / DELETE
    # =====================================================
    def update_cr(self, upload_id: int, data: dict) -> dict:
        cr = self.repo.get_by_upload_id(upload_id)
        if not cr:
            raise ValueError(f"No compte de résultat found for upload {upload_id}")
        updated = self.repo.update(upload_id, data)
        return updated.data

    def delete_cr(self, upload_id: int) -> None:
        self.repo.delete_by_upload_id(upload_id)
        logger.info(f"CR deleted for upload {upload_id}")