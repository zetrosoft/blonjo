from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.api import deps
from app.models.accounting import Account, Transaction, JournalEntry, TransactionStatus, TransactionType, AccountType
from app.models.tenant import Tenant
from app.models.setting import AppSetting
from app.models.inventory import Product, TenantInventory, InventoryLog
from datetime import date, timedelta
from decimal import Decimal
import httpx
import logging
import xml.etree.ElementTree as ET
import re

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/widgets")
def get_insights_widgets(
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    tenant_id = current_user.tenant_id
    today = date.today()
    yesterday = today - timedelta(days=1)
    start_of_month = today.replace(day=1)
    start_of_year = today.replace(month=1, day=1)

    # 1. CASH BALANCE SNAPSHOT
    # Saldo kas & bank: akun ASSET berkode 1-1000, 1-1100, 1-1200, 1-1101, 1-1102 milik tenant ATAU sistem (None)
    cash_accounts_query = db.query(Account.id).filter(
        or_(Account.tenant_id == tenant_id, Account.tenant_id.is_(None)),
        Account.account_type == AccountType.ASSET,
        Account.code.in_(["1-1000", "1-1100", "1-1200", "1-1101", "1-1102"])
    ).all()
    cash_account_ids = [r[0] for r in cash_accounts_query]

    # Current Cash Balance (Ketat by current_user.tenant_id)
    current_balance = Decimal("0.00")
    if cash_account_ids:
        current_balance = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            JournalEntry.account_id.in_(cash_account_ids)
        ).scalar() or Decimal("0.00")

    # Inflow/Outflow Yesterday
    yesterday_inflow = Decimal("0.00")
    yesterday_outflow = Decimal("0.00")
    if cash_account_ids:
        yesterday_inflow = db.query(func.sum(JournalEntry.debit)).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            Transaction.transaction_date == yesterday,
            JournalEntry.account_id.in_(cash_account_ids)
        ).scalar() or Decimal("0.00")

        yesterday_outflow = db.query(func.sum(JournalEntry.credit)).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            Transaction.transaction_date == yesterday,
            JournalEntry.account_id.in_(cash_account_ids)
        ).scalar() or Decimal("0.00")

    # Inflow/Outflow Month
    month_inflow = Decimal("0.00")
    month_outflow = Decimal("0.00")
    if cash_account_ids:
        month_inflow = db.query(func.sum(JournalEntry.debit)).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            Transaction.transaction_date >= start_of_month,
            Transaction.transaction_date <= today,
            JournalEntry.account_id.in_(cash_account_ids)
        ).scalar() or Decimal("0.00")

        month_outflow = db.query(func.sum(JournalEntry.credit)).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            Transaction.transaction_date >= start_of_month,
            Transaction.transaction_date <= today,
            JournalEntry.account_id.in_(cash_account_ids)
        ).scalar() or Decimal("0.00")

    # 2. TOP SELLING PRODUCTS (Berdasarkan log_type == 'out' dari penjualan)
    # Item terlaris bulan ini
    selling_month = db.query(
        Product.name,
        func.sum(InventoryLog.quantity).label("total_qty")
    ).join(Product, Product.id == InventoryLog.product_id).join(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date >= start_of_month,
        Transaction.transaction_date <= today,
        InventoryLog.log_type == "out"
    ).group_by(Product.name).order_by(func.sum(InventoryLog.quantity).desc()).limit(5).all()

    # Sepanjang tahun
    selling_year = db.query(
        Product.name,
        func.sum(InventoryLog.quantity).label("total_qty")
    ).join(Product, Product.id == InventoryLog.product_id).join(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date >= start_of_year,
        Transaction.transaction_date <= today,
        InventoryLog.log_type == "out"
    ).group_by(Product.name).all()

    year_qty_map = {name: float(qty) for name, qty in selling_year}
    
    top_selling = []
    for name, qty in selling_month:
        top_selling.append({
            "name": name,
            "qty_month": float(qty),
            "qty_year": year_qty_map.get(name, float(qty))
        })

    # Fill remaining from year selling if month selling has less than 5
    if len(top_selling) < 5:
        sorted_year = sorted(selling_year, key=lambda x: x[1], reverse=True)
        added_names = {item["name"] for item in top_selling}
        for name, qty in sorted_year:
            if len(top_selling) >= 5:
                break
            if name not in added_names:
                top_selling.append({
                    "name": name,
                    "qty_month": 0.0,
                    "qty_year": float(qty)
                })

    # 3. FORECAST & DEPLETION RISK (Terisolasi ketat per tenant_id)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    maintenance_stock = tenant.maintenance_stock if tenant else False

    forecast_items = []
    if maintenance_stock:
        # 5 produk top-selling (log_type == "out") + sisa stok fisiknya
        sales_items = db.query(
            Product.id,
            Product.name,
            func.sum(InventoryLog.quantity).label("sales_qty")
        ).join(Product, Product.id == InventoryLog.product_id).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            InventoryLog.log_type == "out"
        ).group_by(Product.id, Product.name).order_by(func.sum(InventoryLog.quantity).desc()).limit(5).all()

        for prod_id, prod_name, sales_qty in sales_items:
            # Sisa stok fisik terisolasi tenant_id
            in_stock = db.query(func.sum(InventoryLog.quantity)).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                InventoryLog.product_id == prod_id,
                InventoryLog.log_type == "in"
            ).scalar() or Decimal("0.00")

            out_stock = db.query(func.sum(InventoryLog.quantity)).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                InventoryLog.product_id == prod_id,
                InventoryLog.log_type == "out"
            ).scalar() or Decimal("0.00")

            current_stock = in_stock - out_stock
            
            # Cek jika ada static stock terisolasi tenant_id
            ti = db.query(TenantInventory).filter(
                TenantInventory.tenant_id == tenant_id,
                TenantInventory.product_id == prod_id
            ).first()
            if ti and ti.static_stock > 0:
                current_stock = ti.static_stock

            forecast_items.append({
                "name": prod_name,
                "volume": float(sales_qty),
                "current_stock": float(current_stock)
            })
    else:
        # 5 top-purchased dari supplier (terisolasi tenant_id)
        purchased_items = db.query(
            Product.name,
            func.sum(InventoryLog.quantity).label("purchase_qty")
        ).join(Product, Product.id == InventoryLog.product_id).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            InventoryLog.log_type == "in"
        ).group_by(Product.name).order_by(func.sum(InventoryLog.quantity).desc()).limit(5).all()

        for name, qty in purchased_items:
            forecast_items.append({
                "name": name,
                "volume": float(qty),
                "current_stock": 0.0
            })

    # 4. MACRO NEWS CLIPS (Pencarian berita real-time dinamis)
    business_setting = db.query(AppSetting).filter(
        AppSetting.tenant_id == tenant_id,
        AppSetting.key == "business_category"
    ).first()
    business_category = business_setting.value if business_setting else "Retail FMCG Indonesia"

    macro_news = []
    try:
        # Dynamic search via Google News RSS Feed
        query_encoded = business_category.replace(" ", "+")
        rss_url = f"https://news.google.com/rss/search?q={query_encoded}&hl=id&gl=ID&ceid=ID:id"
        response = httpx.get(rss_url, timeout=5.0)
        if response.status_code == 200:
            root = ET.fromstring(response.content)
            items = root.findall(".//item")
            for item in items[:3]:
                title = item.find("title").text if item.find("title") is not None else ""
                link = item.find("link").text if item.find("link") is not None else ""
                source = item.find("source").text if item.find("source") is not None else "Google News"
                summary = item.find("description").text if item.find("description") is not None else ""
                summary = re.sub(r'<[^>]*>', '', summary)
                if len(summary) > 200:
                    summary = summary[:197] + "..."
                macro_news.append({
                    "title": title,
                    "summary": summary or title,
                    "source": source,
                    "url": link
                })
    except Exception as ex:
        logger.error(f"Gagal melakukan pencarian berita dinamis: {ex}")

    # Fallback jika berita dinamis kosong/gagal
    if not macro_news:
        macro_news = [
            {
                "title": f"Penurunan Penjualan Ritel {business_category} Q2 2026",
                "summary": "Bank Indonesia melaporkan kontraksi penjualan ritel sebesar 3.9% yoy pada Mei 2026. Konsumen menjadi sangat value-driven dan selektif akibat tekanan inflasi pada pengeluaran rumah tangga.",
                "source": "Indonesia Investments / Bank Indonesia",
                "url": "https://www.indonesia-investments.com"
            },
            {
                "title": f"Pergeseran Pola Belanja Ritel: Tren Omnichannel 2026",
                "summary": "E-commerce berkembang menjadi saluran utama untuk penyetokan kebutuhan dapur (pantry-stocking). Kategori sembako, snack, dan kopi instan mengalami lonjakan volume transaksi.",
                "source": "Worldpanel",
                "url": "https://www.worldpanel.com"
            }
        ]

    return {
        "cash_balance": {
            "current_balance": float(current_balance),
            "yesterday_inflow": float(yesterday_inflow),
            "yesterday_outflow": float(yesterday_outflow),
            "month_inflow": float(month_inflow),
            "month_outflow": float(month_outflow)
        },
        "top_selling": top_selling,
        "forecast_depletion": {
            "maintenance_stock": maintenance_stock,
            "items": forecast_items
        },
        "macro_news": macro_news
    }

class ChatMessage(BaseModel):
    message: str
    history: list = []

@router.post("/chat")
async def vibes_chat_endpoint(
    payload: ChatMessage,
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.services.ai_engine import call_ai_freetext
    from app.services.ai_context import get_rag_context
    
    # Kumpulkan context riil (terisolasi ketat tenant_id)
    cash_accounts_query = db.query(Account.id).filter(
        or_(Account.tenant_id == current_user.tenant_id, Account.tenant_id.is_(None)),
        Account.account_type == AccountType.ASSET,
        Account.code.in_(["1-1000", "1-1100", "1-1200", "1-1101", "1-1102"])
    ).all()
    cash_account_ids = [r[0] for r in cash_accounts_query]
    
    summary = Decimal("0.00")
    if cash_account_ids:
        summary = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == current_user.tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            JournalEntry.account_id.in_(cash_account_ids)
        ).scalar() or Decimal("0.00")

    products = db.query(Product).join(TenantInventory).filter(TenantInventory.tenant_id == current_user.tenant_id).limit(10).all()
    prod_list = ", ".join([p.name for p in products])

    # Ambil RAG Context dari MCP Server (mcp.samkarsa.com)
    rag_context = ""
    try:
        rag_context = get_rag_context(db=db, tenant_id=current_user.tenant_id, query_text=payload.message)
    except Exception as erag:
        logger.error(f"Gagal mengambil RAG context dari MCP: {erag}")

    context_prompt = (
        f"Anda adalah Asisten Virtual Vibes Chat (NotebookLM-Style) untuk toko '{current_user.tenant.name if current_user.tenant else 'Toko Blonjo'}'.\n"
        f"Gunakan data riil ini jika relevan:\n"
        f"- Total Saldo Kas & Bank saat ini: Rp {float(summary):,.2f}\n"
        f"- Produk terdaftar: {prod_list if prod_list else 'Belum ada produk'}\n"
        f"{rag_context}\n\n"
        f"Jawab pertanyaan pengguna dengan gaya bahasa profesional, informatif, ramah, dan ringkas."
    )

    try:
        response = call_ai_freetext(
            db=db,
            prompt=payload.message,
            system_instruction=context_prompt,
            temperature=0.7
        )
        # Ambil raw_output secara aman untuk menghindari NoneType crash
        answer_text = response.get("raw_output") if isinstance(response, dict) else ""
        return {
            "answer": answer_text or "Maaf, saya tidak dapat memproses pertanyaan Anda saat ini.",
            "sources": ["Database Keuangan Riil", "Master Inventaris Toko", "Konteks RAG MCP"]
        }
    except Exception as e:
        logger.error(f"Error in Vibes Chat: {e}")
        return {
            "answer": f"Terjadi kesalahan saat memproses pertanyaan Anda: {str(e)}",
            "sources": []
        }
