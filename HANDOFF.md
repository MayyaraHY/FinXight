# Session Handoff — Financial Engine

## Project stack
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (`backend/`)
- **Frontend**: Next.js 16 / React 19 / TypeScript / Tailwind (`frontend/`)
- **AI**: Groq (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) + Gemini (anomalies/chat via `ai_service/`)
- **Auth**: JWT RS256 via a separate `user-service` (Spring Boot)
- **Run**: `uvicorn app.main:app` from `backend/`, `npm run dev` from `frontend/`

---

## What was built this session

### 1. PCGT Account Validator (new pipeline)
Checks every account code from a CSV upload against the official Tunisian chart of accounts.

| File | Purpose |
|---|---|
| `backend/app/core/pcgt_loader.py` | Singleton loader for `plan_comptables_tunisiens.json`. Builds `_valid_prefixes` set at load time — O(1) `code_exists()`. Handles exact codes, parent prefixes ("54", "65"), analytic suffixes ("401000"), and zero-padded ERP codes ("23000000"). |
| `backend/app/services/account_matcher.py` | Rapidfuzz `token_sort_ratio` matcher + in-session cache. Thresholds: ≥90 high, 75–89 medium, <75 → LLM. |
| `backend/app/ai/account_llm.py` | Groq LLM fallback for invalid codes. Constrained to PCGT candidates. Never raises. |
| `backend/app/services/account_validator.py` | Orchestrator: `validate_account(code, label)` → valid / invalid_code / unresolved. `validate_accounts_batch(rows)` returns summary + invalid lines only. |
| `backend/app/models/validation_report.py` | `ValidationReport` ORM model (`id, upload_id, status, data, created_at`). Status: pending/done/failed. |
| `backend/app/repositories/validation_repository.py` | `upsert(upload_id, status, data)` — mirrors `BilanRepository`. |
| `backend/app/services/validation_service.py` | `run_account_validation(upload_id)` — background task (async). `run_account_validation_with_db(db, upload_id)` — synchronous, used by the `/run` endpoint. |
| `backend/app/controllers/validation_controller.py` | `GET /validation/{upload_id}` (read cache), `POST /validation/run/{upload_id}` (fresh re-run). |
| `backend/migrations/add_validation_reports.sql` | `CREATE TABLE validation_reports` for already-running DBs. |
| `backend/scripts/audit_pcgt.py` | Audits PCGT JSON — per-class counts + spot-checks. Run: `python backend/scripts/audit_pcgt.py`. |
| `backend/scripts/test_validation.py` | Standalone unit tests (no pytest needed). Run: `python backend/scripts/test_validation.py`. |

**Wired into upload pipeline**: after `save_accounts()` in both `parse_csv_file()` and `upload_and_parse_document()`, a `BackgroundTask` schedules `run_account_validation`.

**Frontend**:
- `frontend/src/services/validationService.ts` — `getValidationReport()`, `runValidation()` (POST /run)
- `frontend/src/app/uploads/[id]/accounts/page.tsx` — "Validation PCGT" button in card header (calls POST /run on click, GET on mount). Shows ⚠ invalide red badge on invalid code cells with tooltip. Green/red summary bar.
- `frontend/src/components/common/ComponentCard.tsx` — added `headerAction?: React.ReactNode` prop.

### 2. Bilan Deterministic Validator
Runs after `compute_totals()` on every `Recalculer`, before any LLM call.

| File | Purpose |
|---|---|
| `backend/app/core/bilan_validator.py` | 6 pure check functions + `run_all_checks()`. Zero DB deps. Classes 6/7 excluded from unmapped check (they're résultat accounts, not bilan). |
| `backend/tests/test_bilan_validator.py` | 8 tests. Run: `python backend/tests/test_bilan_validator.py`. |

**Check functions**:
- `find_unmapped_accounts` — accounts absent from bilan rules (skips classes 6/7)
- `check_negative_net_immobilisations` — immobilisation net < 0
- `check_difference_matches_account` — if imbalance == unmapped account balance, name it
- `check_sign_anomalies` — class-2 asset with credit balance (never flags class 6/7)
- `check_closure` — 131/135 = 0 while classes 6/7 have activity
- `check_netting_violations` — 409 vs 401, 419 vs 411 compensation

**Integration** (`bilan_service.py`): `calculate_and_save` now always adds `detected_issues` to `final_result`. The `/bilan/analyze` endpoint reads pre-computed issues from DB and passes them to Groq — the LLM only translates, never calculates.

**Key rule**: `bilan_rules.json` has `_validation` block documenting sign conventions. Account 421 placement left as-is (user confirmed correct).

### 3. Separate AI Analysis Endpoints
Generation and analysis are now decoupled.

| Endpoint | What it does |
|---|---|
| `POST /bilan/generate/{id}` | Pure math — calculates + saves. No LLM. |
| `POST /bilan/analyze/{id}` | LLM only — reads saved bilan, runs Groq/Gemini. Returns `{analysis}` (balanced) or `{imbalance_analysis}` (unbalanced). |
| `POST /cr/generate/{id}` | Pure math. |
| `POST /cr/analyze/{id}` | LLM only — returns `{cr_diagnosis}` if warnings. |

**Frontend buttons**:
- Bilan page: "⚠ Diagnostic IA" (red, only when `!isBalanced`) calls `POST /bilan/analyze`
- CR page: "✦ Diagnostic IA" always visible, calls `POST /cr/analyze`
- Both buttons have spinner, merge result into existing state without full reload.

**Prompts** (`backend/app/ai/prompts.py`): rewritten with `_CONVENTIONS` block (sign convention) prepended. `BILAN_IMBALANCE_PROMPT` now receives `{detected_issues}` JSON — LLM forbidden from inventing facts.

**Token fix**: `KnowledgeScope.NONE` used for imbalance diagnosis (was `BILAN` = 13k tokens, free tier limit 12k).

### 4. Bug fixes
- **Account code update**: `PUT /accounts/update/{id}?account_code=X` was returning 400. Added `account_code: str = None` param to `account_controller.py`. Service already handled it.
- **Polling infinite loop**: `validation/page.tsx` now uses `cancelledRef` to stop async polling after component unmounts.
- **rapidfuzz venv**: needs `venv1\Scripts\pip install rapidfuzz` (not global pip).

---

## Known issues / things to watch

1. **bilan_rules.json — 421 is intentionally in `autres_actifs_courants`**. User confirmed this placement is correct multiple times. Do not move it again without explicit instruction. The `_validation` block in the JSON explains the convention.

2. **PCGT singleton reset for tests**: when testing `PCGTLoader` in a script, do `PCGTLoader._instance = None` before instantiating to avoid stale singleton state.

3. **Groq token limits**: free tier = 12k TPM on `llama-3.3-70b-versatile`. The `KnowledgeScope.BILAN` scope (plan comptable + bilan rules + NC01) = ~13.8k tokens — too large. Use `KnowledgeScope.NONE` for diagnosis prompts that are already self-contained.

4. **CR analysis token issue**: `compte_resultat_service.py` `analyze()` uses `KnowledgeScope.NONE` — same token fix applied. `KnowledgeScope.CR` was over the limit.

5. **Stale validation reports**: if a user uploaded a file before the PCGT logic was updated, the stored `ValidationReport` row has old results. The "Validation PCGT" button now calls `POST /validation/run` (re-runs fresh), so clicking it always gives current results.

6. **bilan_rules.json `_validation` note**: says "421 côté actif = cas exceptionnel (acompte sur salaire versé = solde débiteur)". This is accurate — 421 shows on the actif side only when the balance is debit (advance paid). The `(DR)` filter convention handles this.

---

## Architecture decisions made

- **LLM = translator only**: all numerical diagnosis happens in Python (`bilan_validator.py`). The LLM receives `detected_issues` JSON and only reformats it into French. Never invents balances.
- **Async validation**: PCGT validation runs as a FastAPI `BackgroundTask` after parsing — same pattern as anomaly detection. Upload never blocks on LLM calls.
- **No label checking**: `account_validator.py` only checks code existence vs PCGT, never compares labels. Labels are ERP-generated and differ from official PCGT wording.
- **Classes 6/7 excluded from bilan unmapped check**: by PCGT rule, these are always résultat accounts, never bilan accounts. Closure check (`check_closure`) handles them separately.
- **`_valid_prefixes` set**: built at load time from all prefixes of all PCGT codes. Makes `code_exists("54")` work without special-casing every 2-digit parent code.

---

## Files to know

```
backend/app/
├── core/
│   ├── bilan_rules.json          ← Bilan classification rules (do not move accounts without proof)
│   ├── plan_comptables_tunisiens.json  ← PCGT reference (530 accounts)
│   ├── pcgt_loader.py            ← PCGT singleton + code_exists()
│   ├── bilan_validator.py        ← Deterministic pre-LLM checks
│   └── accounting_loader.py      ← Bilan rules loader (used by reconciliation)
├── services/
│   ├── bilan_service.py          ← calculate_and_save + analyze()
│   ├── compte_resultat_service.py ← same pattern
│   ├── account_validator.py      ← PCGT code validator
│   ├── account_matcher.py        ← rapidfuzz + cache
│   └── validation_service.py     ← background + sync validation tasks
├── ai/
│   ├── prompts.py                ← BILAN_IMBALANCE_PROMPT + CR_DIAGNOSIS_PROMPT
│   ├── groq_client.py            ← ask_groq(), KnowledgeScope, knowledge loaders
│   └── account_llm.py            ← llm_match() for invalid PCGT codes
├── controllers/
│   ├── bilan_controller.py       ← /bilan/generate, /bilan/analyze
│   ├── compte_resultat_controller.py ← /cr/generate, /cr/analyze
│   ├── validation_controller.py  ← /validation/{id}, /validation/run/{id}
│   └── account_controller.py     ← /accounts/update/{id} (account_code param added)
└── models/
    └── validation_report.py      ← ValidationReport ORM

frontend/src/
├── services/
│   ├── bilanService.ts           ← generateBilan, getBilan, analyzeBilan
│   ├── compteResultatService.ts  ← generateCR, getCR, analyzeCR
│   └── validationService.ts      ← getValidationReport, runValidation
└── app/uploads/[id]/
    ├── bilan/page.tsx            ← imbalance_analysis block + Diagnostic IA button
    ├── cr/page.tsx               ← cr_diagnosis block + Diagnostic IA button
    └── accounts/page.tsx         ← Validation PCGT button + ⚠ invalide badges
```

---

## Quick test checklist before starting

```bash
# 1. PCGT audit (should print "ALL spot-check codes resolve")
python backend/scripts/audit_pcgt.py

# 2. Validator unit tests (should print "ALL 8 TESTS PASSED")
python backend/tests/test_bilan_validator.py

# 3. PCGT code_exists sanity (should print True for all valid, False for 999/225)
python -c "
from app.core.pcgt_loader import PCGTLoader
l = PCGTLoader()
for c in ['54','65','75','282','2282','401','999','225']:
    print(c, l.code_exists(c))
"
```
