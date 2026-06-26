from fastapi import APIRouter, Depends, status
from typing import List
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
    JournalMappingResponse
)
from app.models.accounting import Account, Transaction, TransactionType, JournalMapping, JournalMappingLine
from app.models.log import AIParsingLog, AIModelQuota, ParserType
from app.models.ocr import AILearningTemplate, OCRTask, OCRStatus
from app.services.accounting import (
    create_transaction_with_journal, 
    update_transaction_draft, 
    post_transaction,
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
def parse_transaction_note(
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

    # ── Pra-pemrosesan: Normalisasi pemisah ribuan ───────────────────────────
    normalized_text = re.sub(r'(\d)\.(\d{3})(\b|\s)', r'\1\2\3', text)
    normalized_text = re.sub(r'(\d)\.(\d{3})(\b|\s)', r'\1\2\3', normalized_text)

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

    if rule_result:
        # ✅ Langsung selesai tanpa LLM!
        final_parsed_data = rule_result
        processor_name = "rule_based"
        print(f"[PARSE] Rule-based HIT: {text[:60]}")

    else:
        # ────────────────────────────────────────────────────────────────────
        # LEVEL 2 & 3: RAG Context + LLM (hanya jika rule-based gagal)
        # ────────────────────────────────────────────────────────────────────

        # Bangun RAG context (tidak lagi mengandung COA)
        rag_context = get_rag_context(session, current_user.tenant_id, normalized_text)

        # COA: Ambil dari cache Redis, inject ke prompt HANYA jika diperlukan
        coa_section = ""
        if needs_coa_in_prompt(normalized_text):
            coa_str = get_coa_string(session, current_user.tenant_id)
            if coa_str:
                coa_section = f"\n--- DAFTAR AKUN (COA) ---\n{coa_str}\n"

        # Bangun prompt minimal (bukan prompt raksasa dengan semua konteks)
        system_instruction, prompt = build_minimal_prompt(
            normalized_text, today_date, coa_section
        )

        # Gabungkan RAG context ke prompt jika ada
        if rag_context.strip():
            prompt = rag_context.strip() + "\n\n" + prompt

        # Panggil AI (Level 2: Redis Cache di dalam call_ai_text, Level 3: LLM)
        res = call_ai_text(session, prompt, system_instruction=system_instruction, temperature=0.0)
        final_parsed_data = res["parsed_data"]
        processor_name = res.get("processor", "unknown")
        token_in = res.get("token_in", 0)
        token_out = res.get("token_out", 0)

        # ── Post-processing: Override & Sanity Check ─────────────────────────
        if final_parsed_data:
            # Force 'sales' jika heuristik mendeteksi pendapatan operasional
            if is_operational_revenue and final_parsed_data.get("transaction_type") == "income":
                final_parsed_data["transaction_type"] = "sales"

            # Bersihkan halusinasi untuk input ringkasan
            if len(normalized_text.split()) < 6 and is_operational_revenue:
                items = final_parsed_data.get("items", [])
                if len(items) == 1 and items[0].get("total") == final_parsed_data.get("total_amount"):
                    item_name = str(items[0].get("name", "")).lower()
                    if item_name not in low_text:
                        final_parsed_data["items"] = []

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
        t_type_str = final_parsed_data.get("transaction_type")
        t_amount = final_parsed_data.get("total_amount", 0)
        t_items = final_parsed_data.get("items", [])

        if t_type_str and t_type_str != "manual":
            is_exempt = True
            if t_type_str in ["sales", "purchase"]:
                is_exempt = check_tax_exempt_via_vector(t_items)

            suggested_entries = get_auto_journal_entries(
                session,
                current_user.tenant_id,
                TransactionType(t_type_str),
                Decimal(str(t_amount)),
                is_tax_exempt=is_exempt
            )
    except Exception as e:
        print(f"Auto-journal suggestion error: {e}")

    # ── Simpan Activity Log ───────────────────────────────────────────────────
    new_log = AIParsingLog(
        tenant_id=current_user.tenant_id,
        original_text=text,
        prompt=prompt,
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
    current_user: CurrentUser
):
    """
    Get dashboard summary statistics.
    """
    return get_dashboard_summary(db=session, tenant_id=current_user.tenant_id)

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
    return create_transaction_with_journal(
        db=session,
        trans_in=trans_in,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )



@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50
):
    """
    Retrieve recent transactions for the active tenant.
    """
    return session.query(Transaction).filter(
        Transaction.tenant_id == current_user.tenant_id
    ).order_by(
        Transaction.transaction_date.desc(),
        Transaction.id.desc()
    ).offset(skip).limit(limit).all()


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
    return post_transaction(
        db=session,
        transaction_id=transaction_id,
        tenant_id=current_user.tenant_id
    )


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
    return None
