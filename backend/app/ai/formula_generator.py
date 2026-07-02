"""Groq-backed generation of custom KPI/ratio definitions from a metric name.
"""

import json
import logging
import re
import unicodedata

from groq import Groq

from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL = "llama-3.3-70b-versatile"

# Functions the formula grammar supports (must match frontend lib/formula.ts).
_FUNCTIONS_DOC = "abs(x), min(a, b), max(a, b)"

# ---------------------------------------------------------------------------
# Grounding data. KEEP IN SYNC with the frontend catalogs:
#   frontend/src/components/companies/ratioCatalog.ts
#   frontend/src/components/companies/kpiCatalog.ts
#   frontend/src/components/companies/metricVariables.ts
# This is advisory grounding + an override source; the authoritative formula
# validation stays in custom_metric_service (ALLOWED_VARS / _validate_formula).
# ---------------------------------------------------------------------------

# Canonical, ground-truth definitions for the built-in metrics. When the model
# maps a requested name to one of these keys (catalog_key), the service swaps in
# the exact formula here — guaranteeing correctness for the common metrics.
CATALOG_METRICS: dict[str, dict] = {
    # --- Liquidité ---
    "liquidite_generale": {
        "name": "Liquidité générale", "kind": "ratio", "format": "ratio",
        "formula": "actifs_courants / passifs_courants", "higher_better": True, "threshold": 1.5,
    },
    "liquidite_reduite": {
        "name": "Liquidité réduite (Quick Ratio)", "kind": "ratio", "format": "ratio",
        "formula": "(actifs_courants - stocks) / passifs_courants", "higher_better": True, "threshold": 1,
    },
    "liquidite_immediate": {
        "name": "Liquidité immédiate", "kind": "ratio", "format": "ratio",
        "formula": "liquidites / passifs_courants", "higher_better": True, "threshold": 0.2,
    },
    "fonds_de_roulement": {  # FR = capitaux permanents - actifs immobilisés
        "name": "Fonds de roulement", "kind": "kpi", "format": "currency",
        "formula": "capitaux_propres + passifs_non_courants - actifs_non_courants",
        "higher_better": True, "threshold": None,
    },
    "bfr": {  # BFR = stocks + créances clients - dettes fournisseurs
        "name": "Besoin en fonds de roulement (BFR)", "kind": "kpi", "format": "currency",
        "formula": "stocks + clients - fournisseurs", "higher_better": False, "threshold": None,
    },
    "tresorerie_nette": {  # TN = FR - BFR
        "name": "Trésorerie nette", "kind": "kpi", "format": "currency",
        "formula": "(capitaux_propres + passifs_non_courants - actifs_non_courants) - (stocks + clients - fournisseurs)",
        "higher_better": True, "threshold": None,
    },
    # --- Rentabilité ---
    "marge_exploitation": {
        "name": "Marge d'exploitation", "kind": "ratio", "format": "percent",
        "formula": "resultat_exploitation / produits_exploitation", "higher_better": True, "threshold": None,
    },
    "marge_nette": {
        "name": "Marge nette", "kind": "ratio", "format": "percent",
        "formula": "resultat_net / produits_exploitation", "higher_better": True, "threshold": None,
    },
    "roa": {
        "name": "ROA", "kind": "ratio", "format": "percent",
        "formula": "resultat_net / total_actif", "higher_better": True, "threshold": 0.05,
    },
    "roe": {
        "name": "ROE", "kind": "ratio", "format": "percent",
        "formula": "resultat_net / capitaux_propres", "higher_better": True, "threshold": 0.1,
    },
    # --- Structure financière ---
    "endettement": {  # Ratio d'endettement (D/E) = dettes / capitaux propres
        "name": "Endettement (D/E)", "kind": "ratio", "format": "ratio",
        "formula": "dettes / capitaux_propres", "higher_better": False, "threshold": 1,
    },
    "autonomie": {
        "name": "Autonomie financière", "kind": "ratio", "format": "percent",
        "formula": "capitaux_propres / total_passif", "higher_better": True, "threshold": 0.3,
    },
    "taux_endettement": {  # Total dettes / total actif
        "name": "Taux d'endettement", "kind": "ratio", "format": "percent",
        "formula": "dettes / total_actif", "higher_better": False, "threshold": 0.5,
    },
    "couverture_immobilisations": {  # capitaux permanents / actifs immobilisés
        "name": "Couverture des immobilisations", "kind": "ratio", "format": "ratio",
        "formula": "(capitaux_propres + passifs_non_courants) / actifs_non_courants",
        "higher_better": True, "threshold": 1,
    },
    # --- Activité ---
    "rotation_actifs": {  # CA / total actif (mono-période)
        "name": "Rotation des actifs", "kind": "ratio", "format": "ratio",
        "formula": "produits_exploitation / total_actif", "higher_better": True, "threshold": None,
    },
    "delai_clients": {  # (créances clients × 365) / CA — en jours
        "name": "Délai moyen de recouvrement clients (jours)", "kind": "ratio", "format": "ratio",
        "formula": "clients * 365 / produits_exploitation", "higher_better": False, "threshold": None,
    },
    # --- Montants (KPIs directs / dérivés) ---
    "resultat_exploitation": {
        "name": "Résultat d'exploitation", "kind": "kpi", "format": "currency",
        "formula": "resultat_exploitation", "higher_better": True, "threshold": None,
    },
    "dettes": {
        "name": "Dettes", "kind": "kpi", "format": "currency",
        "formula": "passifs_non_courants + passifs_courants", "higher_better": False, "threshold": None,
    },
    "total_actif": {"name": "Total Actif", "kind": "kpi", "format": "currency",
                    "formula": "total_actif", "higher_better": True, "threshold": None},
    "total_passif": {"name": "Total Passif", "kind": "kpi", "format": "currency",
                     "formula": "total_passif", "higher_better": True, "threshold": None},
    "capitaux_propres": {"name": "Capitaux propres", "kind": "kpi", "format": "currency",
                         "formula": "capitaux_propres", "higher_better": True, "threshold": None},
    "resultat_net": {"name": "Résultat net", "kind": "kpi", "format": "currency",
                     "formula": "resultat_net", "higher_better": True, "threshold": None},
}

# Known names/abbreviations per catalog metric. Used to VERIFY the model's
# catalog_key against the requested name before trusting the canonical override
# (guards against mis-mapping, e.g. "Taux de marge" → marge_nette). Seeded from
# the name variants in scripts/eval_formula_ai.py GOLD set.
CATALOG_ALIASES: dict[str, list[str]] = {
    "liquidite_generale": ["liquidité générale", "current ratio"],
    "liquidite_reduite": ["liquidité réduite", "quick ratio", "acid test"],
    "liquidite_immediate": ["liquidité immédiate", "cash ratio"],
    "fonds_de_roulement": ["fonds de roulement", "working capital", "fr"],
    "bfr": ["bfr", "besoin en fonds de roulement", "working capital requirement"],
    "tresorerie_nette": ["trésorerie nette", "net cash"],
    "marge_exploitation": ["marge d'exploitation", "marge opérationnelle", "operating margin"],
    "marge_nette": ["marge nette", "net margin", "marge bénéficiaire nette"],
    "roa": ["roa", "rentabilité de l'actif", "rentabilité des actifs", "return on assets"],
    "roe": ["roe", "rentabilité des capitaux propres", "return on equity"],
    "endettement": ["endettement", "ratio d'endettement", "gearing", "dette sur capitaux propres"],
    "autonomie": ["autonomie financière"],
    "taux_endettement": ["taux d'endettement"],
    "couverture_immobilisations": ["couverture des immobilisations"],
    "rotation_actifs": ["rotation des actifs", "asset turnover"],
    "delai_clients": ["délai moyen de recouvrement clients", "délai clients", "dso", "days sales outstanding"],
    "resultat_exploitation": ["résultat d'exploitation", "operating income", "ebit"],
    "dettes": ["dettes", "total des dettes"],
    "total_actif": ["total actif", "total de l'actif"],
    "total_passif": ["total passif", "total du passif"],
    "capitaux_propres": ["capitaux propres", "fonds propres", "equity"],
    "resultat_net": ["résultat net", "net income", "bénéfice net"],
}


def _norm(s: str) -> str:
    """Lowercase, strip accents, collapse to alphanumeric tokens — for tolerant
    name matching."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def catalog_key_matches(requested_name: str, catalog_key: str) -> bool:
    """True when the requested name plausibly corresponds to `catalog_key`
    (matches its canonical name or a known alias). Conservative: requires
    equality or a substring relationship on the normalized strings, so a
    mis-mapped key falls through to validated free-generation instead."""
    meta = CATALOG_METRICS.get(catalog_key)
    if not meta:
        return False
    req = _norm(requested_name)
    if not req:
        return False
    candidates = [meta["name"], *CATALOG_ALIASES.get(catalog_key, [])]
    for cand in candidates:
        c = _norm(cand)
        if c and (req == c or req in c or c in req):
            return True
    return False


# Precise meaning of each variable — the model must NOT guess these. Emphasizes
# the ambiguous ones (total_passif is the whole passif side, not "debts").
VARIABLE_DEFINITIONS: dict[str, str] = {
    "total_actif": "Total de l'actif = actifs_non_courants + actifs_courants.",
    "actifs_non_courants": "Actifs non courants (immobilisations).",
    "actifs_courants": "Actifs courants (stocks, clients, liquidités…).",
    "total_passif": "Total du passif = capitaux_propres + dettes (TOUT le passif, égal à total_actif). Ce n'est PAS le total des dettes.",
    "capitaux_propres": "Capitaux propres (fonds propres / equity).",
    "passifs_non_courants": "Passifs non courants (dettes à long terme).",
    "passifs_courants": "Passifs courants (dettes à court terme).",
    "resultat_net": "Résultat net de l'exercice (signé).",
    "produits_exploitation": "Produits d'exploitation / chiffre d'affaires (montant positif).",
    "charges_exploitation": "Charges d'exploitation (montant positif).",
    "resultat_exploitation": "Résultat d'exploitation déjà calculé (signé). Utilise-le directement pour les marges d'exploitation.",
    "stocks": "Stocks.",
    "clients": "Créances clients.",
    "fournisseurs": "Dettes fournisseurs.",
    "autres_actifs_courants": "Autres actifs courants.",
    "autres_passifs_courants": "Autres passifs courants.",
    "liquidites": "Liquidités et équivalents.",
    "concours_bancaires": "Concours bancaires courants (découverts).",
    "dettes": "Total des dettes = passifs_non_courants + passifs_courants.",
    "fonds_de_roulement": "Fonds de roulement = capitaux_propres + passifs_non_courants - actifs_non_courants.",
}

# Worked examples — anchor the model on correct formulas. Includes catalog
# metrics AND patterns the override won't cover (margins, BFR, net cash).
FEW_SHOT_EXAMPLES: list[dict] = [
    {"name": "ROE", "kind": "ratio", "format": "percent",
     "formula": "resultat_net / capitaux_propres", "higher_better": True, "threshold": 0.1,
     "catalog_key": "roe", "explanation": "Rentabilité des capitaux propres."},
    {"name": "Autonomie financière", "kind": "ratio", "format": "percent",
     "formula": "capitaux_propres / total_passif", "higher_better": True, "threshold": 0.3,
     "catalog_key": "autonomie", "explanation": "Part des capitaux propres dans le passif."},
    {"name": "Endettement (D/E)", "kind": "ratio", "format": "ratio",
     "formula": "dettes / capitaux_propres", "higher_better": False, "threshold": 1,
     "catalog_key": "endettement", "explanation": "Dettes rapportées aux capitaux propres."},
    {"name": "Liquidité réduite (Quick Ratio)", "kind": "ratio", "format": "ratio",
     "formula": "(actifs_courants - stocks) / passifs_courants", "higher_better": True, "threshold": 1,
     "catalog_key": "liquidite_reduite", "explanation": "Liquidité hors stocks."},
    {"name": "Fonds de roulement", "kind": "kpi", "format": "currency",
     "formula": "capitaux_propres + passifs_non_courants - actifs_non_courants",
     "higher_better": True, "threshold": None, "catalog_key": "fonds_de_roulement",
     "explanation": "Ressources stables moins les emplois stables."},
    {"name": "Besoin en fonds de roulement (BFR)", "kind": "kpi", "format": "currency",
     "formula": "stocks + clients - fournisseurs",
     "higher_better": False, "threshold": None, "catalog_key": "bfr",
     "explanation": "Besoin de financement du cycle d'exploitation."},
    {"name": "Marge d'exploitation", "kind": "ratio", "format": "percent",
     "formula": "resultat_exploitation / produits_exploitation", "higher_better": True,
     "threshold": None, "catalog_key": "marge_exploitation", "explanation": "Rentabilité d'exploitation."},
    # Computable but NOT a known catalog metric → catalog_key = null.
    {"name": "Part des stocks dans l'actif", "kind": "ratio", "format": "percent",
     "formula": "stocks / total_actif", "higher_better": False, "threshold": None,
     "catalog_key": None, "explanation": "Poids des stocks dans le total actif."},
    # Out of scope: NOT buildable from the allowed variables → refuse (computable
    # false, empty formula). NEVER approximate.
    {"name": "Marge brute", "computable": False, "kind": "ratio", "format": "percent",
     "formula": "", "higher_better": True, "threshold": None, "catalog_key": None,
     "explanation": "Nécessite le coût des ventes, absent des données disponibles."},
    {"name": "Rotation des stocks", "computable": False, "kind": "ratio", "format": "ratio",
     "formula": "", "higher_better": True, "threshold": None, "catalog_key": None,
     "explanation": "Nécessite le coût des ventes / achats, non disponibles."},
    {"name": "Excédent brut d'exploitation (EBE)", "computable": False, "kind": "kpi",
     "format": "currency", "formula": "", "higher_better": True, "threshold": None,
     "catalog_key": None, "explanation": "Nécessite charges de personnel et impôts, non disponibles."},
    {"name": "Délai moyen de paiement fournisseurs", "computable": False, "kind": "ratio",
     "format": "ratio", "formula": "", "higher_better": False, "threshold": None,
     "catalog_key": None, "explanation": "Nécessite les achats, non disponibles dans les données."},
]

_client: Groq = None


def _get_client() -> Groq:
    """Dedicated singleton — NOT app.ai.groq_client.get_client(), so formula
    generation draws on its own key/rate-limit bucket."""
    global _client
    if _client is None:
        key = settings.GROQ_FORMULA_API_KEY or settings.GROQ_API_KEY
        if not key:
            raise ValueError(
                "Génération IA indisponible : aucune clé API Groq configurée "
                "(GROQ_FORMULA_API_KEY)."
            )
        _client = Groq(api_key=key)
    return _client


def _build_messages(name: str, variables: list[dict], extra_instruction: str) -> list[dict]:
    # Emit a precise definition per allowed variable (fall back to the label).
    var_lines = "\n".join(
        f"- {v['key']} : {VARIABLE_DEFINITIONS.get(v['key'], v.get('label', ''))}"
        for v in variables
        if v.get("key")
    )
    # Known metrics the model may map to (→ server substitutes the exact formula).
    catalog_lines = "\n".join(
        f"- {key} : {m['name']}" for key, m in CATALOG_METRICS.items()
    )
    # Default computable=true for the positive examples; refusal examples carry
    # computable=false explicitly.
    examples = "\n".join(
        json.dumps({"computable": True, **ex}, ensure_ascii=False) for ex in FEW_SHOT_EXAMPLES
    )

    system = (
        "Tu es un expert-comptable tunisien (SCE / PCGT / NC01) qui traduit le nom "
        "d'un indicateur financier en une définition exploitable.\n\n"
        "Tu reçois le nom d'un KPI ou d'un ratio. Tu réponds UNIQUEMENT par un objet JSON "
        "avec exactement ces clés :\n"
        '{\n'
        '  "name": string,            // nom corrigé et standardisé en français\n'
        '  "kind": "kpi" | "ratio",   // "ratio" pour un rapport/pourcentage, "kpi" pour un montant\n'
        '  "format": "currency" | "ratio" | "percent",\n'
        '  "formula": string,         // expression mathématique\n'
        '  "higher_better": boolean,  // true si une valeur plus élevée est meilleure\n'
        '  "threshold": number | null,// seuil sain conventionnel, sinon null\n'
        '  "catalog_key": string | null, // clé d\'un indicateur connu ci-dessous, sinon null\n'
        '  "computable": boolean,     // false si l\'indicateur NE PEUT PAS être calculé avec les variables autorisées\n'
        '  "explanation": string      // une courte phrase en français\n'
        '}\n\n'
        "VARIABLES AUTORISÉES (identifiants exacts et leur signification) :\n"
        f"{var_lines}\n\n"
        "INDICATEURS CONNUS (si le nom demandé correspond à l'un d'eux, renvoie sa clé dans "
        "catalog_key ; sinon catalog_key = null) :\n"
        f"{catalog_lines}\n\n"
        "EXEMPLES (réponses correctes) :\n"
        f"{examples}\n\n"
        "RÈGLES STRICTES pour formula :\n"
        f"- N'utilise QUE les variables listées ci-dessus (identifiants exacts).\n"
        f"- Opérateurs autorisés : + - * / et parenthèses. Fonctions autorisées : {_FUNCTIONS_DOC}.\n"
        "- N'invente aucune autre variable, aucun chiffre magique non justifié.\n"
        "- Respecte la signification exacte des variables (ex. total_passif = capitaux_propres + dettes, "
        "PAS uniquement les dettes).\n"
        "- Un ratio/pourcentage => kind \"ratio\" (format \"percent\" si exprimé en %, sinon \"ratio\").\n"
        "- Un montant agrégé (dinars) => kind \"kpi\", format \"currency\".\n"
        "- Vérifie que la formule correspond à la définition comptable standard avant de répondre.\n"
        "- Si l'indicateur demandé NE PEUT PAS être calculé à partir des variables autorisées "
        "(ex. marge brute, rotation des stocks, EBE, délai fournisseurs — qui exigent le coût des "
        "ventes, les achats, etc.), réponds computable=false et laisse formula vide (\"\"). "
        "N'invente JAMAIS une formule approximative pour contourner des données manquantes.\n"
    )
    if extra_instruction:
        system += "\nCORRECTION DEMANDÉE : " + extra_instruction
    user = f'Nom de l\'indicateur : "{name}"\nRéponds en JSON.'
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# First-pass generations cached by normalized name — the model is deterministic
# (temperature=0) and the variable catalog is static, so repeating a name should
# not re-bill Groq. Corrective retries (extra_instruction set) are never cached.
_GEN_CACHE: dict[str, dict] = {}
_GEN_CACHE_MAX = 512


def generate_metric_json(name: str, variables: list[dict], extra_instruction: str = "") -> dict:
    """Call Groq (JSON mode) and return the parsed metric definition dict.

    Raises ValueError (French message) on any Groq/parse failure.
    """
    cache_key = _norm(name) if not extra_instruction else None
    if cache_key and cache_key in _GEN_CACHE:
        logger.info(f"Formula gen cache hit for '{name}'")
        return dict(_GEN_CACHE[cache_key])

    client = _get_client()
    messages = _build_messages(name, variables, extra_instruction)
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content.strip()
        logger.info(f"Formula gen for '{name}': {len(content)} chars")
        parsed = json.loads(content)
        if cache_key is not None:
            if len(_GEN_CACHE) >= _GEN_CACHE_MAX:
                _GEN_CACHE.clear()
            _GEN_CACHE[cache_key] = dict(parsed)
        return parsed
    except ValueError:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Formula gen JSON parse error: {e}")
        raise ValueError("Réponse IA illisible, réessayez.")
    except Exception as e:
        logger.error(f"Formula gen Groq error: {e}")
        raise ValueError(f"Erreur de génération IA : {str(e)}")
