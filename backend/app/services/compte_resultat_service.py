import logging
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional

import json
from sqlalchemy.orm import Session

from app.models.account import Account
from app.repositories.compte_resultat_repository import CompteResultatRepository
from app.services.balance import signed_balance

logger = logging.getLogger(__name__)

CR_RULES_PATH = Path(__file__).resolve().parent.parent / "core" / "cr_rules.json"


class CompteResultatService:

    def __init__(self, db: Session, inventory_method: str = "permanent"):
        self.db = db
        self.repo = CompteResultatRepository(db)
        self.inventory_method = inventory_method
        self._rules: Optional[List[Dict]] = None

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
    # BALANCE EXTRACTION  (same logic as BilanService)
    # =====================================================
    def get_balance(self, acc: Account) -> Decimal:
        # MAGNITUDE convention for the income statement.
        #
        # The CR rules (cr_rules.json) were authored around each account
        # contributing its natural positive magnitude, with explicit "-" prefixes
        # for contra accounts (e.g. "-709" subtracts rebates from revenue). We
        # therefore take the absolute value of the canonical signed balance, which
        # makes the result IDENTICAL across every CSV layout (previously a single
        # "solde_final" column returned a signed value — so revenues came out
        # negative on those files and every CR total was wrong; R1).
        #
        # NOTE: stock variation (line 5) deliberately bypasses this and keeps the
        # signed value — see compute_line() — because its sign is meaningful (R2).
        return abs(signed_balance(acc))

    # =====================================================
    # ACCOUNT MATCHING BY PREFIX
    # =====================================================
    def sum_by_prefix(self, accounts: List[Account], prefix: str) -> Decimal:
        """Sum balances of all accounts whose code starts with prefix."""
        return sum(
            (
                self.get_balance(acc)
                for acc in accounts
                if acc.account_code.startswith(prefix)
            ),
            Decimal("0"),
        )

    # =====================================================
    # COMPUTE ONE LINE FROM ITS COMPTES
    # =====================================================
    def compute_from_comptes(
        self, comptes: List[str], accounts: List[Account]
    ) -> Decimal:
        """
        Apply sign rules from prefix list.
        "-701" → subtract, "701" → add.
        Revenue accounts (7x) credit = positive, debit = negative.
        Expense accounts (6x) debit = positive, credit = negative.
        """
        total = Decimal("0")
        for entry in comptes:
            sign = Decimal("-1") if entry.startswith("-") else Decimal("1")
            prefix = entry.lstrip("-")
            total += sign * self.sum_by_prefix(accounts, prefix)
        return total

    # =====================================================
    # COMPUTE SINGLE LINE
    # =====================================================
    def compute_line(
        self,
        rule: Dict,
        accounts: List[Account],
        computed: Dict[int, Decimal],
    ) -> Decimal:
        line_type = rule["type"]

        # --- Direct account computation ---
        if line_type == "computed":
            comptes = rule.get("comptes", [])
            return self.compute_from_comptes(comptes, accounts)

        # --- Stock variation: SIGNED net debit-credit of compte 71 (R2) ---
        #     A stock variation can legitimately be positive or negative, so we
        #     keep the signed balance here instead of the magnitude used elsewhere.
        if line_type == "stock_variation":
            prefix = rule["comptes"][0]
            return sum(
                (
                    signed_balance(acc)
                    for acc in accounts
                    if acc.account_code.startswith(prefix)
                ),
                Decimal("0"),
            )

        # NOTE: inventory-method lines (L6/L7, which carry "comptes_permanent") are
        # handled directly in compute_all_lines() before compute_line() is reached.
        # The previous duplicate branch here was unreachable (the "computed" check
        # above always returned first) and has been removed.

        # --- Formula lines: sum/subtract already-computed lines ---
        if line_type == "formula":
            return self._eval_formula(rule["formula"], computed)

        logger.warning(f"Unknown line type '{line_type}' for line {rule['line_id']}")
        return Decimal("0")

    # =====================================================
    # FORMULA EVALUATOR  e.g. [4, "-", 11]  or  [1, 2, 3]
    # =====================================================
    def _eval_formula(
        self, formula: List, computed: Dict[int, Decimal]
    ) -> Decimal:
        """
        Supports two formats:
          [1, 2, 3]           → L1 + L2 + L3  (sum)
          [4, "-", 11]        → L4 - L11
          [12, "-", 13, "+", 14, "+", 15, "-", 16]
        """
        total = Decimal("0")
        sign = Decimal("1")

        for token in formula:
            if token == "+":
                sign = Decimal("1")
            elif token == "-":
                sign = Decimal("-1")
            else:
                # token is a line_id integer
                total += sign * computed.get(int(token), Decimal("0"))
                sign = Decimal("1")  # reset to + after each operand

        return total

    # =====================================================
    # COMPUTE ALL 23 LINES
    # =====================================================
    def compute_all_lines(self, accounts: List[Account]) -> Dict[int, Dict]:
        rules = self.load_rules()
        computed: Dict[int, Decimal] = {}   # line_id → amount
        lines_output: Dict[int, Dict] = {}  # final serialisable result

        for rule in rules:
            line_id = rule["line_id"]

            # L6/L7 special: re-route to inventory-method handler
            if "comptes_permanent" in rule:
                if self.inventory_method == "permanent":
                    comptes = rule.get("comptes_permanent", [])
                    amount = self.compute_from_comptes(comptes, accounts)
                    if amount == 0 and "fallback_permanent" in rule:
                        amount = self.compute_from_comptes(
                            rule["fallback_permanent"], accounts
                        )
                else:
                    amount = self.compute_from_comptes(
                        rule.get("comptes_intermittent", []), accounts
                    )
            else:
                amount = self.compute_line(rule, accounts, computed)

            computed[line_id] = amount
            lines_output[line_id] = {
                "line_id": line_id,
                "label": rule["label"],
                "amount": float(round(amount, 3)),
            }

        return lines_output

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
    # VALIDATION: cross-check résultat net vs compte 13
    # =====================================================
    def validate(
        self, lines: Dict[int, Dict], accounts: List[Account]
    ) -> List[str]:
        warnings = []

        # ── Per-line checks driven by "check_account" in the rules ──────────
        for rule in self.load_rules():
            check_accounts = rule.get("check_account")
            if not check_accounts:
                continue

            line_id    = rule["line_id"]
            calculated = lines.get(line_id, {}).get("amount", 0.0)

            # Same sign-prefix convention as comptes: "-135" → subtract
            bilan_result = Decimal("0")
            account_labels: List[str] = []
            for entry in check_accounts:
                sign   = Decimal("-1") if entry.startswith("-") else Decimal("1")
                prefix = entry.lstrip("-")
                bilan_result  += sign * self.sum_by_prefix(accounts, prefix)
                account_labels.append(prefix)

            bilan_result_f = float(bilan_result)

            if bilan_result_f != 0 and abs(calculated - bilan_result_f) > 1.0:
                label        = rule.get("label", f"Ligne {line_id}")
                accounts_str = "/".join(account_labels)
                warnings.append(
                    f"{label} calculé ({calculated:,.3f} DT) ≠ "
                    f"Compte(s) {accounts_str} au bilan ({bilan_result_f:,.3f} DT). "
                    f"Vérifiez les comptes {accounts_str}."
                )

        return warnings

    # =====================================================
    # MAIN ENTRY POINT
    # =====================================================
    def calculate_and_save(self, upload_id: int) -> Dict:
        """
        1. Load accounts
        2. Compute all 23 lines
        3. Compute totals
        4. Validate
        5. Save to DB
        """
        logger.info(f"Starting CR calculation for upload {upload_id}")

        try:
            accounts = self.load_accounts(upload_id)

            # Diagnostic: log first 5 accounts so we can verify which balance
            # column is populated and what get_balance returns.
            for acc in accounts[:5]:
                bal = self.get_balance(acc)
                logger.info(
                    "DIAG account=%s solde_final=%s sfd=%s sfc=%s "
                    "solde_debit=%s solde_credit=%s → balance=%s",
                    acc.account_code,
                    acc.solde_final,
                    acc.solde_final_debit,
                    acc.solde_final_credit,
                    acc.solde_debit,
                    acc.solde_credit,
                    bal,
                )

            lines    = self.compute_all_lines(accounts)
            totals   = self.compute_totals(lines)
            warnings = self.validate(lines, accounts)

            final_result = {
                "lines":    lines,
                "totals":   totals,
                "warnings": warnings,
            }

            self.repo.update(upload_id, final_result)
            logger.info(f"✓ Compte de résultat saved for upload {upload_id}")

            return final_result

        except Exception as e:
            logger.error(f"CR calculation failed for upload {upload_id}: {e}", exc_info=True)
            raise

    # =====================================================
    # UPDATE (manual override from controller)
    # =====================================================
    def update_cr(self, upload_id: int, data: dict) -> dict:
        cr = self.repo.get_by_upload_id(upload_id)
        if not cr:
            raise ValueError(f"No compte de résultat found for upload {upload_id}")
        updated = self.repo.update(upload_id, data)
        return updated.data

    # =====================================================
    # DELETE
    # =====================================================
    def delete_cr(self, upload_id: int) -> None:
        self.repo.delete_by_upload_id(upload_id)
        logger.info(f"CR deleted for upload {upload_id}")