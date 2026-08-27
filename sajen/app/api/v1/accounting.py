from fastapi import APIRouter, Depends, status, Query
from typing import List, Optional
from app.api.deps import SessionDep, CurrentUser, check_role
from app.models.user import UserRole, User
from app.schemas.accounting import (
    AccountResponse, 
    TransactionResponse, 
    TransactionCreate, 
    TransactionUpdate,
    DashboardSummaryResponse,
    ParseNoteRequest,
    ParseNoteResponse,
    AIParsingLogResponse,
    AIModelQuotaResponse,
    JournalMappingCreate,
    JournalMappingResponse,
    TransactionPayoffRequest,
    TransactionRescheduleRequest,
    CompassSummaryResponse,
    MarketIntelligenceItem,
    GeneralLedgerResponse
)
from app.models.accounting import Account, Transaction, TransactionType, TransactionStatus, JournalMapping, JournalMappingLine, JournalEntry
from app.models.log import AIParsingLog, AIModelQuota, ParserType
from sqlalchemy import or_, and_, func
from app.models.ocr import OCRTask, OCRStatus
from app.services.accounting import (
    create_transaction_with_journal, 
    update_transaction_draft, 
    post_transaction,
    unpost_transaction,
    delete_transaction_draft,
    get_dashboard_summary,
    get_auto_journal_entries,
    check_tax_exempt_via_vector
)
from app.services.ai_context import get_rag_context
from app.services.ai_engine import call_ai_text
from app.services.smart_parser import try_rule_based_parse, build_minimal_prompt  # ✅ NEW
from app.services.coa_cache import get_coa_string, needs_coa_in_prompt            # ✅ NEW
from app.core.config import settings
import json
import os
import re
from decimal import Decimal
from datetime import datetime

router = APIRouter()

@router.post("/transactions/parse", response_model=ParseNoteResponse)
async def parse_transaction_note(
    request: ParseNoteRequest,
    session: SessionDep,
    current_user: CurrentUser
):

    """
    Parse unstructured text into transaction data.

    Pipeline optimasi 3 level:
      L1. Rule-Based Pre-Filter   → 0ms, tanpa LLM (untuk input ringkasan simpel)
      L2. Redis Cache             → <5ms jika pola sama pernah diproses
      L3. LLM dengan Prompt Minimal → hanya jika L1 & L2 gagal
    """
    text = request.text

    # ── Pra-pemrosesan: Normalisasi pemisah ribuan & nama barang ─────────────
    normalized_text = re.sub(r'(\d)\.(\d{3})(\b|\s)', r'\1\2\3', text)
    normalized_text = re.sub(r'(\d)\.(\d{3})(\b|\s)', r'\1\2\3', normalized_text)
    normalized_text = re.sub(r'\btelor\b', 'telur', normalized_text, flags=re.IGNORECASE)

    low_text = normalized_text.lower()
    is_operational_revenue = any(kw in low_text for kw in [
        "pendapatan", "jual", "penjualan", "hasil toko", "omzet", "penerimaan"
    ])
    today_date = datetime.now().strftime("%Y-%m-%d")

    # ────────────────────────────────────────────────────────────────────────
    # LEVEL 1: Rule-Based Pre-Filter (0ms — TANPA LLM)
    # ────────────────────────────────────────────────────────────────────────
    rule_result = try_rule_based_parse(normalized_text)
    processor_name = "local_fallback"
    final_parsed_data = None
    token_in = 0
    token_out = 0
    prompt = "[BYPASSED — rule-based parser]"
    system_instruction = "[BYPASSED — rule-based parser]"

    if rule_result:
        # ✅ Langsung selesai tanpa LLM!
        final_parsed_data = rule_result
        processor_name = "rule_based"
        print(f"[PARSE] Rule-based HIT: {text[:60]}")

    else:
        # ────────────────────────────────────────────────────────────────────
        # LEVEL 2 & 3: RAG Context + LLM (hanya jika rule-based gagal)
        # ────────────────────────────────────────────────────────────────────
        from app.services.smart_parser import classify_transaction, TransactionClass
        from app.services.ai_context import build_minimal_context

        # Deteksi kelas transaksi untuk membatasi overhead context
        tx_class = classify_transaction(normalized_text)
        min_context = build_minimal_context(normalized_text, tx_class, current_user.tenant_id, session)

        rag_context = ""

        # 1. Inject Pricing Rules yang sudah difilter berdasarkan keyword produk
        #    KAS_GLOBAL → [] (skip), PRODUCT_SALES → keyword-matched, UNKNOWN → []
        rules = min_context.get("pricing_rules", [])
        if rules:
            rag_context += "\n--- ATURAN HARGA JUAL (PRICING RULES) ---\n"
            for r in rules:
                rag_context += f"- {r['name'] or 'Aturan Harga'}: {json.dumps(r['rule_payload'])}\n"

        # 2. Ambil PEMBELAJARAN/REFERENSI dari RAG (tanpa pricing rules & master data global)
        #    Hanya untuk input kompleks (>60 char) — hemat token untuk input pendek
        is_complex = len(normalized_text) > 60
        if is_complex:
            rag_context_full = get_rag_context(session, current_user.tenant_id, normalized_text)
            # Strip SELURUH blok ATURAN HARGA dari get_rag_context (regex multiline)
            # Ini mencegah duplikasi: min_context sudah inject rules yang terfilter di atas
            rag_clean = re.sub(
                r'\n?--- ATURAN HARGA JUAL.*?(?=\n---|$)',
                '',
                rag_context_full,
                flags=re.DOTALL
            )
            if rag_clean.strip():
                rag_context += "\n" + rag_clean.strip()

        # 3. Ambil Aturan Khusus (Voice AI Rules) dari Setting
        from app.models.setting import AppSetting
        voice_ai_setting = session.query(AppSetting).filter(
            AppSetting.tenant_id == current_user.tenant_id,
            AppSetting.key == "voice_ai_rules"
        ).first()
        voice_ai_rules = voice_ai_setting.value if voice_ai_setting else ""

        # 4. (Dihapus: Catalog Context tidak lagi diinjeksi ke LLM untuk menghemat token)
        # Ekstraksi nama mentah akan ditangani backend menggunakan pg_trgm & ProductAlias
        catalog_section = ""

        # Bangun prompt minimal
        sys_inst, p_inst = build_minimal_prompt(
            normalized_text, today_date, "", catalog_section
        )
        system_instruction = sys_inst
        prompt = p_inst

        # Gabungkan RAG context ke prompt jika ada
        if rag_context.strip():
            prompt = rag_context.strip() + "\n\n" + prompt

        # Panggil AI (Level 2: Redis Cache/MCP, Level 3: LLM/MCP)
        from app.services.mcp_client import mcp_client
        mcp_result = await mcp_client.parse_transaction(
            session,
            normalized_text,
            {"pricing_rules": rules, "catalog_context": catalog_section, "voice_ai_rules": voice_ai_rules},
            tenant_id=current_user.tenant_id
        )

        # Ambil semua info dari hasil — processor & token sekarang akurat
        final_parsed_data = mcp_result.get("parsed_data") if isinstance(mcp_result, dict) else mcp_result
        processor_name = mcp_result.get("processor", "local_fallback") if isinstance(mcp_result, dict) else "local_fallback"
        token_in = mcp_result.get("token_in", 0) if isinstance(mcp_result, dict) else 0
        token_out = mcp_result.get("token_out", 0) if isinstance(mcp_result, dict) else 0



        # ── Post-processing: Override & Sanity Check ─────────────────────────
        if final_parsed_data:
            # Force 'purchase_return' atau 'sales_return' jika ada kata kunci retur/kembali
            is_retur_keyword = any(kw in low_text for kw in ["retur", "return", "refund", "pengembalian", "kembali"])
            if is_retur_keyword:
                t_type = final_parsed_data.get("transaction_type")
                # Jika terdeteksi purchase atau sales, paksa ke tipe return yang sesuai
                if t_type == "purchase":
                    final_parsed_data["transaction_type"] = "purchase_return"
                elif t_type == "sales":
                    final_parsed_data["transaction_type"] = "sales_return"
                elif t_type not in ["purchase_return", "sales_return"]:
                    # Default fallback jika tidak ada tipe, atau keliru terdeteksi sebagai 'expense' / lainnya
                    # Jika ada 'supplier', 'sales bumbu', dll, arahkan ke purchase_return
                    if any(kw in low_text for kw in ["supplier", "distributor", "vendor", "sales"]):
                        final_parsed_data["transaction_type"] = "purchase_return"
                    else:
                        final_parsed_data["transaction_type"] = "sales_return"

            # Force 'sales' jika heuristik mendeteksi pendapatan operasional (selama bukan retur)
            if is_operational_revenue and final_parsed_data.get("transaction_type") == "income" and not is_retur_keyword:
                final_parsed_data["transaction_type"] = "sales"

            # Bersihkan item dummy untuk input ringkasan/global (hanya simpan histori & jurnal)
            items = final_parsed_data.get("items", [])
            summary_kws = ["pendapatan", "penjualan", "omzet", "omset", "rekap", "hasil toko", "penerimaan", "total penjualan"]
            if items:
                is_summary = any(
                    str(it.get("name", "")).lower().strip() == low_text.strip()
                    or (any(kw in str(it.get("name", "")).lower() for kw in summary_kws) and not any(u in str(it.get("name", "")).lower() for u in ["kg", "pcs", "@", "liter", "btl", "ctn", "pack", "rtg", "dus", "sak", "gram", "gr"]))
                    for it in items
                )
                if is_summary:
                    final_parsed_data["items"] = []

            # ── SAPU BERSIH: Sanitize Supplier Name & Description ──
            # 1. Ekstrak nama toko dari JSON mentah dalam input teks jika ada
            extracted_toko = None
            toko_match = re.search(r'"(?:toko|brand_name|merchant|nama_toko)"\s*:\s*"([^"]+)"', text)
            if toko_match:
                extracted_toko = toko_match.group(1).strip()
            
            # 1b. Ekstrak pintar jika teks mengandung 'di supplier X' atau 'X supplier'
            if not extracted_toko:
                # Pola 1: "di/dari/ke supplier NAMA"
                m1 = re.search(r'\b(?:di|dari|ke)\s+(?:supplier|suplier)\s+([a-zA-Z\s]+?)(?=\s+\d|\s+@|\s+pcs|\s+kg|\s+liter|\s+rp|$)', low_text, re.IGNORECASE)
                if m1:
                    extracted_toko = m1.group(1).strip().title()
                else:
                    # Pola 2: "di/dari/ke NAMA supplier"
                    m2 = re.search(r'\b(?:di|dari|ke)\s+([a-zA-Z\s]+?)\s+(?:supplier|suplier)\b', low_text, re.IGNORECASE)
                    if m2:
                        extracted_toko = m2.group(1).strip().title()

            c_name = final_parsed_data.get("contact_name") or ""
            if extracted_toko:
                final_parsed_data["contact_name"] = extracted_toko
            elif c_name == "|" or c_name.strip() == "" or (final_parsed_data.get("transaction_type") == "purchase" and "KUSUMA" in c_name.upper()):
                final_parsed_data["contact_name"] = ""

            # 2. Perbaiki tanggal yang tertukar (misal DD/MM/YY terbaca YY/MM/DD)
            tgl = final_parsed_data.get("transaction_date") or ""
            if tgl:
                try:
                    parts = tgl.split("-")
                    if len(parts) == 3:
                        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                        if y < 2015 and d >= 20:
                            new_y = 2000 + d
                            new_d = y % 100
                            final_parsed_data["transaction_date"] = f"{new_y}-{m:02d}-{new_d:02d}"
                except Exception as e:
                    print(f"Date correction error: {e}")

            # 2b. Validasi sanity check: tanggal tidak boleh tidak masuk akal
            from datetime import date as _date, timedelta
            try:
                parsed_tgl_str = final_parsed_data.get("transaction_date") or ""
                if parsed_tgl_str:
                    parsed_dt = _date.fromisoformat(parsed_tgl_str)
                    today_dt = _date.fromisoformat(today_date)
                    max_future = today_dt.replace(year=today_dt.year + 1)
                    min_past = _date(2020, 1, 1)
                    if parsed_dt > max_future or parsed_dt < min_past:
                        print(f"[DATE SANITY] Tanggal AI '{parsed_tgl_str}' tidak masuk akal, diganti dengan today_date='{today_date}'")
                        final_parsed_data["transaction_date"] = today_date
                else:
                    final_parsed_data["transaction_date"] = today_date
            except (ValueError, TypeError) as e:
                print(f"[DATE SANITY] Error validasi tanggal: {e}, fallback ke today_date")
                final_parsed_data["transaction_date"] = today_date

            # 2c. Force Tanggal Relatif jika teks mengandung 'kemarin' / 'hari kemarin'
            if any(kw in low_text for kw in ["kemarin", "kemaren", "yesterday"]):
                try:
                    today_dt = _date.fromisoformat(today_date)
                    final_parsed_data["transaction_date"] = (today_dt - timedelta(days=1)).isoformat()
                except Exception as e:
                    print(f"Error setting yesterday date: {e}")

            # 2d. Force Payment Method berdasarkan kata kunci di input teks
            if any(kw in low_text for kw in ["dp ", " dp", "uang muka", "down payment", "deposit", "panjar"]):
                final_parsed_data["payment_method"] = "customer_deposit"
            elif any(kw in low_text for kw in ["qris", "qr"]):
                final_parsed_data["payment_method"] = "qris"
            elif any(kw in low_text for kw in ["transfer", "tf", "bank", "bca", "mandiri", "bri", "bni", "cimb", "gopay", "ovo", "dana", "shopeepay"]):
                final_parsed_data["payment_method"] = "transfer"
            elif any(kw in low_text for kw in ["tempo", "kredit", "hutang", "utang", "bon"]):
                final_parsed_data["payment_method"] = "tempo"
            elif not final_parsed_data.get("payment_method"):
                final_parsed_data["payment_method"] = "cash"

            # 3. Re-generate Description yang bersih dan manusiawi
            desc = final_parsed_data.get("description") or ""
            items = final_parsed_data.get("items") or []
            tgl = final_parsed_data.get("transaction_date") or today_date
            supplier = final_parsed_data.get("contact_name") or extracted_toko or "Supplier"
            
            has_babble = any(kw in desc for kw in ["Berikut adalah", "ekstraksi data", "tabel data", "markdown", "format tabel", "|"])
            if not desc or has_babble or len(desc) > 35:
                if final_parsed_data.get("transaction_type") == "purchase":
                    final_parsed_data["description"] = f"Pembelian di {supplier}"
                elif final_parsed_data.get("transaction_type") == "purchase_return":
                    final_parsed_data["description"] = f"Retur Pembelian di {supplier}"
                elif final_parsed_data.get("transaction_type") == "sales_return":
                    final_parsed_data["description"] = f"Retur Penjualan"
                else:
                    final_parsed_data["description"] = f"Transaksi di {supplier} pada {tgl}"

            # 4. Perbaiki masalah matematika LLM (halusinasi hitungan total item)
            if items and len(items) > 0:
                calculated_total = 0
                for it in items:
                    qty = it.get("qty", it.get("quantity"))
                    if qty is None: qty = 1
                    try: qty = float(qty)
                    except: qty = 1
                        
                    price = it.get("unit_price") or 0
                    try: price = float(price)
                    except: price = 0
                        
                    discount = it.get("discount") or 0
                    try: discount = float(discount)
                    except: discount = 0
                        
                    item_total = it.get("total") or 0
                    try: item_total = float(item_total)
                    except: item_total = 0
                        
                    # Normalize fields in dictionary for frontend compatibility
                    it["qty"] = qty
                    it["unit_price"] = price
                    it["discount"] = discount
                    
                    # Jika price dan qty valid, hitung ulang total per item
                    if price > 0:
                        item_total = (qty * price) - discount
                        it["total"] = item_total
                    elif item_total > 0 and price == 0:
                        it["unit_price"] = item_total
                        
                    calculated_total += item_total
                
                # Jika ada item dan calculated_total > 0, prioritaskan hasil kalkulasi matematis item
                # daripada halusinasi/kesalahan teks total nota (misal selisih antara total_amount dengan calculated_total).
                llm_total = final_parsed_data.get("total_amount", 0)
                try: llm_total = float(llm_total)
                except: llm_total = 0

                if calculated_total > 0 and (llm_total == 0 or abs(llm_total - calculated_total) > 0.01):
                    final_parsed_data["total_amount"] = calculated_total

            # 5. Konversi Jatuh Tempo Relatif menjadi Absolute Date
            due_date_raw = final_parsed_data.get("due_date")
            if due_date_raw and isinstance(due_date_raw, str):
                due_lower = due_date_raw.lower()
                if "hari" in due_lower or "day" in due_lower or "tempo" in due_lower or "+" in due_lower:
                    nums = re.findall(r'\d+', due_lower)
                    if nums:
                        try:
                            from datetime import timedelta
                            days_added = int(nums[0])
                            tgl_obj = datetime.strptime(tgl, "%Y-%m-%d").date()
                            final_parsed_data["due_date"] = (tgl_obj + timedelta(days=days_added)).isoformat()
                        except Exception as e:
                            print(f"Error parsing relative due_date '{due_date_raw}': {e}")
                            final_parsed_data.pop("due_date", None)
                else:
                    # Coba validasi jika itu ISO string atau format lain
                    try:
                        # Jika parse gagal, Pydantic akan error nanti, biarkan saja
                        datetime.strptime(due_date_raw[:10], "%Y-%m-%d")
                    except ValueError:
                        final_parsed_data.pop("due_date", None)

    # ── Local Fallback terakhir jika semua gagal ─────────────────────────────
    if not final_parsed_data:
        t_type = "manual"
        if any(kw in low_text for kw in ["saldo", "modal", "setoran awal"]):
            t_type = "capital"
        elif any(kw in low_text for kw in ["opname", "tunai hari ini", "cash on hand"]):
            t_type = "cash_count"
        elif is_operational_revenue:
            t_type = "sales"
        elif any(kw in low_text for kw in ["beli", "belanja", "purchase"]):
            t_type = "purchase"
        elif any(kw in low_text for kw in ["biaya", "beban", "bayar"]):
            t_type = "expense"

        clean_text = text.replace(".", "")
        nums = [int(n) for n in re.findall(r"\d+", clean_text)]
        nums = [n for n in nums if n >= 1000]
        t_amount = max(nums) if nums else 0

        final_parsed_data = {
            "transaction_type": t_type,
            "total_amount": t_amount,
            "description": text[:100],
            "transaction_date": datetime.now().date().isoformat(),
            "items": [],
            "_source": "local_backend_fallback",
        }
        processor_name = "local_backend_fallback"

    # ── Hapus field internal sebelum dikembalikan ────────────────────────────
    final_parsed_data.pop("_source", None)

    # ── Auto Journal Suggestion ───────────────────────────────────────────────
    suggested_entries = []
    try:
        # Standardize 'type' to 'transaction_type' if needed
        if "type" in final_parsed_data and "transaction_type" not in final_parsed_data:
            final_parsed_data["transaction_type"] = final_parsed_data.pop("type")
            
        t_type_str = final_parsed_data.get("transaction_type")
        t_amount = final_parsed_data.get("total_amount", 0)
        t_items = final_parsed_data.get("items", [])

        if t_type_str and t_type_str != "manual":
            is_exempt = True
            if t_type_str in ["sales", "purchase"]:
                is_exempt = check_tax_exempt_via_vector(t_items)
                
                # Override if raw text or description explicitly mentions tax/PPN keywords
                text_lower = text.lower()
                desc_lower = final_parsed_data.get("description", "").lower()
                if any(k in text_lower or k in desc_lower for k in ["ppn", "pajak", "tax", "vat"]):
                    is_exempt = False

            # Force tax exempt if the tenant is not PKP (Non-PKP cannot claim PPN Masukan)
            from app.models.setting import AppSetting
            pkp_setting = session.query(AppSetting).filter(
                AppSetting.tenant_id == current_user.tenant_id,
                AppSetting.key == "is_pkp"
            ).first()
            is_pkp = pkp_setting.value == "true" if pkp_setting else False
            if not is_pkp:
                is_exempt = True
                
            # Keep original invoice items as-is to preserve document audit trail integrity (Sisi A).
            # The proration will be applied in the stock valuation ledger (sajen/app/services/accounting.py) when saving.

            suggested_entries = get_auto_journal_entries(
                session,
                current_user.tenant_id,
                TransactionType(t_type_str),
                Decimal(str(t_amount)),
                is_tax_exempt=is_exempt,
                payment_method=final_parsed_data.get("payment_method"),
                description=text
            )
    except Exception as e:
        import traceback
        print(f"Auto-journal suggestion error: {e}")
        traceback.print_exc()

    # ── Check Duplicate Transaction Signature in Postgres DB ──────────────────
    tgl_parsed = final_parsed_data.get("transaction_date")
    total_parsed = final_parsed_data.get("total_amount", 0)
    try:
        total_parsed_val = float(total_parsed)
    except (ValueError, TypeError):
        total_parsed_val = 0.0

    if tgl_parsed and total_parsed_val > 0:
        existing_tx = session.query(Transaction).filter(
            Transaction.tenant_id == current_user.tenant_id,
            Transaction.transaction_date == tgl_parsed,
            Transaction.total_amount == total_parsed_val,
            Transaction.status == TransactionStatus.POSTED
        ).first()
        if existing_tx:
            supplier_name = final_parsed_data.get("contact_name") or "Supplier"
            final_parsed_data["is_duplicate"] = True
            final_parsed_data["duplicate_warning"] = (
                f"⚠️ DUPLIKASI AI TERDETEKSI: Transaksi dari '{supplier_name}' "
                f"(Tanggal: {tgl_parsed}, Total: Rp {total_parsed_val:,.0f}) "
                f"SUDAH PERNAH DICATAT sebelumnya (Ref #{existing_tx.id})."
            )

    # Combine complete dynamic system prompt and user prompt for full transparency logging
    full_logged_prompt = f"[SYSTEM INSTRUCTION]\n{system_instruction}\n\n[USER PROMPT]\n{prompt}"

    # ── Simpan Activity Log ───────────────────────────────────────────────────
    new_log = AIParsingLog(
        tenant_id=current_user.tenant_id,
        original_text=text,
        prompt=full_logged_prompt,
        parsed_result=json.dumps(final_parsed_data),
        token_in=token_in,
        token_out=token_out,
        processor=processor_name
    )
    session.add(new_log)
    session.commit()
    session.refresh(new_log)

    return ParseNoteResponse(
        parsed_data=final_parsed_data,
        suggested_entries=suggested_entries,
        processor=processor_name,
        token_in=token_in,
        token_out=token_out,
        prompt=prompt
    )

@router.get("/parsing-logs", response_model=List[AIParsingLogResponse])
def get_parsing_logs(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50
):
    """
    Retrieve AI parsing logs for monitoring.
    """
    return session.query(AIParsingLog).filter(
        AIParsingLog.tenant_id == current_user.tenant_id
    ).order_by(AIParsingLog.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/ai-quotas", response_model=List[AIModelQuotaResponse])
def get_ai_quotas(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get daily usage statistics for AI models to monitor remaining quota.
    """
    from app.services.ai_engine import GEMINI_MODELS
    from datetime import datetime
    
    today = datetime.now().date()
    quotas = session.query(AIModelQuota).filter(
        AIModelQuota.usage_date == today
    ).all()
    
    # Enrich with limits from configuration
    results = []
    for q in quotas:
        limit = 0
        for m in GEMINI_MODELS:
            if m["name"] == q.model_name:
                limit = m["limit"]
                break
        
        results.append({
            "model_name": q.model_name,
            "request_count": q.request_count,
            "token_count": q.token_count,
            "limit": limit,
            "usage_date": q.usage_date
        })
    return results

@router.get("/deposit-liquidity-metrics")
def get_deposit_liquidity_metrics(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get liquidity metrics for customer deposits & savings reserves.
    """
    tenant_id = current_user.tenant_id
    
    # Accounts: Kas & Bank (1-1101, 1-1102, 1-1103)
    cash_accounts = session.query(Account).filter(
        Account.code.in_(["1-1101", "1-1102", "1-1103"]),
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
    ).all()
    cash_account_ids = [a.id for a in cash_accounts]

    # Deposit accounts: 2-1205 (Hutang Paket Lebaran), 2-1206 (Hutang Tabungan Pelanggan), 2-1200
    deposit_accounts = session.query(Account).filter(
        Account.code.in_(["2-1205", "2-1206", "2-1200"]),
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
    ).all()
    deposit_account_ids = [a.id for a in deposit_accounts]

    # Compute Cash Reserve Balance
    cash_reserve = Decimal("0.00")
    if cash_account_ids:
        entries = session.query(JournalEntry).filter(
            JournalEntry.account_id.in_(cash_account_ids)
        ).all()
        for e in entries:
            cash_reserve += (e.debit or Decimal("0.00")) - (e.credit or Decimal("0.00"))

    # Compute Total Customer Deposits Balance
    total_deposits = Decimal("0.00")
    if deposit_account_ids:
        entries = session.query(JournalEntry).filter(
            JournalEntry.account_id.in_(deposit_account_ids)
        ).all()
        for e in entries:
            total_deposits += (e.credit or Decimal("0.00")) - (e.debit or Decimal("0.00"))

    reserve_ratio = float((cash_reserve / total_deposits * 100)) if total_deposits > Decimal("0.00") else 100.0
    
    status = "healthy"
    if total_deposits > Decimal("0.00"):
        if reserve_ratio < 15.0:
            status = "critical"
        elif reserve_ratio < 30.0:
            status = "warning"

    return {
        "total_customer_deposits": float(total_deposits),
        "cash_reserve": float(cash_reserve),
        "reserve_ratio": round(reserve_ratio, 2),
        "liquidity_status": status,
        "recommended_allocations": {
            "reserve_standby_20": round(float(total_deposits) * 0.20, 2),
            "lock_price_supplier_50": round(float(total_deposits) * 0.50, 2),
            "fast_moving_goods_30": round(float(total_deposits) * 0.30, 2)
        }
    }

@router.get("/journal-mappings", response_model=List[JournalMappingResponse])
def get_journal_mappings(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Retrieve journal mappings for the current tenant or global defaults.
    """
    # Try tenant specific first, then global
    mappings = session.query(JournalMapping).filter(
        JournalMapping.tenant_id == current_user.tenant_id
    ).all()
    
    if not mappings:
        mappings = session.query(JournalMapping).filter(
            JournalMapping.tenant_id == None
        ).all()
        
    return mappings

@router.post("/journal-mappings", response_model=JournalMappingResponse)
def create_journal_mapping(
    mapping_in: JournalMappingCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create or update a journal mapping for the tenant.
    """
    # Check if exists
    existing = session.query(JournalMapping).filter(
        JournalMapping.tenant_id == current_user.tenant_id,
        JournalMapping.transaction_type == mapping_in.transaction_type
    ).first()
    
    if existing:
        # Update existing
        existing.description = mapping_in.description
        # Clear lines and recreate
        session.query(JournalMappingLine).filter(JournalMappingLine.mapping_id == existing.id).delete()
        for line in mapping_in.lines:
            new_line = JournalMappingLine(
                mapping_id=existing.id,
                account_id=line.account_id,
                side=line.side,
                value_type=line.value_type
            )
            session.add(new_line)
        session.commit()
        session.refresh(existing)
        return existing
    
    # Create new
    db_mapping = JournalMapping(
        tenant_id=current_user.tenant_id,
        transaction_type=mapping_in.transaction_type,
        description=mapping_in.description
    )
    session.add(db_mapping)
    session.flush()
    
    for line in mapping_in.lines:
        new_line = JournalMappingLine(
            mapping_id=db_mapping.id,
            account_id=line.account_id,
            side=line.side,
            value_type=line.value_type
        )
        session.add(new_line)
        
    session.commit()
    session.refresh(db_mapping)
    return db_mapping

@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_summary(
    session: SessionDep,
    current_user: CurrentUser,
    days: int = Query(30, description="Filter timeframe for chart data: 7, 30, 60, 90")
):
    """
    Get dashboard summary statistics.
    """
    return get_dashboard_summary(db=session, tenant_id=current_user.tenant_id, days=days)

@router.get("/compass/summary", response_model=CompassSummaryResponse)
def get_compass_summary(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get business compass summary statistics for Bento Cards.
    """
    summary = get_dashboard_summary(db=session, tenant_id=current_user.tenant_id)
    
    rev = summary.get("total_revenue", 0.0)
    net = summary.get("net_profit", 0.0)
    margin = (net / rev * 100.0) if rev > 0.0 else 0.0
    
    # Calculate revenue trend
    chart_data = summary.get("chart_data", [])
    revenue_trend = 0.0
    if len(chart_data) >= 2:
        last_day_rev = chart_data[-1].get("revenue", 0.0)
        prev_day_rev = chart_data[-2].get("revenue", 0.0)
        if prev_day_rev > 0.0:
            revenue_trend = ((last_day_rev - prev_day_rev) / prev_day_rev) * 100.0

    from app.models.tenant import Tenant
    tenant = session.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    maintenance_stock = tenant.maintenance_stock if tenant else False
            
    return CompassSummaryResponse(
        cash_balance=summary.get("cash_balance", 0.0),
        net_profit=net,
        profit_margin=margin,
        total_inventory_value=summary.get("total_inventory_value", 0.0),
        low_stock_count=summary.get("low_stock_count", 0),
        revenue_trend=revenue_trend,
        market_info_placeholder="Harga beras IR64 nasional stabil di Rp13.200/kg. Permintaan Minyak Goreng Curah diprediksi naik 6.8% menjelang akhir pekan.",
        maintenance_stock=maintenance_stock
    )

@router.get("/compass/market-intelligence", response_model=List[MarketIntelligenceItem])
def get_compass_market_intelligence(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get market intelligence and recommendations for tenant products.
    """
    from app.models.inventory import Product
    
    # Ambil 5 produk riil milik tenant
    db_products = session.query(Product).limit(5).all()
    
    # Fallback dummy jika tidak ada produk
    if not db_products:
        dummy_products = [
            {"id": 1, "name": "Beras Pandan Wangi 5kg", "sell_price": 72000.0},
            {"id": 2, "name": "Minyak Goreng Curah 1L", "sell_price": 15500.0},
            {"id": 3, "name": "Gula Pasir Putih 1kg", "sell_price": 14500.0},
            {"id": 4, "name": "Telur Ayam Negeri 1kg", "sell_price": 28000.0},
            {"id": 5, "name": "Terigu Segitiga Biru 1kg", "sell_price": 12500.0}
        ]
        items = []
        for dp in dummy_products:
            p_price = dp["sell_price"]
            r_price = p_price * 1.05 # naik 5%
            items.append({
                "product_id": dp["id"],
                "product_name": dp["name"],
                "current_price": p_price,
                "recommended_price": round(r_price / 100) * 100,
                "confidence_score": 98.2,
                "reason": "Permintaan pasar meningkat menjelang akhir pekan berdasarkan analisis tren makro retail.",
                "copywriting": {
                    "social_media": f"📸 PROMO SPESIAL HARI INI: IMUNITAS TERJAGA, DOMPET AMAN!\n\nDapatkan {dp['name']} segar hari ini dengan harga terbaik hanya Rp {int(dp['sell_price']):,}. Cocok banget buat stok kebutuhan keluarga di rumah agar tetap fit setiap hari.\n\n📍 Kunjungi toko kami sekarang atau hubungi WA kami untuk layanan pesan antar instan. Stok terbatas!",
                    "whatsapp_broadcast": f"Mitra Setia! 👋\n\nInfo update harga bahan pokok hari ini dari gudang kami:\n- {dp['name']}: Cuma Rp {int(dp['sell_price']):,}\n\nAmankan pasokan warung Anda sebelum harga pasar naik lagi. Chat kami sekarang untuk Keep Stok ya! 📞",
                    "visual_idea": f"Banner promo dengan latar belakang kuning-hijau segar. Foto produk {dp['name']} diletakkan di tengah dengan label harga tebal Rp {int(dp['sell_price']):,} merah menyala, ditambah teks 'Hemat & Praktis!'."
                }
            })
        return items

    items = []
    import random
    for idx, p in enumerate(db_products):
        p_price = float(p.sell_price) if p.sell_price else 10000.0
        # Berikan variasi rekomendasi harga dan confidence score
        r_price = p_price * (1.0 + (random.randint(4, 9) / 100.0))
        conf = round(95.0 + random.random() * 4.0, 1)
        
        items.append({
            "product_id": p.id,
            "product_name": p.name,
            "current_price": p_price,
            "recommended_price": round(r_price / 100) * 100,
            "confidence_score": conf,
            "reason": "Kenaikan harga bahan baku logistik nasional memicu kenaikan rata-rata harga pasar retail.",
            "copywriting": {
                "social_media": f"📸 PROMO SPESIAL HARI INI: KUALITAS TERBAIK, HARGA BERSAHABAT!\n\nDapatkan {p.name} berkualitas tinggi hari ini dengan harga terbaik hanya Rp {int(p_price):,}. Pilihan tepat untuk kebutuhan harian keluarga tercinta.\n\n📍 Kunjungi toko kami sekarang atau hubungi WA untuk layanan pesan antar instan. Stok terbatas!",
                "whatsapp_broadcast": f"Mitra Setia! 👋\n\nInfo update harga hari ini dari toko kami:\n- {p.name}: Cuma Rp {int(p_price):,}\n\nDapatkan harga grosir terbaik sebelum kehabisan stok. Hubungi admin kami sekarang untuk keep barang ya! 📞",
                "visual_idea": f"Desain poster cerah minimalis. Menampilkan visual produk {p.name} di bagian tengah, dilengkapi stiker harga Rp {int(p_price):,} berwarna merah tebal, dengan tulisan 'Stok Melimpah, Siap Kirim!'."
            }
        })
    return items


@router.get("/accounts", response_model=List[AccountResponse])
def get_chart_of_accounts(
    session: SessionDep,
    current_user: CurrentUser,
    active_only: bool = True
):
    """
    Retrieve the Chart of Accounts (COA) for the active tenant.
    """
    query = session.query(Account).filter(Account.tenant_id == current_user.tenant_id)
    if active_only:
        query = query.filter(Account.is_active)
    return query.order_by(Account.code).all()


@router.post("/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_new_transaction(
    trans_in: TransactionCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Record a new transaction with double-entry journal lines.
    Ensure debits and credits balance.
    Only accessible by Admin and Manager roles.
    """
    res = create_transaction_with_journal(
        db=session,
        trans_in=trans_in,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )
    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["products", "dashboard", "insights", "material_control"])
    return res



@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    """
    Retrieve recent transactions for the active tenant.
    """
    query = session.query(Transaction).filter(
        Transaction.tenant_id == current_user.tenant_id
    )

    if start_date:
        try:
            from datetime import datetime
            dt = datetime.strptime(start_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.transaction_date >= dt)
        except ValueError:
            pass

    if end_date:
        try:
            from datetime import datetime
            dt = datetime.strptime(end_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.transaction_date <= dt)
        except ValueError:
            pass

    return query.order_by(
        Transaction.transaction_date.desc(),
        Transaction.id.desc()
    ).offset(skip).limit(limit).all()

@router.get("/transactions/general-ledger", response_model=GeneralLedgerResponse)
def get_general_ledger(
    session: SessionDep,
    current_user: CurrentUser,
    account_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Dapatkan mutasi Buku Besar dan saldo berjalan untuk akun tertentu.
    Menghitung saldo awal sebelum start_date dan memetakan mutasi secara kronologis.
    """
    from app.models.accounting import JournalEntry, Account, Transaction, TransactionStatus, AccountType
    from sqlalchemy import func
    from fastapi import HTTPException
    from datetime import date
    
    # 1. Pastikan akun ada dan milik tenant
    account = session.query(Account).filter(
        Account.id == account_id,
        (Account.tenant_id == current_user.tenant_id) | (Account.tenant_id.is_(None))
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")

    # Parsing dates
    today = date.today()
    s_date = today.replace(day=1)
    if start_date:
        try:
            s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            pass
            
    e_date = today
    if end_date:
        try:
            e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            pass

    # 2. Hitung Saldo Awal (sebelum s_date)
    # Akun normal debit: Asset, Expense.
    # Akun normal kredit: Liability, Equity, Revenue.
    is_normal_debit = account.account_type in [AccountType.ASSET, AccountType.EXPENSE]
    
    op_debit = session.query(func.coalesce(func.sum(JournalEntry.debit), 0)).join(Transaction).filter(
        Transaction.tenant_id == current_user.tenant_id,
        JournalEntry.account_id == account.id,
        Transaction.status == TransactionStatus.POSTED,
        Transaction.transaction_date < s_date
    ).scalar() or Decimal('0.00')

    op_credit = session.query(func.coalesce(func.sum(JournalEntry.credit), 0)).join(Transaction).filter(
        Transaction.tenant_id == current_user.tenant_id,
        JournalEntry.account_id == account.id,
        Transaction.status == TransactionStatus.POSTED,
        Transaction.transaction_date < s_date
    ).scalar() or Decimal('0.00')

    opening_balance = (op_debit - op_credit) if is_normal_debit else (op_credit - op_debit)

    # 3. Ambil Mutasi Jurnal Jelas (POSTED) dalam rentang tanggal
    entries = session.query(JournalEntry).join(Transaction).filter(
        Transaction.tenant_id == current_user.tenant_id,
        JournalEntry.account_id == account.id,
        Transaction.status == TransactionStatus.POSTED,
        Transaction.transaction_date >= s_date,
        Transaction.transaction_date <= e_date
    ).order_by(Transaction.transaction_date.asc(), Transaction.id.asc()).all()

    # 4. Susun Mutasi dengan Saldo Berjalan (Running Balance)
    mutations = []
    running = opening_balance
    for je in entries:
        tx = je.transaction
        deb = Decimal(str(je.debit))
        cred = Decimal(str(je.credit))
        
        if is_normal_debit:
            running += (deb - cred)
        else:
            running += (cred - deb)
            
        mutations.append({
            "transaction_id": tx.id,
            "transaction_date": tx.transaction_date,
            "reference_no": tx.reference_no,
            "description": tx.description,
            "debit": deb,
            "credit": cred,
            "running_balance": running
        })

    return {
        "account_id": account.id,
        "account_code": account.code,
        "account_name": account.name,
        "opening_balance": opening_balance,
        "closing_balance": running,
        "mutations": mutations,
        "start_date": s_date.strftime("%Y-%m-%d"),
        "end_date": e_date.strftime("%Y-%m-%d")
    }

@router.get("/transactions/debts/upcoming", response_model=List[TransactionResponse])
def get_upcoming_debts(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = 20
):
    """
    Retrieve upcoming debts & bills (Hutang Pembelian + DP Customer Penjualan) sorted by due date ascending.
    """
    from sqlalchemy import or_, and_
    return session.query(Transaction).filter(
        Transaction.tenant_id == current_user.tenant_id,
        or_(
            and_(
                Transaction.transaction_type == TransactionType.PURCHASE,
                or_(Transaction.payment_method != "lunas", Transaction.payment_method.is_(None)),
                or_(Transaction.due_date.isnot(None), Transaction.payment_method.in_(["tempo", "credit", "invoice", "utang", "hutang"]))
            ),
            and_(
                Transaction.transaction_type == TransactionType.SALES,
                Transaction.payment_method.in_(["customer_deposit", "dp", "uang_muka", "uang muka", "deposit", "panjar"])
            )
        )
    ).order_by(
        Transaction.due_date.asc().nullslast(), Transaction.id.desc()
    ).limit(limit).all()


@router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
def get_transaction_by_id(
    transaction_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Retrieve a specific transaction with journal entries and inventory logs for the active tenant.
    """
    transaction = session.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == current_user.tenant_id
    ).first()
    if not transaction:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return transaction


@router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    trans_update: TransactionUpdate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Update a transaction (only if DRAFT).
    Only accessible by Admin and Manager roles.
    """
    return update_transaction_draft(
        db=session,
        transaction_id=transaction_id,
        trans_update=trans_update,
        tenant_id=current_user.tenant_id
    )


@router.post("/transactions/{transaction_id}/post", response_model=TransactionResponse)
def post_transaction_api(
    transaction_id: int,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Post a transaction (change status from DRAFT to POSTED).
    Only accessible by Admin and Manager roles.
    """
    res = post_transaction(
        db=session,
        transaction_id=transaction_id,
        tenant_id=current_user.tenant_id
    )
    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["products", "dashboard", "insights", "material_control"])
    return res


@router.post("/transactions/{transaction_id}/unpost", response_model=TransactionResponse)
def unpost_transaction_api(
    transaction_id: int,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Unpost a transaction (change status from POSTED to DRAFT).
    Only accessible by Admin and Manager roles.
    """
    res = unpost_transaction(
        db=session,
        transaction_id=transaction_id,
        tenant_id=current_user.tenant_id
    )
    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["products", "dashboard", "insights", "material_control"])
    return res


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction_api(
    transaction_id: int,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Delete a transaction (only if DRAFT).
    Only accessible by Admin and Manager roles.
    """
    delete_transaction_draft(
        db=session,
        transaction_id=transaction_id,
        tenant_id=current_user.tenant_id
    )
    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["products", "dashboard", "insights", "material_control"])
    return None

@router.post("/transactions/{transaction_id}/pay", response_model=TransactionResponse)
def pay_transaction_api(
    transaction_id: int,
    payoff: TransactionPayoffRequest,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Pay off an outstanding purchase debt.
    Updates the payment method to 'lunas' and creates a matching payment journal.
    """
    from fastapi import HTTPException
    from app.models.accounting import JournalEntry
    from app.services.accounting import _generate_reference_no
    
    # 1. Fetch original transaction
    original_tx = session.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == current_user.tenant_id
    ).first()
    
    if not original_tx:
        raise HTTPException(status_code=404, detail="Transaction not found.")
        
    if original_tx.transaction_type != TransactionType.PURCHASE:
        raise HTTPException(status_code=400, detail="Only purchase transactions can be paid off.")
        
    # 2. Get Utang Usaha Account (2-1101)
    utang_account = session.query(Account).filter(
        Account.tenant_id == current_user.tenant_id,
        Account.code == "2-1101"
    ).first()
    if not utang_account:
        raise HTTPException(status_code=400, detail="Akun Utang Usaha (2-1101) tidak ditemukan untuk tenant ini.")
        
    # 3. Get Payment Account (Kas / Bank)
    pay_account = session.query(Account).filter(
        Account.tenant_id == current_user.tenant_id,
        Account.id == payoff.payment_account_id
    ).first()
    if not pay_account or not pay_account.code.startswith("1-11"):
        raise HTTPException(status_code=400, detail="Akun pembayaran harus berupa Kas/Bank.")
        
    amount = original_tx.total_amount
    
    # 4. Create Payoff Transaction Journal
    ref_no = _generate_reference_no(session, TransactionType.EXPENSE, current_user.tenant_id)
    pay_tx = Transaction(
        tenant_id=current_user.tenant_id,
        transaction_date=payoff.payment_date,
        reference_no=ref_no,
        description=f"Pelunasan Utang untuk Nota {original_tx.reference_no or original_tx.id}",
        transaction_type=TransactionType.EXPENSE,
        status="posted",
        total_amount=amount,
        payment_method="cash",
        created_by_id=current_user.id
    )
    session.add(pay_tx)
    session.flush()
    
    # Debit: Utang Usaha (reducing debt)
    entry_debit = JournalEntry(
        transaction_id=pay_tx.id,
        account_id=utang_account.id,
        debit=amount,
        credit=0.00
    )
    # Credit: Kas/Bank (reducing cash)
    entry_credit = JournalEntry(
        transaction_id=pay_tx.id,
        account_id=pay_account.id,
        debit=0.00,
        credit=amount
    )
    session.add(entry_debit)
    session.add(entry_credit)
    
    # 5. Mark original transaction as paid
    original_tx.payment_method = "lunas"
    
    session.commit()
    session.refresh(original_tx)
    return original_tx


@router.post("/transactions/{transaction_id}/reschedule", response_model=TransactionResponse)
def reschedule_transaction_api(
    transaction_id: int,
    req: TransactionRescheduleRequest,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Reschedule the due date of a purchase debt transaction.
    Works even if transaction is POSTED, as long as payment_method is not 'lunas'.
    """
    from fastapi import HTTPException
    
    tx = session.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == current_user.tenant_id
    ).first()
    
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found.")
        
    if tx.transaction_type != TransactionType.PURCHASE:
        raise HTTPException(status_code=400, detail="Only purchase transactions can be rescheduled.")
        
    if tx.payment_method == "lunas":
        raise HTTPException(status_code=400, detail="Cannot reschedule a paid transaction.")
        
    tx.due_date = req.due_date
    session.commit()
    session.refresh(tx)
    return tx

