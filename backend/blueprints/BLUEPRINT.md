# Financial AI Engine — Backend Blueprint

> Python · FastAPI · PostgreSQL · Gemini AI · Tunisian Accounting Standards (SCE / PCGT)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Initial State](#3-initial-state-before-this-session)
4. [Bugs Fixed](#4-bugs-fixed-this-session)
5. [New Features](#5-new-features-added)
6. [Files Reference](#6-files-reference)
7. [API Endpoints](#7-api-endpoints)
8. [Data Flow](#8-data-flow)
9. [Suggested Improvements](#9-suggested-improvements)

---

## 1. Project Overview

A backend engine that:

- Accepts Tunisian accounting CSV files (trial balances / grand livres)
- Automatically detects encoding, delimiters, header rows, and column types
- Maps columns to standardized accounting fields using NLP + fuzzy matching + Gemini fallback
- Calculates a full balance sheet (bilan) from the parsed accounts using recursive rule trees
- Generates AI financial analysis, anomaly detection, and a natural-language Q&A chat

All calculations follow **Tunisian Accounting Standards** (Système Comptable des Entreprises — SCE) and the **Plan Comptable Général Tunisien (PCGT)** with its 7 account classes.

---

## 2. Architecture

```
backend/
├── app/
│   ├── main.py                      # FastAPI app, router registration, startup migration
│   ├── ai/
│   │   ├── gemini_client.py         # Gemini SDK wrapper + all AI functions
│   │   ├── prompts.py               # System prompt (French, Tunisian SCE context)
│   │   └── anomaly_service.py       # Background task: detect + save anomalies
│   ├── controllers/
│   │   ├── upload_controller.py     # /upload/* endpoints
│   │   ├── bilan_controller.py      # /bilan/* endpoints
│   │   ├── account_controller.py    # /accounts/* endpoints
│   │   └── ai_controller.py         # /ai/chat, /ai/anomalies (NEW)
│   ├── services/
│   │   ├── csv_parsing_service.py   # Orchestrates the full parse pipeline
│   │   ├── bilan_service.py         # Balance sheet calculation engine
│   │   ├── upload_service.py        # File save, parse, CRUD helpers
│   │   ├── column_classifier.py     # Hybrid NLP+fuzzy classifier
│   │   ├── semantic_classifier.py   # ENRICHED_COLUMN_MAPPING + semantic scoring
│   │   ├── data_extractor.py        # Column rename + French number parsing
│   │   ├── header_detector.py       # Skips title rows, finds real header
│   │   ├── preparation_service.py   # Normalize column names + cell values
│   │   └── validator.py             # Filter invalid account codes
│   ├── models/
│   │   ├── upload.py                # Upload ORM model
│   │   ├── account.py               # Account ORM model
│   │   ├── bilan.py                 # Bilan ORM model (JSON data column)
│   │   └── anomaly.py               # Anomaly ORM model (NEW)
│   ├── repositories/
│   │   ├── upload_repository.py
│   │   ├── account_repository.py
│   │   ├── bilan_repository.py
│   │   └── anomaly_repository.py    # save_anomalies / get_anomalies (NEW)
│   ├── core/
│   │   ├── config.py                # Settings from .env
│   │   ├── accounting_loader.py     # Singleton rules loader (bilan_rules.json)
│   │   ├── bilan_rules.json         # PCGT balance sheet rule tree
│   │   └── plan_comptables_tunisiens.json
│   └── db/
│       └── cnx.py                   # SQLAlchemy engine, Base, get_db()
├── requirements.txt
├── .env
└── BLUEPRINT.md
```

---

## 3. Initial State (Before This Session)

### What was already working

| Component | Description |
|-----------|-------------|
| **CSV parsing pipeline** | 8-step pipeline: encoding detection → delimiter detection → CSV read → header detection → normalization → column classification → data extraction → validation |
| **AccountingRulesLoader** | Singleton class reading `bilan_rules.json`. Handles account lookups, category matching, prefix extraction |
| **BilanService** | Recursive rule-tree engine computing BRUT / AMORT / NET / AFFECTATION phases per node, then summing leaf nodes into Actif / Passif totals |
| **Column classifier** | Hybrid: 50% semantic embeddings (sentence-transformers) + 30% fuzzy matching (fuzzywuzzy) + 20% content analysis |
| **Models** | `Upload`, `Account`, `Bilan` with cascade deletes |
| **Controllers** | Full CRUD for uploads, accounts, bilan |
| **Gemini client** | File existed but was entirely broken (3 runtime import errors, deprecated SDK) |

### Pre-session bugs already fixed (accounting_loader.py)

These were fixed before this session and are recorded here for completeness.

| # | Bug | Fix |
|---|-----|-----|
| 1 | `__init__` ran on every singleton call, resetting `_rules_cache` | Added `if hasattr(self, '_initialized'): return` guard |
| 2 | Hardcoded `C:\Users\mayyara...` path in `_detect_rules_path()` | Replaced with relative path search (same dir → parent → grandparent → cwd) |
| 3 | `_rules_cache` was a class variable shared across all instances | Moved to `self._rules_cache = None` in `__init__` |
| 4 | `"comptes" in obj` never matched (keys are `"comptes_valeurs_brutes"` etc.) | Fixed to `any(k.startswith("comptes") for k in obj)` |

---

## 4. Bugs Fixed This Session

### Bug 1 — Wrong import path in gemini_client.py

| | |
|---|---|
| **File** | `app/ai/gemini_client.py` |
| **Problem** | `from prompts import SYSTEM_PROMPT_FR` — Python can't resolve a bare module name at runtime in a package |
| **Fix** | `from app.ai.prompts import SYSTEM_PROMPT_FR` |
| **Impact** | Server crashed on the first AI call with `ModuleNotFoundError` |

---

### Bug 2 — Non-existent functions imported

| | |
|---|---|
| **File** | `app/ai/gemini_client.py` |
| **Problem** | `from app.core.accounting_loader import get_rules_loader, get_chart_loader` — neither function exists; only the `AccountingRulesLoader` class exists |
| **Fix** | `from app.core.accounting_loader import AccountingRulesLoader` then `loader = AccountingRulesLoader()` |
| **Impact** | Server crashed on the first AI call with `ImportError` |

---

### Bug 3 — Wrong method name

| | |
|---|---|
| **File** | `app/ai/gemini_client.py` |
| **Problem** | `loader.extract_all_accounts()` — method is named `get_all_accounts()` |
| **Fix** | `loader.get_all_accounts()` |
| **Impact** | System prompt enrichment silently fell back to the plain prompt; Gemini had no knowledge of actual account prefixes |

---

### Bug 4 — `solde_final` disabled → bilan all zeros

| | |
|---|---|
| **File** | `app/services/semantic_classifier.py` |
| **Problem** | `solde_final` entry had `keywords: []` and `priority: 0`. It was intentionally disabled to force use of `solde_final_debit`/`solde_final_credit`. But simple trial balances (like `balance_2021_utf.csv`) use a single signed `Solde Final` column — this column mapped to `"unknown"`, so all accounts were saved with `solde_final = NULL`. `BilanService.get_balance()` returned `Decimal("0")` for every account. |
| **Fix** | Restored `solde_final` with keywords `["solde final", "solde net", "balance", "solde global", ...]` at priority 5. The more specific `solde_final_debit`/`solde_final_credit` keep priority 11 and still win when a CSV has split columns. |
| **Impact** | Every bilan calculation returned all zeros regardless of the data |

---

### Bug 5 — Anomalies table missing columns

| | |
|---|---|
| **File** | `app/main.py` |
| **Problem** | `Base.metadata.create_all()` only creates tables that don't exist — it never alters existing ones. The `anomalies` table was created from an earlier partial model that lacked the `anomalies` (JSON) and `created_at` columns. |
| **Fix** | Added startup SQL: `ALTER TABLE IF EXISTS anomalies ADD COLUMN IF NOT EXISTS anomalies JSON` (runs every startup, safe no-op once column exists) |
| **Impact** | `GET /ai/anomalies/{id}` returned `500 Internal Server Error` with `UndefinedColumn` |

---

### Bug 6 — Deprecated Gemini SDK

| | |
|---|---|
| **Files** | `app/ai/gemini_client.py`, `requirements.txt` |
| **Problem** | `google-generativeai` is fully deprecated. `gemini-1.5-flash` was removed from the v1beta API. Old methods (`genai.configure()`, `genai.GenerativeModel()`, `model.generate_content()`) no longer exist in the replacement SDK. |
| **Fix** | Migrated to `google-genai`. New pattern: `genai.Client(api_key=...)` + `client.models.generate_content(model=..., contents=..., config=types.GenerateContentConfig(system_instruction=...))`. Updated `requirements.txt`. |
| **Impact** | Every AI call returned `404 models/gemini-1.5-flash is not found` |

**SDK migration summary:**

```python
# OLD (google-generativeai) — broken
genai.configure(api_key=key)
model = genai.GenerativeModel(model_name="...", system_instruction="...")
response = model.generate_content(prompt)

# NEW (google-genai) — current
client = genai.Client(api_key=key)
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
    config=types.GenerateContentConfig(system_instruction="..."),
)
```

---

## 5. New Features Added

### Feature 1 — Gemini Classifier Fallback

**Purpose:** Handle CSV columns with exotic or non-standard names that the NLP/fuzzy classifier can't map.

**How it works:**
1. After `classify_columns_smart()` runs, collect all columns mapped to `"unknown"`
2. For each unknown column, send to Gemini: column name + 5 sample values + list of valid field names
3. If Gemini returns a valid field name, update the mapping
4. Any failure is non-blocking — logs a warning and continues

**Files:**
- Modified: `app/services/csv_parsing_service.py` — added fallback block after step 5
- Added function: `gemini_classify_fallback()` in `app/ai/gemini_client.py`

---

### Feature 2 — AI Bilan Interpretation

**Purpose:** Turn raw balance sheet numbers into a readable French financial narrative with ratios and recommendations.

**How it works:**
1. After `calculate_and_save()` saves the bilan, pass `totals` to Gemini
2. Gemini returns: key ratios (liquidity, autonomy, debt), health score /10, 2-3 paragraph interpretation, 3 actionable recommendations
3. Added as `"analysis"` key in the `calculate_and_save()` response
4. Failure is non-blocking — if Gemini fails, the bilan data is still returned normally

**Files:**
- Modified: `app/services/bilan_service.py` — added AI call after step 5
- Added function: `ask_gemini_bilan_analysis()` in `app/ai/gemini_client.py`

---

### Feature 3 — Anomaly Detection (Background Task)

**Purpose:** Automatically scan uploaded accounts for accounting anomalies without blocking the upload response.

**How it works:**
1. After accounts are saved, `background_tasks.add_task(run_anomaly_detection, upload_id)` is called
2. FastAPI returns the upload response immediately
3. In the background: a new DB session is created (the request session will be closed by this point), accounts are fetched, sent to Gemini, and the JSON anomaly list is saved to the `anomalies` table
4. The frontend can poll `GET /ai/anomalies/{upload_id}` to check results

> **Important:** The background task creates its own `SessionLocal()` because FastAPI closes the request's DB session before the background task runs. Passing the request session would cause `session already closed` errors.

**Files:**
- New: `app/models/anomaly.py`
- New: `app/repositories/anomaly_repository.py`
- New: `app/ai/anomaly_service.py`
- Modified: `app/services/upload_service.py` — added optional `background_tasks` param
- Modified: `app/controllers/upload_controller.py` — injected `BackgroundTasks`
- Added function: `ask_gemini_anomaly_detection()` in `app/ai/gemini_client.py`

**Anomaly response format:**
```json
[
  {
    "compte": "401",
    "probleme": "Solde débiteur sur un compte fournisseur (passif)",
    "suggestion": "Vérifier si c'est un avoir ou une erreur d'imputation"
  }
]
```

---

### Feature 4 — Stateless Q&A Chat

**Purpose:** Let users ask natural-language questions about their financial data without managing session state.

**How it works:**
1. Every `POST /ai/chat` request fetches accounts (top 50) + bilan totals for the given `upload_id` from the database
2. Builds a context dict and passes it to Gemini with the user's question
3. Returns Gemini's French response
4. No Redis, no session table, works with multiple workers

**Why stateless:** Each request is self-contained. The DB is the source of truth; Gemini gets fresh context on every call. Simpler architecture, fewer failure modes.

**File:** `app/controllers/ai_controller.py` → `POST /ai/chat`

**Request:**
```json
{ "upload_id": 117, "message": "Quel est le ratio de liquidité générale?" }
```

---

### Feature 5 — Anomaly Results Endpoint

**File:** `app/controllers/ai_controller.py` → `GET /ai/anomalies/{upload_id}`

Returns anomalies saved by the background task. Returns `[]` if the task hasn't completed yet (frontend should poll).

---

## 6. Files Reference

### Modified files

| File | What changed |
|------|-------------|
| `app/ai/gemini_client.py` | Full rewrite: fixed 3 import bugs, migrated to `google-genai` SDK, added `gemini_classify_fallback()`, `ask_gemini_bilan_analysis()`, `ask_gemini_anomaly_detection()` |
| `app/services/csv_parsing_service.py` | Added Gemini fallback block after `classify_columns_smart()` (step 5b) |
| `app/services/bilan_service.py` | Added AI interpretation call after `repo.update()` |
| `app/services/upload_service.py` | Added optional `background_tasks=None` param to `parse_csv_file()` and `upload_and_parse_document()` |
| `app/controllers/upload_controller.py` | Added `BackgroundTasks` import and parameter to `/parse/{id}` and `/upload_and_parse` |
| `app/services/semantic_classifier.py` | Restored `solde_final` with keywords and priority 5 |
| `app/main.py` | Added `ai_router`, startup `ALTER TABLE` migration |
| `app/db/cnx.py` | Added `from app.models.anomaly import Anomaly` for table auto-creation |
| `app/models/__init__.py` | Added `Anomaly` to exports |
| `requirements.txt` | `google-generativeai` → `google-genai` |

### New files

| File | Purpose |
|------|---------|
| `app/models/anomaly.py` | `Anomaly` ORM model: `id`, `upload_id` (FK → uploads CASCADE), `anomalies` (JSON), `created_at` |
| `app/repositories/anomaly_repository.py` | `save_anomalies(db, upload_id, list)` and `get_anomalies(db, upload_id)` |
| `app/ai/anomaly_service.py` | `run_anomaly_detection(upload_id)` — background task with its own DB session |
| `app/controllers/ai_controller.py` | `POST /ai/chat` and `GET /ai/anomalies/{upload_id}` |

---

## 7. API Endpoints

### Upload — `/upload`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/upload/add` | Upload file only → returns `upload_id` |
| `POST` | `/upload/parse/{upload_id}` | Parse previously uploaded file; triggers anomaly detection background task |
| `POST` | `/upload/upload_and_parse` | Upload + parse in one step; triggers anomaly detection background task |
| `GET` | `/upload/preview/{upload_id}` | Preview raw CSV (headers + first N rows) |
| `GET` | `/upload/get_all_uploads` | List all uploads |
| `PUT` | `/upload/update_upload/{upload_id}` | Rename display filename |
| `DELETE` | `/upload/delete_upload/{upload_id}` | Delete one upload and its file |
| `DELETE` | `/upload/delete_all_uploads` | Delete everything |

### Bilan — `/bilan`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/bilan/generate/{upload_id}` | Calculate balance sheet + AI interpretation → returns `{bilan, totals, analysis}` |
| `GET` | `/bilan/{upload_id}` | Fetch saved bilan |
| `PUT` | `/bilan/{upload_id}` | Update bilan data |
| `DELETE` | `/bilan/{upload_id}` | Delete bilan |

### AI — `/ai` *(new)*

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ai/chat` | Ask a question about an upload's financial data |
| `GET` | `/ai/anomalies/{upload_id}` | Get anomalies detected by background task |

---

## 8. Data Flow

### Step 1 — Upload & Parse

```
POST /upload/upload_and_parse
│
├── Save file to disk
├── Register Upload record (get upload_id)
│
├── detect_encoding()          → UTF-8 / Latin-1 / CP1252
├── detect_delimiter()         → ; or , or \t
├── read_csv(header=None)      → col_0, col_1, ...
│
├── detect_header()            → skip title rows, find real header row
│                                (≥40% non-numeric values, >1 non-empty cell)
├── prepare_dataframe()        → normalize column names + cell values
│                                (remove accents, lowercase, French→standard)
│
├── classify_columns_smart()   → 50% semantic + 30% fuzzy + 20% content
│   └── gemini_classify_fallback()  → for any remaining "unknown" columns
│
├── extract_data()             → rename columns, parse French numbers
│                                (-1 000,000 → -1000.0)
├── validate_accounts()        → keep only numeric codes, length 2-10
│
├── save_accounts(db, ...)     → bulk insert to accounts table
│
└── background_tasks.add_task(run_anomaly_detection, upload_id)
    └── [async] fetch accounts → Gemini → save to anomalies table
```

### Step 2 — Balance Sheet Calculation

```
POST /bilan/generate/{upload_id}
│
├── load_accounts(upload_id)         → from DB
├── AccountingRulesLoader.load_rules()  → bilan_rules.json (cached singleton)
│
├── process_tree(rules["bilan_comptable_tunisien"], accounts)
│   └── for each node in tree:
│       ├── compute_node()
│       │   ├── BRUT: sum comptes_valeurs_brutes entries
│       │   ├── AMORT: sum comptes_amortissements_provisions entries (abs value)
│       │   ├── NET: sum comptes_valeurs_nettes entries
│       │   └── final = (brut - amort) if brut/amort > 0 else net
│       └── recurse into child nodes
│
├── compute_totals(result)
│   ├── Actif Non Courant + Actif Courant = Total Actif
│   └── Capitaux Propres + Passifs NC + Passifs C = Total Passif
│
├── repo.update(upload_id, {bilan, totals})   → save to DB
│
└── ask_gemini_bilan_analysis(totals)
    └── returns: ratios + score/10 + interpretation + recommendations
```

### Step 3 — Q&A Chat

```
POST /ai/chat  { upload_id: 117, message: "..." }
│
├── db.query(Account).filter(upload_id=117).limit(50)
├── BilanRepository.get_by_upload_id(117)
│
├── context = {
│     comptes: [{code, label, solde}, ...],
│     bilan_totaux: {actif, passif, difference}
│   }
│
└── ask_gemini(user_message, context=context)
    └── returns French AI response
```

### Balance extraction priority (BilanService.get_balance)

```
1. solde_final          (single signed balance — simple trial balances)
2. solde_debit          (debit-side period balance)
3. -solde_credit        (credit-side period balance, negated)
4. debit                (period debit movement)
5. -credit              (period credit movement, negated)
6. 0                    (fallback)
```

---

## 9. Suggested Improvements

### High priority

#### 1. Database migrations (Alembic)
**Current:** `Base.metadata.create_all()` + manual `ALTER TABLE` in `main.py`  
**Problem:** Cannot safely deploy schema changes to a live DB; no rollback  
**Solution:**
```bash
pip install alembic
alembic init migrations
# then: alembic revision --autogenerate -m "add anomalies table"
#        alembic upgrade head
```

#### 2. Async Gemini calls
**Current:** `ask_gemini()` is synchronous — blocks a FastAPI worker thread for 2-8 seconds  
**Solution:** Use `genai.AsyncClient()` and `await client.aio.models.generate_content(...)`  
Make AI endpoints `async def` — FastAPI will run them in the event loop without blocking other requests

#### 3. Streaming chat responses
**Current:** `/ai/chat` waits for the full response before returning (noticeable delay)  
**Solution:**
```python
from fastapi.responses import StreamingResponse

async def stream_chat(...):
    async def generator():
        async for chunk in client.aio.models.generate_content_stream(...):
            yield chunk.text
    return StreamingResponse(generator(), media_type="text/plain")
```
**Benefit:** Users see text appear token-by-token — perceived latency near zero

---

### Medium priority

#### 4. Multi-turn chat history
**Current:** Every `/ai/chat` call is stateless — no memory of previous questions  
**Solution:** Add a `chat_sessions` table (`id`, `upload_id`, `messages` JSON). Pass the last N messages to Gemini on each call. The new SDK supports this natively.

#### 5. Rate limiting + retry with backoff
**Current:** Quota errors surface immediately as 429  
**Solution:** Wrap `ask_gemini()` with exponential backoff (tenacity library):
```python
from tenacity import retry, stop_after_attempt, wait_exponential
@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
def ask_gemini_with_retry(...): ...
```

#### 6. Gemini response caching
**Current:** Every bilan generation calls Gemini even if nothing changed  
**Solution:** Hash the totals dict → check a `ai_cache` table → return cached analysis if hit  
**Benefit:** Reduces API costs significantly if users regenerate the same bilan

#### 7. PCGT account code validation
**Current:** `validator.py` only checks digit format and length  
**Solution:** Call `AccountingRulesLoader.validate_account_code()` and attach a `"pcgt_valid": false` warning to unrecognized codes (don't reject — the CSV may have valid codes not in the rules file)

---

### Lower priority

#### 8. Arabic language support
**Current:** `get_system_prompt(language)` exists in `prompts.py` but only French is implemented  
**Solution:** Add `SYSTEM_PROMPT_AR` — Arabic accounting terminology is common in Tunisian SMEs. The function signature is already in place.

#### 9. Health check endpoint
**Solution:**
```python
@app.get("/health")
def health():
    # check DB connection
    # check Gemini reachability
    return {"db": "ok", "gemini": "ok"}
```

#### 10. Structured logging
**Current:** Standard Python `logging` with string messages  
**Solution:** Use `structlog` or add a JSON formatter — attach `upload_id`, `request_id`, Gemini latency per call type (classify / bilan / anomaly / chat) to every log entry. Enables log aggregation and alerting.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `GEMINI_API_KEY` | ✅ | — | Google AI Studio API key |
| `GEMINI_MODEL` | — | `gemini-1.5-flash` | Gemini model name (use `gemini-2.5-flash`) |
| `UPLOAD_DIR` | — | — | Directory for uploaded files |
| `MAX_UPLOAD_SIZE_MB` | — | `100` | Max file size |
| `APP_NAME` | — | — | Application name |
| `ENV` | — | — | Environment (`development` / `production`) |

---

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Set up .env (see Environment Variables above)
cp .env.example .env

# Run server
uvicorn app.main:app --reload

# API docs
open http://localhost:8000/docs
```
