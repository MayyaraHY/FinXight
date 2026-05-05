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
        """
        Initialize service.
        
        Args:
            db: SQLAlchemy database session
        """
        self.db = db
        self.repo = BilanRepository(db)
        # Use singleton rules loader (no multiple instances)
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
        if acc.solde_final is not None:
            return Decimal(str(acc.solde_final))

        if acc.solde_debit:
            return Decimal(str(acc.solde_debit))

        if acc.solde_credit:
            return -Decimal(str(acc.solde_credit))

        if acc.debit:
            return Decimal(str(acc.debit))

        if acc.credit:
            return -Decimal(str(acc.credit))

        return Decimal("0")

    # =====================================================
    # RULE NORMALIZATION
    # =====================================================
    def normalize_entry(self, entry: str) -> Dict:
        # Remove parentheses
        entry = entry.replace("(", "").replace(")", "").strip()

        sign = 1
        side = None

        # Check for negation
        if entry.startswith("-"):
            sign = -1
            entry = entry[1:]

        # Check for side indicator (DR/CR)
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

        # -------- BRUT (Gross) --------
        for entry in node.get("comptes_valeurs_brutes", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if self.match(acc.account_code, rule["prefix"]):
                    amount = self.get_balance(acc)

                    # Apply side filter if specified
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

        # -------- AMORT (Depreciation/Provisions) --------
        for entry in node.get("comptes_amortissements_provisions", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if self.match(acc.account_code, rule["prefix"]):
                    # Amortization is always absolute value
                    amount = abs(self.get_balance(acc))
                    amort += amount
                    computed = amount * rule["sign"]

                    used_accounts.add(acc.account_code)
                    breakdown.append({
                        "phase": "amort",
                        "account": acc.account_code,
                        "label": acc.label,
                        "raw_amount": float(amount)
                    })

        # -------- NET (Net values, used when no depreciation) --------
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
                        "label": acc.label,
                        "raw_amount": float(amount)
                    })

        # -------- AFFECTATION (Allocation - e.g., capital, reserves) --------
        for entry in node.get("comptes_affectation", []):
            rule = self.normalize_entry(entry)

            for acc in accounts:
                if self.match(acc.account_code, rule["prefix"]):
                    amount = self.get_balance(acc)
                    net += amount * rule["sign"]

        # -------- FINAL AMOUNT --------
        # If we have gross or depreciation, net = gross - depreciation
        # Otherwise use net directly
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
                # This is a category node - calculate it
                node_result = self.compute_node(value, accounts)

                result[key] = {
                    "label": value["label"],
                    "amount": node_result["amount"],
                    "used_accounts": node_result["used_accounts"],
                    "amount_details": node_result["amount_details"]
                }

            elif isinstance(value, dict):
                # This is a parent node - recurse into it
                result[key] = self.process_tree(value, accounts)

        return result

    # =====================================================
    # TOTALS (IMPORTANT - Sum only leaf nodes)
    # =====================================================
    def compute_totals(self, result: Dict) -> Dict:
    
        def sum_leaf_nodes(node):
            total = 0

            for v in node.values():
                if isinstance(v, dict) and "amount" in v:
                    # Leaf node
                    total += v["amount"]
                elif isinstance(v, dict):
                    # Parent node - recurse
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
        difference = total_actif - total_passif
        
        logger.info(f"Balance sheet totals: Actif={total_actif}, Passif={total_passif}, Diff={difference}")
        
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
            "difference": difference
        }

    # =====================================================
    # MAIN CALCULATION FUNCTION
    # =====================================================
    def calculate_and_save(self, upload_id: int) -> Dict:
        """
        Complete workflow: Load accounts, apply rules, calculate balance sheet, save.
        
        Steps:
        1. Load accounts from database
        2. Load rules from AccountingRulesLoader
        3. Process tree and calculate amounts
        4. Compute totals
        5. Save to database
        
        Args:
            upload_id: Upload to process
            
        Returns:
            dict with 'bilan' (detail) and 'totals'
            
        Raises:
            ValueError: If upload has no accounts
        """
        logger.info(f"Starting balance sheet calculation for upload {upload_id}")
        
        try:
            # 1. Load accounts
            accounts = self.load_accounts(upload_id)

            # 2. Load rules (from singleton loader, cached)
            rules = self.rules_loader.load_rules()
            tree = rules["bilan_comptable_tunisien"]

            # 3. Compute bilan (apply rules to accounts)
            result = self.process_tree(tree, accounts)

            # 4. Compute totals
            totals = self.compute_totals(result)

            final_result = {
                "bilan": result,
                "totals": totals
            }

            # 5. Save to DB
            self.repo.update(upload_id, final_result)
            logger.info(f"✓ Balance sheet saved for upload {upload_id}")

            # 6. AI interpretation (non-blocking — failure does not abort the response)
            try:
                from app.ai.ai_service_client import analyze_bilan
                analysis = analyze_bilan(totals)
                final_result["analysis"] = analysis
            except Exception as e:
                logger.warning(f"AI bilan interpretation skipped (non-blocking): {e}")

            return final_result
            
        except Exception as e:
            logger.error(f"Failed to calculate balance sheet: {e}", exc_info=True)
            raise