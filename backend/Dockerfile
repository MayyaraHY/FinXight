# ─────────────────────────────────────────────────────────────────────
# Backend — FastAPI "Financial AI Engine"
# Slim single-stage build. Torch is installed from the CPU-only wheel
# index so we don't pull ~2GB of CUDA libraries (sentence-transformers
# only ever runs on CPU here).
# ─────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install CPU-only torch first so sentence-transformers reuses it instead
# of dragging in the default CUDA build.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Upload dir referenced by UPLOAD_DIR (defaults to app/uploads).
RUN mkdir -p app/uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
