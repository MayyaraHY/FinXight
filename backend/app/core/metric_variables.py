"""Single source of truth for the custom-metric variable map.

Mirrors frontend/src/components/companies/metricVariables.ts `periodVars`: given
a timeline period dict (as produced by timeline_repository), it returns the full
variable map a formula may reference, including the DERIVED convenience vars
`dettes` and `fonds_de_roulement`. Computing these here (once) replaces the
copies previously scattered across metricVariables.ts / kpiCatalog.ts /
ratioCatalog.ts.
"""

# Base statement variables carried on every timeline period.
_BASE_KEYS = (
    "total_actif", "actifs_non_courants", "actifs_courants",
    "total_passif", "capitaux_propres", "passifs_non_courants", "passifs_courants",
    "resultat_net", "produits_exploitation", "charges_exploitation", "resultat_exploitation",
    "stocks", "clients", "fournisseurs", "autres_actifs_courants", "autres_passifs_courants",
    "liquidites", "concours_bancaires",
)

# Derived convenience variables computed from the base ones.
_DERIVED_KEYS = ("dettes", "fonds_de_roulement")

# The complete set a formula may reference (base + derived).
VARIABLE_KEYS: frozenset[str] = frozenset(_BASE_KEYS + _DERIVED_KEYS)


def _z(v: float | None) -> float:
    return 0.0 if v is None else v


def build_var_map(period: dict) -> dict[str, float | None]:
    """Build the {var_key: value|None} map for one period, adding derived vars.

    `dettes` and `fonds_de_roulement` are None only when ALL their inputs are
    missing (matches the frontend), so a formula referencing a partially-present
    derived var still gets a number rather than silently dropping to None."""
    pnc = period.get("passifs_non_courants")
    pc = period.get("passifs_courants")
    cp = period.get("capitaux_propres")
    anc = period.get("actifs_non_courants")

    dettes = None if pnc is None and pc is None else _z(pnc) + _z(pc)
    fonds_de_roulement = (
        None
        if cp is None and pnc is None and anc is None
        else _z(cp) + _z(pnc) - _z(anc)
    )

    var_map: dict[str, float | None] = {k: period.get(k) for k in _BASE_KEYS}
    var_map["dettes"] = dettes
    var_map["fonds_de_roulement"] = fonds_de_roulement
    return var_map
