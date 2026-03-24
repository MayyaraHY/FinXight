"""
Phase 3: Main FastAPI Application
Exposes all financial analysis through REST API
Entry point for the entire system
"""

import sys
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ajouter le répertoire racine du projet au chemin Python
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from config.settings import settings
from api.routes import health_routes, query_routes, financial_routes

logger = logging.getLogger(__name__)


# ================================================================
# LIFESPAN - Application startup/shutdown
# ================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan management
    Startup: Initialize services
    Shutdown: Cleanup
    """
    # Startup
    try:
        logger.info("🚀 Starting IA Financière Tunisienne API...")
        logger.info(f"Environment: {settings.ENVIRONMENT}")
        logger.info(f"Debug mode: {settings.DEBUG}")
        logger.info(f"Language: {settings.LANGUAGE}")
        print("✅ API Services initialized")
    except Exception as e:
        logger.error(f"❌ Startup failed: {str(e)}")
        raise
    
    yield  # Application runs here
    
    # Shutdown
    try:
        logger.info("🛑 Shutting down API...")
        print("✅ API shutdown complete")
    except Exception as e:
        logger.error(f"❌ Shutdown error: {str(e)}")


# ================================================================
# CREATE FASTAPI APPLICATION
# ================================================================

app = FastAPI(
    title="API IA Financière Tunisienne",
    description="Analyse financière intelligente avec Mistral et LLamaIndex",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)


# ================================================================
# MIDDLEWARE - CORS
# ================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("✅ CORS middleware configured")


# ================================================================
# INCLUDE ROUTES
# ================================================================

# Health routes
app.include_router(
    health_routes.router,
    prefix="/api/v1",
    tags=["Health"]
)

# Query routes (main questions)
app.include_router(
    query_routes.router,
    prefix="/api/v1",
    tags=["Queries"]
)

# Financial analysis routes
app.include_router(
    financial_routes.router,
    prefix="/api/v1",
    tags=["Financial Analysis"]
)

logger.info("✅ All routes registered")


# ================================================================
# ROOT ENDPOINT
# ================================================================

@app.get("/")
async def root():
    """
    Root endpoint - API information
    """
    return {
        "message": "Bienvenue dans l'API IA Financière Tunisienne",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "health": "/api/v1/health",
            "query": "/api/v1/query",
            "analyze_accounts": "/api/v1/analyze/accounts",
            "analyze_categories": "/api/v1/analyze/categories",
            "analyze_classes": "/api/v1/analyze/classes"
        }
    }


# ================================================================
# EXCEPTION HANDLERS
# ================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """
    Global exception handler
    Catches unhandled exceptions
    """
    logger.error(f"❌ Unhandled exception: {str(exc)}")
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "details": str(exc) if settings.DEBUG else None
        }
    )


# ================================================================
# STARTUP LOGGING
# ================================================================

if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*60)
    print("🚀 IA FINANCIÈRE TUNISIENNE API")
    print("="*60)
    print(f"Environment: {settings.ENVIRONMENT}")
    print(f"Language: {settings.LANGUAGE}")
    print(f"\n📚 API Documentation:")
    print("  - Swagger UI: http://localhost:8000/docs")
    print("  - ReDoc: http://localhost:8000/redoc")
    print("\n" + "="*60 + "\n")
    
    uvicorn.run(
        "api.api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        reload_dirs=[str(project_root)] if settings.DEBUG else None,
        log_level="info"
    )