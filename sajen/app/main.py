from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, accounting, ocr

app = FastAPI(
    title="Sajen Engine API",
    description="""
    High-performance API for Blonjo UMKM Retail Accounting, OCR, and AI Inference.
    Includes endpoints for WhatsApp Bizeto Integration.
    """,
    version="1.3.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(accounting.router, prefix="/api/v1/finance", tags=["Accounting"])
app.include_router(ocr.router, prefix="/api/v1/ocr", tags=["AI & OCR"])

@app.get("/api/health", tags=["System"])
async def health_check():
    """
    Health Check Endpoint.
    
    Verifies the operational status of the API API.
    In future iterations, this will also verify Database (PostgreSQL) and Redis connections.
    """
    return {"status": "ok", "message": "Sajen Engine API is running securely."}
