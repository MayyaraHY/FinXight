import json
import logging
import os
from enum import Flag, auto
from functools import lru_cache

from groq import Groq
from app.core.config import settings

logger = logging.getLogger(__name__)

# All knowledge files live alongside the JSON rules in backend/app/
_APP_DIR = os.path.join(os.path.dirname(__file__), "..")

PLAN_COMPTABLE_FILE = os.path.join(_APP_DIR, "core","plan_comptables_tunisiens.json")
BILAN_RULES_FILE    = os.path.join(_APP_DIR, "core", "bilan_rules.json")
NC01_RULES_FILE     = os.path.join(_APP_DIR, "knowledge", "nc01_rules.txt")


# ---------------------------------------------------------------------------
# Knowledge scope — declare exactly what each call needs
# ---------------------------------------------------------------------------

class KnowledgeScope(Flag):
    NONE           = 0
    PLAN_COMPTABLE = auto()
    BILAN_RULES    = auto()
    NC01_BILAN     = auto()   # NC01 pages 5-7: bilan presentation rules
    NC01_CR        = auto()   # NC01 pages 8-10: CR structure + cost of sales

    BILAN = PLAN_COMPTABLE | BILAN_RULES | NC01_BILAN
    CR    = PLAN_COMPTABLE | NC01_CR
    FULL  = PLAN_COMPTABLE | BILAN_RULES | NC01_BILAN | NC01_CR


# ---------------------------------------------------------------------------
# Groq client — singleton
# ---------------------------------------------------------------------------

_client: Groq = None

def get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Knowledge loaders — lru_cache: disk read exactly once per process
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def load_plan_comptable() -> str:
    if not os.path.exists(PLAN_COMPTABLE_FILE):
        logger.warning(f"Plan comptable not found: {PLAN_COMPTABLE_FILE}")
        return ""
    with open(PLAN_COMPTABLE_FILE, encoding="utf-8") as f:
        data = json.load(f)
    pct, lines = data["plan_comptable_tunisien"], []
    for cls_key, cls_val in pct.items():
        cls_label = cls_val["label"]
        cls_num   = cls_key.replace("classe_", "")
        for _, cat_val in cls_val["categories"].items():
            if not isinstance(cat_val, dict):
                continue
            cat_label = cat_val.get("label", "")
            for acc_code, acc_val in cat_val.get("accounts", {}).items():
                acc_label = acc_val.get("label", "") if isinstance(acc_val, dict) else str(acc_val)
                lines.append(
                    f"{acc_code} - {acc_label} | {cat_label} | Classe {cls_num}: {cls_label}"
                )
    result = "\n".join(lines)
    logger.info(f"Plan comptable cached: {len(lines)} accounts (~{len(result)//4} tokens)")
    return result


@lru_cache(maxsize=1)
def load_bilan_rules() -> str:
    if not os.path.exists(BILAN_RULES_FILE):
        logger.warning(f"Bilan rules not found: {BILAN_RULES_FILE}")
        return ""
    with open(BILAN_RULES_FILE, encoding="utf-8") as f:
        data = json.load(f)
    lines = []
    _flatten_rules(data, path=[], lines=lines)
    result = "\n".join(lines)
    logger.info(f"Bilan rules cached: {len(lines)} sections (~{len(result)//4} tokens)")
    return result


def _flatten_rules(node: dict, path: list, lines: list) -> None:
    label        = node.get("label", "")
    account_keys = [
        "comptes_valeurs_brutes", "comptes_amortissements_provisions",
        "comptes_valeurs_nettes",  "comptes_affectation",
    ]
    if any(k in node for k in account_keys):
        section = " > ".join(path + ([label] if label else []))
        parts   = [f"{k}: {node[k]}" for k in account_keys if k in node]
        lines.append(f"{section} | " + " | ".join(parts))
        return
    for key, val in node.items():
        if isinstance(val, dict) and key not in ("label", "note", "_source"):
            _flatten_rules(val, path + ([label] if label else [key]), lines)


@lru_cache(maxsize=1)
def _load_nc01_full() -> dict[str, str]:
    if not os.path.exists(NC01_RULES_FILE):
        logger.warning(
            f"NC01 rules not found: {NC01_RULES_FILE}. "
            "Run scripts/build_nc01_knowledge.py to generate it."
        )
        return {"bilan": "", "cr": ""}
    with open(NC01_RULES_FILE, encoding="utf-8") as f:
        content = f.read()
    marker = "=== NC 01 — Page 8"
    if marker in content:
        bilan_part = content[:content.index(marker)].strip()
        cr_part    = content[content.index(marker):].strip()
    else:
        bilan_part, cr_part = content, ""
    logger.info(f"NC01 cached: bilan={len(bilan_part)//4}tok, cr={len(cr_part)//4}tok")
    return {"bilan": bilan_part, "cr": cr_part}


# ---------------------------------------------------------------------------
# Message assembly — knowledge → system, task + data → user
# ---------------------------------------------------------------------------

def _build_messages(task: str, context: dict | None, scope: KnowledgeScope) -> list[dict]:
    """
    System message: stable knowledge (cache-friendly prefix).
    User message:   task + financial data (changes per query).
    """
    system_parts = [
        "Tu es un expert-comptable tunisien spécialisé dans le SCE "
        "(Système Comptable des Entreprises) et les normes PCGT / NC 01. "
        "Tu identifies les erreurs dans les états financiers et expliques comment les corriger."
    ]

    if KnowledgeScope.PLAN_COMPTABLE in scope:
        plan = load_plan_comptable()
        if plan:
            system_parts.append(
                "PLAN COMPTABLE GÉNÉRAL TUNISIEN (PCGT):\n"
                "Code - Libellé | Catégorie | Classe\n" + plan
            )

    if KnowledgeScope.BILAN_RULES in scope:
        rules = load_bilan_rules()
        if rules:
            system_parts.append(
                "RÈGLES DU BILAN SCE — Affectation des comptes par rubrique:\n" + rules
            )

    nc01 = _load_nc01_full()
    if KnowledgeScope.NC01_BILAN in scope and nc01["bilan"]:
        system_parts.append("RÈGLES NC01 — Bilan (pages 5-7):\n" + nc01["bilan"])
    if KnowledgeScope.NC01_CR in scope and nc01["cr"]:
        system_parts.append("RÈGLES NC01 — Compte de Résultat (pages 8-10):\n" + nc01["cr"])

    system_content = ("\n\n" + "─" * 60 + "\n\n").join(system_parts)

    user_parts = []
    if context:
        user_parts.append(
            "DONNÉES FINANCIÈRES:\n"
            + json.dumps(context, ensure_ascii=False, default=str, indent=2)
        )
    user_parts.append("TÂCHE:\n" + task)

    return [
        {"role": "system", "content": system_content},
        {"role": "user",   "content": "\n\n".join(user_parts)},
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def ask_groq(
    prompt: str,
    context: dict | None = None,
    scope: KnowledgeScope = KnowledgeScope.BILAN,
    model: str = "llama-3.3-70b-versatile",
) -> str:
    """
    Single entry point for all Groq diagnosis calls in the backend.

    Args:
        prompt:  Task instruction (BILAN_IMBALANCE_PROMPT or CR_DIAGNOSIS_PROMPT).
        context: Financial data — totals, accounts, difference, CR lines, etc.
        scope:   KnowledgeScope.BILAN  → bilan diagnosis  (~12k system tokens)
                 KnowledgeScope.CR     → CR diagnosis      (~12k system tokens)
                 KnowledgeScope.FULL   → both              (~17k system tokens)
                 KnowledgeScope.NONE   → no knowledge      (simple/cheap calls)
        model:   llama-3.3-70b-versatile (default).

    Raises:
        ValueError with a French message on failure.
    """
    client   = get_client()
    messages = _build_messages(prompt, context, scope)

    logger.debug(
        f"Groq | scope={scope} | model={model} | "
        f"system={len(messages[0]['content'])//4}tok | "
        f"user={len(messages[1]['content'])//4}tok"
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=800,
            temperature=0.1,
        )
        result = response.choices[0].message.content.strip()
        logger.info(f"Groq response: {len(result)} chars")
        return result

    except Exception as e:
        logger.error(f"Groq error: {e}")
        raise ValueError(f"Erreur Groq: {str(e)}")