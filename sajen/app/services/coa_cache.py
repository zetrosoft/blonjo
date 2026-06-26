"""
COA Cache — Menyimpan Chart of Accounts di Redis agar tidak query DB setiap request.

TTL default: 10 menit (bisa disesuaikan).
Invalidasi otomatis saat ada perubahan akun (panggil invalidate_coa_cache).

Format COA yang disimpan di cache: string ringkas untuk injection ke prompt AI.
Contoh: "[1-1000] Kas Utama, [1-1200] Bank Mandiri, ..."
"""

import json
from typing import Optional
from sqlalchemy.orm import Session
from app.core.redis import get_redis_client

_COA_CACHE_KEY_PREFIX = "coa:tenant:"
_COA_TTL_SECONDS = 600  # 10 menit


def _make_key(tenant_id: int) -> str:
    return f"{_COA_CACHE_KEY_PREFIX}{tenant_id}"


def get_coa_string(db: Session, tenant_id: int) -> str:
    """
    Ambil COA dalam format string ringkas untuk digunakan dalam prompt AI.
    Menggunakan Redis cache (TTL 10 menit).

    Mengembalikan string kosong jika tidak ada akun aktif.
    """
    redis = None
    cache_key = _make_key(tenant_id)

    # --- Cek Cache ---
    try:
        redis = get_redis_client()
        cached = redis.get(cache_key)
        if cached:
            return cached  # Cache HIT
    except Exception as e:
        print(f"[COA Cache] Redis GET error: {e}")

    # --- Cache MISS: Query DB ---
    coa_str = _fetch_coa_from_db(db, tenant_id)

    # --- Simpan ke Cache ---
    try:
        if redis and coa_str:
            redis.setex(cache_key, _COA_TTL_SECONDS, coa_str)
    except Exception as e:
        print(f"[COA Cache] Redis SET error: {e}")

    return coa_str


def _fetch_coa_from_db(db: Session, tenant_id: int) -> str:
    """Query COA dari database dan format menjadi string ringkas."""
    try:
        from sqlalchemy import or_
        from app.models.accounting import Account

        accounts = (
            db.query(Account.code, Account.name)
            .filter(
                or_(Account.tenant_id == tenant_id, Account.tenant_id == None),
                Account.is_active == True,
            )
            .order_by(Account.code)
            .limit(50)
            .all()
        )

        if not accounts:
            return ""

        return ", ".join(f"[{a.code}] {a.name}" for a in accounts)
    except Exception as e:
        print(f"[COA Cache] DB fetch error: {e}")
        return ""


def invalidate_coa_cache(tenant_id: int) -> None:
    """
    Invalidasi cache COA untuk tenant tertentu.
    Panggil ini setiap kali ada perubahan pada tabel accounts.
    """
    try:
        redis = get_redis_client()
        redis.delete(_make_key(tenant_id))
        print(f"[COA Cache] Invalidated for tenant {tenant_id}")
    except Exception as e:
        print(f"[COA Cache] Invalidation error: {e}")


def needs_coa_in_prompt(text: str) -> bool:
    """
    Tentukan apakah teks transaksi perlu COA dalam prompt.

    COA diperlukan hanya jika AI perlu mengetahui akun untuk mapping
    (misal: input multi-item, ada kata 'akun', atau input kompleks).
    Untuk ringkasan 1 baris seperti "Penerimaan Penjualan 2.650.000",
    COA tidak perlu dikirim ke LLM karena mapping dilakukan secara deterministik
    oleh accounting service.
    """
    lower = text.lower()
    words = text.strip().split()

    # Teks sangat pendek → tidak perlu COA
    if len(words) <= 8:
        return False

    # Sinyal bahwa user ingin mapping akun secara eksplisit
    explicit_mapping_signals = ["akun", "debit", "kredit", "jurnal", "mapping"]
    if any(sig in lower for sig in explicit_mapping_signals):
        return True

    # Input kompleks dengan banyak item → COA membantu AI
    if len(words) > 15:
        return True

    return False
