from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.inventory import TenantInventory, Contact, Product
from app.models.accounting import Transaction, TransactionType

from app.models.tenant import Tenant

router = APIRouter()

@router.get("/kinetic-insight")
async def get_kinetic_insight(
    db: Session = Depends(get_db)
):
    tenant_id = 1
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    maintenance_stock = tenant.maintenance_stock if tenant else False
        
    # 1. Check Inventory Risk (Low Stock)
    critical_inventory = None
    if maintenance_stock:
        critical_inventory = db.query(TenantInventory, Product).join(
            Product, TenantInventory.product_id == Product.id
        ).filter(
            TenantInventory.tenant_id == tenant_id,
            TenantInventory.static_stock <= TenantInventory.reorder_point
        ).first()
    
    # 2. Check Debts / Payables
    payables = db.query(func.sum(Contact.current_balance)).filter(
        Contact.tenant_id == tenant_id,
        Contact.contact_type == 'supplier'
    ).scalar() or 0
    
    # 3. Check Cash Flow (Today's Income vs Expense)
    today = date.today()
    income_today = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date == today,
        Transaction.transaction_type == TransactionType.INCOME
    ).scalar() or 0
    
    expense_today = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date == today,
        Transaction.transaction_type == TransactionType.EXPENSE
    ).scalar() or 0
    
    net_cashflow = income_today - expense_today
    
    # Determine the Kinetic Focus based on weights
    active_persona = "RISK_MANAGER"
    central_text = "Semua sistem berjalan stabil. Tidak ada anomali."
    impact_text = "Status: Aman"
    urgency_weight = 50
    
    if critical_inventory:
        inv, prod = critical_inventory
        active_persona = "RISK_MANAGER"
        central_text = f"Stok {prod.name} Kritis. Tersisa {inv.static_stock} {prod.base_unit}."
        impact_text = "Segera restock untuk menghindari kehilangan penjualan."
        urgency_weight = 100
    elif payables > 10000000:
        active_persona = "FINANCIAL_ANALYST"
        central_text = f"Total hutang ke supplier menumpuk mencapai Rp {payables:,.0f}."
        impact_text = "Perhatikan arus kas untuk pelunasan minggu ini."
        urgency_weight = 90
    elif net_cashflow > 0:
        active_persona = "GROWTH_HACKER"
        central_text = f"Arus kas positif hari ini: +Rp {net_cashflow:,.0f}!"
        impact_text = "Pertahankan momentum penjualan."
        urgency_weight = 80
        
    return {
        "maintenance_stock": maintenance_stock,
        "active_persona": active_persona,
        "central_headline": {
            "text": central_text,
            "impact": impact_text,
            "urgency_weight": urgency_weight,
            "chart_data": [80, 85, 90, 88, urgency_weight]
        },
        "supporting_metrics": [
            {
                "title": "Cash Flow (Hari Ini)",
                "value": f"{'Rp' if net_cashflow >= 0 else '-Rp'} {abs(net_cashflow):,.0f}",
                "urgency_weight": 40,
                "status": "stable" if net_cashflow >= 0 else "warning"
            },
            {
                "title": "Total Hutang Supplier",
                "value": f"Rp {payables:,.0f}",
                "urgency_weight": 30,
                "status": "warning" if payables > 0 else "stable"
            }
        ]
    }
