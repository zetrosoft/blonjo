import re
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from fastapi import HTTPException, status
from app.models.accounting import Account, Transaction, JournalEntry, TransactionType, TransactionStatus, AccountType
from app.schemas.accounting import TransactionCreate
from datetime import datetime, date
from decimal import Decimal
from app.models.accounting import JournalMapping, JournalMappingLine
from app.core import context

def check_tax_exempt_via_vector(items: list) -> bool:
    """
    Check if the transaction items are tax-exempt (bebas pajak PPN).
    Uses a hybrid approach: keyword matching first for high accuracy on common Indonesian terms,
    then falls back to vector similarity (Ollama nomic-embed-text) if ambiguous.
    """
    if not items:
        # Jika tanpa detail items anggap bebas pajak PPN
        return True
        
    item_text = " ".join([i.get("name", "") for i in items]).lower()
    if not item_text.strip():
        return True

    # If any item explicitly mentions tax/PPN, it is taxable
    if any(k in item_text for k in ["ppn", "pajak", "tax", "vat"]):
        return False

    # 1. Keyword Matching (Highly accurate for known local items)
    exempt_keywords = ["beras", "gula", "minyak", "sembako", "sayur", "telur", "daging", "garam", "buah", "susu"]
    taxable_keywords = ["elektronik", "hp", "handphone", "komputer", "laptop", "jasa", "service", "pakaian", "baju", "sepatu", "mewah", "tv", "kulkas", "motor", "mobil"]
    
    if any(kw in item_text for kw in exempt_keywords):
        return True
    if any(kw in item_text for kw in taxable_keywords):
        return False

    # 2. Vector Similarity Fallback (for unknown items)
    try:
        from app.services.ai_engine import get_embedding
        import numpy as np
        
        item_vec = get_embedding(item_text)
        if not item_vec:
            return True # Fallback ke bebas pajak jika AI offline
            
        sembako_vec = get_embedding("basic food necessities rice sugar cooking oil meat vegetables tax exempt")
        pajak_vec = get_embedding("electronic devices luxury goods clothing services taxable items")
        
        if not sembako_vec or not pajak_vec:
            return True
            
        def cosine_sim(a, b):
            a_norm = np.linalg.norm(a)
            b_norm = np.linalg.norm(b)
            if a_norm == 0 or b_norm == 0: return 0.0
            return np.dot(a, b) / (a_norm * b_norm)
            
        sim_sembako = cosine_sim(item_vec, sembako_vec)
        sim_pajak = cosine_sim(item_vec, pajak_vec)
        
        return sim_sembako >= sim_pajak
    except Exception as e:
        print(f"Error checking tax exemption: {e}")
        return True # Safe fallback

def get_auto_journal_entries(db: Session, tenant_id: int | None, trans_type: TransactionType, amount: Decimal, is_tax_exempt: bool = True, payment_method: str | None = None, description: str | None = None) -> list[dict]:
    """
    Generate dynamic journal entries based on JournalMapping master data.
    Supports multi-pair (compound) entries and specialized logic for CASH_COUNT.
    """
    from app.models.accounting import JournalEntry, Account

    # 1. Standard Handling: Try to get from Master Data first (Multi-pair)
    t_id = tenant_id or context.get_tenant_context()

    # 0. SPECIAL HANDLING: Customer Deposit (DP Penjualan)
    is_dp_customer = (
        trans_type == TransactionType.SALES
        and (
            (payment_method and payment_method.lower() in ["customer_deposit", "dp", "uang_muka", "uang muka", "deposit", "panjar"])
            or bool(re.search(r'\b(dp|down\s*payment|uang\s*muka|panjar)\b', (description or "").lower()))
        )
    )
    if is_dp_customer:
        # 1. Cari atau buat akun 2-1402 (Uang Muka Penjualan)
        dp_acc = db.query(Account).filter(
            Account.code == "2-1402",
            or_(Account.tenant_id == t_id, Account.tenant_id == None)
        ).first()
        if not dp_acc:
            dp_acc = Account(
                tenant_id=t_id,
                code="2-1402",
                name="Uang Muka Penjualan",
                account_type=AccountType.LIABILITY
            )
            db.add(dp_acc)
            db.flush()

        # 2. Cari akun Kas (1-1101) atau Bank (1-1102)
        desc_lower = (description or payment_method or "").lower()
        is_non_cash = (
            (payment_method and payment_method.lower() in ["non_cash", "non tunai", "transfer", "bank", "qris", "gopay", "ovo", "dana"])
            or any(kw in desc_lower for kw in ["qris", "qr", "transfer", "tf bank", "via bank", "non tunai"])
        )
        debit_code = "1-1102" if is_non_cash else "1-1101"
        cash_acc = db.query(Account).filter(
            Account.code == debit_code,
            or_(Account.tenant_id == t_id, Account.tenant_id == None)
        ).first()
        if not cash_acc:
            cash_acc = db.query(Account).filter(
                Account.code == "1-1101",
                or_(Account.tenant_id == t_id, Account.tenant_id == None)
            ).first()

        if dp_acc and cash_acc:
            return [
                {
                    "account_id": cash_acc.id,
                    "account": {"id": cash_acc.id, "code": cash_acc.code, "name": cash_acc.name},
                    "debit": amount,
                    "credit": Decimal('0.00')
                },
                {
                    "account_id": dp_acc.id,
                    "account": {"id": dp_acc.id, "code": dp_acc.code, "name": dp_acc.name},
                    "debit": Decimal('0.00'),
                    "credit": amount
                }
            ]

    # 0a. SPECIAL HANDLING: CASH_COUNT (Rekonsiliasi Kas Dinamis)
    if trans_type == TransactionType.CASH_COUNT:
        system_cash = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(
            Account, Account.id == JournalEntry.account_id
        ).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == t_id,
            Transaction.status == TransactionStatus.POSTED,
            or_(Account.code.startswith("1-10"), Account.code.startswith("1-11"))
        ).scalar() or Decimal('0.00')
        
        diff = amount - system_cash
        if diff == 0: return []
        
        is_surplus = diff > 0
        abs_diff = abs(diff)
        
        cash_acc = db.query(Account).filter(
            Account.code.in_(["1-1000", "1-1100", "1-1101"]),
            or_(Account.tenant_id == t_id, Account.tenant_id == None)
        ).order_by(Account.tenant_id.desc(), Account.code).first()
        
        if is_surplus:
            adj_acc = db.query(Account).filter(
                Account.code.in_(["4-9000", "4-2101", "4-2000"]),
                or_(Account.tenant_id == t_id, Account.tenant_id == None)
            ).order_by(Account.tenant_id.desc()).first()
        else:
            adj_acc = db.query(Account).filter(
                Account.code.in_(["3-1401", "3-1201", "6-1901", "6-9000"]),
                or_(Account.tenant_id == t_id, Account.tenant_id == None)
            ).order_by(Account.tenant_id.desc()).first()
            
        if cash_acc and adj_acc:
            return [
                {
                    "account_id": cash_acc.id,
                    "account": {"id": cash_acc.id, "code": cash_acc.code, "name": cash_acc.name},
                    "debit": abs_diff if is_surplus else Decimal('0.00'),
                    "credit": Decimal('0.00') if is_surplus else abs_diff
                },
                {
                    "account_id": adj_acc.id,
                    "account": {"id": adj_acc.id, "code": adj_acc.code, "name": adj_acc.name},
                    "debit": Decimal('0.00') if is_surplus else abs_diff,
                    "credit": abs_diff if is_surplus else Decimal('0.00')
                }
            ]





    mapping = db.query(JournalMapping).filter(
        JournalMapping.tenant_id == t_id,
        JournalMapping.transaction_type == trans_type,
        JournalMapping.is_active == True
    ).first()
    
    # Fallback to Global Mapping if Tenant hasn't customized it
    if not mapping:
        mapping = db.query(JournalMapping).filter(
            JournalMapping.tenant_id == None,
            JournalMapping.transaction_type == trans_type,
            JournalMapping.is_active == True
        ).first()
        
    if mapping and mapping.lines:
        entries = []
        
        # Precompute tax_val
        tax_val = Decimal('0.00')
        if not is_tax_exempt:
            # Asumsi PPN 11% sudah termasuk dalam harga (include tax)
            # Pajak = Total * (11/111)
            tax_val = (amount * Decimal('11') / Decimal('111')).quantize(Decimal('0.00'))
            
        # Determine which side has the tax line
        tax_sides = [line.side for line in mapping.lines if line.value_type == "tax_amount"]
        tax_side = tax_sides[0] if tax_sides else None
        
        # Count total_amount lines on the tax side
        total_lines_on_tax_side = [line for line in mapping.lines if line.side == tax_side and line.value_type == "total_amount"]

        for line in mapping.lines:
            # Fetch full account details for UI enrichment (Bab 10.1 ARCHITECTURE.md)
            account = db.query(Account).filter(Account.id == line.account_id).first()
            
            # Handle different value types from mapping
            if line.value_type == "total_amount":
                # Deduct tax_val from the first total_amount line on the tax side to balance the journal
                if tax_side and line.side == tax_side and line in total_lines_on_tax_side:
                    if line == total_lines_on_tax_side[0]:
                        val = amount - tax_val
                    else:
                        val = amount
                else:
                    val = amount
            elif line.value_type == "cogs_amount":
                # Get HPP Rate from settings (default 85% if no real cost known)
                from app.models.setting import AppSetting
                rate_setting = db.query(AppSetting).filter(AppSetting.tenant_id == t_id, AppSetting.key == "default_cogs_rate").first()
                cogs_rate = Decimal(rate_setting.value) / 100 if rate_setting else Decimal('0.85')
                val = (amount * cogs_rate).quantize(Decimal('0.00'))
            elif line.value_type == "tax_amount":
                val = tax_val
            else:
                val = Decimal('0.00')
                
            # Intercept Cash/Bank jika dideteksi tempo/non-tunai
            target_account_id = line.account_id
            target_account = account
            
            # 1. Redirect Tempo / Kredit / Hutang
            if payment_method and payment_method.lower() in ["hutang", "tempo", "kredit"]:
                if account and (account.code.startswith("1-11") or account.code.startswith("1-10")):
                    if trans_type == TransactionType.PURCHASE and line.side == "credit":
                        # Redirect to Hutang Dagang (2-1101)
                        hutang_acc = db.query(Account).filter(
                            Account.code == "2-1101", 
                            or_(Account.tenant_id == t_id, Account.tenant_id == None)
                        ).first()
                        if hutang_acc:
                            target_account_id = hutang_acc.id
                            target_account = hutang_acc
                    elif trans_type == TransactionType.SALES and line.side == "debit":
                        # Redirect to Piutang Usaha (1-1201)
                        piutang_acc = db.query(Account).filter(
                            Account.code == "1-1201", 
                            or_(Account.tenant_id == t_id, Account.tenant_id == None)
                        ).first()
                        if piutang_acc:
                            target_account_id = piutang_acc.id
                            target_account = piutang_acc
            
            # 1b. Redirect Customer Deposit (Uang Muka Penjualan) -> Akun 2-1402 / 2-1101
            is_dp_customer = (
                trans_type == TransactionType.SALES
                and (
                    (payment_method and payment_method.lower() in ["customer_deposit", "dp", "uang_muka", "uang muka", "deposit", "panjar"])
                    or bool(re.search(r'\b(dp|down\s*payment|uang\s*muka|panjar)\b', (description or "").lower()))
                )
            )
            if is_dp_customer and line.side == "credit":
                dp_acc = db.query(Account).filter(
                    Account.code == "2-1402",
                    or_(Account.tenant_id == t_id, Account.tenant_id == None)
                ).first()
                if not dp_acc:
                    # Fallback auto-create akun 2-1402 jika belum ada di tenant
                    dp_acc = Account(
                        tenant_id=t_id,
                        code="2-1402",
                        name="Uang Muka Penjualan",
                        account_type=AccountType.LIABILITY
                    )
                    db.add(dp_acc)
                    db.flush()
                target_account_id = dp_acc.id
                target_account = dp_acc

            # 2. Redirect Kas -> Bank (1-1102) jika non-tunai (QRIS / Transfer)
            desc_lower = (description or payment_method or "").lower()
            is_non_cash = (
                (payment_method and payment_method.lower() in ["non_cash", "non tunai", "transfer", "bank", "qris", "gopay", "ovo", "dana"])
                or any(kw in desc_lower for kw in ["qris", "qr", "transfer", "tf bank", "via bank", "non tunai"])
            )
            if is_non_cash and account and (account.code.startswith("1-10") or (account.code.startswith("1-11") and account.code != "1-1102")):
                bank_acc = db.query(Account).filter(
                    Account.code == "1-1102",
                    or_(Account.tenant_id == t_id, Account.tenant_id == None)
                ).first()
                if bank_acc:
                    target_account_id = bank_acc.id
                    target_account = bank_acc

            # 3. Dynamic Operational & Expense Sub-account Resolution
            is_payroll_expense = any(kw in desc_lower for kw in ["gaji", "upah", "honor", "payroll", "thr", "bonus karyawan", "gaji karyawan"])
            is_bbm_expense = any(kw in desc_lower for kw in ["bbm", "bensin", "pertalite", "pertamax", "solar", "spbu", "parkir", "tol"])
            is_utility_expense = any(kw in desc_lower for kw in ["listrik", "pln", "air", "pdam", "internet", "wifi", "telkom", "pulsa"])
            is_rent_expense = any(kw in desc_lower for kw in ["sewa", "kontrak ruko", "sewa toko", "sewa gedung"])
            is_marketing_expense = any(kw in desc_lower for kw in ["iklan", "pemasaran", "marketing", "brosur", "banner", "spanduk", "ads"])

            # Jika tipe EXPENSE tetapi BUKAN payroll, jangan masukkan baris Utang Gaji (2-1201) / Hutang PPh 21 (2-1202)
            if trans_type in [TransactionType.OPERATIONAL, TransactionType.EXPENSE] and not is_payroll_expense:
                if account and account.code in ["2-1201", "2-1202"]:
                    continue  # Lewati baris utang gaji & pajak akrual jika bukan transaksi gaji eksplisit

            if trans_type in [TransactionType.OPERATIONAL, TransactionType.EXPENSE] and account and account.code.startswith("6-"):
                if is_payroll_expense:
                    payroll_acc = db.query(Account).filter(
                        Account.code == "6-1101",
                        or_(Account.tenant_id == t_id, Account.tenant_id == None)
                    ).first()
                    if payroll_acc:
                        target_account_id = payroll_acc.id
                        target_account = payroll_acc
                elif is_bbm_expense:
                    bbm_acc = db.query(Account).filter(
                        Account.code == "6-1302",
                        or_(Account.tenant_id == t_id, Account.tenant_id == None)
                    ).first()
                    if bbm_acc:
                        target_account_id = bbm_acc.id
                        target_account = bbm_acc
                elif is_utility_expense:
                    util_acc = db.query(Account).filter(
                        Account.code == "6-1301",
                        or_(Account.tenant_id == t_id, Account.tenant_id == None)
                    ).first()
                    if util_acc:
                        target_account_id = util_acc.id
                        target_account = util_acc
                elif is_rent_expense:
                    rent_acc = db.query(Account).filter(
                        Account.code == "6-1201",
                        or_(Account.tenant_id == t_id, Account.tenant_id == None)
                    ).first()
                    if rent_acc:
                        target_account_id = rent_acc.id
                        target_account = rent_acc
                elif is_marketing_expense:
                    mkt_acc = db.query(Account).filter(
                        Account.code == "6-1401",
                        or_(Account.tenant_id == t_id, Account.tenant_id == None)
                    ).first()
                    if mkt_acc:
                        target_account_id = mkt_acc.id
                        target_account = mkt_acc
                else:
                    # Default: Beban Operasional Lainnya (6-9000)
                    ops_acc = db.query(Account).filter(
                        Account.code == "6-9000",
                        or_(Account.tenant_id == t_id, Account.tenant_id == None)
                    ).first()
                    if ops_acc:
                        target_account_id = ops_acc.id
                        target_account = ops_acc
            
            entries.append({
                "account_id": target_account_id,
                "account": {
                    "id": target_account.id,
                    "code": target_account.code,
                    "name": target_account.name
                } if target_account else None,
                "debit": val if line.side == "debit" else 0,
                "credit": val if line.side == "credit" else 0
            })

        # 4. Pastikan transaksi SALES selalu memiliki pasangan Jurnal Perpetual (HPP & Persediaan) jika bukan DP Customer
        is_dp_transaction = (
            trans_type == TransactionType.SALES
            and (
                (payment_method and payment_method.lower() in ["customer_deposit", "dp", "uang_muka", "uang muka", "deposit", "panjar"])
                or bool(re.search(r'\b(dp|down\s*payment|uang\s*muka|panjar)\b', (description or "").lower()))
            )
        )
        if trans_type == TransactionType.SALES and not is_dp_transaction and not any(e.get("account") and e["account"]["code"].startswith("5-") for e in entries):
            from app.models.setting import AppSetting
            rate_setting = db.query(AppSetting).filter(AppSetting.tenant_id == t_id, AppSetting.key == "default_cogs_rate").first()
            cogs_rate = Decimal(rate_setting.value) / 100 if rate_setting else Decimal('0.85')
            cogs_val = (amount * cogs_rate).quantize(Decimal('0.00'))
            
            hpp_acc = db.query(Account).filter(Account.code == "5-1101", or_(Account.tenant_id == t_id, Account.tenant_id == None)).first()
            persediaan_acc = db.query(Account).filter(Account.code == "1-1301", or_(Account.tenant_id == t_id, Account.tenant_id == None)).first()
            
            if hpp_acc and persediaan_acc:
                entries.append({
                    "account_id": hpp_acc.id,
                    "account": {"id": hpp_acc.id, "code": hpp_acc.code, "name": hpp_acc.name},
                    "debit": cogs_val,
                    "credit": Decimal('0.00')
                })
                entries.append({
                    "account_id": persediaan_acc.id,
                    "account": {"id": persediaan_acc.id, "code": persediaan_acc.code, "name": persediaan_acc.name},
                    "debit": Decimal('0.00'),
                    "credit": cogs_val
                })

        if is_dp_transaction and trans_type == TransactionType.SALES:
            # Saring hanya entri Kas/Bank dan Uang Muka Penjualan (Hapus baris HPP 5-* dan Persediaan 1-13*)
            entries = [e for e in entries if not (e.get("account") and (e["account"]["code"].startswith("5-") or e["account"]["code"].startswith("1-13")))]

        return entries

    # 2. SPECIAL HANDLING: CASH_COUNT (Reconciliation) 
    # Only runs if NO mapping is found in database
    if trans_type == TransactionType.CASH_COUNT:
        # Get current system balance for Cash (Accounts starting with 1-10 or 1-11)
        system_cash = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(
            Account, Account.id == JournalEntry.account_id
        ).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            or_(Account.code.startswith("1-10"), Account.code.startswith("1-11"))
        ).scalar() or Decimal('0.00')
        
        diff = amount - system_cash
        if diff == 0: return []
        
        is_surplus = diff > 0
        abs_diff = abs(diff)
        
        # Support various cash accounts (Kas Utama/Kecil/Kas)
        cash_acc_codes = ["1-1000", "1-1100", "1-1101"]
        cash_acc = db.query(Account).filter(
            Account.code.in_(cash_acc_codes),
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).order_by(Account.tenant_id.desc(), Account.code).first()
        
        # Support various adjustment accounts (Pendapatan Lain-lain/Beban Operasional Lainnya)
        if is_surplus:
            adj_acc_codes = ["4-9000", "4-2101", "4-2000"]
        else:
            adj_acc_codes = ["5-9000", "6-9000", "5-2000"]
            
        adj_accounts = db.query(Account).filter(
            Account.code.in_(adj_acc_codes),
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).all()
        
        adj_acc = None
        for code in adj_acc_codes:
            tenant_match = next((a for a in adj_accounts if a.code == code and a.tenant_id == tenant_id), None)
            if tenant_match:
                adj_acc = tenant_match
                break
            global_match = next((a for a in adj_accounts if a.code == code and a.tenant_id is None), None)
            if global_match:
                adj_acc = global_match
                break
        
        if cash_acc and adj_acc:
            return [
                {
                    "account_id": cash_acc.id,
                    "account": {
                        "id": cash_acc.id,
                        "code": cash_acc.code,
                        "name": cash_acc.name
                    },
                    "debit": abs_diff if is_surplus else 0,
                    "credit": 0 if is_surplus else abs_diff
                },
                {
                    "account_id": adj_acc.id,
                    "account": {
                        "id": adj_acc.id,
                        "code": adj_acc.code,
                        "name": adj_acc.name
                    },
                    "debit": 0 if is_surplus else abs_diff,
                    "credit": abs_diff if is_surplus else 0
                }
            ]
    
    # 2. FALLBACK HANDLING: Hanya untuk Retur Pembelian/Penjualan jika mapping spesifik belum diatur
    if not mapping and trans_type in [TransactionType.PURCHASE_RETURN, TransactionType.SALES_RETURN]:
        inv_acc = db.query(Account).filter(Account.code == "1-1301", or_(Account.tenant_id == t_id, Account.tenant_id == None)).first()
        rev_acc = db.query(Account).filter(Account.code == "4-1101", or_(Account.tenant_id == t_id, Account.tenant_id == None)).first()
        kas_acc = db.query(Account).filter(Account.code == "1-1101", or_(Account.tenant_id == t_id, Account.tenant_id == None)).first()
        
        if payment_method and payment_method.lower() in ["hutang", "tempo", "kredit"]:
            piutang_acc = db.query(Account).filter(Account.code == "1-1201", or_(Account.tenant_id == t_id, Account.tenant_id == None)).first()
            hutang_acc = db.query(Account).filter(Account.code == "2-1101", or_(Account.tenant_id == t_id, Account.tenant_id == None)).first()
        else:
            piutang_acc = None
            hutang_acc = None

        if trans_type == TransactionType.PURCHASE_RETURN and inv_acc:
            debit_acc = hutang_acc if (payment_method and payment_method.lower() in ["hutang", "tempo", "kredit"] and hutang_acc) else kas_acc
            if debit_acc:
                return [
                    {
                        "account_id": debit_acc.id,
                        "account": {"id": debit_acc.id, "code": debit_acc.code, "name": debit_acc.name},
                        "debit": amount, "credit": Decimal('0.00')
                    },
                    {
                        "account_id": inv_acc.id,
                        "account": {"id": inv_acc.id, "code": inv_acc.code, "name": inv_acc.name},
                        "debit": Decimal('0.00'), "credit": amount
                    }
                ]

        elif trans_type == TransactionType.SALES_RETURN and rev_acc:
            credit_acc = piutang_acc if (payment_method and payment_method.lower() in ["hutang", "tempo", "kredit"] and piutang_acc) else kas_acc
            if credit_acc:
                return [
                    {
                        "account_id": rev_acc.id,
                        "account": {"id": rev_acc.id, "code": rev_acc.code, "name": rev_acc.name},
                        "debit": amount, "credit": Decimal('0.00')
                    },
                    {
                        "account_id": credit_acc.id,
                        "account": {"id": credit_acc.id, "code": credit_acc.code, "name": credit_acc.name},
                        "debit": Decimal('0.00'), "credit": amount
                    }
                ]

    return []

def _validate_double_entry(entries: list[JournalEntry]) -> bool:
    """Ensure debits and credits match exactly."""
    total_debit = sum(entry.debit for entry in entries)
    total_credit = sum(entry.credit for entry in entries)
    return total_debit == total_credit

def _generate_reference_no(db: Session, trans_type: TransactionType, tenant_id: int) -> str:
    """Generate a simple sequential reference number like PUR-2026-0001 isolated per tenant"""
    prefixes = {
        TransactionType.PURCHASE: "PUR",
        TransactionType.SALES: "SAL",
        TransactionType.EXPENSE: "EXP",
        TransactionType.MANUAL: "MAN",
        TransactionType.INCOME: "INC",
        TransactionType.OPERATIONAL: "OPE",
        TransactionType.NON_CASH_OUT: "NCO",
        TransactionType.NON_CASH_IN: "NCI",
        TransactionType.CAPITAL: "CAP",
        TransactionType.SALES_RETURN: "SRT",
        TransactionType.PURCHASE_RETURN: "PRT"
    }
    prefix = prefixes.get(trans_type, trans_type.name[:3].upper())
    year = datetime.now().year
    pattern = f"{prefix}-{year}-%"
    
    from sqlalchemy import desc
    latest_tx = db.query(Transaction.reference_no).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.reference_no.like(pattern)
    ).order_by(desc(Transaction.reference_no)).first()
    
    next_seq = 1
    if latest_tx and latest_tx[0]:
        try:
            parts = latest_tx[0].split("-")
            if len(parts) >= 3:
                last_seq = int(parts[-1])
                next_seq = last_seq + 1
        except ValueError:
            pass
            
    return f"{prefix}-{year}-{next_seq:04d}"

def _normalize_and_validate_transaction_date(tx_date):
    """
    Validate transaction date:
    - If in the future, fallback to today.
    - If in a different month, raise error.
    Returns the corrected/validated date.
    """
    from datetime import datetime, date
    from fastapi import HTTPException, status
    
    if isinstance(tx_date, datetime):
        tx_date = tx_date.date()
        
    today = datetime.now().date()
    
    # 1. Fallback future date to today
    if tx_date > today:
        return today
        
    # 2. Check if tx_date is in the active/current month
    if tx_date.year == today.year and tx_date.month == today.month:
        return tx_date

    # 3. Grace period: Allow backdating if today is <= 5th of the month
    if today.day <= 5:
        from datetime import timedelta
        
        # Calculate 5 workdays backward from the 1st of the current month
        first_of_month = today.replace(day=1)
        current = first_of_month
        workdays_subtracted = 0
        
        while workdays_subtracted < 5:
            current -= timedelta(days=1)
            # weekday() < 5 means Monday to Friday (0 = Mon, 4 = Fri)
            if current.weekday() < 5:
                workdays_subtracted += 1
                
        # If tx_date is >= the calculated limit, it's valid (it falls in the allowed previous month period)
        if tx_date >= current:
            return tx_date

    # If all checks fail, raise HTTP 400
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Tanggal transaksi ({tx_date}) harus berada pada bulan aktif ({today.strftime('%B %Y')}) atau maksimal mundur 5 hari kerja dari awal bulan jika masih di bawah tanggal 5."
    )
    
    return tx_date

def create_transaction_with_journal(db: Session, trans_in: TransactionCreate, user_id: int | None = None, tenant_id: int | None = None) -> Transaction:
    """
    Core business logic: Creates a transaction header and its double-entry journal lines.
    Validates that the journal entries balance before committing.
    Now supports Implicit Global Context.
    """
    t_id = tenant_id or context.get_tenant_context()
    u_id = user_id or context.get_user_context()
    
    if not t_id:
        raise HTTPException(status_code=400, detail="Tenant context missing")
        
    # Validate and normalize transaction_date
    trans_in.transaction_date = _normalize_and_validate_transaction_date(trans_in.transaction_date)
    
    # 1. Calculate and validate Debits vs Credits from input
    total_debit = sum(entry.debit for entry in trans_in.entries)
    total_credit = sum(entry.credit for entry in trans_in.entries)

    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Journal imbalance: Debits ({total_debit}) != Credits ({total_credit})"
        )

    # Note: We intentionally DO NOT validate trans_in.total_amount == total_debit anymore.
    # In Multi-Pair journals (like Sales Perpetual), total_debit (Sales + COGS) 
    # will naturally be larger than the transaction's base total_amount.
    # As long as Debit == Credit, the accounting equation holds.

    # 1.5 Duplicate Transaction Check Guard
    if not getattr(trans_in, "allow_duplicate", False):
        existing_tx = db.query(Transaction).filter(
            Transaction.tenant_id == t_id,
            Transaction.transaction_date == trans_in.transaction_date,
            Transaction.transaction_type == trans_in.transaction_type,
            Transaction.total_amount == trans_in.total_amount,
            Transaction.description == trans_in.description,
            Transaction.status == TransactionStatus.POSTED
        ).first()
        if existing_tx:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"DUPLICATE_TRANSACTION_DETECTED: Transaksi serupa (Ref: {existing_tx.reference_no}, Tanggal: {existing_tx.transaction_date}, Total: Rp {existing_tx.total_amount:,.0f}) sudah pernah dicatat."
            )

    # 2. Create Transaction Header
    ref_no = trans_in.reference_no or _generate_reference_no(db, trans_in.transaction_type, t_id)
    
    # Check if auto_post_journal setting is enabled (default is True)
    from app.models.setting import AppSetting
    auto_post_setting = db.query(AppSetting).filter(
        AppSetting.tenant_id == t_id,
        AppSetting.key == "auto_post_journal"
    ).first()
    auto_post = auto_post_setting.value == "true" if auto_post_setting else True
    
    final_status = TransactionStatus.POSTED if auto_post else trans_in.status
    
    db_transaction = Transaction(
        tenant_id=t_id,
        transaction_date=trans_in.transaction_date,
        reference_no=ref_no,
        description=trans_in.description,
        transaction_type=trans_in.transaction_type,
        status=final_status,
        total_amount=trans_in.total_amount,
        payment_method=trans_in.payment_method,
        due_date=trans_in.due_date,
        created_by_id=u_id
    )
    db.add(db_transaction)
    db.flush() # Flush to get the transaction ID

    # 3. Create Journal Entries
    for entry_in in trans_in.entries:
        # Validate account exists and belongs to the same tenant
        account = db.query(Account).filter(
            Account.id == entry_in.account_id,
            Account.tenant_id == t_id
        ).first()
        if not account:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"Account ID {entry_in.account_id} not found or belongs to another tenant.")
        
        # New Rule: Cannot journal to parent accounts
        if db.query(Account).filter(Account.parent_id == account.id).first():
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Akun '{account.name}' adalah Akun Induk (Header). Jurnal hanya diperbolehkan ke akun level terendah.")
            
        db_entry = JournalEntry(
            transaction_id=db_transaction.id,
            account_id=entry_in.account_id,
            debit=entry_in.debit,
            credit=entry_in.credit
        )
        db.add(db_entry)

    # 3b. Smart Master Data Extraction & Automatic HPP Calculation
    from app.models.inventory import Product, InventoryLog, Contact
    import uuid

    if trans_in.items:
        # Filter item dummy ringkasan (tanpa rincian produk ritel spesifik)
        summary_kws = ["pendapatan", "penjualan", "omzet", "omset", "rekap", "hasil toko", "penerimaan", "total penjualan", "kasir"]
        valid_items = []
        for item in trans_in.items:
            it_name_low = (item.name or "").lower().strip()
            desc_low = (trans_in.description or "").lower().strip()
            
            is_dummy_summary = (
                it_name_low == desc_low
                or (len(it_name_low) > 30 and ("penjualan" in it_name_low or "pendapatan" in it_name_low))
                or (any(kw in it_name_low for kw in summary_kws) and not any(u in it_name_low for u in ["kg", "pcs", "@", "liter", "btl", "ctn", "pack", "rtg", "dus", "sak", "gram", "gr"]))
            )
            if not is_dummy_summary:
                valid_items.append(item)
                
        trans_in.items = valid_items

    if trans_in.items:
        from app.models.setting import AppSetting
        total_cost_for_hpp = Decimal('0.00')
        
        # Get HPP Rate for item-based estimation (default 88% if no real cost known for sembako)
        rate_setting = db.query(AppSetting).filter(AppSetting.tenant_id == tenant_id, AppSetting.key == "default_cogs_rate").first()
        cogs_rate = Decimal(rate_setting.value) / 100 if rate_setting else Decimal('0.88')
        
        # Precompute adjusted prices for each item (Round Up to Tens)
        adjusted_prices = []
        if trans_in.items:
            ratio = Decimal('1.0')
            if trans_in.transaction_type.value == "purchase":
                sum_items_total = sum(Decimal(str(item.qty)) * Decimal(str(item.unit_price)) for item in trans_in.items)
                if sum_items_total > 0:
                    pkp_setting = db.query(AppSetting).filter(
                        AppSetting.tenant_id == tenant_id,
                        AppSetting.key == "is_pkp"
                    ).first()
                    is_pkp = pkp_setting.value == "true" if pkp_setting else False
                    
                    is_exempt = True
                    item_text = " ".join([it.name for it in trans_in.items]).lower()
                    if any(k in item_text for k in ["ppn", "pajak", "tax", "vat"]):
                        is_exempt = False
                    else:
                        is_exempt = check_tax_exempt_via_vector([{"name": it.name} for it in trans_in.items])
                        
                    if any(k in trans_in.description.lower() for k in ["ppn", "pajak", "tax", "vat"]):
                        is_exempt = False
                        
                    if not is_pkp:
                        is_exempt = True
                        
                    tax_val = Decimal('0.00')
                    if not is_exempt:
                        tax_val = (trans_in.total_amount * Decimal('11') / Decimal('111')).quantize(Decimal('0.00'))
                        
                    target_inv_total = trans_in.total_amount - tax_val
                    ratio = target_inv_total / sum_items_total
                    
                    import math
                    def round_up_to_tens(val: Decimal) -> Decimal:
                        val_float = float(val)
                        return Decimal(str(int(math.ceil(val_float / 10.0) * 10)))
                        
                    temp_totals = []
                    for item in trans_in.items:
                        raw_adjusted_price = Decimal(str(item.unit_price)) * ratio
                        rounded_price = round_up_to_tens(raw_adjusted_price)
                        qty = Decimal(str(item.qty))
                        tot = rounded_price * qty
                        temp_totals.append((rounded_price, tot))
                        
                    calculated_sum = sum(tot for _, tot in temp_totals)
                    diff = target_inv_total - calculated_sum
                    
                    if diff != 0 and len(trans_in.items) > 0:
                        last_idx = len(trans_in.items) - 1
                        last_price, last_tot = temp_totals[last_idx]
                        adjusted_tot = last_tot + diff
                        last_qty = Decimal(str(trans_in.items[last_idx].qty))
                        adjusted_price = Decimal(str(int(round(float(adjusted_tot / last_qty) if last_qty > 0 else 0))))
                        temp_totals[last_idx] = (adjusted_price, adjusted_tot)
                        
                    adjusted_prices = [price for price, _ in temp_totals]
                else:
                    adjusted_prices = [Decimal(str(item.unit_price)) for item in trans_in.items]
            else:
                adjusted_prices = [Decimal(str(item.unit_price)) for item in trans_in.items]
        
        for idx, item in enumerate(trans_in.items):
            # Calculate adjusted unit price
            adjusted_unit_price = adjusted_prices[idx]
            
            # 1. Resolve Contact (Same as before)
            contact_id = None
            if item.contact_name:
                is_supplier_related = trans_in.transaction_type.value in ["purchase", "operational", "purchase_return"]
                contact_type = "supplier" if is_supplier_related else "customer"
                contact = db.query(Contact).filter(
                    Contact.tenant_id == tenant_id,
                    Contact.name.ilike(item.contact_name),
                    Contact.contact_type == contact_type
                ).first()
                if not contact:
                    contact = Contact(
                        tenant_id=tenant_id,
                        name=item.contact_name[:100].strip(),
                        contact_type=contact_type,
                        address=item.contact_address
                    )
                    db.add(contact)
                    db.flush()
                contact_id = contact.id

            # 2. Resolve Product
            product = db.query(Product).filter(
                Product.name.ilike(item.name[:100].strip())
            ).first()
            
            if not product:
                # 2.1 Coba cari lewat MCP Server (Item-Level RAG)
                from app.services.mcp_client import mcp_client
                try:
                    rag_res = mcp_client.search_item_alias_sync(item.name, tenant_id)
                    if rag_res.get("success") and rag_res.get("resolved_name"):
                        resolved_name = rag_res.get("resolved_name")
                        # Cari ulang dengan nama yang disarankan MCP
                        product = db.query(Product).filter(
                            Product.name.ilike(resolved_name[:100].strip())
                        ).first()
                except Exception as e:
                    print(f"[RAG] MCP Item Alias search failed: {e}")

            if not product:
                clean_product_name = item.name[:100].strip() if item.name else "Produk Non-Nama"
                product = Product(
                    sku=str(uuid.uuid4())[:8].upper(),
                    name=clean_product_name,
                    base_unit=item.unit or "pcs"
                )
                db.add(product)
                db.flush()

            # 2.2 Trigger Ingestion (Auto-Learning) jika nama dikoreksi dari OCR / editan pengguna
            raw_ocr = getattr(item, "ocr_name", None) or getattr(item, "name", None)
            if raw_ocr and raw_ocr.strip() != "" and raw_ocr.strip().lower() != product.name.strip().lower():
                from app.services.mcp_client import mcp_client
                try:
                    mcp_client.ingest_item_alias_sync(
                        raw_name=raw_ocr.strip(),
                        resolved_name=product.name.strip(),
                        tenant_id=tenant_id
                    )
                    logger.info(f"[RAG Auto-Ingest] Learned Alias: '{raw_ocr.strip()}' -> '{product.name.strip()}'")
                except Exception as e:
                    logger.error(f"[RAG] MCP Item Ingest failed: {e}")

            # 3. Update Stock and Create Inventory Log
            # Purchase/Op OR Sales Return -> Stock IN
            # Sales/Income OR Purchase Return -> Stock OUT
            is_stock_in = trans_in.transaction_type.value in ["purchase", "operational", "sales_return"]
            is_stock_out = trans_in.transaction_type.value in ["income", "sales", "purchase_return"]
            
            log_type = "in" if is_stock_in else ("out" if is_stock_out else None)
            
            if log_type:
                from app.services.inventory import InventoryService
                from app.services.pricing_engine import PricingEngine

                if log_type == "in":
                    # Update Moving Average on Purchase
                    if trans_in.transaction_type.value == "purchase":
                        PricingEngine.update_moving_average(db, tenant_id, product.id, item.qty, adjusted_unit_price)
                    
                    # Update Static Stock if maintenance is ON
                    InventoryService.update_stock_after_transaction(db, tenant_id, product.id, item.qty, "in")

                    # Special Logic: SALES_RETURN also reverses HPP
                    if trans_in.transaction_type.value == "sales_return":
                        # Get actual HPP for reversal
                        current_hpp = PricingEngine.get_current_hpp(db, tenant_id, product.id)
                        total_cost_for_hpp -= (Decimal(str(item.qty)) * current_hpp)
                else:
                    # Stock OUT logic & HPP Calculation (Bypass jika transaksi adalah DP / Customer Deposit karena barang belum diserahkan)
                    is_dp_payment = (
                        trans_in.transaction_type.value in ["sales", "income"]
                        and (
                            (trans_in.payment_method and trans_in.payment_method.lower() in ["customer_deposit", "dp", "uang_muka", "uang muka", "deposit", "panjar"])
                            or bool(re.search(r'\b(dp|down\s*payment|uang\s*muka|panjar)\b', (trans_in.description or "").lower()))
                        )
                    )
                    
                    if not is_dp_payment:
                        InventoryService.update_stock_after_transaction(db, tenant_id, product.id, item.qty, "out")
                        
                        # HPP Calculation for Sales/Income
                        if trans_in.transaction_type.value in ["income", "sales"]:
                            current_hpp = PricingEngine.get_current_hpp(db, tenant_id, product.id)
                            # FALLBACK: If current_hpp is 0, estimate it from item.unit_price * cogs_rate
                            if current_hpp == 0:
                                current_hpp = (Decimal(str(item.unit_price)) * cogs_rate).quantize(Decimal('0.00'))
                            total_cost_for_hpp += (Decimal(str(item.qty)) * current_hpp)

                # Common logic for both IN and OUT
                log = InventoryLog(
                    product_id=product.id,
                    transaction_id=db_transaction.id,
                    contact_id=contact_id,
                    quantity=item.qty,
                    price_per_unit=adjusted_unit_price,
                    log_type=log_type
                )
                db.add(log)
        
        # 4. AUTOMATIC HPP JURNAL (Proportional Logic)
        # Create Jurnal for HPP if any cost calculated (positive for Sales, negative for Returns)
        if total_cost_for_hpp != 0:
            hpp_acc = db.query(Account).filter(Account.code == "5-1101", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            inv_acc = db.query(Account).filter(Account.code == "1-1301", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            if not hpp_acc:
                hpp_acc = db.query(Account).filter(Account.code == "5-1000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            if not inv_acc:
                inv_acc = db.query(Account).filter(Account.code == "1-3000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            
            if hpp_acc and inv_acc:
                # Find if we already added these entries to db in step 3
                hpp_entry = next((e for e in db_transaction.entries if e.account_id == hpp_acc.id), None)
                inv_entry = next((e for e in db_transaction.entries if e.account_id == inv_acc.id), None)
                
                debit_val = total_cost_for_hpp if total_cost_for_hpp > 0 else 0
                credit_val = 0 if total_cost_for_hpp > 0 else abs(total_cost_for_hpp)
                
                if hpp_entry:
                    hpp_entry.debit = debit_val
                    hpp_entry.credit = credit_val
                else:
                    db.add(JournalEntry(transaction_id=db_transaction.id, account_id=hpp_acc.id, debit=debit_val, credit=credit_val))
                    
                if inv_entry:
                    inv_entry.debit = credit_val
                    inv_entry.credit = debit_val
                else:
                    db.add(JournalEntry(transaction_id=db_transaction.id, account_id=inv_acc.id, debit=credit_val, credit=debit_val))

    # 4. Commit everything as an atomic transaction
    try:
        # Adjust summary sales HPP for the day
        if db_transaction.transaction_type == TransactionType.SALES:
            adjust_summary_sales_hpp(db, t_id, db_transaction.transaction_date)
            
        db.commit()
        db.refresh(db_transaction)
        return db_transaction
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def update_transaction_draft(db: Session, transaction_id: int, trans_update: any, tenant_id: int) -> Transaction:
    """
    Updates a transaction if it's in DRAFT status.
    Handles stock re-adjustment if items are modified.
    """
    from app.models.accounting import TransactionStatus
    from app.models.inventory import Product, InventoryLog, Contact
    import uuid

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status == TransactionStatus.POSTED and trans_update.status != TransactionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Cannot edit a posted transaction.")

    # 1. Update basic fields
    if trans_update.description is not None:
        db_transaction.description = trans_update.description
    if trans_update.transaction_date is not None:
        trans_update.transaction_date = _normalize_and_validate_transaction_date(trans_update.transaction_date)
        db_transaction.transaction_date = trans_update.transaction_date
    if trans_update.status is not None:
        db_transaction.status = trans_update.status
    if trans_update.total_amount is not None:
        new_total = Decimal(str(trans_update.total_amount))
        old_total = db_transaction.total_amount
        db_transaction.total_amount = new_total
        
        if old_total != new_total:
            debit_entries = [e for e in db_transaction.entries if e.debit > 0]
            credit_entries = [e for e in db_transaction.entries if e.credit > 0]
            
            sum_debit = sum(e.debit for e in debit_entries)
            sum_credit = sum(e.credit for e in credit_entries)
            
            if sum_debit > 0 and sum_credit > 0:
                for e in debit_entries:
                    e.debit = (e.debit * new_total / sum_debit).quantize(Decimal("0.01"))
                for e in credit_entries:
                    e.credit = (e.credit * new_total / sum_credit).quantize(Decimal("0.01"))
                
                new_sum_debit = sum(e.debit for e in debit_entries)
                new_sum_credit = sum(e.credit for e in credit_entries)
                
                if new_sum_debit != new_total and debit_entries:
                    debit_entries[0].debit += (new_total - new_sum_debit)
                if new_sum_credit != new_total and credit_entries:
                    credit_entries[0].credit += (new_total - new_sum_credit)

    # 2. Update Items & Inventory Logs (if provided)
    if trans_update.items is not None:
        from app.services.inventory import InventoryService
        # First, revert existing stock changes from old logs
        for old_log in db_transaction.inventory_logs:
            # Reverse logic: if it was IN, we take OUT, etc.
            rev_type = "out" if old_log.log_type == "in" else "in"
            InventoryService.update_stock_after_transaction(db, tenant_id, old_log.product_id, old_log.quantity, rev_type)
        
        # Delete old logs
        db.query(InventoryLog).filter(InventoryLog.transaction_id == transaction_id).delete()

        # Create new logs
        for item in trans_update.items:
            # Resolve Product
            product = db.query(Product).filter(
                Product.name.ilike(item.name)
            ).first()
            if not product:
                # This should ideally use the global catalog search, but for now simple ILIKE
                product = Product(
                    sku=str(uuid.uuid4())[:8].upper(),
                    name=item.name,
                    base_unit=item.unit
                )
                db.add(product)
                db.flush()

            # Resolve Contact
            contact_id = None
            if item.contact_name:
                is_supplier_related = db_transaction.transaction_type.value in ["purchase", "operational", "purchase_return"]
                contact_type = "supplier" if is_supplier_related else "customer"
                contact = db.query(Contact).filter(
                    Contact.tenant_id == tenant_id,
                    Contact.name.ilike(item.contact_name),
                    Contact.contact_type == contact_type
                ).first()
                if not contact:
                    contact = Contact(tenant_id=tenant_id, name=item.contact_name, contact_type=contact_type)
                    db.add(contact)
                    db.flush()
                contact_id = contact.id

            # Update Stock
            is_stock_in = db_transaction.transaction_type.value in ["purchase", "operational", "sales_return"]
            is_stock_out = db_transaction.transaction_type.value in ["income", "sales", "purchase_return"]
            log_type = "in" if is_stock_in else ("out" if is_stock_out else None)
            
            if log_type:
                InventoryService.update_stock_after_transaction(db, tenant_id, product.id, item.qty, log_type)

                new_log = InventoryLog(
                    product_id=product.id,
                    transaction_id=db_transaction.id,
                    contact_id=contact_id,
                    quantity=item.qty,
                    price_per_unit=item.unit_price,
                    log_type=log_type
                )
                db.add(new_log)

    # Adjust summary sales HPP for the day
    if db_transaction.transaction_type == TransactionType.SALES:
        adjust_summary_sales_hpp(db, tenant_id, db_transaction.transaction_date)

    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def post_transaction(db: Session, transaction_id: int, tenant_id: int) -> Transaction:
    """
    Posts a transaction, changing its status from DRAFT to POSTED.
    """
    from app.models.accounting import TransactionStatus

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status == TransactionStatus.POSTED:
        raise HTTPException(status_code=400, detail="Transaction is already posted.")

    db_transaction.status = TransactionStatus.POSTED
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def unpost_transaction(db: Session, transaction_id: int, tenant_id: int) -> Transaction:
    """
    Unposts a transaction, changing its status from POSTED to DRAFT.
    """
    from app.models.accounting import TransactionStatus

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status != TransactionStatus.POSTED:
        raise HTTPException(status_code=400, detail="Transaction is not posted.")

    db_transaction.status = TransactionStatus.DRAFT
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def delete_transaction_draft(db: Session, transaction_id: int, tenant_id: int) -> bool:
    """
    Deletes a transaction if it's in DRAFT status.
    """
    from app.models.accounting import TransactionStatus
    from app.models.inventory import InventoryLog
    from app.services.inventory import InventoryService

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status == TransactionStatus.POSTED:
        raise HTTPException(status_code=400, detail="Cannot delete a posted transaction.")

    # Revert stock changes if any
    for log in db_transaction.inventory_logs:
        rev_type = "out" if log.log_type == "in" else "in"
        InventoryService.update_stock_after_transaction(db, tenant_id, log.product_id, log.quantity, rev_type)
    
    tx_date = db_transaction.transaction_date
    tx_type = db_transaction.transaction_type

    db.delete(db_transaction)
    
    if tx_type == TransactionType.SALES:
        db.flush() # Apply delete first to get correct count
        adjust_summary_sales_hpp(db, tenant_id, tx_date)

    db.commit()
    return True

def get_dashboard_summary(db: Session, tenant_id: int | None = None, days: int = 30) -> dict:
    """
    Calculates dashboard statistics for the given tenant.
    Includes YTD and MTD calculations for Revenue, Expense, and Inventory Asset.
    Supports dynamic chart_data period (days parameter).
    """
    from sqlalchemy import func, or_
    from app.models.accounting import TransactionType, TransactionStatus, JournalEntry, Account
    from decimal import Decimal
    from datetime import datetime, timedelta, date

    t_id = tenant_id or context.get_tenant_context()
    today = datetime.now().date()
    start_of_year = date(today.year, 1, 1)
    start_of_month = date(today.year, today.month, 1)
    end_of_last_month = start_of_month - timedelta(days=1)
    start_of_last_month = date(end_of_last_month.year, end_of_last_month.month, 1)

    revenue_types = [TransactionType.INCOME, TransactionType.SALES]
    expense_types = [TransactionType.PURCHASE, TransactionType.OPERATIONAL, TransactionType.EXPENSE]

    # Total Revenue YTD (Year To Date)
    total_revenue_ytd = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(revenue_types),
        Transaction.transaction_date >= start_of_year
    ).scalar() or Decimal('0.00')

    # Total Revenue MTD (This Month)
    total_revenue = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(revenue_types),
        Transaction.transaction_date >= start_of_month
    ).scalar() or Decimal('0.00')

    # Total Revenue Last Month
    total_revenue_last_month = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(revenue_types),
        Transaction.transaction_date >= start_of_last_month,
        Transaction.transaction_date <= end_of_last_month
    ).scalar() or Decimal('0.00')

    # Total Expense YTD
    total_expense_ytd = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(expense_types),
        Transaction.transaction_date >= start_of_year
    ).scalar() or Decimal('0.00')

    # Total Expense MTD (This Month)
    total_expense = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(expense_types),
        Transaction.transaction_date >= start_of_month
    ).scalar() or Decimal('0.00')

    # Total Expense Last Month
    total_expense_last_month = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(expense_types),
        Transaction.transaction_date >= start_of_last_month,
        Transaction.transaction_date <= end_of_last_month
    ).scalar() or Decimal('0.00')

    net_profit = total_revenue - total_expense

    # Actual Cash & Bank Balances (Sum of all journal entries for Cash/Bank accounts: 1-11xx or 1-10xx)
    cash_bank_entries = db.query(
        Account.code,
        Account.name,
        func.sum(JournalEntry.debit - JournalEntry.credit).label("balance")
    ).join(
        Account, Account.id == JournalEntry.account_id
    ).join(
        Transaction, Transaction.id == JournalEntry.transaction_id
    ).filter(
        Transaction.tenant_id == t_id,
        Transaction.status == TransactionStatus.POSTED,
        or_(Account.code.startswith("1-11"), Account.code.startswith("1-10"))
    ).group_by(Account.id, Account.code, Account.name).all()

    total_cash = Decimal('0.00')
    total_bank = Decimal('0.00')

    for code, name, bal_val in cash_bank_entries:
        bal = bal_val or Decimal('0.00')
        name_lower = (name or "").lower()
        if "bank" in name_lower or code.startswith("1-1102"):
            total_bank += bal
        else:
            total_cash += bal

    cash_balance = total_cash + total_bank

    recent_transactions = db.query(Transaction).filter(
        Transaction.tenant_id == t_id
    ).order_by(Transaction.id.desc()).limit(5).all()

    # Chart Data: Dynamic timeframe based on days parameter (default 30, supports 7, 30, 60, 90)
    chart_data = []
    num_days = max(1, min(days, 365))
    for i in range(num_days - 1, -1, -1):
        day = today - timedelta(days=i)
        
        day_rev = db.query(func.sum(Transaction.total_amount)).filter(
            Transaction.tenant_id == t_id,
            Transaction.transaction_date == day,
            Transaction.transaction_type.in_(revenue_types)
        ).scalar() or Decimal('0.00')
        
        day_exp = db.query(func.sum(Transaction.total_amount)).filter(
            Transaction.tenant_id == t_id,
            Transaction.transaction_date == day,
            Transaction.transaction_type.in_(expense_types)
        ).scalar() or Decimal('0.00')
        
        chart_data.append({
            "name": day.strftime("%d %b"),
            "revenue": float(day_rev),
            "expense": float(day_exp)
        })

    # Fetch Upcoming Debts & Bills (Hutang Pembelian Supplier + DP Customer Penjualan)
    from sqlalchemy import or_, and_
    upcoming_debts = db.query(Transaction).filter(
        Transaction.tenant_id == t_id,
        or_(
            and_(
                Transaction.transaction_type == TransactionType.PURCHASE,
                or_(
                    Transaction.payment_method != "lunas",
                    Transaction.payment_method.is_(None)
                ),
                or_(
                    Transaction.due_date.isnot(None),
                    Transaction.payment_method.in_(["tempo", "credit", "invoice", "utang", "hutang"])
                )
            ),
            and_(
                Transaction.transaction_type == TransactionType.SALES,
                Transaction.payment_method.in_(["customer_deposit", "dp", "uang_muka", "uang muka", "deposit", "panjar"])
            )
        )
    ).order_by(Transaction.due_date.asc().nullslast(), Transaction.id.desc()).limit(15).all()

    # ── Calculate Inventory Asset ──
    # Total Pembelian - Total Penjualan
    purchase_val_ytd = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type == TransactionType.PURCHASE
    ).scalar() or Decimal('0.00')
    
    sales_val_ytd = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type == TransactionType.SALES
    ).scalar() or Decimal('0.00')
    
    total_inventory_value_ytd = purchase_val_ytd - sales_val_ytd

    purchase_val_mtd = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type == TransactionType.PURCHASE,
        Transaction.transaction_date >= start_of_month
    ).scalar() or Decimal('0.00')

    sales_val_mtd = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type == TransactionType.SALES,
        Transaction.transaction_date >= start_of_month
    ).scalar() or Decimal('0.00')

    total_inventory_value = purchase_val_mtd - sales_val_mtd

    # Calculate low stock count for info
    from app.models.setting import AppSetting
    from app.models.inventory import TenantInventory, Product, InventoryLog
    
    setting = db.query(AppSetting).filter(
        AppSetting.tenant_id == t_id, 
        AppSetting.key == "stock_maintenance"
    ).first()
    is_static = setting.value.lower() == "true" if setting else False
    low_stock_count = 0
    products = db.query(Product).all()
    for p in products:
        ti = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == t_id,
            TenantInventory.product_id == p.id
        ).first()
        if is_static:
            qty = ti.static_stock if ti else Decimal('0.00')
        else:
            in_qty = db.query(func.sum(InventoryLog.quantity)).join(Transaction).filter(
                Transaction.tenant_id == t_id,
                InventoryLog.product_id == p.id,
                InventoryLog.log_type == "in"
            ).scalar() or Decimal('0.00')
            out_qty = db.query(func.sum(InventoryLog.quantity)).join(Transaction).filter(
                Transaction.tenant_id == t_id,
                InventoryLog.product_id == p.id,
                InventoryLog.log_type == "out"
            ).scalar() or Decimal('0.00')
            qty = in_qty - out_qty
        if qty < 10:
            low_stock_count += 1

    # ── Top 5 Purchased Products ──
    top_products = db.query(
        Product.name,
        func.sum(InventoryLog.quantity * InventoryLog.price_per_unit).label("total_amount")
    ).join(Product, Product.id == InventoryLog.product_id).join(Transaction).filter(
        Transaction.tenant_id == t_id,
        InventoryLog.log_type == "in"
    ).group_by(Product.name).order_by(func.sum(InventoryLog.quantity * InventoryLog.price_per_unit).desc()).limit(5).all()
    
    top_products_list = [{"name": name, "qty": float(amount)} for name, amount in top_products]

    # ── Purchase Distribution per Supplier ──
    from app.models.inventory import Contact
    purchase_by_supplier = db.query(
        Contact.name,
        func.sum(InventoryLog.quantity * InventoryLog.price_per_unit).label("total_amount")
    ).join(Contact, Contact.id == InventoryLog.contact_id).join(Transaction, Transaction.id == InventoryLog.transaction_id).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type == TransactionType.PURCHASE
    ).group_by(Contact.name).order_by(func.sum(InventoryLog.quantity * InventoryLog.price_per_unit).desc()).all()
    
    supplier_purchases = [{"name": row[0], "amount": float(row[1])} for row in purchase_by_supplier]

    return {
        "total_revenue": float(total_revenue),
        "total_revenue_ytd": float(total_revenue_ytd),
        "total_revenue_last_month": float(total_revenue_last_month),
        "total_expense": float(total_expense),
        "total_expense_ytd": float(total_expense_ytd),
        "total_expense_last_month": float(total_expense_last_month),
        "net_profit": float(net_profit),
        "cash_balance": float(cash_balance),
        "total_cash": float(total_cash),
        "total_bank": float(total_bank),
        "recent_transactions": recent_transactions,
        "chart_data": chart_data,
        "upcoming_debts": upcoming_debts,
        "total_inventory_value": float(total_inventory_value),
        "total_inventory_value_ytd": float(total_inventory_value_ytd),
        "low_stock_count": low_stock_count,
        "top_products": top_products_list,
        "supplier_purchases": supplier_purchases
    }

def adjust_summary_sales_hpp(db: Session, tenant_id: int, transaction_date: date):
    """
    Adjusts the HPP of the summary SALES transaction of the day
    by subtracting the total amount of all detailed SALES transactions.
    """
    from app.models.setting import AppSetting
    from app.models.inventory import InventoryLog
    from sqlalchemy import or_
    from datetime import date

    # Force flush so that all pending transaction entries are written to the database transaction state and queryable
    db.flush()

    # Find the summary transaction for the day: SALES type, tenant_id, date, and NO items/inventory logs
    # We join with InventoryLog and find the one with count of logs == 0
    summary_tx = db.query(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date == transaction_date,
        Transaction.transaction_type == TransactionType.SALES
    ).outerjoin(
        InventoryLog, InventoryLog.transaction_id == Transaction.id
    ).group_by(
        Transaction.id
    ).having(
        func.count(InventoryLog.id) == 0
    ).first()

    if not summary_tx:
        return

    # Find all other detailed sales of the day (SALES type with inventory logs / items)
    detailed_sales = db.query(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date == transaction_date,
        Transaction.transaction_type == TransactionType.SALES,
        Transaction.id != summary_tx.id
    ).join(
        InventoryLog, InventoryLog.transaction_id == Transaction.id
    ).distinct().all()

    sum_detailed_amount = sum(tx.total_amount for tx in detailed_sales)

    # Calculate remaining amount for summary HPP
    remaining_amount = summary_tx.total_amount - sum_detailed_amount
    if remaining_amount < 0:
        remaining_amount = Decimal('0.00')

    # Get cogs rate
    rate_setting = db.query(AppSetting).filter(AppSetting.tenant_id == tenant_id, AppSetting.key == "default_cogs_rate").first()
    cogs_rate = Decimal(rate_setting.value) / 100 if rate_setting else Decimal('0.88') # 88% default for sembako

    cogs_amount = (remaining_amount * cogs_rate).quantize(Decimal('0.00'))

    # Update the summary transaction's HPP and Inventory entries
    hpp_acc = db.query(Account).filter(Account.code == "5-1101", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
    inv_acc = db.query(Account).filter(Account.code == "1-1301", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
    if not hpp_acc:
        hpp_acc = db.query(Account).filter(Account.code == "5-1000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
    if not inv_acc:
        inv_acc = db.query(Account).filter(Account.code == "1-3000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()

    if hpp_acc and inv_acc:
        hpp_entry = db.query(JournalEntry).filter(JournalEntry.transaction_id == summary_tx.id, JournalEntry.account_id == hpp_acc.id).first()
        inv_entry = db.query(JournalEntry).filter(JournalEntry.transaction_id == summary_tx.id, JournalEntry.account_id == inv_acc.id).first()

        if hpp_entry:
            hpp_entry.debit = cogs_amount
            hpp_entry.credit = Decimal('0.00')
        else:
            db.add(JournalEntry(transaction_id=summary_tx.id, account_id=hpp_acc.id, debit=cogs_amount, credit=Decimal('0.00')))

        if inv_entry:
            inv_entry.debit = Decimal('0.00')
            inv_entry.credit = cogs_amount
        else:
            db.add(JournalEntry(transaction_id=summary_tx.id, account_id=inv_acc.id, debit=Decimal('0.00'), credit=cogs_amount))

        db.flush()
