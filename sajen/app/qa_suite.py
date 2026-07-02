import sys
import json
from datetime import datetime
from decimal import Decimal

def test_imports():
    print("1. Testing critical module imports...")
    try:
        from app.api.v1.accounting import parse_transaction_note
        from app.services.accounting import get_auto_journal_entries, check_tax_exempt_via_vector
        from app.services.ai_engine import call_ai_text, get_embedding
        from app.services.ai_context import get_rag_context
        print("   [PASS] All modules imported successfully.")
    except Exception as e:
        print(f"   [FAIL] Import error detected: {e}")
        return False
    return True

def test_tax_logic():
    print("\n2. Testing Tax Exemption Logic (Hybrid Keyword + Vector)...")
    from app.services.accounting import check_tax_exempt_via_vector
    
    test_cases = [
        ({"items": [{"name": "telur 10kg"}]}, True, "Sembako (Telor)"),
        ({"items": [{"name": "beras premium"}]}, True, "Sembako (Beras)"),
        ({"items": [{"name": "iPhone 15"}]}, False, "Barang Kena Pajak (HP)"),
        ({"items": [{"name": "service ac"}]}, False, "Jasa Kena Pajak"),
        ({"items": []}, True, "No items (Default Exempt)"),
    ]
    
    success = True
    for items, expected, label in test_cases:
        result = check_tax_exempt_via_vector(items["items"])
        if result == expected:
            print(f"   [PASS] {label}: Result={result}")
        else:
            print(f"   [FAIL] {label}: Expected={expected}, Got={result}")
            success = False
    return success

def test_journal_generation():
    print("\n3. Testing Journal Mapping Generation (Multi-Pair)...")
    from app.services.accounting import get_auto_journal_entries
    from app.models.accounting import TransactionType
    from app.core.database import SessionLocal
    
    db = SessionLocal()
    tenant_id = 1
    amount = Decimal("1000000")
    
    try:
        # Test SALES (Should be 4 lines)
        sales_entries = get_auto_journal_entries(db, tenant_id, TransactionType.SALES, amount, is_tax_exempt=True)
        if len(sales_entries) == 4:
            print(f"   [PASS] SALES Multi-pair: Found {len(sales_entries)} lines.")
        else:
            print(f"   [FAIL] SALES Multi-pair: Expected 4 lines, found {len(sales_entries)}.")
            
        # Test PURCHASE with Tax (Should be 3 lines)
        purch_entries = get_auto_journal_entries(db, tenant_id, TransactionType.PURCHASE, amount, is_tax_exempt=False)
        has_tax = any(e['debit'] > 0 and e['account_id'] == 60 for e in purch_entries) # 60 is PPN Masukan
        if len(purch_entries) == 3:
            print(f"   [PASS] PURCHASE Multi-pair: Found {len(purch_entries)} lines.")
        else:
            print(f"   [FAIL] PURCHASE Multi-pair: Expected 3 lines, found {len(purch_entries)}.")
            
    except Exception as e:
        print(f"   [FAIL] Journal generation error: {e}")
        return False
    finally:
        db.close()
    return True

if __name__ == "__main__":
    print("=== STARTING AUTOMATED QA SUITE ===\n")
    results = [
        test_imports(),
        test_tax_logic(),
        test_journal_generation()
    ]
    
    print("\n" + "="*35)
    if all(results):
        print("FINAL RESULT: [SUCCESS] System is stable.")
        sys.exit(0)
    else:
        print("FINAL RESULT: [FAILED] Errors detected in QA suite.")
        sys.exit(1)
