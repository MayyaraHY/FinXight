"""Canonical flattened bilan-leaf keys + the shared flattener.

`_flatten_bilan` used to be copy-pasted in timeline_repository and
cashflow_orchestrator; it lives here now, together with named constants for
every leaf key those modules look up. Referencing constants (not inline
strings) means a rules-file rename can't silently null a variable — the
resolution guard test asserts every constant resolves.

NOTE on the "concours" spelling: bilan_rules.json originally shipped a typo
("conours_bancaires..."). The rule is now corrected to "concours_...", but
bilans COMPUTED BEFORE the fix are persisted with the old key. Readers of
STORED bilan data must therefore accept both spellings — hence
CONCOURS_BANCAIRES_KEYS and the `leaf()` multi-candidate lookup.
"""

# --- Flattened leaf keys ("<parent>.<leaf>", spaces→underscores) ------------
STOCKS = "actifs_courants.stocks"
CLIENTS = "actifs_courants.clients_et_comptes_rattaches"
AUTRES_ACTIFS_COURANTS = "actifs_courants.autres_actifs_courants"
LIQUIDITES = "actifs_courants.liquidites_et_equivalents_de_liquidites"
FOURNISSEURS = "passifs_courant.fournisseurs_et_comptes_rattaches"
AUTRES_PASSIFS_COURANTS = "passifs_courant.autres_passifs_courants"
CONCOURS_BANCAIRES = "passifs_courant.concours_bancaires_et_autres_passif_financier"

# Legacy misspelling persisted in bilans computed before the rules-file fix.
CONCOURS_BANCAIRES_LEGACY = "passifs_courant.conours_bancaires_et_autres_passif_financier"
# Accept both when reading stored data (corrected first).
CONCOURS_BANCAIRES_KEYS = (CONCOURS_BANCAIRES, CONCOURS_BANCAIRES_LEGACY)


def flatten_bilan(nested: dict) -> dict[str, float]:
    """Flatten a bilan tree to {"<parent>.<leaf>": amount}, where <parent> is the
    leaf's immediate parent key with spaces replaced by underscores — matching the
    `ref` spellings in the rules files (e.g. "passifs_courant.fournisseurs...")."""
    flat: dict[str, float] = {}

    def walk(node: dict, parent_key: str | None) -> None:
        for key, value in node.items():
            if not isinstance(value, dict):
                continue
            if "amount" in value:  # leaf
                if parent_key is not None:
                    flat[f"{parent_key.replace(' ', '_')}.{key}"] = float(value["amount"])
            else:
                walk(value, key)

    walk(nested, None)
    return flat


def leaf(leaves: dict, *candidates: str):
    """Return the first present candidate key's value, else None. Used for keys
    that may appear under more than one spelling in stored data."""
    for key in candidates:
        if key in leaves:
            return leaves[key]
    return None
