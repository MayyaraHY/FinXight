from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
import logging

from app.models.account import Account
from app.models.upload import Upload
from app.repositories.bilan_repository import BilanRepository
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
        # Canonical signed balance (debit - credit), uniform across all CSV
        # formats. See app/services/balance.py. This makes the DR/CR side filters
        # and the affectation negation behave correctly for BOTH the single
        # signed-column files and the Sage split-column files (previously the
        # split path returned absolute values, breaking the passif side filters).
        return signed_balance(acc)

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

        B4/R6: a zero balance belongs to NEITHER side. Many account prefixes appear
        in two sections distinguished only by DR vs CR (e.g. 532 is "liquidités"
        when debit and "concours bancaires" when credit). With signed balances a
        non-zero account passes exactly one side, but a zero balance would pass both
        and be listed in two sections. Excluding zero here keeps each account in a
        single section (it contributes 0 either way, so no total changes).
        """
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
        # B2: always additive. Each phase already carries its own sign:
        #   brut  - gross asset values
        #   amort - accumulated depreciation/provisions (subtracted)
        #   net   - direct net values + affectation (passif) entries
        # The previous "(brut - amort) if … else net" silently DROPPED the net part
        # of any node that had both gross/amort AND net/affectation entries.
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
        """
        Read-only diagnostic for the prefix-matching over-match risk (B4/R6):
        prefix rules use ``startswith`` with no "most-specific wins" guarantee, so an
        account code can be consumed by more than one section (e.g. a broad ``53`` rule
        and a narrow ``532`` rule). This logs any such account so cross-section double
        counting is visible. It does NOT change any computed amount.
        """
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

    def compute_totals(self, result: Dict, cr_net_result: Optional[float] = None) -> Dict:
        """
        Sum only leaf nodes (nodes that have an 'amount' key).

        Per the SCE maquette, "Résultat de l'exercice" is a regular leaf (accounts
        131/135) already summed by sum_leaf_nodes — the standard, default behaviour.

        cr_net_result (optional, OFF by default): override that pulls the CR engine's
            computed net result into capitaux propres instead of relying on 131/135.
            Useful only if the trial balance is pre-closing AND you trust the CR
            calculation more than the ledger. Not used by the default workflow.
        """

        def sum_leaf_nodes(node: Dict) -> float:
            total = 0.0
            for v in node.values():
                if isinstance(v, dict) and "amount" in v:
                    total += v["amount"]
                elif isinstance(v, dict):
                    total += sum_leaf_nodes(v)
            return total

        # B6: the rule tree is keyed by exact French section names. A typo/rename in
        # bilan_rules.json would make a whole section silently sum to 0, so warn loudly
        # when an expected section node is missing instead of returning a wrong total.
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

        # Inject CR net result into capitaux propres when the trial balance is
        # pre-closing (account 131 = 0). The net result is part of equity even
        # before the annual closing entry hits the ledger.
        if cr_net_result is not None:
            capitaux_propres += cr_net_result
            logger.info(f"CR net result {cr_net_result:,.2f} injected into capitaux propres.")

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

            # 1b. Check whether the source file had a Rubrique column
            upload = self.db.query(Upload).filter(Upload.id == upload_id).first()
            has_rubrique_column = bool(upload and getattr(upload, "has_rubrique_column", False))

            # 2. Load rules (singleton — cached after first load)
            rules = self.rules_loader.load_rules()
            tree  = rules["bilan_comptable_tunisien"]

            # 3. Per-line reconciliation: classify every account via rules, compare
            #    to source Rubrique, collect discrepancy/unmapped warnings.
            #    INVARIANT: this step never changes how amounts are summed —
            #    process_tree still drives the math independently via the same rules.
            recon_results = reconcile_all(accounts, self.rules_loader)
            data_quality  = build_data_quality(recon_results, has_rubrique_column)

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
            totals = self.compute_totals(result)

            final_result = {
                "bilan":        result,
                "totals":       totals,
                "data_quality": data_quality,
            }

            # 6. Persist to DB
            self.repo.update(upload_id, final_result)
            logger.info(f"Bilan saved for upload {upload_id}")

            # 7. AI interpretation (non-blocking — failure does not abort)
            try:
                from app.ai.ai_service_client import analyze_bilan
                final_result["analysis"] = analyze_bilan(totals)
            except Exception as e:
                logger.warning(f"AI interpretation skipped: {e}")

            return final_result

        except Exception as e:
            logger.error(f"Bilan calculation failed for upload {upload_id}: {e}", exc_info=True)
            raise