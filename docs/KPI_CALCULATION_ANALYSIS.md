# KPI Calculation & Generation — Analysis, Rating, and Improvement Plan

_Analysis only — no code was changed. Date: 2026-07-02._

## Scope

This reviews the custom KPI/ratio feature end to end:

**Generation (AI)**
- `backend/app/ai/formula_generator.py` — Groq prompt, catalog, few-shot
- `backend/app/services/custom_metric_service.py` — normalization, validation, retry
- `backend/app/controllers/custom_metric_controller.py` — API surface
- `backend/scripts/eval_formula_ai.py` — eval harness

**Calculation (evaluation)**
- `frontend/src/lib/formula.ts` — safe formula engine
- `frontend/src/components/companies/metricVariables.ts` — variable map
- `frontend/src/components/companies/ratioCatalog.ts` / `kpiCatalog.ts` — built-ins
- `frontend/src/components/companies/RatioAnalysis.tsx` / `KpiCard.tsx` — rendering
- `backend/app/repositories/timeline_repository.py` — variable data source

---

## Overall rating: **8.0 / 10 — strong, production-grade design with a few sharp edges**

| Dimension | Rating | One-line verdict |
|---|---|---|
| Security of evaluation | 9.5 / 10 | No `eval`/`Function`; hand-written parser. Excellent. |
| AI generation architecture | 8.5 / 10 | Catalog-override + free-gen + retry is a smart, correctness-first design. |
| Formula engine robustness | 8.5 / 10 | Clean null propagation, div-by-zero → `null`, arity checks. |
| Validation | 7 / 10 | Syntactic only; no semantic/dimensional guard; server/client grammar can drift. |
| Out-of-scope handling | 4.5 / 10 | **Biggest risk:** no refusal path — impossible metrics get plausible-but-wrong formulas that validate and save. |
| Data-source coupling | 6 / 10 | Variable values come from fragile string-key leaf lookups (with typos). |
| Consistency / DRY | 6 / 10 | Same derived math duplicated in 3+ places; catalogs "KEEP IN SYNC" by hand. |
| Testing | 6 / 10 | Good live eval harness, but the critical parser (`formula.ts`) has no unit tests, and the harness needs Groq (not CI-friendly). |

---

## What is done well

1. **Safe-by-construction evaluation.** `formula.ts` is a tokenizer + shunting-yard → RPN evaluator with no `eval`/`Function`. This is the correct choice for user-authored formulas and eliminates the whole injection class.
2. **Correctness-first AI design.** The two-tier approach in `_normalize_generated` — when the model returns a `catalog_key`, the **canonical built-in formula overrides** the generated one — guarantees exactness for the ~25 common metrics while still allowing free generation for the long tail.
3. **Defensive generation loop.** `temperature=0`, JSON mode, a **dedicated Groq key/rate bucket**, and a **single corrective retry that feeds the validation error back to the model** (`custom_metric_service.py:120`). Solid.
4. **Strong grounding.** Per-variable definitions (`VARIABLE_DEFINITIONS`), a known-metrics catalog, and few-shot examples — including the ambiguous ones (`total_passif ≠ dettes`) and a negative example (`catalog_key = null`).
5. **Semantic eval harness.** `eval_formula_ai.py` compares formulas **numerically over random inputs**, not as strings — so `a/b` and `(a)/(b)` are equal and a plausible-but-wrong formula is still caught.
6. **Graceful UI degradation.** Null propagation returns `null` → UI shows `—` instead of `NaN`; `KpiCard` avoids `NaN%` on a zero base; live preview in the modal.

---

## Weaknesses & risks (highest to lowest impact)

### 1. No out-of-scope refusal — wrong formulas that validate and persist ⚠️ (highest)
The 20 variables cannot express marge brute, rotation des stocks, EBE, DSO fournisseurs, etc. The eval harness explicitly marks these `oos=True` for manual review — but **production has no equivalent guard**. The model will fabricate a plausible formula from the available variables; it passes the syntactic `_validate_formula`, and gets saved as if correct. A user asking for "Marge brute" can silently get a meaningless number.
- **Fix:** let the model return `catalog_key: null` **and** a `computable: false` / `confidence` signal; when low, refuse in the service and surface "cet indicateur ne peut pas être calculé à partir des données disponibles" instead of saving.

### 2. `catalog_key` is trusted blindly
`_normalize_generated` swaps in the catalog formula whenever the model emits a `catalog_key`, with **no check that the mapped metric actually matches the requested name**. A mis-mapping (e.g. "Taux de marge" → `marge_nette`) silently overrides with the wrong-but-canonical formula.
- **Fix:** cross-check the requested name against the catalog metric's name/aliases (fuzzy match) before trusting the override; on mismatch, fall back to free-gen or refuse.

### 3. Validation is purely syntactic — no dimensional/semantic sanity
`_validate_formula` and `validateFormula` check unknown identifiers, balanced parens, and arity only. Nothing catches **dimensional nonsense** (adding a currency to a ratio, `total_actif + roe`), inverted ratios, or a `kind="ratio"` with `format="currency"`.
- **Fix:** a lightweight dimensional tag per variable (currency vs ratio vs pure number) and reject `+`/`-` between incompatible dims; assert `kind`/`format` coherence in `_normalize_generated`.

### 4. Server can persist a formula the frontend can never evaluate
The Python validator deliberately skips arity/stack-depth checks ("authoritative evaluation is on the frontend"). So `min(a)` or `max(a, b, c)` **passes the server and saves**, then evaluates to `null` forever on the client — a silent dead metric. There is also a subtle grammar drift: `formula.ts` accepts leading-dot numbers (`.5`) that the server regex (`\d+\.?\d*`) rejects.
- **Fix:** port the arity/stack-depth simulation from `validateFormula` into `_validate_formula` (or share one grammar spec), so the server rejects exactly what the client can't evaluate.

### 5. Fragile variable data source
`timeline_repository.py` maps variables via hard-coded flattened string keys, some with **typos baked in**: `"passifs_courant.conours_bancaires_..."` (missing `c`, singular `courant`). If the bilan tree key ever changes, the variable silently becomes `null` → metric shows `—` with no error. `concours_bancaires` is almost certainly already broken by that typo.
- **Fix:** centralize leaf-key constants, add a startup assertion that every expected key resolves for a sample bilan, and fix the `conours`/`passifs_courant` spelling at the source.

### 6. Derived math duplicated in 3+ places (DRY / drift)
`dettes` and `fonds_de_roulement` are recomputed independently in `metricVariables.periodVars`, `kpiCatalog` (`debtOf`/`frOf`), and `ratioCatalog` (`sumOrNull`), and again as strings in the AI catalog. The catalogs also carry a **"KEEP IN SYNC" manual contract** across `formula_generator.py` and three frontend files. Any edit risks divergence.
- **Fix:** a single derived-variable module reused by KPI cards, ratios, and the formula var-map; generate the AI's variable/catalog grounding from that same source (or a shared JSON) rather than hand-copying.

### 7. Presentation inconsistency for similar ratios
`ROA` is `format: "percent"` but `ROE` is `format: "ratio"` (shows `0.15`, not `15%`) in both `ratioCatalog.ts` and the AI catalog. Two profitability ratios rendered on different scales is confusing.
- **Fix:** pick one convention for profitability ratios (percent is conventional) and align.

### 8. Sign / edge-case blind spots
Ratios don't guard against **negative denominators**: ROE with negative equity yields a positive-looking number (neg/neg), which is misleading. `resultat_net`/`resultat_exploitation` are signed, so margins can legitimately go negative — fine — but the "healthy/higher-better" coloring has no handling for the negative-equity case.

### 9. Testing gaps
- The **most critical component — the `formula.ts` parser — has no unit tests.** Tokenizer/shunting-yard/RPN edge cases (unary minus, nested funcs, unbalanced parens, `min(a,)`) are exactly where hand-written parsers break.
- The eval harness calls **live Groq** (costs tokens, non-deterministic, not CI-runnable) and only samples **positive inputs** in `[1,1000]` — it never exercises zeros (div-by-zero equivalence) or negatives (sign correctness).

### 10. No caching / persisted values
Generation re-hits Groq for identical names; computed metric values are never persisted server-side, so there's no server-side sorting/alerting/multi-company aggregation and every render recomputes.

---

## Prioritized recommendations

| # | Priority | Change | Payoff |
|---|---|---|---|
| 1 | **High** | Add an out-of-scope refusal signal (`computable`/confidence) and refuse instead of fabricating | Kills the top correctness risk |
| 2 | **High** | Add unit tests for `formula.ts` (tokenizer/parser/eval edge cases) | Protects the load-bearing component |
| 3 | **High** | Verify `catalog_key` matches the requested name before override | Prevents silent wrong-metric swaps |
| 4 | **Medium** | Fix `timeline_repository` leaf-key typos + startup key-resolution assertion | Restores likely-broken variables |
| 5 | **Medium** | Port arity/depth check into the server validator; unify one grammar spec | No un-evaluable saved formulas |
| 6 | **Medium** | Single derived-variable module; generate AI grounding from one source | Removes "keep in sync" drift |
| 7 | **Medium** | Add dimensional + `kind`/`format` coherence checks | Catches nonsense formulas |
| 8 | **Low** | Align ROA/ROE format; handle negative-denominator ratios | Consistency + correctness on edge cases |
| 9 | **Low** | Make eval harness CI-friendly (record/replay Groq, add zero/negative inputs) | Regression safety net |
| 10 | **Low** | Cache generation by normalized name; consider persisting computed values | Cost + future server-side features |

---

## Bottom line

The **architecture is genuinely good**: safe evaluation, a correctness-first catalog-override strategy, retry-with-feedback, and a semantic eval harness are above the bar for this kind of feature. The rating is held back mainly by one real hazard — **impossible metrics silently produce plausible, validating, saved-but-wrong formulas** — plus DRY/consistency drift and a missing unit-test layer around the parser. Address items 1–3 and this moves comfortably into the 9/10 range.
