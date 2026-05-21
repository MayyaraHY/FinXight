from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
import logging

from app.models.account import Account
from app.repositories.bilan_repository import BilanRepository
from app.core.accounting_loader import AccountingRulesLoader

logger = logging.getLogger(__name__)


class BilanService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = BilanRepository(db)
        self.rules_loader = AccountingRulesLoader()
        logger.info("BilanService initialized with AccountingRulesLoader singleton")

    # =====================================================
    # LOAD ACCOUNTS
    # =====================================================
    def load_accounts(self, upload_id: int) -> List[Account]:
        accounts = self.db.query(Account).filter(
            Account.upload_id == upload_id
        ).all()

        if not accounts:
            raise ValueError(f"No accounts found for upload {upload_id}")

        logger.info(f"Loaded {len(accounts)} accounts for upload {upload_id}")
        return accounts

    # =====================================================
    # BALANCE EXTRACTION
    # =====================================================
    def get_balance(self, acc: Account) -> Decimal:
        # 1. Signed net balance (most common format)
        if acc.solde_final is not None:
            return Decimal(str(acc.solde_final))

        # 2. Sage X3 split debit/credit columns (absolute values)
        #    Rules handle direction via sign prefixes ("-109", "101"), so
        #    we return the value as-is without negating the credit side.
        if acc.solde_final_debit:
            return Decimal(str(acc.solde_final_debit))
        if acc.solde_final_credit:
            return Decimal(str(acc.solde_final_credit))

        # 3. Period balances (older export format)
        if acc.solde_debit:
            return Decimal(str(acc.solde_debit))
        if acc.solde_credit:
            return -Decimal(str(acc.solde_credit))

        # 4. Raw movements (last resort)
        if acc.debit:
            return Decimal(str(acc.debit))
        if acc.credit:
            return -Decimal(str(acc.credit))

        return Decimal("0")

    # =====================================================
    # RULE NORMALIZATION
    # =====================================================
    def normalize_entry(self, entry: str) -> Dict:
        """
        Parse a rule entry string into its components.

        Supported formats:
          "101"        → prefix=101, sign=+1, side=None
          "-109"       → prefix=109, sign=-1, side=None  (subtract)
          "(422 DR)"   → prefix=422, sign=+1, side=DR    (debit accounts only)
          "532 CR"     → prefix=532, sign=+1, side=CR    (credit accounts only)
          "-269"       → prefix=269, sign=-1, side=None
        """
        entry = entry.replace("(", "").replace(")", "").strip()

        sign = 1
        side = None

        if entry.startswith("-"):
            sign = -1
            entry = entry[1:]

        if " " in entry:
            prefix, side = entry.split()
        else:
            prefix = entry

        return {"prefix": prefix, "side": side, "sign": sign}

    def _passes_side_filter(self, amount: Decimal, side: Optional[str]) -> bool:
        """
        Return False if the account should be skipped based on the DR/CR filter.

        DR filter: keep only accounts with a debit (positive) balance.
        CR filter: keep only accounts with a credit (negative) balance.
        """
        if side == "DR" and amount < 0:
            return False
        if side == "CR" and amount > 0:
            return False
        return True

    def match(self, code: str, prefix: str) -> bool:
        return code.startswith(prefix)

    # =====================================================
    # CORE CALCULATION PER NODE
    # =====================================================
    def compute_node(self, node: Dict, accounts: List[Account]) -> Dict:
        brut = Decimal("0")
        amort = Decimal("0")
        net = Decimal("0")
        used_accounts = set()
        breakdown = []

        # ── BRUT (Gross value) ────────────────────────────────────────────────
        for entry in node.get("comptes_valeurs_brutes", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if not self.match(acc.account_code, rule["prefix"]):
                    continue

                amount = self.get_balance(acc)

                if not self._passes_side_filter(amount, rule["side"]):
                    continue

                computed = amount * rule["sign"]
                brut += computed
                used_accounts.add(acc.account_code)
                breakdown.append({
                    "phase": "brut",
                    "account": acc.account_code,
                    "label": acc.label,
                    "raw_amount": float(amount),
                    "signed_amount": float(computed),
                    "rule_prefix": rule["prefix"],
                })

        # ── AMORT (Depreciation / Provisions) ────────────────────────────────
        for entry in node.get("comptes_amortissements_provisions", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if not self.match(acc.account_code, rule["prefix"]):
                    continue

                # Amortization accounts always contribute as absolute values
                amount = abs(self.get_balance(acc))
                amort += amount
                used_accounts.add(acc.account_code)
                breakdown.append({
                    "phase": "amort",
                    "account": acc.account_code,
                    "label": acc.label,
                    "raw_amount": float(amount),
                })

        # ── NET (Direct net values — e.g. frais préliminaires) ───────────────
        for entry in node.get("comptes_valeurs_nettes", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if not self.match(acc.account_code, rule["prefix"]):
                    continue

                amount = self.get_balance(acc)
                computed = amount * rule["sign"]
                net += computed
                used_accounts.add(acc.account_code)
                breakdown.append({
                    "phase": "net",
                    "account": acc.account_code,
                    "label": acc.label,
                    "raw_amount": float(amount),
                    "signed_amount": float(computed),
                    "rule_prefix": rule["prefix"],
                })

        # ── AFFECTATION (Passif: capital, reserves, liabilities) ─────────────
        #
        # BUG 1 FIX — sign: passif accounts are credit-natured → stored as
        #   negative in the DB (e.g. capital 101 = -13,900,000). We negate so
        #   the displayed amount is positive (+13,900,000).
        #   The "-" prefix in rules (e.g. "-109") still works correctly:
        #   sign=-1 × negate = double-negate = additive effect.
        #
        # BUG 2 FIX — tracking: populate used_accounts and breakdown so the
        #   passif sections have a full audit trail (was always empty before).
        #
        # BUG 3 FIX — side filter: apply the same DR/CR filter used for
        #   comptes_valeurs_brutes. Without this, DR-balance accounts (e.g.
        #   bank accounts 532xx with debit balance) are wrongly included in
        #   passif sections like "concours bancaires" ("532 CR" rule), causing
        #   double-counting and understating the passif total.
        for entry in node.get("comptes_affectation", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if not self.match(acc.account_code, rule["prefix"]):
                    continue

                amount = self.get_balance(acc)

                # BUG 3 FIX — side filter (was missing for affectation)
                if not self._passes_side_filter(amount, rule["side"]):
                    continue

                # BUG 1 FIX — negate to convert CR convention to display sign
                computed = -(amount * rule["sign"])
                net += computed

                # BUG 2 FIX — audit trail
                used_accounts.add(acc.account_code)
                breakdown.append({
                    "phase": "affectation",
                    "account": acc.account_code,
                    "label": acc.label,
                    "raw_amount": float(amount),
                    "signed_amount": float(computed),
                    "rule_prefix": rule["prefix"],
                })

        # ── FINAL AMOUNT ──────────────────────────────────────────────────────
        # Gross/depreciation path: used for asset sections with amortization.
        # Net-only path: used for sections with no gross/amort (affectation, nettes).
        final_amount = (brut - amort) if (brut != 0 or amort != 0) else net

        return {
            "amount": float(final_amount),
            "used_accounts": list(used_accounts),
            "amount_details": {
                "brut": float(brut),
                "amortissement": float(amort),
                "net": float(net),
                "breakdown": breakdown,
            },
        }

    # =====================================================
    # RECURSIVE TREE WALK
    # =====================================================
    def process_tree(self, tree: Dict, accounts: List[Account]) -> Dict:
        result = {}

        for key, value in tree.items():
            if isinstance(value, dict) and "label" in value:
                # Leaf node: calculate it
                node_result = self.compute_node(value, accounts)
                result[key] = {
                    "label": value["label"],
                    "amount": node_result["amount"],
                    "used_accounts": node_result["used_accounts"],
                    "amount_details": node_result["amount_details"],
                }
            elif isinstance(value, dict):
                # Parent node: recurse
                result[key] = self.process_tree(value, accounts)

        return result

    # =====================================================
    # TOTALS
    # =====================================================
    def compute_totals(self, result: Dict) -> Dict:
        """Sum only leaf nodes (nodes that have an 'amount' key)."""

        def sum_leaf_nodes(node: Dict) -> float:
            total = 0.0
            for v in node.values():
                if isinstance(v, dict) and "amount" in v:
                    total += v["amount"]
                elif isinstance(v, dict):
                    total += sum_leaf_nodes(v)
            return total

        actifs = result.get("actifs", {})
        actifs_non_courants = sum_leaf_nodes(actifs.get("actifs_non_courants", {}))
        actifs_courants     = sum_leaf_nodes(actifs.get("actifs_courants", {}))
        total_actif         = actifs_non_courants + actifs_courants

        passif_root          = result.get("capitaux propres et passifs", {})
        capitaux_propres     = sum_leaf_nodes(passif_root.get("capitaux propres", {}))
        passifs              = passif_root.get("passifs", {})
        passifs_non_courants = sum_leaf_nodes(passifs.get("passifs non courant", {}))
        passifs_courants     = sum_leaf_nodes(passifs.get("passifs courant", {}))
        total_passif         = capitaux_propres + passifs_non_courants + passifs_courants

        difference = total_actif - total_passif

        logger.info(
            f"Bilan totals — Actif: {total_actif:,.2f} | "
            f"Passif: {total_passif:,.2f} | Diff: {difference:,.2f}"
        )

        return {
            "actif": {
                "actifs_non_courants": actifs_non_courants,
                "actifs_courants":     actifs_courants,
                "total_actif":         total_actif,
            },
            "passif": {
                "capitaux_propres":     capitaux_propres,
                "passifs_non_courants": passifs_non_courants,
                "passifs_courants":     passifs_courants,
                "total_passif":         total_passif,
            },
            "difference": difference,
        }

    # =====================================================
    # MAIN ENTRY POINT
    # =====================================================
    def calculate_and_save(self, upload_id: int) -> Dict:
        """
        Full workflow: load accounts → apply rules → calculate bilan → save.

        Returns:
            dict with keys 'bilan' (full detail), 'totals', and optionally 'analysis'.

        Raises:
            ValueError: if no accounts are found for the given upload_id.
        """
        logger.info(f"Starting bilan calculation for upload {upload_id}")

        try:
            # 1. Load accounts from DB
            accounts = self.load_accounts(upload_id)

            # 2. Load rules (singleton — cached after first load)
            rules = self.rules_loader.load_rules()
            tree  = rules["bilan_comptable_tunisien"]

            # 3. Apply rules to accounts
            result = self.process_tree(tree, accounts)

            # 4. Compute section totals
            totals = self.compute_totals(result)

            final_result = {"bilan": result, "totals": totals}

            # 5. Persist to DB
            self.repo.update(upload_id, final_result)
            logger.info(f"Bilan saved for upload {upload_id}")

            # 6. AI interpretation (non-blocking — failure does not abort)
            try:
                from app.ai.ai_service_client import analyze_bilan
                final_result["analysis"] = analyze_bilan(totals)
            except Exception as e:
                logger.warning(f"AI interpretation skipped: {e}")

            return final_result

        except Exception as e:
            logger.error(f"Bilan calculation failed for upload {upload_id}: {e}", exc_info=True)
            raise