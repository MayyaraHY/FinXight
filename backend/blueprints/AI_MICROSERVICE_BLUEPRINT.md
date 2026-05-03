# AI Microservice Extraction — Blueprint

## Should You Do This Now?

**Verdict: Plan it, defer it.**

The AI code (`app/ai/`) is already well-isolated, non-blocking, and stateless. You get ~80% of the architectural benefit just from the current folder structure. The remaining 20% — independent deployment, independent scaling, fault isolation at the network level — only pays off when:

- The team grows and different people own different services
- You need to deploy AI updates without touching the main backend
- AI call volume requires separate scaling (e.g., 10× more AI requests than uploads)

The main risk of splitting too early is the **shared database problem**: the AI service needs accounts and bilan data that live in the main DB. If you share the DB between two services you get a *distributed monolith* — all the complexity of microservices with none of the independence. This blueprint solves that properly.

---

## Target Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend (Next.js)             │
│  /uploads  /bilan  /anomalies  /chat             │
└────────────────────┬────────────────────────────┘
                     │ HTTP
          ┌──────────▼──────────┐
          │   Main Backend      │   FastAPI — port 8000
          │                     │   PostgreSQL (main DB)
          │  - upload           │   Tables: uploads, accounts,
          │  - accounts         │           bilans, anomalies
          │  - bilan            │
          └──────────┬──────────┘
                     │ HTTP (internal)
          ┌──────────▼──────────┐
          │    AI Service       │   FastAPI — port 8001
          │                     │   PostgreSQL (ai DB) ← optional
          │  - POST /chat       │   Tables: ai_requests (audit log)
          │  - POST /anomalies  │
          │  - POST /bilan-     │
          │       analysis      │
          └──────────┬──────────┘
                     │ HTTPS
                ┌────▼────┐
                │  Gemini  │
                │   API    │
                └──────────┘
```

**Key design decision:** The main backend owns all business data. When it needs AI, it fetches the data itself and **sends it** to the AI service in the request body. The AI service is purely a *function service* — it receives data, calls Gemini, returns text. It has no dependency on the main database.

---

## Step-by-Step Implementation

### Step 1 — Define the AI service contract

Before touching any code, decide the API surface. The AI service exposes three endpoints:

```
POST /chat
Body: { message: str, context: { comptes: [...], bilan_totaux: {...} } }
Returns: { reply: str }

POST /anomalies/detect
Body: { comptes: [ { code, label, solde_debit, solde_credit, solde_final } ] }
Returns: { anomalies: [ { compte, probleme, suggestion } ] }

POST /bilan/analyze
Body: { totals: { actif: {...}, passif: {...}, difference: float } }
Returns: { analysis: str }
```

Notice: **no upload_id, no database queries**. The AI service only receives what it needs to do its job.

---

### Step 2 — Create the new service directory

```
financial_engine/
├── backend/           ← existing main service
│   └── app/
└── ai_service/        ← new service
    ├── app/
    │   ├── main.py
    │   ├── routes/
    │   │   ├── chat.py
    │   │   ├── anomalies.py
    │   │   └── bilan.py
    │   ├── core/
    │   │   ├── config.py
    │   │   └── gemini_client.py
    │   ├── models/
    │   │   └── requests.py     ← Pydantic request/response models
    │   └── db/                 ← optional audit log DB
    │       ├── cnx.py
    │       └── audit_model.py
    ├── requirements.txt
    ├── .env
    └── Dockerfile
```

---

### Step 3 — Build the AI service

**`ai_service/app/core/config.py`**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GEMINI_API_KEY: str
    GEMINI_MODEL_NAME: str = "gemini-2.5-flash"
    # Optional: audit DB to log every AI request/response
    DATABASE_URL: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
```

**`ai_service/app/core/gemini_client.py`**

Move the existing `gemini_client.py` here almost unchanged. Remove all imports that reference the main app (`accounting_loader`, `config` from the main app). The only dependency is `settings` from the local config and the prompts file.

```python
from google import genai
from google.genai import types, errors as genai_errors
from app.core.config import settings
import json, logging

logger = logging.getLogger(__name__)
_client = None

def get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client

def ask_gemini(prompt: str, context: dict = None) -> str:
    client = get_client()
    full_prompt = prompt
    if context:
        full_prompt = f"Données:\n{json.dumps(context, ensure_ascii=False)}\n\nTâche:\n{prompt}"
    response = client.models.generate_content(
        model=settings.GEMINI_MODEL_NAME,
        contents=full_prompt,
        config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT_FR),
    )
    return response.text
```

**`ai_service/app/models/requests.py`**
```python
from pydantic import BaseModel
from typing import Any

class CompteItem(BaseModel):
    code: str
    label: str | None = None
    solde: float = 0.0

class ChatRequest(BaseModel):
    message: str
    context: dict[str, Any]   # { comptes: [...], bilan_totaux: {...} }

class ChatResponse(BaseModel):
    reply: str

class AnomalyDetectRequest(BaseModel):
    comptes: list[dict[str, Any]]

class AnomalyDetectResponse(BaseModel):
    anomalies: list[dict[str, Any]]

class BilanAnalyzeRequest(BaseModel):
    totals: dict[str, Any]

class BilanAnalyzeResponse(BaseModel):
    analysis: str
```

**`ai_service/app/routes/chat.py`**
```python
from fastapi import APIRouter
from app.models.requests import ChatRequest, ChatResponse
from app.core.gemini_client import ask_gemini

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    reply = ask_gemini(req.message, context=req.context)
    return ChatResponse(reply=reply)
```

**`ai_service/app/routes/anomalies.py`**
```python
import json
from fastapi import APIRouter
from app.models.requests import AnomalyDetectRequest, AnomalyDetectResponse
from app.core.gemini_client import ask_gemini

router = APIRouter()

PROMPT = (
    "Analyse ces comptes du plan comptable tunisien (PCGT) et détecte les anomalies.\n"
    "Réponds UNIQUEMENT avec un tableau JSON valide: "
    '[{"compte": "...", "probleme": "...", "suggestion": "..."}]\n'
    "Si aucune anomalie, réponds: []"
)

@router.post("/anomalies/detect", response_model=AnomalyDetectResponse)
def detect_anomalies(req: AnomalyDetectRequest):
    raw = ask_gemini(PROMPT, context={"comptes": req.comptes[:100]})
    try:
        anomalies = json.loads(raw) if raw.strip().startswith("[") else []
    except json.JSONDecodeError:
        anomalies = []
    return AnomalyDetectResponse(anomalies=anomalies)
```

**`ai_service/app/routes/bilan.py`**
```python
from fastapi import APIRouter
from app.models.requests import BilanAnalyzeRequest, BilanAnalyzeResponse
from app.core.gemini_client import ask_gemini

router = APIRouter()

PROMPT = (
    "Analyse ces totaux de bilan tunisien et fournis:\n"
    "1. Ratios clés (liquidité générale, autonomie financière, taux d'endettement)\n"
    "2. Score de santé financière (/10) avec justification\n"
    "3. Interprétation en français (2-3 paragraphes)\n"
    "4. 3 recommandations concrètes et actionnables\n\n"
    "Utilise exactement les montants fournis. Monnaie: TND."
)

@router.post("/bilan/analyze", response_model=BilanAnalyzeResponse)
def analyze_bilan(req: BilanAnalyzeRequest):
    analysis = ask_gemini(PROMPT, context={"totals": req.totals})
    return BilanAnalyzeResponse(analysis=analysis)
```

**`ai_service/app/main.py`**
```python
from fastapi import FastAPI
from app.routes import chat, anomalies, bilan

app = FastAPI(title="Financial AI Service")

app.include_router(chat.router)
app.include_router(anomalies.router)
app.include_router(bilan.router)

@app.get("/health")
def health():
    return {"status": "ok"}
```

**`ai_service/requirements.txt`**
```
fastapi
uvicorn
google-genai
python-dotenv
pydantic-settings
```

**`ai_service/.env`**
```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL_NAME=gemini-2.5-flash
```

---

### Step 4 — Add an AI client to the main backend

The main backend no longer imports from `app.ai.gemini_client` directly. It gets AI results by calling the AI service over HTTP.

Create **`backend/app/ai/ai_service_client.py`**:

```python
import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

AI_SERVICE_URL = settings.AI_SERVICE_URL  # e.g. "http://localhost:8001"


def _post(path: str, payload: dict) -> dict:
    try:
        with httpx.Client(timeout=60.0) as client:
            res = client.post(f"{AI_SERVICE_URL}{path}", json=payload)
            res.raise_for_status()
            return res.json()
    except httpx.TimeoutException:
        raise ValueError("AI service timeout. Réessayez.")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise ValueError("Limite API atteinte. Réessayez dans 1 minute.")
        raise ValueError(f"AI service error: {e.response.text}")
    except Exception as e:
        logger.error(f"AI service unreachable: {e}")
        raise ValueError("Service IA indisponible.")


def chat(message: str, context: dict) -> str:
    result = _post("/chat", {"message": message, "context": context})
    return result["reply"]


def detect_anomalies(comptes: list[dict]) -> list[dict]:
    result = _post("/anomalies/detect", {"comptes": comptes})
    return result.get("anomalies", [])


def analyze_bilan(totals: dict) -> str:
    result = _post("/bilan/analyze", {"totals": totals})
    return result.get("analysis", "")
```

Add `AI_SERVICE_URL` to the main backend config and `.env`:

```python
# backend/app/core/config.py  — add this field
AI_SERVICE_URL: str = "http://localhost:8001"
```

```
# backend/.env — add this line
AI_SERVICE_URL=http://localhost:8001
```

---

### Step 5 — Update the main backend to use the new client

**`backend/app/services/bilan_service.py`** — replace the direct gemini import:
```python
# Before
from app.ai.gemini_client import ask_gemini_bilan_analysis
analysis = ask_gemini_bilan_analysis(totals)

# After
from app.ai.ai_service_client import analyze_bilan
analysis = analyze_bilan(totals)
```

**`backend/app/ai/anomaly_service.py`** — replace the direct gemini import:
```python
# Before
from app.ai.gemini_client import ask_gemini_anomaly_detection
raw = ask_gemini_anomaly_detection(accounts_data)
anomalies = json.loads(raw) if raw.strip().startswith("[") else []

# After
from app.ai.ai_service_client import detect_anomalies
anomalies = detect_anomalies(accounts_data)
```

**`backend/app/controllers/ai_controller.py`** — replace the direct gemini import:
```python
# Before
from app.ai.gemini_client import ask_gemini
response = ask_gemini(request.message, context=context)

# After
from app.ai.ai_service_client import chat as ai_chat
response = ai_chat(request.message, context=context)
```

**`backend/app/services/csv_parsing_service.py`** — replace the gemini fallback:
```python
# Before
from app.ai.gemini_client import gemini_classify_fallback

# After — keep this in main app OR move to AI service as POST /classify
# Simplest: keep in main app since it's a one-time parsing step
```

> **Note on column classification:** The `gemini_classify_fallback` function is called once at parse time and is tightly coupled to the CSV pipeline. You can keep it in the main backend calling Gemini directly (via a small `httpx` call to the AI service's `/classify` endpoint) or leave it in the main app as the only remaining direct Gemini call. Your call.

---

### Step 6 — (Optional) Add an audit log database to the AI service

If you want to track every AI request for debugging, cost monitoring, or replay:

**`ai_service/app/db/audit_model.py`**
```python
from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class AIRequest(Base):
    __tablename__ = "ai_requests"
    id = Column(Integer, primary_key=True)
    endpoint = Column(String(50))          # /chat, /anomalies/detect, /bilan/analyze
    prompt_tokens = Column(Integer)
    response_tokens = Column(Integer)
    latency_ms = Column(Float)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

This is the AI service's *own* database. It never touches the main DB.

---

### Step 7 — Dockerize both services

**`ai_service/Dockerfile`**
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

**`docker-compose.yml`** (at project root):
```yaml
version: "3.9"

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: financial_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: admin
    ports:
      - "5432:5432"

  ai_db:
    image: postgres:16
    environment:
      POSTGRES_DB: ai_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: admin
    ports:
      - "5433:5432"

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: ./backend/.env
    environment:
      AI_SERVICE_URL: http://ai_service:8001
    depends_on:
      - db
      - ai_service

  ai_service:
    build: ./ai_service
    ports:
      - "8001:8001"
    env_file: ./ai_service/.env
    environment:
      DATABASE_URL: postgresql://postgres:admin@ai_db:5432/ai_db
    depends_on:
      - ai_db
```

---

### Step 8 — Update the frontend

The frontend talks only to the main backend on port 8000. **No frontend changes needed.** The main backend proxies all AI calls to the AI service invisibly.

```
Frontend → POST /ai/chat (port 8000, main backend)
                    ↓
           Main backend fetches accounts from its own DB
                    ↓
           POST /chat (port 8001, AI service) with context in body
                    ↓
           AI service calls Gemini, returns { reply }
                    ↓
           Main backend returns { success, response } to frontend
```

---

## Migration Checklist

```
[ ] 1. Create ai_service/ directory structure
[ ] 2. Move prompts + gemini_client logic into ai_service/app/core/
[ ] 3. Create Pydantic request/response models in ai_service/
[ ] 4. Implement /chat, /anomalies/detect, /bilan/analyze routes
[ ] 5. Test AI service standalone: uvicorn app.main:app --port 8001
[ ] 6. Create backend/app/ai/ai_service_client.py
[ ] 7. Add AI_SERVICE_URL to backend config and .env
[ ] 8. Replace direct gemini imports in:
       - bilan_service.py
       - anomaly_service.py
       - ai_controller.py
[ ] 9. Test main backend with AI service running
[ ] 10. Write docker-compose.yml and test both services together
[ ] 11. (Optional) Add audit log DB to AI service
[ ] 12. Remove google-genai from backend/requirements.txt
        (main backend no longer calls Gemini directly)
```

---

## What Changes vs. What Stays the Same

| Concern | Before | After |
|---|---|---|
| Gemini SDK | In main backend | Only in AI service |
| GEMINI_API_KEY | In backend .env | Only in AI service .env |
| Account/Bilan DB | Main backend | Main backend (unchanged) |
| AI audit log | None | AI service DB (optional) |
| Frontend API calls | http://localhost:8000 | http://localhost:8000 (unchanged) |
| Background tasks | BackgroundTasks in main app | Still in main app, calls AI service |
| Column classification | gemini_client in main app | Can stay in main app or move |

---

## When to Actually Do This

Do the extraction when **any one** of these becomes true:

1. A second developer joins and takes ownership of the AI features
2. You want to deploy AI service updates (new prompts, new model) without restarting the main backend
3. AI response time starts affecting upload/bilan response times under load
4. You want to add rate limiting, caching, or retries specifically for AI calls without complicating the main backend
5. You want to swap Gemini for another provider (OpenAI, Mistral) without touching the main app

Until then, the current monolith with `app/ai/` as a well-separated module is the right call.
