import hashlib
import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import json
from sqlalchemy.orm import Session

from app.models.account import Account
from app.repositories.compte_resultat_repository import CompteResultatRepository
from app.services.balance import signed_balance, unsigned_column_warning

logger = logging.getLogger(__name__)

CR_RULES_PATH = Path(__file__).resolve().parent.parent / "core" / "cr_rules.json"

# CR-relevant classes. An account in these classes that maps to no line is a
# real gap (rule missing or bad code) and must be surfaced, never dropped.
CR_CLASSES = ("6", "7")

# Completeness / equality tolerance in DT. Single source of truth for every
# amount comparison (completeness, check_account, mode contradiction). Stays at
# 1.0 until the input columns widen from Numeric(20,2): millimes are truncated
# at storage today, so a tighter threshold would be meaningless (separate ticket).
CR_TOL = Decimal("1.0")

# Quantum for per-line amounts. Lines are rounded to the millime (HALF_UP, the
# usual financial convention rather than Decimal's default banker's rounding)
# BEFORE the formula pass, so a displayed total equals the sum of its displayed
# components.
CR_QUANTUM = Decimal("0.001")


class CompteResultatService:

    def __init__(self, db: Session, inventory_method: str = "permanent"):
        self.db = db
        self.repo = CompteResultatRepository(db)
        self.inventory_method = inventory_method
        self._rules: Optional[List[Dict]] = None
        self._rules_by_id: Optional[Dict[int, Dict]] = None
        self._rules_hash: Optional[str] = None
        self._index: Optional[List[Tuple[str, Decimal, int]]] = None
        # Non-actionable audit notes (kept OUT of `warnings`, which feeds Groq).
        # Reset at the start of every compute_all_lines run.
        self._info_notes: List[str] = []

    # =====================================================
    # RULES LOADER
    # =====================================================
    def load_rules(self) -> List[Dict]:
        if self._rules is not None:
            return self._rules
        raw = CR_RULES_PATH.read_bytes()
        self._rules_hash = hashlib.sha256(raw).hexdigest()[:16]
        data = json.loads(raw.decode("utf-8"))
        rules = data["compte_resultat_tunisien"]["lines"]
        self.validate_rules(rules)
        self._rules = rules
        self._rules_by_id = {r["line_id"]: r for r in rules}
        logger.info(f"CR rules loaded: {len(self._rules)} lines (v{self._rules_hash})")
        return self._rules

    @staticmethod
    def validate_rules(rules: List[Dict]) -> None:
        """
        Fail loudly at load time on a malformed cr_rules.json rather than silently
        producing wrong totals. Guards: unique line_id; no two index prefixes of the
        SAME string map to different lines (the historical 636-in-two-lines bug);
        every formula token is "+"/"-" or an int referencing an EXISTING and EARLIER
        line_id (forward refs would silently read 0 in the ordered formula pass).
        """
        seen_ids: set = set()
        prefix_owner: Dict[str, int] = {}
        for rule in rules:
            line_id = rule.get("line_id")
            if line_id is None or line_id in seen_ids:
                raise ValueError(f"cr_rules.json: line_id dupliqué ou manquant ({line_id})")
            seen_ids.add(line_id)

            if rule.get("type") in ("computed", "stock_variation"):
                codes = (rule.get("comptes", [])
                         + rule.get("comptes_permanent", [])
                         + rule.get("comptes_intermittent", []))
                for entry in codes:
                    prefix = entry.lstrip("-")
                    owner = prefix_owner.get(prefix)
                    if owner is not None and owner != line_id:
                        raise ValueError(
                            f"cr_rules.json: préfixe '{prefix}' réclamé par les lignes "
                            f"{owner} et {line_id} (collision d'appariement)."
                        )
                    prefix_owner[prefix] = line_id

        for rule in rules:
            if rule.get("type") != "formula":
                continue
            line_id = rule["line_id"]
            for token in rule.get("formula", []):
                if token in ("+", "-"):
                    continue
                ref = int(token)
                if ref not in seen_ids:
                    raise ValueError(
                        f"cr_rules.json: formule L{line_id} référence une ligne "
                        f"inconnue {ref}."
                    )
                if ref >= line_id:
                    raise ValueError(
                        f"cr_rules.json: formule L{line_id} référence une ligne "
                        f"non antérieure {ref} (serait évaluée à 0)."
                    )

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

    # =====================================================
    # FORMULA EVALUATOR  e.g. [4, "-", 11]  or  [1, 2, 3]
    # =====================================================
    def _eval_formula(
        self, line_id: int, formula: List, computed: Dict[int, Decimal]
    ) -> Decimal:
        total = Decimal("0")
        sign = Decimal("1")
        for token in formula:
            if token == "+":
                sign = Decimal("1")
            elif token == "-":
                sign = Decimal("-1")
            else:
                ref = int(token)
                if ref not in computed:
                    # validate_rules() should have caught this at load; defend
                    # anyway rather than read a silent 0.
                    raise ValueError(
                        f"Formule L{line_id} référence la ligne inconnue {ref}."
                    )
                total += sign * computed[ref]
                sign = Decimal("1")
        return total

    # =====================================================
    # COMPUTE ALL 23 LINES
    # =====================================================
    def compute_all_lines(
        self, accounts: List[Account]
    ) -> Tuple[Dict[int, Dict], List[str]]:
        rules = self.load_rules()
        rules_by_id = self._rules_by_id
        index = self.build_index()
        self._info_notes = []   # fresh audit notes per computation

        computed: Dict[int, Decimal] = {r["line_id"]: Decimal("0") for r in rules}
        matched_codes: Dict[int, List[str]] = {r["line_id"]: [] for r in rules}
        matched_details: Dict[int, List[Dict]] = {r["line_id"]: [] for r in rules}


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
            rule = rules_by_id[line_id]

            # Stock variation keeps the SIGNED balance (its direction matters).
            if rule["type"] == "stock_variation":
                val = signed_balance(acc)
            else:
                val = self.get_balance(acc)

            computed[line_id] += sign * val
            matched_codes[line_id].append(code)
            matched_details[line_id].append({
                "code": code,
                "label": getattr(acc, "label", None) or getattr(acc, "account_label", None),  # safe fallback
                "amount": float((sign * val).quantize(CR_QUANTUM, rounding=ROUND_HALF_UP)),
            })

        # ---- Un-subdivided 603 (permanent): assign ONCE, never per-line ----
        # A 603 account with no 6031/6032 split matches neither L6 nor L7 in the
        # index, so both lines would be empty. The old per-line fallback added the
        # whole 603 to BOTH lines (double count). Assign the residual once, to L7,
        # and say so. Trigger on "no account matched" (matched_codes empty), not
        # "amount == 0", so a balance that legitimately nets to zero isn't refilled.
        if self.inventory_method == "permanent":
            residual_603 = (
                self.sum_by_prefix(accounts, "603")
                - self.sum_by_prefix(accounts, "6031")
                - self.sum_by_prefix(accounts, "6032")
                - self.sum_by_prefix(accounts, "6037")
            )
            if residual_603 != 0 and not matched_codes[6] and not matched_codes[7]:
                computed[7] += residual_603
                matched_codes[7].append("(603 non subdivisé)")
                matched_details[7].append({
                "code": "603",
                "label": "Compte 603 non subdivisé",
                "amount": float(residual_603.quantize(CR_QUANTUM, rounding=ROUND_HALF_UP)),
            })
                self._info_notes.append(
                    "Compte 603 non subdivisé en 6031/6032 : variation affectée en "
                    "totalité à L7 (Achats d'approvisionnements). Vérifiez la subdivision."
                )
                unmapped[:] = [c for c in unmapped if not c.startswith("603")]

        # ---- Round each line to the millime BEFORE the formula pass so the ----
        # ---- displayed totals equal the sum of the displayed components.   ----
        for line_id in computed:
            computed[line_id] = computed[line_id].quantize(
                CR_QUANTUM, rounding=ROUND_HALF_UP
            )

        # ---- Pass 2: formula lines (rules are ordered) --------------------
        for rule in rules:
            if rule["type"] == "formula":
                computed[rule["line_id"]] = self._eval_formula(
                    rule["line_id"], rule["formula"], computed
                ).quantize(CR_QUANTUM, rounding=ROUND_HALF_UP)

        # ---- Serialise -----------------------------------------------------
        lines_output: Dict[int, Dict] = {}
        for rule in rules:
            line_id = rule["line_id"]
            lines_output[line_id] = {
                "line_id": line_id,
                "label": rule["label"],
                "amount": float(round(computed[line_id], 3)),
                "accounts": matched_codes[line_id],
                "account_breakdown": matched_details.get(line_id, []),
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
    # COMPLETENESS INVARIANT
    # =====================================================
    def check_completeness(
        self,
        accounts: List[Account],
        lines: Dict[int, Dict],
        unmapped: List[str],
    ) -> Dict:
        """
        Independent of how accounts are grouped into lines, double-entry gives
        résultat net = −Σ(signed_balance over every class 6/7 account)
        (class 7 credit-natured → negative b, class 6 debit-natured → positive b;
        the leading minus turns produits into +, charges into −). If every
        class-6/7 account is captured exactly once with the correct sign, the CR
        line 21 equals this truth. A non-zero gap with no orphan therefore
        isolates a sign/rule error — there can be no cross-line double count
        because Pass 1 assigns each account to a single line.
        """
        truth = -sum(
            (signed_balance(acc) for acc in accounts
             if acc.account_code[:1] in CR_CLASSES),
            Decimal("0"),
        )
        resultat_net = Decimal(str(lines.get(21, {}).get("amount", 0.0)))
        gap = resultat_net - truth
        return {
            "orphans": sorted(set(unmapped)),
            "expected": float(round(truth, 3)),
            "resultat_net": float(round(resultat_net, 3)),
            "gap": float(round(gap, 3)),
            "ok": (not unmapped) and abs(gap) < CR_TOL,
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

        # ── Completeness invariant: L21 == −Σ(classe 6/7) ───────────────────
        comp = self.check_completeness(accounts, lines, unmapped)
        if not comp["ok"] and abs(Decimal(str(comp["gap"]))) > CR_TOL:
            if comp["orphans"]:
                # Cause already named by the unmapped warning above; restate the
                # measured arithmetic impact for the accountant.
                warnings.append(
                    f"Écart de complétude {comp['gap']:+,.3f} DT : résultat net "
                    f"({comp['resultat_net']:,.3f} DT) ≠ −Σ(classes 6/7) "
                    f"({comp['expected']:,.3f} DT), dû aux comptes non capturés "
                    f"ci-dessus."
                )
            else:
                # No orphan ⇒ every account is captured but the totals still
                # disagree → a sign or rule error, not a missing prefix.
                warnings.append(
                    f"Écart de complétude {comp['gap']:+,.3f} DT SANS compte "
                    f"orphelin ⇒ erreur de signe/règle dans cr_rules.json. "
                    f"Résultat net {comp['resultat_net']:,.3f} DT vs "
                    f"−Σ(classes 6/7) {comp['expected']:,.3f} DT. Un écart "
                    f"positif = charges masquées ou produits gonflés."
                )

        # ── Inventory-mode contradiction (param vs balances) ────────────────
        gross_603 = self.sum_by_prefix(accounts, "601") + self.sum_by_prefix(accounts, "602")
        var_6031 = self.sum_by_prefix(accounts, "6031")
        var_6032 = self.sum_by_prefix(accounts, "6032")
        if self.inventory_method == "permanent" and abs(gross_603) > CR_TOL:
            warnings.append(
                f"Mode 'permanent' demandé mais les comptes 601/602 portent "
                f"{float(gross_603):,.0f} DT (achats bruts) — l'inventaire est "
                f"probablement INTERMITTENT. Les achats bruts risquent d'être ignorés."
            )
        if self.inventory_method == "intermittent" and abs(gross_603) <= CR_TOL \
                and abs(var_6031 + var_6032) > CR_TOL:
            warnings.append(
                f"Mode 'intermittent' demandé mais aucun achat brut 601/602 ; seules "
                f"des variations 6031/6032 ({float(var_6031 + var_6032):,.0f} DT) sont "
                f"présentes — l'inventaire est probablement PERMANENT."
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

            accs = "/".join(labels)
            if abs(bilan_result) <= float(CR_TOL):
                # 131/135 both null → the result hasn't been posted to equity yet.
                # Skipping is correct, but record it for the audit trail rather
                # than failing silently (info, not a warning).
                self._info_notes.append(
                    f"Comptes {accs} nuls : balance probablement pré-clôture, "
                    f"contrôle {rule.get('label', f'L{line_id}')} ignoré."
                )
            elif abs(calculated - bilan_result) > float(CR_TOL):
                label = rule.get("label", f"Ligne {line_id}")
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

            # Client financial figures stay out of INFO logs.
            for acc in accounts[:5]:
                logger.debug(
                    "DIAG account=%s solde_final=%s sfd=%s sfc=%s → balance=%s",
                    acc.account_code, acc.solde_final,
                    acc.solde_final_debit, acc.solde_final_credit,
                    self.get_balance(acc),
                )

            lines, unmapped = self.compute_all_lines(accounts)
            totals   = self.compute_totals(lines)
            warnings = self.validate(lines, accounts, unmapped)

            # Ingestion guard: a complete balance sums (signed) to ≈ 0. A large
            # residual means the source column was unsigned → all credit signs
            # wrong upstream. Surfaced as info (computed after the notes above).
            info = list(self._info_notes)
            unsigned = unsigned_column_warning(accounts, tolerance=CR_TOL)
            if unsigned:
                logger.warning("Upload %s: %s", upload_id, unsigned)
                info.append(unsigned)

            final_result = {
                "lines":    lines,
                "totals":   totals,
                "warnings": warnings,
                # Non-actionable audit notes (populated by compute_all_lines and
                # validate); kept separate so the Groq diagnosis only sees warnings.
                "info":     info,
                "meta": {
                    "inventory_method": self.inventory_method,
                    "rules_version":    self._rules_hash,
                    "generated_at":     datetime.now(timezone.utc).isoformat(),
                },
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

        # NOTE: read-modify-write is not atomic — a concurrent calculate_and_save
        # could overwrite this diagnosis (or vice-versa). Acceptable for now; if it
        # becomes visible, switch to a partial JSONB update of just cr_diagnosis.
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