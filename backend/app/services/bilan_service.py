from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
import logging

from app.models.account import Account
from app.models.upload import Upload
from app.repositories.bilan_repository import BilanRepository
from app.repositories.compte_resultat_repository import CompteResultatRepository
from app.core.accounting_loader import AccountingRulesLoader
from app.core.reconciliation import reconcile_all, build_data_quality
from app.services.balance import signed_balance

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
        return signed_balance(acc)

    # =====================================================
    # RULE NORMALIZATION
    # =====================================================
    def normalize_entry(self, entry: str) -> Dict:
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
        if side in ("DR", "CR") and amount == 0:
            return False
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

        final_amount = brut - amort + net

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
    # DIAGNOSTIC: account used in more than one leaf node
    # =====================================================
    def _log_account_collisions(self, result: Dict) -> Dict[str, List[str]]:
        from collections import defaultdict

        account_nodes: Dict[str, List[str]] = defaultdict(list)

        def walk(node: Dict, path: str = "") -> None:
            for key, value in node.items():
                if not isinstance(value, dict):
                    continue
                cur = f"{path}.{key}" if path else key
                if "used_accounts" in value:
                    for code in value.get("used_accounts", []):
                        account_nodes[code].append(cur)
                else:
                    walk(value, cur)

        walk(result)
        collisions = {c: nodes for c, nodes in account_nodes.items() if len(nodes) > 1}

        if collisions:
            logger.warning(
                "Account-to-node collisions (account counted in >1 section): %s",
                dict(list(collisions.items())[:20]),
            )
        else:
            logger.info("No account-to-node collisions detected.")

        return collisions

    # =====================================================
    # TOTALS
    # =====================================================
    # Tolerance (in currency units) under which actif/passif are considered balanced.
    BALANCE_TOLERANCE = 1.0

    def compute_totals(self, result: Dict) -> Dict:
        def sum_leaf_nodes(node: Dict) -> float:
            total = 0.0
            for v in node.values():
                if isinstance(v, dict) and "amount" in v:
                    total += v["amount"]
                elif isinstance(v, dict):
                    total += sum_leaf_nodes(v)
            return total

        def require(node: Dict, key: str, ctx: str) -> Dict:
            child = node.get(key, {})
            if not child:
                logger.warning(
                    f"Bilan rules: expected section '{key}' not found under {ctx}. "
                    f"This section will total 0 — check bilan_rules.json keys."
                )
            return child

        actifs = require(result, "actifs", "root")
        actifs_non_courants = sum_leaf_nodes(require(actifs, "actifs_non_courants", "actifs"))
        actifs_courants     = sum_leaf_nodes(require(actifs, "actifs_courants", "actifs"))
        total_actif         = actifs_non_courants + actifs_courants

        passif_root          = require(result, "capitaux propres et passifs", "root")
        capitaux_propres     = sum_leaf_nodes(require(passif_root, "capitaux propres", "passif_root"))

        passifs              = require(passif_root, "passifs", "passif_root")
        passifs_non_courants = sum_leaf_nodes(require(passifs, "passifs non courant", "passifs"))
        passifs_courants     = sum_leaf_nodes(require(passifs, "passifs courant", "passifs"))
        total_passif         = capitaux_propres + passifs_non_courants + passifs_courants

        difference = total_actif - total_passif
        balanced   = abs(difference) < self.BALANCE_TOLERANCE

        logger.info(
            f"Bilan totals — Actif: {total_actif:,.2f} | "
            f"Passif: {total_passif:,.2f} | Diff: {difference:,.2f} | "
            f"Balanced: {balanced}"
        )
        if not balanced:
            logger.warning(
                f"Bilan does NOT balance (actif - passif = {difference:,.2f}). "
                f"For a pre-closing trial balance this normally equals the unclosed "
                f"net result (classes 6/7); otherwise check rule coverage."
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
            "balanced":   balanced,
        }

    # =====================================================
    # MAIN ENTRY POINT
    # =====================================================
    def calculate_and_save(self, upload_id: int) -> Dict:
        logger.info(f"Starting bilan calculation for upload {upload_id}")

        try:
            # 1. Load accounts from DB
            accounts = self.load_accounts(upload_id)

            # 1b. Check whether the source file had a Rubrique column
            upload = self.db.query(Upload).filter(Upload.id == upload_id).first()
            has_rubrique_column = bool(upload and getattr(upload, "has_rubrique_column", False))

            # 2. Load rules (singleton — cached after first load)
            rules = self.rules_loader.load_rules()
            tree  = rules["bilan_comptable_tunisien"]

            # 3. Per-line reconciliation: only run when the source file actually had
            #    a Rubrique column — there is nothing to reconcile without one.
            if has_rubrique_column:
                recon_results = reconcile_all(accounts, self.rules_loader)
                data_quality  = build_data_quality(recon_results, has_rubrique_column)
            else:
                data_quality = {
                    "rubrique_present":  False,
                    "discrepancy_count": 0,
                    "unmapped_count":    0,
                    "flagged_lines":     [],
                    "lines":             [],
                }

            discrepancy_count = data_quality["discrepancy_count"]
            unmapped_count    = data_quality["unmapped_count"]
            if discrepancy_count or unmapped_count:
                logger.info(
                    f"Reconciliation: {discrepancy_count} discrepancy, "
                    f"{unmapped_count} unmapped out of {len(accounts)} accounts."
                )

            # 4. Apply rules to accounts (unchanged math — rules are the authority)
            result = self.process_tree(tree, accounts)

            # 4b. Read-only diagnostic: flag accounts counted in multiple sections
            self._log_account_collisions(result)

            # 5. Compute section totals.
            # Fallback: if 131/135 are absent (pre-closure), use CR L21 as résultat de
            # l'exercice. The value is written straight into the tree node so the front
            # end (which renders each leaf's own `amount`) shows the line, and the section
            # total — summed from the leaves — stays consistent with it.
            try:
                resultat_node = (
                    result
                    .get("capitaux propres et passifs", {})
                    .get("capitaux propres", {})
                    .get("resultat_de_l_exercice", {})
                )
                if resultat_node and abs(resultat_node.get("amount", 0.0)) < self.BALANCE_TOLERANCE:
                    cr = CompteResultatRepository(self.db).get_by_upload_id(upload_id)
                    if cr and cr.data:
                        cr_net_result = cr.data.get("totals", {}).get("resultat_net")
                        if cr_net_result is not None:
                            logger.info(
                                f"131/135 absent — using CR résultat net {cr_net_result:,.2f} as fallback."
                            )
                            resultat_node["amount"] = float(cr_net_result)
                            details = resultat_node.setdefault("amount_details", {})
                            details["brut"] = float(cr_net_result)
                            details["amortissement"] = 0.0
                            details["net"] = float(cr_net_result)
                            details.setdefault("breakdown", []).append({
                                "phase": "net",
                                "account": "131/135",
                                "label": "Résultat net (report du compte de résultat)",
                                "raw_amount": float(cr_net_result),
                                "signed_amount": float(cr_net_result),
                                "rule_prefix": "131/135",
                            })
            except Exception:
                logger.warning("Could not load CR fallback for résultat de l'exercice.", exc_info=True)

            totals = self.compute_totals(result)

            # 5b. Deterministic validation — runs before LLM, always present in response.
            from app.core.bilan_validator import run_all_checks
            detected_issues = run_all_checks(accounts, result, totals, rules)

            final_result = {
                "bilan":           result,
                "totals":          totals,
                "data_quality":    data_quality,
                "detected_issues": [i.to_dict() for i in detected_issues],
            }

            # 6. Persist to DB
            self.repo.update(upload_id, final_result)
            logger.info(f"Bilan saved for upload {upload_id}")

            return final_result

        except Exception as e:
            logger.error(f"Bilan calculation failed for upload {upload_id}: {e}", exc_info=True)
            raise

    # =====================================================
    # AI ANALYSIS — dedicated method called by /analyze endpoint
    # =====================================================
    def analyze(self, upload_id: int) -> dict:
        """
        Run AI analysis on the already-saved bilan.
        Returns {"analysis": "..."} for balanced bilans,
        {"imbalance_analysis": "..."} for unbalanced ones.
        Raises ValueError with a French message on failure.
        """
        bilan = self.repo.get_by_upload_id(upload_id)
        if not bilan or not bilan.data:
            raise ValueError("Aucun bilan trouvé pour cet upload. Générez d'abord le bilan.")

        totals   = bilan.data.get("totals", {})
        balanced = totals.get("balanced", True)
        # Use pre-computed issues from calculate_and_save — do NOT recompute.
        detected_issues = bilan.data.get("detected_issues", [])

        if balanced:
            from app.ai.ai_service_client import analyze_bilan
            analysis = analyze_bilan(totals)
            result = {"analysis": analysis}
        else:
            from app.ai.groq_client import ask_groq, KnowledgeScope
            from app.ai.prompts import BILAN_IMBALANCE_PROMPT
            import json as _json

            context = {
                "difference":      totals.get("difference"),
                "totals":          totals,
                "detected_issues": detected_issues,
            }
            prompt = BILAN_IMBALANCE_PROMPT.replace(
                "{difference}",     f"{totals.get('difference', 0):,.3f}"
            ).replace(
                "{detected_issues}", _json.dumps(detected_issues, ensure_ascii=False, indent=2)
            )
            imbalance_analysis = ask_groq(prompt, context=context, scope=KnowledgeScope.NONE)
            result = {"imbalance_analysis": imbalance_analysis}

        # Persist the analysis into the saved bilan data
        updated_data = dict(bilan.data)
        updated_data.update(result)
        self.repo.update(upload_id, updated_data)

        return result