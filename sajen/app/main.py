from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, accounting, ocr, inventory, admin, roles, settings, users, reports, vibe, material_control
from app.core.config import settings as app_settings

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
    allow_origins=app_settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(accounting.router, prefix="/api/v1/finance", tags=["Accounting"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(ocr.router, prefix="/api/v1/ocr", tags=["AI & OCR"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["Inventory & Stock Management"])
app.include_router(material_control.router, prefix="/api/v1/material-control", tags=["Material & Purchase Control"])
app.include_router(admin.router, prefix="/api/v1/saas", tags=["SaaS Admin"])
app.include_router(roles.router, prefix="/api/v1/roles", tags=["RBAC & Roles"])
app.include_router(settings.router, prefix="/api/v1/settings", tags=["Tenant Settings"])
app.include_router(users.router, prefix="/api/v1/users", tags=["User Management"])
app.include_router(vibe.router, prefix="/api/v1/vibe", tags=["Vibe Coding"])

@app.get("/api/health", tags=["System"])
async def health_check():
    """
    Health Check Endpoint.
    
    Verifies the operational status of the API API.
    In future iterations, this will also verify Database (PostgreSQL) and Redis connections.
    """
    return {"status": "ok", "message": "Sajen Engine API is running securely."}
