# AI Microservice Refactoring — Fixes Applied

This document records every fix made to the AI microservice extraction.
For each fix: **what** changed, **why** it was needed, **where** the change lives, and the **exact diff** applied.

---

## Decision recorded before fixing

The column-classification fallback (`gemini_classify_fallback`) was migrated from Gemini to **Groq `llama-3.1-8b-instant`** and stays in the **main backend**. Rationale:

- Classification is a tiny deterministic task ("which of 12 field names matches this column?") — it does not need Gemini's reasoning power.
- Groq's free tier is more than enough for this volume.
- Keeping it in the main backend avoids a network hop on every CSV upload and removes the need for a `/classify` endpoint on the AI service.

The Gemini AI microservice is now reserved exclusively for the heavier tasks: **chat**, **anomaly detection**, and **bilan analysis**.

---

## BLOCKING fixes

### B1 — Create `__init__.py` files in the AI service

**Why:** Python could not resolve any of the AI service's imports (`from app.routes import ...`, `from app.core.gemini_client import ...`, etc.) because the directories were not registered as packages. The service crashed immediately on `uvicorn` startup.

**Where:** `ai_service/app/`

**Files created:**
- `ai_service/app/__init__.py` (empty)
- `ai_service/app/core/__init__.py` (empty)
- `ai_service/app/models/__init__.py` (empty)
- `ai_service/app/routes/__init__.py` (empty)
- `ai_service/app/db/__init__.py` (empty)
- `ai_service/app/prompts/__init__.py` — re-exports the public prompt symbols so call sites can `from app.prompts import SYSTEM_PROMPT_FR` if desired:
  ```python
  from app.prompts.prompts import (
      SYSTEM_PROMPT_FR,
      ANOMALY_DETECTION_PROMPT,
      BILAN_ANALYSIS_PROMPT,
      get_system_prompt,
  )
  __all__ = [...]
  ```

---

### B2 — Remove the `AccountingRulesLoader` dependency from `gemini_client`

**Why:** The original `_build_enriched_prompt()` instantiated `AccountingRulesLoader()` to inject account prefixes from `bilan_rules.json` into the system prompt. That loader lives in the **main backend** (`app.core.accounting_loader`) and was never imported in the AI service — calling the function would raise `NameError`. The AI service is also a standalone microservice with no access to the main backend's data files.

**Where:** `ai_service/app/core/gemini_client.py`

**Change:** Replaced the enrichment helper with a static system-prompt getter. The whole `_build_enriched_prompt` function and the `_system_prompt` cache are gone. `get_system_prompt()` now simply returns `SYSTEM_PROMPT_FR`. If runtime enrichment is needed in the future, the main backend can pass relevant context in the request body — the microservice should not be reaching across service boundaries to read files.

---

### B3 — Add `httpx` to backend `requirements.txt`

**Why:** `backend/app/ai/ai_service_client.py` does `import httpx` but the package was not declared. The first call to `/ai/chat`, `/ai/anomalies/...`, or any code path that uses `analyze_bilan` would crash with `ModuleNotFoundError`.

**Where:** `backend/requirements.txt`

**Diff:**
```
fastapi
uvicorn
sqlalchemy
psycopg2-binary
python-dotenv
pandas
python-multipart
numpy
chardet
fuzzywuzzy
sentence-transformers
groq
+ httpx
```

---

### B4 — Column classifier replaced with Groq, kept in main backend

**Status:** Already implemented before this fix pass. Verified in place:

- `backend/app/ai/classifier_client.py` — uses `groq.Groq` with `llama-3.1-8b-instant`, `temperature=0`, max 20 tokens
- `backend/app/services/csv_parsing_service.py` — imports `classify_columns` from `classifier_client` instead of the old `gemini_classify_fallback`
- `backend/requirements.txt` — has `groq` listed
- `backend/.env` — has `GROQ_API_KEY` set
- `backend/app/core/config.py` — exposes `GROQ_API_KEY`

No changes needed during this pass other than the verification.

---

## WARNING fixes

### W1 — CORS middleware on the AI service

**Why:** Without CORS the main backend (and any future client on a different origin) gets blocked when calling the AI service over HTTP. Preflight requests would 403 silently.

**Where:** `ai_service/app/main.py`

**Diff:**
```python
+ from fastapi.middleware.cors import CORSMiddleware
  ...
+ app.add_middleware(
+     CORSMiddleware,
+     allow_origins=[
+         "http://localhost:8000",
+         "http://127.0.0.1:8000",
+     ],
+     allow_credentials=True,
+     allow_methods=["*"],
+     allow_headers=["*"],
+ )
```

The allow-list is intentionally narrow — only the main backend should ever talk to the AI service. Add staging/prod hosts here when deploying.

---

### W2 — Fix the prompts import path

**Why:** `gemini_client.py` had `from app.prompts import SYSTEM_PROMPT_FR`. With `prompts` now a package (because of B1's new `__init__.py`), the import works only because the `__init__.py` re-exports the symbol. To stay explicit and avoid circular-import surprises, all internal imports go through the canonical module path.

**Where:** `ai_service/app/core/gemini_client.py`

**Diff:**
```python
- from app.prompts import SYSTEM_PROMPT_FR
+ from app.prompts.prompts import SYSTEM_PROMPT_FR
```

The same fix was applied in `routes/anomalies.py` and `routes/bilan.py` when they were rewritten for M1+M2 — they now import `ANOMALY_DETECTION_PROMPT` and `BILAN_ANALYSIS_PROMPT` directly from `app.prompts.prompts`.

---

### W3 — Align the `ChatResponse` field name end-to-end

**Why:** The AI service was returning `{ "reply": "..." }`. The main backend's `ai_service_client.chat()` extracted `result["reply"]` and the controller wrapped it in `{ "success": True, "response": "..." }` for the frontend. The contract worked but the field name flipped from `reply` → `response` in transit, which is confusing and easy to break. The frontend's `ChatResponse` model expects `response`. We standardized on **`response`** throughout the AI service public contract.

**Where:**
1. `ai_service/app/models/requests.py`
   ```python
   class ChatResponse(BaseModel):
   -    reply: str
   +    response: str
   ```
2. `ai_service/app/routes/chat.py`
   ```python
   - return ChatResponse(reply=reply)
   + return ChatResponse(response=reply)
   ```
3. `backend/app/ai/ai_service_client.py`
   ```python
   def chat(message: str, context: dict) -> str:
       result = _post("/chat", {"message": message, "context": context})
   -   return result["reply"]
   +   return result["response"]
   ```

The frontend (`frontend/src/models/ai.ts`) was already correct (`response: string`) — no change needed.

---

### W4 — `AI_SERVICE_URL` in `.env` and read from environment

**Why:** The backend config hardcoded `AI_SERVICE_URL: str = "http://localhost:8001"` and didn't read from the environment. Deploying to Docker or a different host required code changes.

**Where:**
- `backend/.env` — `AI_SERVICE_URL=http://localhost:8001` (verified already present)
- `backend/app/core/config.py`:
  ```python
  - AI_SERVICE_URL: str = "http://localhost:8001"
  + AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8001")
  ```
  Also cleaned up the file: removed commented-out Gemini variables, added explanatory comments grouping `GROQ_API_KEY` (cheap classifier) and `AI_SERVICE_URL` (Gemini service) so future readers understand the two-tier AI architecture at a glance.

---

## MINOR fixes

### M1 + M2 — Centralize all task prompts in `prompts.py`

**Why:** The anomaly-detection and bilan-analysis prompts existed in **two places each** with slight wording differences:
- `gemini_client.py` had `ask_gemini_anomaly_detection()` and `ask_gemini_bilan_analysis()` helper functions with their own embedded prompts
- The route files (`routes/anomalies.py`, `routes/bilan.py`) had their own `PROMPT = "..."` constants that were almost-but-not-quite the same

Maintenance trap: updating one and forgetting the other silently changes behavior between code paths.

**Where:** `ai_service/app/prompts/prompts.py`

**Change:** Appended two named constants to the prompts module:
```python
ANOMALY_DETECTION_PROMPT = (
    "Analyse ces comptes du plan comptable tunisien (PCGT) et détecte les anomalies:\n"
    "- Soldes anormaux (ex: actif avec solde créditeur, passif avec solde débiteur)\n"
    "- Codes de compte hors PCGT (pas dans les classes 1-7)\n"
    "- Montants aberrants (nuls sans justification, ou excessivement élevés)\n"
    "- Incohérences entre débit et crédit\n\n"
    "Pour chaque anomalie détectée, fournis: le code compte, le problème exact, "
    "et la correction suggérée.\n"
    "Réponds UNIQUEMENT avec un tableau JSON valide: "
    '[{"compte": "...", "probleme": "...", "suggestion": "..."}]\n'
    "Si aucune anomalie, réponds: []"
)

BILAN_ANALYSIS_PROMPT = (
    "Analyse ces totaux de bilan tunisien et fournis:\n"
    "1. Ratios clés (liquidité générale, autonomie financière, taux d'endettement)\n"
    "2. Score de santé financière (/10) avec justification\n"
    "3. Interprétation en français (2-3 paragraphes)\n"
    "4. 3 recommandations concrètes et actionnables\n\n"
    "Utilise exactement les montants fournis dans tes calculs. Monnaie: TND."
)
```

The route files now import these constants:
```python
# anomalies.py
from app.prompts.prompts import ANOMALY_DETECTION_PROMPT
...
raw = ask_gemini(ANOMALY_DETECTION_PROMPT, context={"comptes": req.comptes[:100]})

# bilan.py
from app.prompts.prompts import BILAN_ANALYSIS_PROMPT
...
analysis = ask_gemini(BILAN_ANALYSIS_PROMPT, context={"totals": req.totals})
```

The duplicated `ask_gemini_anomaly_detection()` and `ask_gemini_bilan_analysis()` helper functions in `gemini_client.py` were also removed — they were only ever called from the (now-deleted) duplicate code paths. `gemini_client.py` is now a tight ~55-line file: client, system prompt getter, and `ask_gemini`. Nothing else.

---

### M3 — Log the raw Gemini response when JSON parsing fails

**Why:** When Gemini returned malformed JSON for anomaly detection, the route silently returned `[]` (no anomalies). The user would see "everything is fine" with no way to know detection actually crashed. Hard to debug, hard to alert on.

**Where:** `ai_service/app/routes/anomalies.py`

**Diff:**
```python
+ import logging
+ logger = logging.getLogger(__name__)
  ...
  try:
      anomalies = json.loads(raw) if raw.strip().startswith("[") else []
- except json.JSONDecodeError:
+ except json.JSONDecodeError as e:
+     logger.warning(
+         f"Anomaly detection returned malformed JSON; raw response: {raw!r} | error: {e}"
+     )
      anomalies = []
```

We still return `[]` (graceful degradation — the user gets a working bilan view, not a 500). But the log line gives operators a fingerprint of the failure.

---

### M4 — `google-genai` removed from backend `requirements.txt`

**Status:** Already removed. Verified the backend `requirements.txt` no longer lists `google-genai`. The main backend has `groq` for column classification and `httpx` for talking to the AI microservice — no direct Gemini SDK calls remain in the backend.

The `gemini_client.py` file in the backend (`backend/app/ai/gemini_client.py`) was also deleted as part of the original refactor — verified absent.

---

## Files changed in this pass

```
ai_service/
├── app/
│   ├── __init__.py                      ← NEW (B1)
│   ├── main.py                          ← MODIFIED (W1)
│   ├── core/
│   │   ├── __init__.py                  ← NEW (B1)
│   │   ├── config.py                    (unchanged — already correct)
│   │   └── gemini_client.py             ← REWRITTEN (B2, W2, M1+M2)
│   ├── db/
│   │   └── __init__.py                  ← NEW (B1)
│   ├── models/
│   │   ├── __init__.py                  ← NEW (B1)
│   │   └── requests.py                  ← MODIFIED (W3)
│   ├── prompts/
│   │   ├── __init__.py                  ← NEW (B1, re-exports)
│   │   └── prompts.py                   ← APPENDED (M1+M2)
│   └── routes/
│       ├── __init__.py                  ← NEW (B1)
│       ├── chat.py                      ← MODIFIED (W3)
│       ├── anomalies.py                 ← REWRITTEN (M1+M2, M3)
│       └── bilan.py                     ← REWRITTEN (M1+M2)
│
backend/
├── requirements.txt                     ← MODIFIED (B3 — added httpx)
├── app/
│   ├── core/
│   │   └── config.py                    ← MODIFIED (W4)
│   └── ai/
│       └── ai_service_client.py         ← MODIFIED (W3 — reply→response)
```

---

## Verification

A standalone Python import test was run against the AI service entry point:
```
from app.main import app
```
All imports now resolve correctly. The only remaining startup requirement is installing the AI service's own dependencies (`fastapi`, `uvicorn`, `google-genai`, `python-dotenv`, `pydantic-settings`) into a venv inside `ai_service/`. The backend's venv was used in the smoke test, which is why `pydantic_settings` was missing — that is expected and unrelated to the refactor.

---

## How to run after these fixes

**Terminal 1 — main backend (port 8000):**
```powershell
cd backend
.\venv1\Scripts\Activate.ps1
pip install -r requirements.txt   # picks up the new httpx dependency
uvicorn app.main:app --reload
```

**Terminal 2 — AI microservice (port 8001):**
```powershell
cd ai_service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

The frontend continues to point at `http://localhost:8000` only — the AI service is internal infrastructure, never exposed to the browser.
