from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/kpi")
async def get_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Dummy data logic mimicking future real DB queries tied to current_user
    return {
        "total_revenue": {
            "value": 124500000,
            "trend": 12.5,
            "trend_type": "up",
            "context": "vs last month"
        },
        "total_expenses": {
            "value": 86911287,
            "trend": 5.2,
            "trend_type": "down",
            "context": "vs last month"
        },
        "cash_balance": {
            "value": 37588713,
            "trend": 8.0,
            "trend_type": "up",
            "context": "Active cash position"
        },
        "accounts_payable": {
            "value": 12500000,
            "trend": -2.5,
            "trend_type": "down",
            "context": "Upcoming 7 days"
        }
    }

@router.get("/chart")
async def get_chart_data(
    filter: str = "30d",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Mock dynamic data based on filter
    import random
    days = 30
    if filter == "7d": days = 7
    elif filter == "60d": days = 60
    elif filter == "90d": days = 90
    elif filter == "ytd": days = 180 # roughly 6 months for mock
    
    data = []
    for i in range(days):
        data.append({
            "name": f"Day {i+1}",
            "income": random.randint(1000000, 5000000),
            "expense": random.randint(500000, 3000000),
            "projection": random.randint(2000000, 6000000)
        })
    return data

@router.get("/advisor")
async def get_advisor_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {
        "sales_analysis": "Penjualan produk Kopi Susu Aren meningkat 15% minggu ini. Pertimbangkan untuk restock bahan baku aren.",
        "business_health": "Arus kas sehat. Biaya logistik bisa ditekan 5% jika beralih ke kurir alternatif untuk rute luar kota."
    }

@router.get("/smart_widgets")
async def get_smart_widgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Retrieve maintenance_stock configuration (mocked as true for now)
    return {
        "maintenance_stock": True,
        "low_stock_alerts": [
            {"product": "Gula Pasir 1Kg", "remaining": 5, "unit": "pcs"}
        ],
        "upcoming_debts": [
            {"creditor": "Supplier Kopi Abadi", "amount": 2500000, "due_in_days": 3}
        ]
    }

from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str

@router.post("/ai_chat")
async def ai_chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Mock LLM interaction
    return {
        "response": f"Ini adalah jawaban cerdas dari Blonjo AI terkait pertanyaan Anda: '{req.message}'. Data Anda menunjukkan tren positif minggu ini!"
    }
