import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CashFlowLine:
    label: str
    amount: float = 0.0


@dataclass
class CashFlowSection:
    label: str
    lines: list[CashFlowLine] = field(default_factory=list)
    total: float = 0.0


@dataclass
class CashFlowResult:
    exploitation: CashFlowSection = None
    investissement: CashFlowSection = None
    financement: CashFlowSection = None
    autres: CashFlowSection = None
    variation_tresorerie: float = 0.0
    tresorerie_debut: float = 0.0
    tresorerie_fin: float = 0.0
    reconciliation_ok: bool = False
    reconciliation_ecart: float = 0.0


class CashFlowService:
    """État des flux de trésorerie — méthode indirecte (NC 01, Annexe 5)."""

    def __init__(self, rules: dict, bilan_rules: dict | None = None):
        self.rules = rules
        # bilan_rules tree (the "bilan_comptable_tunisien" subtree) is needed to
        # resolve `direct_accounts` dot-paths into account-code prefixes.
        self.bilan_rules = bilan_rules
        self.tresorerie_comptes = rules["tresorerie"]["comptes"]

    def compute(
        self,
        resultat_net_n: float,
        bilan_n: dict[str, float],          # computed bilan: {line_path: signed_total}
        bilan_n_minus_1: dict[str, float],
        tb_balances_n: dict[str, float],    # raw signed TB balances N (for tb_codes refs)
        tb_balances_n_1: dict[str, float],
        period_flows_n: dict[str, float],   # signed period movements (dotations, reprises)
    ) -> CashFlowResult:
        result = CashFlowResult()

        result.exploitation = self._build_exploitation(
            resultat_net_n, bilan_n, bilan_n_minus_1, period_flows_n,
            tb_balances_n, tb_balances_n_1,
        )
        result.investissement = self._build_section(
            self.rules["flux_investissement"],
            bilan_n, bilan_n_minus_1, tb_balances_n, tb_balances_n_1,
        )
        result.financement = self._build_section(
            self.rules["flux_financement"],
            bilan_n, bilan_n_minus_1, tb_balances_n, tb_balances_n_1,
        )

        total_flux = (
            result.exploitation.total
            + result.investissement.total
            + result.financement.total
        )

        result.tresorerie_debut = self._sum_codes(tb_balances_n_1, self.tresorerie_comptes)
        result.tresorerie_fin = self._sum_codes(tb_balances_n, self.tresorerie_comptes)
        result.variation_tresorerie = result.tresorerie_fin - result.tresorerie_debut

        # Catch-all: this model captures a curated subset of the balance sheet, so
        # the three sections rarely equal the true cash movement on real data. The
        # residual = (Δtréso − Σsections) is ventilated into one explicit line so the
        # statement always articulates and the unmodeled movement stays visible.
        residual = result.variation_tresorerie - total_flux
        result.autres = CashFlowSection(
            "Autres postes du bilan (réconciliation)",
            [CashFlowLine("Variation des autres postes du bilan (non ventilée)", residual)],
            residual,
        )
        result.reconciliation_ecart = result.variation_tresorerie - (total_flux + residual)
        result.reconciliation_ok = abs(result.reconciliation_ecart) < 0.01

        return result

    # --- Exploitation ---
    def _build_exploitation(self, resultat_net, bilan_n, bilan_n_1, flows, tb_n, tb_n_1):
        cfg = self.rules["flux_exploitation"]
        s = CashFlowSection(cfg["label"])

        s.lines.append(CashFlowLine("Résultat net de l'exercice", resultat_net))
        s.total += resultat_net

        # add_back/remove assume natural balances (dotations 68x debit → positive
        # period amount; QP subventions 739 credit). Verify the 739 sign per dataset.
        for adj in cfg["ajustements"].values():
            amount = self._sum_codes(flows, adj["comptes"])
            if adj["operation"] == "remove":
                amount = -amount
            s.lines.append(CashFlowLine(adj["label"], amount))
            s.total += amount

        for var in cfg["variations_bfr"].values():
            delta = self._variation(var, bilan_n, bilan_n_1, tb_n, tb_n_1)
            effect = self._effect(var, delta, tb_n, tb_n_1)
            s.lines.append(CashFlowLine(var["label"], effect))
            s.total += effect

        return s

    # --- Generic section (investissement / financement) ---
    def _build_section(self, cfg, bilan_n, bilan_n_1, tb_n, tb_n_1):
        s = CashFlowSection(cfg["label"])
        for key, item in cfg.items():
            if key == "label" or not isinstance(item, dict):
                continue
            delta = self._variation(item, bilan_n, bilan_n_1, tb_n, tb_n_1)
            effect = self._effect(item, delta, tb_n, tb_n_1)
            s.lines.append(CashFlowLine(item["label"], effect))
            s.total += effect
        return s

    # --- Variation resolver: handles bilan_line_ref / direct_accounts / tb_codes ---
    def _variation(self, item, bilan_n, bilan_n_1, tb_n, tb_n_1):
        if item["source"] == "bilan_line_ref":
            refs = item["ref"] if isinstance(item["ref"], list) else [item["ref"]]
            n = sum(bilan_n.get(r, 0.0) for r in refs)
            n_1 = sum(bilan_n_1.get(r, 0.0) for r in refs)
            return n - n_1
        if item["source"] == "direct_accounts":
            # Gross-value-only variation: resolve each dot-path into bilan_rules to
            # its gross account prefixes (amortization paths are simply not listed),
            # then take the raw TB variation. _sum_codes does longest-prefix matching.
            prefixes: list[str] = []
            for path in item["comptes_valeurs_brutes"]:
                prefixes.extend(self._resolve_codes(path))
            if not prefixes:
                logger.warning("Cashflow: '%s' resolved to no account codes.", item.get("label"))
            n = self._sum_codes_signed(tb_n, prefixes)
            n_1 = self._sum_codes_signed(tb_n_1, prefixes)
            return n - n_1
        # tb_codes
        n = self._sum_codes(tb_n, item["comptes"])
        n_1 = self._sum_codes(tb_n_1, item["comptes"])
        return n - n_1

    # --- Resolve a dot-path into bilan_rules to a list of account prefixes ---
    def _resolve_codes(self, path: str) -> list[str]:
        if self.bilan_rules is None:
            raise ValueError(
                "CashFlowService needs bilan_rules to resolve a 'direct_accounts' path."
            )
        segments = path.split(".")
        # The dot-path may start mid-tree (e.g. 'actifs_immobilises...'); locate the
        # first segment anywhere in the bilan tree, then descend the rest.
        node = self._find_node(self.bilan_rules, segments[0])
        if node is None:
            raise KeyError(f"Path segment '{segments[0]}' not found in bilan_rules (path: {path})")
        for key in segments[1:]:
            if not isinstance(node, dict) or key not in node:
                raise KeyError(f"Path segment '{key}' not found in bilan_rules (path: {path})")
            node = node[key]
        if not isinstance(node, list):
            raise TypeError(f"Path '{path}' did not resolve to a list of account codes.")
        return node

    @staticmethod
    def _find_node(tree, key):
        if isinstance(tree, dict):
            if key in tree:
                return tree[key]
            for value in tree.values():
                found = CashFlowService._find_node(value, key)
                if found is not None:
                    return found
        return None

    def _effect(self, item, delta, tb_n=None, tb_n_1=None):
        """Cash effect of a balance-sheet variation, accounting for the sign space
        of its source.

        - tb_codes / direct_accounts read raw signed_balance (debit − credit). In
          that space the cash effect of any non-cash movement is always −Δ (the
          identity the treasury reconciliation relies on), regardless of actif/passif.
        - bilan_line_ref reads bilan DISPLAY values, where passifs are already
          sign-normalized to positive, so the actif/passif rule applies.

        `exclude_comptes` peels specific TB codes out of a bilan_line_ref line so the
        same movement can be reclassified to another section (e.g. dividendes 447 /
        comptes courants 442 moved from BFR to financement) without double-counting or
        editing the shared bilan tree. The correction is applied in cash-effect space
        and is the exact negative of how those codes contribute as a tb_codes line
        (effect = −Δ), so the two lines cancel and section subtotals stay correct.
        """
        if item.get("source") in ("tb_codes", "direct_accounts"):
            return -delta
        effect = self._apply_sign(delta, item["classe_actif_passif"])
        for code in item.get("exclude_comptes", []):
            code_delta = self._sum_codes(tb_n, [code]) - self._sum_codes(tb_n_1, [code])
            effect -= -code_delta  # remove the tb_codes-style cash effect of this code
        return effect

    @staticmethod
    def _apply_sign(variation, classe):
        return -variation if classe == "actif" else variation

    @staticmethod
    def _sum_codes(balances, prefixes):
        cleaned = [p.split()[0].strip("()-") for p in prefixes]
        total = 0.0
        for code, bal in balances.items():
            match = max((p for p in cleaned if code.startswith(p)), key=len, default=None)
            if match is not None:
                total += bal
        return total

    @staticmethod
    def _sum_codes_signed(balances, prefixes):
        """Like _sum_codes but honors a leading '-' on a prefix (contra accounts
        such as '-259'/'-269' are subtracted), keeping the bilan's gross-value
        sign convention."""
        sign_by_code: dict[str, float] = {}
        cleaned: list[str] = []
        for p in prefixes:
            code = p.split()[0].strip("()-")
            cleaned.append(code)
            sign_by_code[code] = -1.0 if p.strip().startswith("-") else 1.0
        total = 0.0
        for code, bal in balances.items():
            match = max((c for c in cleaned if code.startswith(c)), key=len, default=None)
            if match is not None:
                total += sign_by_code[match] * bal
        return total