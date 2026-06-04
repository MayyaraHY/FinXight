"""
PCGT (Plan Comptable Général Tunisien) reference loader + rule-based candidate
filter.

This is the deterministic, zero-cost foundation of the account-validation
pipeline. It loads plan_comptables_tunisiens.json ONCE, flattens its nested tree
into a flat list of {code, label, class, subclass, normalized_label} records, and
exposes:

  * exact lookup           — does an account code exist in the official PCGT?
  * candidate generation   — given a code, the small subset of PCGT accounts in
                             the same sub-class (the search space the fuzzy matcher
                             and the LLM are restricted to).

Design mirrors AccountingRulesLoader (app/core/accounting_loader.py): a process
singleton with a cached parse, cross-platform path auto-detection, and label
normalisation that reuses the project's canonical normalizer.

The JSON shape (see plan_comptables_tunisiens.json):

    plan_comptable_tunisien:
      classe_1:
        label: "..."
        categories:
          "10":
            label: "Capital"
            accounts:
              "101":                      # leaf  -> "label string"
                ... or ...
              "101":                      # node  -> {label, sub_accounts}
                label: "Capital social"
                sub_accounts:
                  "1011": "Capital souscrit - non appelé"
                  "1013": {label, sub_accounts}   # recurses arbitrarily deep
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import json

from app.services.preparation_service import normalize_string

logger = logging.getLogger(__name__)

_FILENAME = "plan_comptables_tunisiens.json"


@dataclass(frozen=True)
class PCGTAccount:
    code: str
    label: str
    klass: str        # first digit, e.g. "4"
    subclass: str     # first two digits, e.g. "40"
    normalized_label: str


@dataclass
class CandidateResult:
    """Result of get_candidates(): the search space + compatibility flags."""
    candidates: List[PCGTAccount]
    code_exists: bool        # the exact code is a real PCGT account
    class_exists: bool       # at least one account shares the code's class


class PCGTLoader:
    _instance: Optional["PCGTLoader"] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, path: str | None = None):
        # Initialise once per singleton (mirrors AccountingRulesLoader).
        if getattr(self, "_initialized", False):
            return
        self._initialized = True

        self._path = Path(path) if path else Path(self._detect_path())
        self._accounts: List[PCGTAccount] | None = None
        self._by_code: Dict[str, PCGTAccount] = {}
        self._by_subclass: Dict[str, List[PCGTAccount]] = {}
        self._by_class: Dict[str, List[PCGTAccount]] = {}
        logger.info("PCGTLoader initialised with reference path: %s", self._path)

    # ------------------------------------------------------------------ paths
    @staticmethod
    def _detect_path() -> str:
        base_dir = Path(__file__).resolve().parent
        candidates = [
            base_dir / _FILENAME,
            base_dir / "core" / _FILENAME,
            base_dir.parent / "core" / _FILENAME,
            Path.cwd() / _FILENAME,
            Path.cwd() / "core" / _FILENAME,
        ]
        for p in candidates:
            if p.exists():
                logger.info("✓ Found %s at: %s", _FILENAME, p)
                return str(p)
        tried = "\n  ".join(str(p) for p in candidates)
        raise FileNotFoundError(
            f"{_FILENAME} not found in any standard location.\nTried:\n  {tried}"
        )

    # ------------------------------------------------------------------ load
    def _ensure_loaded(self) -> None:
        if self._accounts is not None:
            return

        with open(self._path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        root = raw.get("plan_comptable_tunisien", raw)
        accounts: List[PCGTAccount] = []

        for classe_key, classe in root.items():
            if not isinstance(classe, dict):
                continue
            categories = classe.get("categories", {})
            for _cat_code, cat in categories.items():
                if not isinstance(cat, dict):
                    continue
                self._walk_accounts(cat.get("accounts", {}), accounts)

        # Build indexes
        self._accounts = accounts
        for acc in accounts:
            # First code wins on duplicate (shouldn't happen in a clean PCGT).
            self._by_code.setdefault(acc.code, acc)
            self._by_subclass.setdefault(acc.subclass, []).append(acc)
            self._by_class.setdefault(acc.klass, []).append(acc)

        logger.info(
            "PCGT loaded: %d accounts across %d classes, %d sub-classes",
            len(accounts), len(self._by_class), len(self._by_subclass),
        )

    def _walk_accounts(self, node: dict, out: List[PCGTAccount]) -> None:
        """
        Recurse through an `accounts` / `sub_accounts` mapping. Each key is a
        code; its value is either a label string (leaf) or a dict that carries
        a `label` and possibly nested `sub_accounts`. Both leaf and intermediate
        codes are real, usable account codes, so every code is recorded.
        """
        if not isinstance(node, dict):
            return
        for code, value in node.items():
            if isinstance(value, str):
                self._add(code, value, out)
            elif isinstance(value, dict):
                label = value.get("label", "")
                if label:
                    self._add(code, label, out)
                self._walk_accounts(value.get("sub_accounts", {}), out)

    def _add(self, code: str, label: str, out: List[PCGTAccount]) -> None:
        code = str(code).strip()
        if not code:
            return
        out.append(
            PCGTAccount(
                code=code,
                label=label,
                klass=code[0],
                subclass=code[:2],
                normalized_label=normalize_string(label),
            )
        )

    # ------------------------------------------------------------------ API
    def all_accounts(self) -> List[PCGTAccount]:
        self._ensure_loaded()
        return list(self._accounts or [])

    def get(self, code: str) -> Optional[PCGTAccount]:
        """Exact lookup of a full account code."""
        self._ensure_loaded()
        return self._by_code.get(str(code).strip())

    def code_exists(self, code: str) -> bool:
        """
        True when the code is a real PCGT account (or a recognised ERP variant).

        Three matching strategies, tried in order:

        1. Exact match                  — "401" → found directly.
        2. Analytic-suffix match        — "401000" → prefix "401" is known.
           (ERPs often append cost-centre digits after the base account code.)
        3. Zero-padded ERP code         — "23000000" → strip trailing zeros → "23".
           Rule confirmed: the meaningful prefix ends at the first trailing zero.
           After stripping, accept if the result (or a prefix of it) is a known
           account OR a known subclass (category code like "23", "40", …).
        """
        self._ensure_loaded()
        code = str(code).strip()

        # 1. Exact
        if code in self._by_code:
            return True

        # 2. Analytic suffix (e.g. "4010000" → prefix "401")
        for n in range(len(code) - 1, 1, -1):
            if code[:n] in self._by_code:
                return True

        # 3. Zero-padded: strip trailing zeros, then repeat checks
        stripped = code.rstrip("0")
        if len(stripped) >= 2 and stripped != code:
            if stripped in self._by_code:
                return True
            for n in range(len(stripped) - 1, 1, -1):
                if stripped[:n] in self._by_code:
                    return True
            # Accept category-level codes (e.g. "23" is a valid subclass prefix)
            if stripped[:2] in self._by_subclass:
                return True

        return False

    def get_candidates(self, code: str) -> CandidateResult:
        """
        Return the PCGT subset to match against for a given source code.

        Search space = accounts in the same sub-class (first 2 digits); if that
        sub-class is empty in the PCGT, fall back to the whole class (first
        digit). Typically ~10–20 records — small enough to feed an LLM cheaply.
        """
        self._ensure_loaded()
        code = str(code).strip()
        subclass = code[:2]
        klass = code[:1]

        candidates = self._by_subclass.get(subclass)
        if not candidates:
            candidates = self._by_class.get(klass, [])

        return CandidateResult(
            candidates=list(candidates),
            code_exists=self.code_exists(code),
            class_exists=bool(self._by_class.get(klass)),
        )
