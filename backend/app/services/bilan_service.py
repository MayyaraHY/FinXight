import json
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.models.account import Account
from app.repositories.bilan_repository import BilanRepository


class BilanService:

    def __init__(self, db: Session):
        self.db = db
        self.repo = BilanRepository(db)

    # =====================================================
    # LOAD RULES (SAFE PATH + CACHE)
    # =====================================================
    _rules_cache = None

    def load_rules(self) -> Dict:
        if self._rules_cache:
            return self._rules_cache

        base_path = Path(__file__).resolve().parent.parent
        rules_path = base_path / "core" / "bilan_rules.json"

        with open(rules_path, "r", encoding="utf-8") as f:
            self._rules_cache = json.load(f)

        return self._rules_cache

    # =====================================================
    # LOAD ACCOUNTS
    # =====================================================
    def load_accounts(self, upload_id: int) -> List[Account]:
        accounts = self.db.query(Account).filter(
            Account.upload_id == upload_id
        ).all()

        if not accounts:
            raise ValueError("No accounts found for this upload")

        return accounts

    # =====================================================
    # BALANCE EXTRACTION
    # =====================================================
    def get_balance(self, acc: Account) -> Decimal:
        if acc.solde_final is not None:
            return Decimal(acc.solde_final)

        if acc.solde_debit:
            return Decimal(acc.solde_debit)

        if acc.solde_credit:
            return -Decimal(acc.solde_credit)

        if acc.debit:
            return Decimal(acc.debit)

        if acc.credit:
            return -Decimal(acc.credit)

        return Decimal("0")

    # =====================================================
    # RULE NORMALIZATION
    # =====================================================
    def normalize_entry(self, entry: str):
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

        return {
            "prefix": prefix,
            "side": side,
            "sign": sign
        }

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

        # -------- BRUT --------
        for entry in node.get("comptes_valeurs_brutes", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if self.match(acc.account_code, rule["prefix"]):
                    amount = self.get_balance(acc)

                    if rule["side"] == "DR" and amount < 0:
                        continue
                    if rule["side"] == "CR" and amount > 0:
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
                        "rule_prefix": rule["prefix"]
                    })

        # -------- AMORT --------
        for entry in node.get("comptes_amortissements_provisions", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if self.match(acc.account_code, rule["prefix"]):
                    amount = abs(self.get_balance(acc))
                    amort += amount
                    computed = amount * rule["sign"]

                    used_accounts.add(acc.account_code)
                    breakdown.append({
                        "phase": "amort",
                        "account": acc.account_code,
                        "label" : acc.label,
                        "raw_amount": float(amount)
                    })

        # -------- NET --------
        for entry in node.get("comptes_valeurs_nettes", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if self.match(acc.account_code, rule["prefix"]):
                    amount = self.get_balance(acc)
                    net += amount * rule["sign"]
                    used_accounts.add(acc.account_code)
                    breakdown.append({
                        "phase": "net",
                        "account": acc.account_code,
                        "label" : acc.label,
                        "raw_amount": float(amount)
                    })

        # -------- AFFECTATION --------
        for entry in node.get("comptes_affectation", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if self.match(acc.account_code, rule["prefix"]):
                    amount = self.get_balance(acc)
                    net += amount * rule["sign"]

        final_amount = (brut - amort) if (brut != 0 or amort != 0) else net

        return {
            "amount": float(final_amount),
            "used_accounts": list(used_accounts),
            "amount_details": {
                "brut": float(brut),
                "amortissement": float(amort),
                "net": float(net),
                "breakdown": breakdown
            }
        }
    # =====================================================
    # RECURSIVE TREE WALK
    # =====================================================
    def process_tree(self, tree: Dict, accounts: List[Account]) -> Dict:

        result = {}

        for key, value in tree.items():

            if isinstance(value, dict) and "label" in value:
                node_result = self.compute_node(value, accounts)


                result[key] = {
                    "label": value["label"],
                    "amount": node_result["amount"],
                    "used_accounts": node_result["used_accounts"],
                    "amount_details": node_result["amount_details"]
                }

            elif isinstance(value, dict):
                result[key] = self.process_tree(value, accounts)

        return result

    # =====================================================
    # TOTALS (IMPORTANT)
    # =====================================================
    def compute_totals(self, result: Dict) -> Dict:

        def sum_leaf_nodes(node):
            """
            Only sum REAL accounting lines (nodes with 'amount')
            Ignore parent aggregations
            """
            total = 0

            for v in node.values():
                if isinstance(v, dict) and "amount" in v:
                    total += v["amount"]
                elif isinstance(v, dict):
                    total += sum_leaf_nodes(v)

            return total

        # =========================
        # ACTIF STRUCTURE
        # =========================
        actifs = result.get("actifs", {})

        actifs_non_courants = sum_leaf_nodes(
            actifs.get("actifs_non_courants", {})
        )

        actifs_courants = sum_leaf_nodes(
            actifs.get("actifs_courants", {})
        )

        total_actif = actifs_non_courants + actifs_courants

        # =========================
        # PASSIF STRUCTURE
        # =========================
        passif_root = result.get("capitaux propres et passifs", {})

        capitaux_propres = sum_leaf_nodes(
            passif_root.get("capitaux propres", {})
        )

        passifs = passif_root.get("passifs", {})

        passifs_non_courants = sum_leaf_nodes(
            passifs.get("passifs non courant", {})
        )

        passifs_courants = sum_leaf_nodes(
            passifs.get("passifs courant", {})
        )

        total_passif = (
            capitaux_propres
            + passifs_non_courants
            + passifs_courants
        )

        # =========================
        # FINAL STRUCTURED OUTPUT
        # =========================
        return {
            "actif": {
                "actifs_non_courants": actifs_non_courants,
                "actifs_courants": actifs_courants,
                "total_actif": total_actif
            },
            "passif": {
                "capitaux_propres": capitaux_propres,
                "passifs_non_courants": passifs_non_courants,
                "passifs_courants": passifs_courants,
                "total_passif": total_passif
            },
            "difference": total_actif - total_passif
        }
    # =====================================================
    # MAIN FUNCTION
    # =====================================================
    def calculate_and_save(self, upload_id: int):

        # 1. Load accounts
        accounts = self.load_accounts(upload_id)

        # 2. Load rules
        rules = self.load_rules()
        tree = rules["bilan_comptable_tunisien"]

        # 3. Compute bilan
        result = self.process_tree(tree, accounts)

        # 4. Compute totals
        totals = self.compute_totals(result)

        final_result = {
            "bilan": result,
            "totals": totals
        }

        # 5. Save to DB
        self.repo.update(upload_id, final_result)

        return final_result

    # =====================================================
    # CRUD OPERATIONS
    # =====================================================
    def get_bilan(self, upload_id: int) -> Optional[dict]:
        """
        Get bilan by upload_id.
        
        Args:
            upload_id: Upload ID
            
        Returns:
            Bilan data dict or None if not found
        """
        bilan = self.repo.get_by_upload_id(upload_id)
        if not bilan:
            return None
        return bilan.data

    def update_bilan(self, upload_id: int, data: dict) -> dict:
        """
        Update bilan data for an upload.
        Validates that the upload_id exists before updating.
        
        Args:
            upload_id: Upload ID
            data: New bilan data
            
        Returns:
            Updated bilan data
            
        Raises:
            ValueError: If no bilan exists for this upload
        """
        existing_bilan = self.repo.get_by_upload_id(upload_id)
        if not existing_bilan:
            raise ValueError(f"No bilan found for upload_id {upload_id}")
        
        updated_bilan = self.repo.update(upload_id, data)
        return updated_bilan.data

    def delete_bilan(self, upload_id: int) -> bool:
        """
        Delete bilan for an upload. Does not delete accounts.
        
        Args:
            upload_id: Upload ID
            
        Returns:
            True if deletion successful
        """
        self.repo.delete_by_upload_id(upload_id)
        return True