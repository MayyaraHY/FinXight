import json
import logging
import re
import unicodedata
from pathlib import Path
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)


class AccountingRulesLoader:
    _instance = None  # Singleton instance holder
    
    def __new__(cls):
        """Ensure only one instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, rules_path: str = None):
        # ✅ FIX 1: Guard - only initialize once per singleton instance
        # Without this, __init__ runs multiple times and resets _rules_cache
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        
        # ✅ FIX 2: Instance variable (not class variable) for caching
        # _rules_cache is now per-instance (though there's only one instance)
        self._rules_cache = None
        
        if rules_path is None:
            rules_path = self._detect_rules_path()
        
        self.rules_path = Path(rules_path)
        logger.info(f"AccountingRulesLoader initialized with rules path: {self.rules_path}")
    
    @staticmethod
    def _detect_rules_path() -> str:
        """
        ✅ FIX 3: Auto-detect rules file with multiple fallback paths.
        NO HARDCODED WINDOWS PATHS - Works on any platform
    
        Search order:
        1. Same directory as this file
        2. Parent directory (project root)
        3. Grandparent directory (nested projects)
        4. Current working directory
        """
        base_file = Path(__file__).resolve()
        base_dir = base_file.parent
        
        # Build list of common locations to check (Cross-platform)
        common_paths = [
            # Same directory as this file
            base_dir / "bilan_rules.json",
            base_dir / "data" / "bilan_rules.json",
            base_dir / "core" / "bilan_rules.json",
            
            # Parent directory (project root)
            base_dir.parent / "bilan_rules.json",
            base_dir.parent / "data" / "bilan_rules.json",
            base_dir.parent / "core" / "bilan_rules.json",
            
            # Grandparent directory (for nested projects)
            base_dir.parent.parent / "bilan_rules.json",
            
            # Current working directory
            Path.cwd() / "bilan_rules.json",
            Path.cwd() / "data" / "bilan_rules.json",
            Path.cwd() / "core" / "bilan_rules.json",
        ]
        
        # Try each path
        for path in common_paths:
            if path.exists():
                logger.info(f"✓ Found bilan_rules.json at: {path}")
                return str(path)
        
        # If we get here, nothing was found
        paths_tried = "\n  ".join(str(p) for p in common_paths)
        error_msg = (
            f"bilan_rules.json not found in any standard location.\n"
            f"Tried:\n  {paths_tried}\n\n"
            f"Please ensure bilan_rules.json exists in one of these locations."
        )
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    def load_rules(self) -> Dict:
        """
        Load accounting rules from JSON file.
        Uses caching to avoid re-reading file on every call.
        """
        # Return cached rules if already loaded
        if self._rules_cache is not None:
            logger.debug("Returning cached rules (loaded previously)")
            return self._rules_cache
        
        # Verify file exists
        if not self.rules_path.exists():
            raise FileNotFoundError(f"Rules file not found: {self.rules_path}")
        
        # Load and cache
        try:
            with open(self.rules_path, "r", encoding="utf-8") as f:
                self._rules_cache = json.load(f)
            logger.info(f"✓ Rules loaded and cached from {self.rules_path}")
            return self._rules_cache
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in rules file: {e}")
            raise
        except IOError as e:
            logger.error(f"Cannot read rules file: {e}")
            raise
    
    def get_account_category(self, account_code: str) -> Optional[Dict]:
        """
        Look up which category an account code belongs to.

        Matching rule (Step 0 fix — prevents false positives):
          - Match only when ``account_code.startswith(rule_prefix)``.
          - Collect ALL matching candidates across the whole tree.
          - Return the LONGEST (most specific) prefix match.

        This prevents e.g. rule prefix "26" from winning over "264" for account
        "26430000", and prevents rule "53" from matching account "5".
        """
        rules = self.load_rules()

        # (prefix_string, label, node_path)
        candidates: List[tuple] = []

        _SKIP_KEYS = frozenset({
            "label", "note", "_source", "_remarque",
            "comptes_valeurs_brutes", "comptes_amortissements_provisions",
            "comptes_valeurs_nettes", "comptes_affectation",
        })

        def walk(obj, path: str = "") -> None:
            if not isinstance(obj, dict):
                return

            has_comptes = any(k.startswith("comptes") for k in obj)

            if "label" in obj and has_comptes:
                all_entries = (
                    obj.get("comptes_valeurs_brutes", []) +
                    obj.get("comptes_amortissements_provisions", []) +
                    obj.get("comptes_valeurs_nettes", []) +
                    obj.get("comptes_affectation", [])
                )
                for entry in all_entries:
                    # Strip sign prefix (-), parentheses, side indicator (DR/CR)
                    clean = entry.replace("(", "").replace(")", "").replace("-", "").strip()
                    if " " in clean:
                        clean = clean.split()[0]

                    # ONE-DIRECTION MATCH: account code must start with rule prefix.
                    # The old bidirectional "clean.startswith(code)" caused false positives
                    # (e.g. prefix "53" matched account "5", prefix "26" beat "264").
                    if account_code.startswith(clean):
                        candidates.append((clean, obj["label"], path))

            for key, value in obj.items():
                if key in _SKIP_KEYS:
                    continue
                new_path = f"{path}.{key}" if path else key
                walk(value, new_path)

        walk(rules)

        if not candidates:
            logger.debug(f"No category found for account code: {account_code}")
            return None

        # Longest prefix = most specific rule wins
        best_prefix, best_label, best_path = max(candidates, key=lambda c: len(c[0]))
        logger.debug(
            f"Account {account_code} → '{best_label}' via prefix '{best_prefix}' "
            f"(from {len(candidates)} candidate(s))"
        )
        return {"label": best_label, "code": account_code, "node_path": best_path}
    
    def get_accounts_by_category(self, category_path: str) -> List[str]:
        """
        Get all account codes in a specific category.
        
        Args:
            category_path: Dot-separated path (e.g., "actifs.actifs_courants.stocks")
            
        Returns:
            List of account code strings
        """
        rules = self.load_rules()
        
        # Navigate to the specified node
        parts = category_path.split(".")
        node = rules
        
        for part in parts:
            if isinstance(node, dict):
                node = node.get(part)
            else:
                logger.warning(f"Category path {category_path} not found")
                return []
        
        # Extract all account codes from this category node
        if not isinstance(node, dict):
            return []
        
        accounts = []
        for field in ["comptes_valeurs_brutes", "comptes_amortissements_provisions",
                      "comptes_valeurs_nettes", "comptes_affectation"]:
            accounts.extend(node.get(field, []))
        
        return accounts
    
    def validate_account_code(self, account_code: str) -> bool:
        """
        Check if an account code is valid (exists in rules).
        
        Args:
            account_code: Account code to validate
            
        Returns:
            True if found in rules, False otherwise
        """
        result = self.get_account_category(account_code)
        is_valid = result is not None
        logger.debug(f"Account {account_code} valid: {is_valid}")
        return is_valid
    
    def get_all_accounts(self) -> List[str]:
        """
        Get all account codes defined in the rules.
        
        Returns:
            List of all account code prefixes (sorted, unique)
        """
        rules = self.load_rules()
        accounts = set()
        
        def extract_accounts(obj):
            if isinstance(obj, dict):
                for field in ["comptes_valeurs_brutes", "comptes_amortissements_provisions",
                              "comptes_valeurs_nettes", "comptes_affectation"]:
                    for account in obj.get(field, []):
                        # Clean and normalize
                        clean = account.replace("(", "").replace(")", "").replace("-", "").strip()
                        if " " in clean:
                            clean = clean.split()[0]
                        accounts.add(clean)
                
                for value in obj.values():
                    extract_accounts(value)
            elif isinstance(obj, list):
                for item in obj:
                    extract_accounts(item)
        
        extract_accounts(rules)
        return sorted(list(accounts))

    # =========================================================================
    # LABEL NORMALISATION (Step 3)
    # =========================================================================

    @staticmethod
    def normalize_label(s: str) -> str:
        """
        Case-fold + accent-strip + collapse whitespace so that
        "Immobilisations financières" == "immobilisations financieres".
        Used by reconciliation to compare source-file Rubrique strings against
        rule category labels.
        """
        if not s:
            return ""
        # Lowercase
        s = s.strip().lower()
        # Remove accents via Unicode decomposition
        s = unicodedata.normalize("NFD", s)
        s = "".join(c for c in s if unicodedata.category(c) != "Mn")
        # Collapse whitespace
        s = re.sub(r"\s+", " ", s).strip()
        return s

    def build_label_index(self) -> Dict[str, str]:
        """
        Return a cached dict mapping normalize_label(category_label) → node_path
        for every leaf node in the rules tree.

        Used by reconciliation as a fallback: when an account has no rule match
        but does have a source Rubrique, we look up its Rubrique in this index to
        find the target node path (marked UNVERIFIED in the warning).
        """
        if hasattr(self, "_label_index_cache"):
            return self._label_index_cache  # type: ignore[return-value]

        rules = self.load_rules()
        index: Dict[str, str] = {}

        def walk(obj: Dict, path: str = "") -> None:
            if not isinstance(obj, dict):
                return
            has_comptes = any(k.startswith("comptes") for k in obj)
            if "label" in obj and has_comptes:
                key = self.normalize_label(obj["label"])
                if key and key not in index:
                    index[key] = path
            _skip = frozenset({"label", "note", "_source", "_remarque",
                               "comptes_valeurs_brutes", "comptes_amortissements_provisions",
                               "comptes_valeurs_nettes", "comptes_affectation"})
            for k, v in obj.items():
                if k not in _skip:
                    new_path = f"{path}.{k}" if path else k
                    walk(v, new_path)

        walk(rules)
        self._label_index_cache = index  # type: ignore[attr-defined]
        logger.info(f"Label index built: {len(index)} entries")
        return index