from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import auth, accounting, ocr, inventory, admin, roles, settings, users, reports, vibe, material_control, insights, dashboard, overview_v2, overview_kinetic
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

@app.on_event("startup")
def on_startup():
    try:
        from app.models.base import Base
        from app.core.database import engine
        import app.models  # ensure all models are registered
        Base.metadata.create_all(bind=engine)
        print("[Sajen API] ✅ All database tables verified and created successfully.")
    except Exception as e:
        print(f"[Sajen API] ⚠️ Startup table creation warning: {e}")

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "sajen-api"}


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
app.include_router(insights.router, prefix="/api/v1/insights", tags=["Business Insights"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard Overview"])
app.include_router(overview_v2.router, prefix="/api/v1/overview_v2", tags=["Overview v2"])
app.include_router(overview_kinetic.router, prefix="/api/v1/overview_kinetic", tags=["Overview Kinetic"])

@app.get("/api/health", tags=["System"])
async def health_check():
    """
    Health Check Endpoint.
    
    Verifies the operational status of the API API.
    In future iterations, this will also verify Database (PostgreSQL) and Redis connections.
    """
    return {"status": "ok", "message": "Sajen Engine API is running securely."}
