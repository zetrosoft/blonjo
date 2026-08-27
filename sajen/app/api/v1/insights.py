from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.api import deps
from app.models.accounting import Account, Transaction, JournalEntry, TransactionStatus, TransactionType, AccountType
from app.models.tenant import Tenant
from app.models.setting import AppSetting
from app.models.inventory import Product, TenantInventory, InventoryLog
from datetime import datetime, date, timedelta
from decimal import Decimal
import httpx
import logging
import xml.etree.ElementTree as ET
import re
import time

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory TTL Cache untuk widget insights per tenant (TTL 60 detik)
_WIDGETS_CACHE = {}
_CACHE_TTL_SECONDS = 60

@router.get("/widgets")
def get_insights_widgets(
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    tenant_id = current_user.tenant_id
    now = time.time()
    if tenant_id in _WIDGETS_CACHE:
        cached_time, cached_data = _WIDGETS_CACHE[tenant_id]
        if now - cached_time < _CACHE_TTL_SECONDS:
            return cached_data

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
    
    IGNORE_KEYWORDS = ["pendapatan", "pembelian", "belanja", "pengeluaran", "prive", "setoran", "operasional", "transaksi", "retur", "bayar", "total"]

    top_selling = []
    for name, qty in selling_month:
        n_lower = name.lower()
        if any(kw in n_lower for kw in IGNORE_KEYWORDS):
            continue
        top_selling.append({
            "name": name,
            "qty_month": float(qty),
            "qty_year": year_qty_map.get(name, float(qty))
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
        # 5 top-purchased dari supplier di bulan berjalan (terisolasi tenant_id)
        purchased_items = db.query(
            Product.name,
            func.sum(InventoryLog.quantity).label("purchase_qty")
        ).join(Product, Product.id == InventoryLog.product_id).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.transaction_date >= start_of_month,
            Transaction.transaction_date <= today,
            InventoryLog.log_type == "in"
        ).group_by(Product.name).order_by(func.sum(InventoryLog.quantity).desc()).limit(5).all()

        for name, qty in purchased_items:
            n_lower = name.lower()
            if any(kw in n_lower for kw in IGNORE_KEYWORDS):
                continue
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

    result_data = {
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
    _WIDGETS_CACHE[tenant_id] = (now, result_data)
    return result_data

class ChatMessage(BaseModel):
    message: str
    session_id: int | None = None
    history: list = []

class SessionCreate(BaseModel):
    title: str = "Percakapan Baru"

@router.get("/sessions")
def get_chat_sessions(
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.models.chat import VibeChatSession
    sessions = db.query(VibeChatSession).filter(
        VibeChatSession.tenant_id == current_user.tenant_id,
        VibeChatSession.user_id == current_user.id
    ).order_by(VibeChatSession.updated_at.desc(), VibeChatSession.id.desc()).all()
    
    return [
        {
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None
        }
        for s in sessions
    ]

@router.get("/sessions/{session_id}")
def get_chat_session_detail(
    session_id: int,
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.models.chat import VibeChatSession, VibeChatMessage
    session = db.query(VibeChatSession).filter(
        VibeChatSession.id == session_id,
        VibeChatSession.tenant_id == current_user.tenant_id,
        VibeChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Sesi percakapan tidak ditemukan")
    
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sources": m.sources or [],
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in session.messages
        ]
    }

@router.post("/sessions")
def create_chat_session(
    payload: SessionCreate,
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.models.chat import VibeChatSession
    new_sess = VibeChatSession(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        title=payload.title
    )
    db.add(new_sess)
    db.commit()
    db.refresh(new_sess)
    
    return {
        "id": new_sess.id,
        "title": new_sess.title,
        "created_at": new_sess.created_at.isoformat() if new_sess.created_at else None,
        "updated_at": new_sess.updated_at.isoformat() if new_sess.updated_at else None
    }

@router.delete("/sessions/{session_id}")
def delete_chat_session(
    session_id: int,
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.models.chat import VibeChatSession
    session = db.query(VibeChatSession).filter(
        VibeChatSession.id == session_id,
        VibeChatSession.tenant_id == current_user.tenant_id,
        VibeChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Sesi percakapan tidak ditemukan")
    
    db.delete(session)
    db.commit()
    return {"status": "deleted", "id": session_id}

@router.post("/chat")
async def vibes_chat_endpoint(
    payload: ChatMessage,
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    from app.services.mcp_client import MCPClient
    from app.services.ai_engine import call_ai_freetext
    from app.services.ai_context import get_rag_context
    from app.models.chat import VibeChatSession, VibeChatMessage
    
    # 0. RESOLVE OR CREATE CHAT SESSION IN DB
    active_session = None
    try:
        if payload.session_id:
            active_session = db.query(VibeChatSession).filter(
                VibeChatSession.id == payload.session_id,
                VibeChatSession.tenant_id == current_user.tenant_id,
                VibeChatSession.user_id == current_user.id
            ).first()

        if not active_session:
            # Buat sesi baru otomatis dengan judul dari pesan pengguna
            clean_title = payload.message.replace('\n', ' ').strip()
            if len(clean_title) > 40:
                clean_title = clean_title[:37] + "..."
            if not clean_title or clean_title.lower().startswith("halo"):
                clean_title = "Konsultasi Operasional & Finansial"
            active_session = VibeChatSession(
                tenant_id=current_user.tenant_id,
                user_id=current_user.id,
                title=clean_title
            )
            db.add(active_session)
            db.commit()
            db.refresh(active_session)
        elif active_session.title in ["Percakapan Baru", "Analisa Keuangan & Toko", "Konsultasi Operasional & Finansial"] and len(payload.message.strip()) > 3:
            # Perbarui judul sesi jika masih default
            clean_title = payload.message.replace('\n', ' ').strip()
            if len(clean_title) > 40:
                clean_title = clean_title[:37] + "..."
            active_session.title = clean_title
            db.commit()

        # Simpan Pesan Pengguna ke Database
        user_msg_db = VibeChatMessage(
            session_id=active_session.id,
            role="user",
            content=payload.message
        )
        db.add(user_msg_db)
        db.commit()
    except Exception as e_db:
        logger.warning(f"[VibesChat] Session DB operation warning: {e_db}")
        db.rollback()

    mcp = MCPClient()
    answer_text = ""
    sources = []

    # 1. UTAMAKAN PEMANGGILAN KE MCP SERVER TOOL "vibe_copilot"
    # Seluruh Autonomous Grounding, Item-Level Queries & Semantic Reasoning dieksekusi terpusat di MCP Server
    try:
        mcp_res = await mcp.call_tool("vibe_copilot", {
            "query": payload.message,
            "tenant_id": str(current_user.tenant_id),
            "history": payload.history or []
        })
        if mcp_res and "content" in mcp_res and len(mcp_res["content"]) > 0:
            answer_text = mcp_res["content"][0].get("text", "")
            sources = ['Database Finansial Riil', 'Buku Besar Akuntansi (PSAK/SAK EMKM)', 'Item-Level Ledger', 'MCP Knowledge Engine']
    except Exception as emcp:
        logger.warning(f"[VibesChat] MCP Call vibe_copilot failed ({emcp}), fallback ke local AI Engine.")
        
        # 2. LOCAL FALLBACK GROUNDING (Jika MCP Server Offline)
        try:
            today = date.today()
            cash_accounts_query = db.query(Account.id).filter(
                or_(Account.tenant_id == current_user.tenant_id, Account.tenant_id.is_(None)),
                Account.account_type == AccountType.ASSET,
                Account.code.in_(["1-1000", "1-1100", "1-1200", "1-1101", "1-1102"])
            ).all()
            cash_ids = [r[0] for r in cash_accounts_query]
            
            cash_summary = Decimal("0.00")
            if cash_ids:
                cash_summary = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(
                    Transaction, Transaction.id == JournalEntry.transaction_id
                ).filter(
                    Transaction.tenant_id == current_user.tenant_id,
                    Transaction.status == TransactionStatus.POSTED,
                    JournalEntry.account_id.in_(cash_ids)
                ).scalar() or Decimal("0.00")

            ap_total = db.query(func.sum(JournalEntry.credit - JournalEntry.debit)).join(
                Account, Account.id == JournalEntry.account_id
            ).join(
                Transaction, Transaction.id == JournalEntry.transaction_id
            ).filter(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.status == TransactionStatus.POSTED,
                Account.code.startswith("2-1")
            ).scalar() or Decimal("0.00")

            recent_txs = db.query(Transaction).filter(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.status == TransactionStatus.POSTED
            ).order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(10).all()
            tx_lines = [f"- [{tx.transaction_date}] [{tx.transaction_type}] {tx.reference_no or 'TX'}: {tx.description} = Rp {float(tx.total_amount):,.0f}" for tx in recent_txs]

            tenant_name = current_user.tenant.name if current_user.tenant else 'Toko Blonjo'
            fallback_prompt = (
                f"Anda adalah Co-Pilot Keuangan Toko '{tenant_name}'. Waktu Server: {today.strftime('%Y-%m-%d')}.\n"
                f"- Saldo Kas: Rp {float(cash_summary):,.2f}\n"
                f"- Utang Usaha: Rp {float(ap_total):,.2f}\n"
                f"- Transaksi Terkini:\n" + "\n".join(tx_lines) + "\n\n"
                f"Jawablah pertanyaan pengguna dengan nalar cerdas dan sopan: {payload.message}"
            )
            response = call_ai_freetext(
                db=db,
                prompt=payload.message,
                system_instruction=fallback_prompt,
                temperature=0.7
            )
            answer_text = response.get("raw_output") if isinstance(response, dict) else ""
            sources = ['Local DB Fallback']
        except Exception as e:
            logger.error(f"Error in Vibes Chat local fallback: {e}")
            answer_text = f"Terjadi kesalahan saat memproses pertanyaan Anda: {str(e)}"
            sources = []

    # Bersihkan sisa-sisa tag rujukan internal jika ada
    import re
    answer_text = re.sub(r'\[Sumber:[^\]]*\]', '', answer_text).strip()
    answer_text = re.sub(r'🔍[^\n]*', '', answer_text).strip()

    final_answer = answer_text or "Maaf, saya tidak dapat memproses pertanyaan Anda saat ini."

    # Simpan Pesan Asisten ke Database
    assistant_msg_db = VibeChatMessage(
        session_id=active_session.id,
        role="assistant",
        content=final_answer,
        sources=sources
    )
    db.add(assistant_msg_db)
    
    # Update timestamp sesi
    from datetime import datetime, timezone
    active_session.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "answer": final_answer,
        "sources": sources,
        "session_id": active_session.id
    }



# ──────────────────────────────────────────────────────────────────────────────
# HEURISTIK KATEGORISASI OTOMATIS (AI CATEGORIZATION ENGINE)
# ──────────────────────────────────────────────────────────────────────────────
AI_CATEGORY_PATTERNS = [
    ("BERAS", [r"\bberas\b", r"\bc4\b", r"\bmentik\b", r"\brojolele\b", r"\bpandan wangi\b", r"\bsiip\b", r"\bobor\b"]),
    ("MINYAK", [r"\bminyak\b", r"\bgoreng\b", r"\brisky\b", r"\bsunco\b", r"\btro Pico\b", r"\bfilm\b", r"\bsovia\b", r"\bfortune\b"]),
    ("GULA", [r"\bgula\b", r"\bgulaku\b", r"\bpasir\b", r"\bmerah\b", r"\bjawa\b"]),
    ("GANDUM & TEPUNG", [r"\btepung\b", r"\bterigu\b", r"\bsegitiga\b", r"\bcakra\b", r"\bkunci\b", r"\btpg\b", r"\btapioka\b", r"\bmaizena\b"]),
    ("MINUMAN", [r"\bminuman\b", r"\byakult\b", r"\baqua\b", r"\ble minerale\b", r"\bteh\b", r"\bsusu\b", r"\bskm\b", r"\bkopi\b", r"\bsprite\b", r"\bcoca\b", r"\bfanta\b", r"\bfloridina\b"]),
    ("TEH & KOPI", [r"\bteh\b", r"\btong tji\b", r"\bhead\b", r"\bkapal api\b", r"\bnescafe\b", r"\bgood day\b", r"\bluwak\b"]),
    ("BUMBU & DAPUR", [r"\bbumbu\b", r"\bketumbar\b", r"\bgaram\b", r"\bmoto\b", r"\bsasa\b", r"\broyco\b", r"\bmasako\b", r"\bkecap\b", r"\bbango\b", r"\bdelima\b", r"\bsantan\b", r"\bbawang\b", r"\bkemiri\b", r"\bmerica\b", r"\blada\b"]),
    ("PLASTIK & PEMBUNGKUS", [r"\bplastik\b", r"\bplasrik\b", r"\bboyo\b", r"\btomat\b", r"\bkresek\b", r"\bmika\b", r"\bhdpe\b", r"\bpe\b"]),
    ("SNACK & BISKUIT", [r"\bsnack\b", r"\bkerupuk\b", r"\bkripik\b", r"\bwafer\b", r"\btango\b", r"\broma\b", r"\bkhong guan\b", r"\bchitato\b"]),
    ("ROKOK", [r"\brokok\b", r"\bmagnum\b", r"\bbhumi\b", r"\bsampoerna\b", r"\bgudang garam\b", r"\bjarum\b", r"\brefil\b", r"\bskt\b"]),
    ("KEBUTUHAN RUMAH TANGGA", [r"\bsabun\b", r"\bwipol\b", r"\bpepsodent\b", r"\bsikat\b", r"\brinso\b", r"\bso klin\b", r"\bsunlight\b", r"\blpg\b", r"\bgas\b"])
]

def auto_classify_item_name(item_name: str) -> str:
    lower_name = item_name.lower()
    for cat_name, patterns in AI_CATEGORY_PATTERNS:
        for p in patterns:
            if re.search(p, lower_name):
                return cat_name
    return "LAIN-LAIN / LAINNYA"


@router.get("/purchase-matrix")
def get_purchase_matrix_analytics(
    year: int = 2026,
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        tenant_id = current_user.tenant_id

        # 1. Ambil data log pembelian dari inventory_logs (log_type = 'in') terisolasi per tenant_id
        all_logs = db.query(InventoryLog).join(
            Transaction, Transaction.id == InventoryLog.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            InventoryLog.log_type == "in"
        ).all()

        logged_tx_ids = set(log.transaction_id for log in all_logs if log.transaction_id)

        # 2. Ambil data transaksi Pembelian Header (TransactionType.PURCHASE) yang statusnya POSTED
        purchase_txs = db.query(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.transaction_type == TransactionType.PURCHASE,
            Transaction.status == TransactionStatus.POSTED
        ).all()

        # Ekstrak daftar tahun unik dari seluruh transaksi & log
        years_set = set()
        for log in all_logs:
            if log.transaction and log.transaction.transaction_date:
                years_set.add(log.transaction.transaction_date.year)
        for tx in purchase_txs:
            if tx.transaction_date:
                years_set.add(tx.transaction_date.year)

        if not years_set:
            years_set.add(year)
        available_years = sorted(list(years_set))

        # Dynamic Month Buckets per selected Year
        month_keys_set = set()
        raw_matrix = {} # { product_name: { month_str: { qty, value }, category, is_ai } }

        # A. Olah data dari InventoryLog
        for log in all_logs:
            if not log.transaction or not log.transaction.transaction_date:
                continue
            if log.transaction.transaction_date.year != year:
                continue

            t_date = log.transaction.transaction_date
            m_str = t_date.strftime("%Y-%m")
            month_keys_set.add(m_str)

            prod_name = log.product.name if (log.product and log.product.name) else "Item Tanpa Nama"
            
            cat_name = "LAIN-LAIN"
            is_ai_category = False
            if log.product and log.product.category and log.product.category.name:
                cat_name = log.product.category.name.upper()
            else:
                cat_name = auto_classify_item_name(prod_name)
                is_ai_category = True

            if prod_name not in raw_matrix:
                raw_matrix[prod_name] = {
                    "item_name": prod_name,
                    "category": cat_name,
                    "is_ai_category": is_ai_category,
                    "months": {}
                }

            if m_str not in raw_matrix[prod_name]["months"]:
                raw_matrix[prod_name]["months"][m_str] = {"qty": 0.0, "value": 0.0}

            qty = float(log.quantity or 0)
            price = float(log.price_per_unit or 0)
            val = qty * price if price > 0 else float(log.transaction.total_amount or 0)

            raw_matrix[prod_name]["months"][m_str]["qty"] += qty
            raw_matrix[prod_name]["months"][m_str]["value"] += val

        # B. Olah data dari Header Transaction (jika belum tercatat di InventoryLog)
        for tx in purchase_txs:
            if tx.id in logged_tx_ids or not tx.transaction_date:
                continue
            if tx.transaction_date.year != year:
                continue

            t_date = tx.transaction_date
            m_str = t_date.strftime("%Y-%m")
            month_keys_set.add(m_str)

            item_label = tx.description.strip() if tx.description else "Pembelian Barang Dagang"
            cat_name = auto_classify_item_name(item_label)

            if item_label not in raw_matrix:
                raw_matrix[item_label] = {
                    "item_name": item_label,
                    "category": cat_name,
                    "is_ai_category": True,
                    "months": {}
                }

            if m_str not in raw_matrix[item_label]["months"]:
                raw_matrix[item_label]["months"][m_str] = {"qty": 0.0, "value": 0.0}

            raw_matrix[item_label]["months"][m_str]["qty"] += 1.0
            raw_matrix[item_label]["months"][m_str]["value"] += float(tx.total_amount or 0)

        # Sort month keys for the selected year
        sorted_months = sorted(list(month_keys_set))
        
        # Jika tahun tersebut belum ada data sama sekali, tampilkan default bulan-bulan yang relevan
        if not sorted_months and year == 2026:
            sorted_months = ["2026-07", "2026-08"]
        
        # Map ISO Month to Indonesian Label (e.g. "2026-07" -> "Juli 2026")
        month_names_id = {
            "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
            "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
            "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
        }
        
        month_columns = []
        for m_str in sorted_months:
            parts = m_str.split("-")
            if len(parts) == 2:
                y, m = parts
                label = f"{month_names_id.get(m, m)} {y}"
            else:
                label = m_str
            month_columns.append({"key": m_str, "label": label})

        # Group items by Category
        categories_dict = {}
        for item_name, data in raw_matrix.items():
            cat = data["category"]
            if cat not in categories_dict:
                categories_dict[cat] = {
                    "category_name": cat,
                    "is_ai_category": data["is_ai_category"],
                    "items": [],
                    "totals": {m_str: {"qty": 0.0, "value": 0.0} for m_str in sorted_months},
                    "grand_total": {"qty": 0.0, "value": 0.0}
                }

            item_month_data = {}
            total_item_qty = 0.0
            total_item_value = 0.0

            for m_str in sorted_months:
                m_data = data["months"].get(m_str, {"qty": 0.0, "value": 0.0})
                item_month_data[m_str] = m_data
                total_item_qty += m_data["qty"]
                total_item_value += m_data["value"]

                categories_dict[cat]["totals"][m_str]["qty"] += m_data["qty"]
                categories_dict[cat]["totals"][m_str]["value"] += m_data["value"]

            categories_dict[cat]["grand_total"]["qty"] += total_item_qty
            categories_dict[cat]["grand_total"]["value"] += total_item_value

            categories_dict[cat]["items"].append({
                "item_name": item_name,
                "months": item_month_data,
                "total_qty": total_item_qty,
                "total_value": total_item_value
            })

        # Bulan aktif (bulan now, e.g. '2026-08')
        current_month_key = date.today().strftime("%Y-%m")

        # Convert to list and sort based on current month value group desc
        result_categories = []
        for cat_name, cat_data in categories_dict.items():
            # Sort items inside category by current month value desc, fallback to total value desc
            cat_data["items"].sort(
                key=lambda x: (x["months"].get(current_month_key, {}).get("value", 0.0), x["total_value"]),
                reverse=True
            )
            result_categories.append(cat_data)

        # Sort categories by current month total value desc, fallback to grand total value desc
        result_categories.sort(
            key=lambda x: (x["totals"].get(current_month_key, {}).get("value", 0.0), x["grand_total"]["value"]),
            reverse=True
        )

        return {
            "selected_year": year,
            "available_years": available_years,
            "columns": month_columns,
            "categories": result_categories
        }
    except Exception as e:
        logger.error(f"Error in purchase matrix analytics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Gagal memuat data matriks analitik: {str(e)}")


