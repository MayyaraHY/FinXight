import json
import logging
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
        Recursively searches the rules tree for matching account codes.
        Handles special cases like negation (-251) and side indicators (401 DR).
        
        Args:
            account_code: The account code to look up
                         Examples: "411", "221", "101"
            
        Returns:
            dict with keys:
            - label: Category name (e.g., "Clients et comptes rattachés")
            - code: The input account code
            - node_path: Path in rules tree (for debugging)
            
            Or None if not found.
            
        Example:
            >>> loader.get_account_category("411")
            {
                "label": "Clients et comptes rattachés",
                "code": "411",
                "node_path": "actifs.actifs_courants.clients_et_comptes_rattaches"
            }
            
            >>> loader.get_account_category("999")
            None  # Not found
        """
        rules = self.load_rules()
        
        def find_category(obj, code, path=""):
            """
            Recursive search through rules tree.
            
            ✅ FIX 3: Proper check for "comptes_*" keys using any().startswith().
            This correctly identifies category nodes regardless of which
            "comptes_*" fields they contain.
            
            Args:
                obj: Current object in recursion (dict, list, or primitive)
                code: Account code to find
                path: Current path in tree (for debugging)
                
            Returns:
                dict with match info, or None if not found
            """
            if isinstance(obj, dict):
                # ✅ FIX 3: Check if this node is a category
                # Old: "comptes" in obj  ← BROKEN (exact key match only)
                # New: any(k.startswith("comptes") for k in obj)  ← FIXED (pattern match)
                has_comptes = any(k.startswith("comptes") for k in obj)
                
                # If it's a category node with account lists
                if "label" in obj and has_comptes:
                    # Collect all account specifications from all comptes_* fields
                    all_accounts = (
                        obj.get("comptes_valeurs_brutes", []) +
                        obj.get("comptes_amortissements_provisions", []) +
                        obj.get("comptes_valeurs_nettes", []) +
                        obj.get("comptes_affectation", [])
                    )
                    
                    # Check if our code matches any account in this category
                    for entry in all_accounts:
                        # Normalize entry: remove negation (-), parentheses, spaces
                        clean = entry.replace("(", "").replace(")", "").replace("-", "").strip()
                        
                        # Remove side indicators (DR/CR) if present
                        # E.g., "401 DR" becomes "401"
                        if " " in clean:
                            clean = clean.split()[0]
                        
                        # Match rules:
                        # - code.startswith(clean): "411" matches "41" (parent category)
                        # - clean.startswith(code): "41" matches "411" (child lookup)
                        if code.startswith(clean) or clean.startswith(code):
                            logger.debug(
                                f"Found: code={code} in category={obj['label']} "
                                f"(entry={entry}, clean={clean})"
                            )
                            return {
                                "label": obj["label"],
                                "code": code,
                                "node_path": path
                            }
                
                # Recurse into child nodes
                for key, value in obj.items():
                    # Skip special fields (not category nodes)
                    if key not in ["label", "comptes_valeurs_brutes", 
                                   "comptes_amortissements_provisions",
                                   "comptes_valeurs_nettes", 
                                   "comptes_affectation", "note"]:
                        new_path = f"{path}.{key}" if path else key
                        result = find_category(value, code, new_path)
                        if result:
                            return result
            
            elif isinstance(obj, list):
                # Recurse into list items
                for i, item in enumerate(obj):
                    new_path = f"{path}[{i}]"
                    result = find_category(item, code, new_path)
                    if result:
                        return result
            
            return None
        
        result = find_category(rules, account_code)
        
        if result:
            logger.info(f"✓ Found category for account {account_code}: {result['label']}")
        else:
            logger.warning(f"⚠ No category found for account code: {account_code}")
        
        return result
    
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