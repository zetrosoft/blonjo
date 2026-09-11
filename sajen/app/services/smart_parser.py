"""
Smart Parser — Rule-Based Pre-Filter sebelum panggil LLM.

Dirancang untuk menangani realita input dari pengguna UMKM Indonesia:
  - Berbagai format angka: 2.650.000 / 2,650,000 / 2650000 / 3jt / 500rb / 1,5jt
  - Campuran bahasa Indonesia + Inggris + singkatan warung
  - Format Rp, IDR, rp., Rp.
  - Tanggal eksplisit: "kemarin", "tadi pagi", "tgl 20", "20 juni"
  - Berbagai kata kerja: "dapet", "terima", "masuk", "keluar", "abis"
  - Retur / refund → selalu ke LLM (efek jurnal berbeda)
  - Transfer bank masuk/keluar

Pipeline:
  try_rule_based_parse(text)   → dict | None
  build_minimal_prompt(...)    → (system_instruction, prompt)
"""

import re
import numpy as np
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List


class TransactionClass(str, Enum):
    KAS_GLOBAL = "KAS_GLOBAL"           # Kas, rekonsiliasi, selisih — SKIP pricing rules
    PRODUCT_SALES = "PRODUCT_SALES"     # Jual ke pelanggan — butuh pricing rules
    PRODUCT_PURCHASE = "PRODUCT_PURCHASE"  # Beli dari supplier/kulakan — SKIP pricing rules
    UNKNOWN = "UNKNOWN"                 # Fallback — bawa context minimal


PATTERNS_KAS_GLOBAL = [
    r'(?i)(selisih|rekonsiliasi)\s+(uang\s+)?tunai\s*([\d.,]+)?',
    r'(?i)(tambahan|kurang)\s+(uang\s+)?(tunai|kas)\s*([\d.,]+)?',
    r'(?i)(pendapatan|pengeluaran)\s+(tambahan|lain[- ]?lain)\s*([\d.,]+)?',
    r'(?i)(setoran|penarikan)\s+(kas|tunai)\s*([\d.,]+)?',
    r'(?i)^(biaya|bayar)\s+\w+[\s\d.,]+$',
    r'(?i)\b(modal|gaji|upah|sewa)\b',
]


# Cache untuk vektor jangkar (anchor vectors)
_ANCHOR_VECTORS_CACHE = {}

def _get_anchor_vectors() -> dict:
    """Mengembalikan dan malas-memuat vektor jangkar untuk klasifikasi semantik."""
    global _ANCHOR_VECTORS_CACHE
    if not _ANCHOR_VECTORS_CACHE:
        try:
            from app.services.onnx_embed import get_onnx_embedding
            anchors = {
                TransactionClass.PRODUCT_PURCHASE: [
                    "belanja persediaan barang dan kulakan stok dari supplier distributor",
                    "pembelian bahan baku stok masuk dari suplier",
                    "tambah stok barang restock dari supplier",
                    "nota struk pembelian barang dagangan"
                ],
                TransactionClass.PRODUCT_SALES: [
                    "jual produk barang dagangan ke pelanggan customer",
                    "penjualan toko kasir laku produk ritel harian",
                    "penerimaan omset penjualan toko dari konsumen",
                    "nota penjualan barang eceran grosir"
                ],
                TransactionClass.KAS_GLOBAL: [
                    "gaji upah bulanan karyawan staff",
                    "setoran modal operasional kas bisnis",
                    "bayar sewa tempat ruko kantor",
                    "selisih kas tunai rekonsiliasi uang masuk keluar",
                    "suntik dana tambahan modal pemilik usaha investasi"
                ]
            }
            for tx_class, sentences in anchors.items():
                _ANCHOR_VECTORS_CACHE[tx_class] = [
                    np.array(get_onnx_embedding(s, is_query=False)) for s in sentences
                ]
        except Exception as e:
            # Fallback jika model ONNX tidak bisa diload
            print(f"[SmartParser] Gagal memuat ONNX embedding untuk anchors: {e}")
            _ANCHOR_VECTORS_CACHE = {}
    return _ANCHOR_VECTORS_CACHE


def classify_via_vector_similarity(text: str, threshold: float = 0.72) -> TransactionClass:
    """Mengklasifikasikan transaksi menggunakan kesamaan kosinus vektor lokal."""
    anchor_cache = _get_anchor_vectors()
    if not anchor_cache:
        return TransactionClass.UNKNOWN
        
    try:
        from app.services.onnx_embed import get_onnx_embedding
        # Dapatkan embedding untuk inputan (sebagai query)
        query_vec = np.array(get_onnx_embedding(text, is_query=True))
        
        best_class = TransactionClass.UNKNOWN
        max_sim = -1.0
        
        for tx_class, vectors in anchor_cache.items():
            for vec in vectors:
                # e5 model sudah ternormalisasi L2, jadi cosine similarity = dot product
                sim = float(np.dot(query_vec, vec))
                if sim > max_sim:
                    max_sim = sim
                    best_class = tx_class
                    
        if max_sim >= threshold:
            return best_class
    except Exception as e:
        print(f"[SmartParser] Kesalahan pada klasifikasi vektor similarity: {e}")
        
    return TransactionClass.UNKNOWN


def classify_transaction(text: str) -> TransactionClass:
    normalized = text.lower().strip()
    
    # 1. Cek Kas Global / Pengeluaran Administrasi
    for pattern in PATTERNS_KAS_GLOBAL:
        if re.search(pattern, normalized):
            return TransactionClass.KAS_GLOBAL
            
    # 2. Cek Kata Kunci Pembelian vs Penjualan secara Semantis & Dinamis
    purchase_keywords = [
        'beli', 'belanja', 'kulak', 'kulakan', 'pembelian', 
        'supplier', 'suplier', 'stok masuk', 'tambah stok', 
        'masuk barang', 'restock'
    ]
    sales_keywords = [
        'jual', 'jualan', 'penjualan', 'laku', 'sold', 
        'omset', 'omzet', 'pendapatan', 'kasir', 'pelanggan', 'customer'
    ]
    
    has_purchase_signal = any(kw in normalized for kw in purchase_keywords)
    has_sales_signal = any(kw in normalized for kw in sales_keywords)
    
    # Jika dominan pembelian (ada kata beli/belanja dan tidak ada kata jual)
    if has_purchase_signal and not has_sales_signal:
        return TransactionClass.PRODUCT_PURCHASE
        
    # Jika dominan penjualan (ada kata jual/laku dan tidak ada kata beli)
    if has_sales_signal and not has_purchase_signal:
        return TransactionClass.PRODUCT_SALES
        
    # Jika kedua sinyal ada, atau menggunakan frase terstruktur, cek regex pembelian fleksibel
    extended_purchase_patterns = [
        r'(?i)(pembelian|beli|belanja|kulak)(?:[\w\s]{0,30}?)(di|dari|ke|supplier|suplier)\s+\w+',
        r'(?i)(nota|struk|faktur)\s+(pembelian|kulak)',
        r'(?i)supplier\s*[:(]',
        r'(?i)dari\s+supplier'
    ]
    for pattern in extended_purchase_patterns:
        if re.search(pattern, normalized):
            return TransactionClass.PRODUCT_PURCHASE
            
    # 3. L2: Gunakan Vector Similarity lokal (Cerdas & Kontekstual)
    vec_class = classify_via_vector_similarity(text)
    if vec_class != TransactionClass.UNKNOWN:
        return vec_class

    # Sinyal unit produk umum (kg, pcs, @, ctn, dll.)
    product_signals = [
        'kg', 'gram', 'gr', 'pcs', 'btl', 'ctn', 'pack', 'ons',
        'liter', '@', 'per '
    ]
    if any(kw in normalized for kw in product_signals):
        # Default jika terindikasi memiliki item ritel tetapi tidak ada kata kunci beli/belanja yang jelas
        return TransactionClass.PRODUCT_SALES
        
    return TransactionClass.UNKNOWN


def _extract_product_keywords(text: str) -> List[str]:
    """Ekstrak kata-kata yang berpotensi menjadi nama produk dari teks transaksi."""
    # Hilangkan angka, simbol, dan kata umum
    clean = re.sub(r'[\d.,@\-+:/]', ' ', text.lower())
    words = clean.split()
    stop_words = {
        'beli', 'belanja', 'jual', 'jualan', 'total', 'jumlah', 'kemarin', 'tgl', 
        'hari', 'ini', 'ke', 'dari', 'untuk', 'rp', 'idr', 'pcs', 'kg', 'gr', 'btl'
    }
    return [w for w in words if w not in stop_words and len(w) > 2]




# ──────────────────────────────────────────────────────────────────────────────
# SECTION 1: NORMALISASI ANGKA
# Mendukung: 2.650.000 | 2,650,000 | 2650000 | 3jt | 3 jt | 500rb | 500 rb
#            1,5jt | 1.5jt | 2.5 juta | Rp 500.000 | IDR2000000
# ──────────────────────────────────────────────────────────────────────────────

# Multiplier shorthand Indonesia
_MULTIPLIERS = {
    "juta": 1_000_000, "jt": 1_000_000,
    "ribu": 1_000,     "rb": 1_000,
    "miliar": 1_000_000_000,
}

# Pola shorthand: angka (boleh desimal koma/titik) diikuti multiplier
# Contoh: "3jt", "500 rb", "1,5juta", "1.5jt", "2,5 juta"
_SHORTHAND_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(juta|jt|miliar|ribu|rb)\b",
    re.IGNORECASE,
)

# Strip prefix mata uang
_CURRENCY_PREFIX_RE = re.compile(r"\b(?:rp\.?|idr)\s*", re.IGNORECASE)

# Regex angka murni (setelah normalisasi)
_PURE_INT_RE = re.compile(r"\d+")


def _normalize_currency_prefix(text: str) -> str:
    """Hapus prefix Rp / IDR agar angka lebih mudah diparse."""
    return _CURRENCY_PREFIX_RE.sub("", text)


def _resolve_shorthand(text: str) -> str:
    """
    Ubah shorthand ke angka penuh dalam teks.
    "3jt" → "3000000", "500rb" → "500000", "1,5juta" → "1500000"
    """
    def replace(m: re.Match) -> str:
        raw = m.group(1).replace(",", ".")
        try:
            base = float(raw)
        except ValueError:
            return m.group(0)
        multiplier = _MULTIPLIERS.get(m.group(2).lower(), 1)
        return str(int(base * multiplier))

    return _SHORTHAND_RE.sub(replace, text)


def _strip_thousand_separators(text: str) -> str:
    """
    Normalisasi pemisah ribuan titik/koma.
    2.650.000 → 2650000,  1,500,000 → 1500000
    Pakai dua pass untuk menangani triple separator: 1.000.000
    """
    result = re.sub(r"([0-9])[.,]([0-9]{3})(?=[^0-9]|$)", r"\1\2", text)
    result = re.sub(r"([0-9])[.,]([0-9]{3})(?=[^0-9]|$)", r"\1\2", result)
    return result


def normalize_amount_text(text: str) -> str:
    """
    Pipeline normalisasi lengkap:
    1. Strip prefix Rp/IDR
    2. Resolve shorthand (3jt → 3000000, 1,5jt → 1500000)
    3. Normalisasi pemisah ribuan
    """
    t = _normalize_currency_prefix(text)
    t = _resolve_shorthand(t)
    t = _strip_thousand_separators(t)
    return t


def _extract_all_numbers(text: str) -> list:
    """Ekstrak semua angka >= 1000 dari teks (sudah dinormalisasi)."""
    result = []
    for m in _PURE_INT_RE.findall(text):
        try:
            val = int(m)
            if val >= 1000:
                result.append(val)
        except ValueError:
            continue
    return result


def _extract_total_amount(text: str) -> int:
    """
    Ambil amount transaksi dari teks (sudah dinormalisasi).

    Prioritas:
    1. Angka setelah kata "total", "jumlah", "diterima", "dibayar"
    2. Angka terbesar (umumnya = total transaksi)
    """
    total_pattern = re.compile(
        r"\b(?:total|jumlah|grand\s*total|dibayar|diterima|bayar)\b[\s:]*(\d+)",
        re.IGNORECASE,
    )
    m = total_pattern.search(text)
    if m:
        try:
            val = int(m.group(1))
            if val >= 1000:
                return val
        except ValueError:
            pass

    numbers = _extract_all_numbers(text)
    return max(numbers) if numbers else 0


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 2: NORMALISASI TANGGAL
# ──────────────────────────────────────────────────────────────────────────────

_MONTHS_ID = {
    "januari": 1, "jan": 1, "februari": 2, "feb": 2,
    "maret": 3, "mar": 3, "april": 4, "apr": 4, "mei": 5,
    "juni": 6, "jun": 6, "juli": 7, "jul": 7,
    "agustus": 8, "agt": 8, "aug": 8, "september": 9,
    "sep": 9, "sept": 9, "oktober": 10, "okt": 10, "oct": 10,
    "november": 11, "nov": 11, "desember": 12, "des": 12, "dec": 12,
}


def _extract_date(text: str) -> str:
    """Coba ekstrak tanggal dari teks. Kembalikan ISO format atau today."""
    lower = text.lower()
    today = datetime.now().date()

    # Tanggal Nota eksplisit dari OCR: (Tanggal Nota: YYYY-MM-DD) atau Tanggal Nota: YYYY-MM-DD
    m_nota = re.search(r"(?:tanggal\s*nota|tgl\s*nota|tanggal)\s*[:=]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})", lower)
    if m_nota:
        try:
            parts = [int(p) for p in re.split(r"[/-]", m_nota.group(1))]
            return datetime(parts[0], parts[1], parts[2]).date().isoformat()
        except ValueError:
            pass

    if any(kw in lower for kw in ["kemarin", "kemaren", "yesterday"]):
        return (today - timedelta(days=1)).isoformat()
    if any(kw in lower for kw in ["tadi pagi", "pagi ini", "siang ini", "malam tadi"]):
        return today.isoformat()

    # ISO: 2026-06-20
    m = re.search(r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b", text)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date().isoformat()
        except ValueError:
            pass

    # DMY: 20/06/2026 atau 20-06-2026
    m = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", text)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).date().isoformat()
        except ValueError:
            pass

    # "tgl 20" atau "tanggal 20"
    m = re.search(r"\b(?:tgl|tanggal)\s+(\d{1,2})\b", lower)
    if m:
        try:
            return today.replace(day=int(m.group(1))).isoformat()
        except ValueError:
            pass

    # "20 juni" atau "juni 20"
    for month_name, month_num in _MONTHS_ID.items():
        m = re.search(
            rf"\b(\d{{1,2}})\s+{month_name}\b|\b{month_name}\s+(\d{{1,2}})\b",
            lower,
        )
        if m:
            day = int(m.group(1) or m.group(2))
            try:
                return today.replace(month=month_num, day=day).isoformat()
            except ValueError:
                pass

    return today.isoformat()


def _extract_payment_method(text: str) -> str:
    """Ekstrak metode pembayaran dari teks dengan boundary matching dan prioritas eksplisit."""
    lower = text.lower()

    # 1. Prioritas Utama: Cek tag eksplisit (contoh: 'metode pembayaran : cash', 'cara bayar : tunai')
    if re.search(r'(?:metode\s+pembayaran|cara\s+bayar)\s*[:=]\s*(?:cash|tunai)', lower):
        return "cash"
    if re.search(r'(?:metode\s+pembayaran|cara\s+bayar)\s*[:=]\s*(?:transfer|tf|bank)', lower):
        return "transfer"
    if re.search(r'(?:metode\s+pembayaran|cara\s+bayar)\s*[:=]\s*(?:qris|qr)', lower):
        return "qris"
    if re.search(r'(?:metode\s+pembayaran|cara\s+bayar)\s*[:=]\s*(?:tempo|kredit|bon|utang|hutang)', lower):
        return "tempo"

    # 2. Cek keyword dengan word boundary (\b) agar tidak salah mencocokkan kata dalam nama produk (seperti 'brilian' mengandung 'bri', 'pembacaan' mengandung 'bca', 'perdana' mengandung 'dana')
    if re.search(r'\b(qris|qr)\b', lower):
        return "qris"
    if re.search(r'\b(transfer|tf|bank|bca|mandiri|bri|bni|cimb|gopay|ovo|dana|shopeepay)\b', lower):
        return "transfer"
    if re.search(r'\b(tempo|kredit|bon)\b', lower) or (re.search(r'\b(hutang|utang)\b', lower) and "modal" not in lower):
        return "tempo"
    return "cash"


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 3: DETEKSI TIPE TRANSAKSI
# ──────────────────────────────────────────────────────────────────────────────

KEYWORDS_INCOME = [
    "bunga bank", "bunga deposito", "hibah", "dividen",
    "pendapatan lain", "pendapatan bunga", "jasa giro",
    "return investasi",
]

KEYWORDS_CASH_COUNT = [
    "opname", "cash opname", "cash count",
    "cash on hand", "uang fisik", "uang tunai fisik",
    "kas fisik", "hitung kas", "saldo kas",
]

KEYWORDS_CAPITAL = [
    "modal", "setoran modal", "setoran awal", "investasi awal",
    "ekuitas", "dana awal", "modal usaha", "modal kerja",
    "tambah modal", "setor modal", "pengembalian modal", "penarikan modal",
    "tarik modal", "prive", "withdraw modal", "ambil modal", "ditarik investor", "penyertaan modal",
]

KEYWORDS_CUSTOMER_DEPOSIT = [
    "tabungan customer", "tabungan pelanggan", "setor tabungan", "setoran tabungan", "simpanan",
    "paket lebaran", "angsuran lebaran", "cicilan lebaran", "setor paket", "setoran paket",
    "paket sembako", "tabungan sembako", "tabungan paket", "titipan pelanggan", "titipan dana",
    "dp customer", "dp pelanggan", "uang muka", "down payment", "panjar", "titipan", "tabungan",
]

KEYWORDS_CUSTOMER_WITHDRAWAL = [
    "tarik tabungan", "penarikan tabungan", "ambil tabungan", "kembalikan tabungan", "cairkan tabungan",
]

# Retur selalu ke LLM — efek jurnal berbeda (retur beli vs retur jual)
KEYWORDS_RETUR = [
    "retur", "refund", "pengembalian uang", "kembalikan uang",
    "barang kembali", "return barang",
]

KEYWORDS_SALES = [
    # Formal
    "penjualan", "pendapatan penjualan", "omzet", "omset", "revenue",
    "pendapatan toko", "pendapatan harian", "pendapatan hari ini", "pendapatan",
    # Ringkasan harian
    "penerimaan penjualan", "penerimaan", "pemasukan",
    "hasil penjualan", "hasil toko", "hasil jualan",
    # Informal / slang
    "jualan", "laku", "dagangan laku", "dapet dari jualan",
    "uang masuk dari sales", "cash masuk", "uang masuk",
    "terima uang", "terima pembayaran", "terima pelunasan",
    "sales", "sell", "sold",
    # Transfer masuk dari pelanggan
    "transfer masuk", "tf masuk",
    "pembayaran customer", "pelunasan piutang", "bayar piutang",
    # Bahasa Inggris campuran
    "daily sales", "income harian",
]

KEYWORDS_PURCHASE = [
    # Formal
    "pembelian", "belanja", "kulakan", "stok masuk",
    "beli barang", "beli stok", "beli bahan", "beli material",
    "bayar supplier", "bayar vendor", "bayar ke supplier",
    "hutang supplier", "pelunasan hutang beli", "bayar hutang pembelian",
    "purchase", "procure", "restock", "restok",
    # Dokumen pembelian — PATOKAN UTAMA
    "faktur", "invoice", "nota pembelian", "nota beli",
    "inv.", "inv ", "fak.", "fak ",
    # Informal — hanya bila konteks jelas (bukan bensin/listrik)
    "borong", "kulak",
]

KEYWORDS_EXPENSE = [
    # Utilitas
    "listrik", "pln", "air", "pdam", "internet", "wifi",
    "telpon", "telepon", "pulsa", "token listrik",
    # Bahan bakar & transport — HARUS di sini bukan purchase
    "bensin", "bbm", "solar", "pertamax", "pertalite",
    "transport", "ongkir", "ongkos kirim", "parkir", "tol",
    # Tempat usaha
    "sewa", "kontrak", "rent",
    # SDM
    "gaji", "upah", "thr", "bonus karyawan", "lembur",
    # Overhead
    "biaya", "beban", "pengeluaran", "expense", "cost",
    "operasional", "overhead",
    # Pemasaran
    "iklan", "promosi", "ads", "marketing",
    # Admin
    "atk", "alat tulis", "fotocopy", "fotokopi", "print",
    "servis", "service", "perbaikan", "maintenance",
    # Keluar
    "uang keluar", "tf keluar", "transfer keluar",
    # Pajak & legal
    "pajak", "ppn", "pph", "bpjs", "iuran", "perizinan",
]

# Kata kerja ambigu: "bayar" tanpa konteks = bisa expense ATAU purchase
# Kata "beli" tanpa konteks jelas juga bisa ke expense (beli bensin)
# → deteksi akan mengecek apakah ada keyword EXPENSE yang lebih spesifik

# Kata yang menunjukkan pertanyaan/perintah (bukan transaksi)
_AMBIGUOUS_SIGNALS = [
    "berapa", "apa itu", "bagaimana", "tolong", "minta", "tanya",
    "cek ", "check ", "lihat", "tampilkan", "laporan", "rekap",
]


def _has_ambiguous_intent(text_lower: str) -> bool:
    return any(sig in text_lower for sig in _AMBIGUOUS_SIGNALS)


def _detect_type(text_lower: str) -> Optional[str]:
    """
    Deteksi transaction_type dari keyword.
    Return None jika tidak yakin → LLM yang handle.

    Urutan: paling spesifik → paling umum.
    """
    if _has_ambiguous_intent(text_lower):
        return None

    # Retur → selalu LLM
    if any(kw in text_lower for kw in KEYWORDS_RETUR):
        return None

    # Spesifik non-operasional dulu
    if any(kw in text_lower for kw in KEYWORDS_INCOME):
        return "income"
    if any(kw in text_lower for kw in KEYWORDS_CASH_COUNT):
        return "cash_count"
    if any(kw in text_lower for kw in ["koreksi", "pindah", "pemindahan", "reklasifikasi"]) and "modal" in text_lower and any(kw in text_lower for kw in ["titipan", "hutang", "utang", "simpanan", "pelanggan", "tabungan"]):
        return "capital_reclassification"
    if any(kw in text_lower for kw in KEYWORDS_CUSTOMER_WITHDRAWAL):
        return "customer_withdrawal"
    if any(kw in text_lower for kw in KEYWORDS_CUSTOMER_DEPOSIT):
        return "customer_deposit"
    if any(kw in text_lower for kw in KEYWORDS_CAPITAL):
        if any(kw in text_lower for kw in ["tarik", "pengembalian", "penarikan", "prive", "withdraw", "ambil"]):
            return "capital_withdrawal"
        return "capital"

    # Deteksi utilitas, BBM & biaya operasional spesifik terlebih dahulu
    if any(kw in text_lower for kw in ["listrik", "pln", "token", "pdam", "internet", "wifi", "indihome", "speedy", "telepon", "pulsa", "bensin", "bbm", "pertalite", "pertamax", "solar", "spbu", "biaya operasional", "operasional", "pengeluaran toko", "biaya toko", "biaya kantor"]):
        return "operational"

    is_sales    = any(kw in text_lower for kw in KEYWORDS_SALES)
    is_expense  = any(kw in text_lower for kw in KEYWORDS_EXPENSE)
    is_purchase = any(kw in text_lower for kw in KEYWORDS_PURCHASE)

    # Expense lebih spesifik menang atas purchase jika keduanya ada
    # (mis: "beli bensin" → expense, bukan purchase)
    if is_expense and is_purchase:
        return "expense"

    # Sales vs expense/purchase — jika sales terdeteksi, prioritaskan
    if is_sales and not is_purchase and not is_expense:
        return "sales"

    # Sales + expense (misal "terima uang bayar ongkir") → ambigu → LLM
    if is_sales and (is_expense or is_purchase):
        return None

    if is_purchase:
        return "purchase"
    if is_expense:
        return "expense"

    return None


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 4: DETEKSI INPUT KOMPLEKS → harus ke LLM
# ──────────────────────────────────────────────────────────────────────────────

_ITEM_DETAIL_PATTERNS = [
    r"@",                               # harga satuan
    r"\bpcs\b",
    r"(?<![a-z])kg(?![a-z])",           # "50kg" tapi bukan "pkg"
    r"\bltr\b|\bliter\b",
    r"\bbuah\b",
    r"\bdus\b|\bkarton\b|\bktn\b",
    r"\bpack\b|\bpck\b|\bpak\b",
    r"(?<![a-z])rim(?![a-z])",          # "rim" tapi bukan "penerimaan"
    r"\blembar\b|\blbr\b",
    r"\bunit\b",
    r"\bpotong\b|\bptg\b",
    r"\bbiji\b",
    r"\bset\b(?=\s+\d|\s*[,;])",        # "set" diikuti angka atau pemisah
    r"\bbotol\b|\bbtl\b",
    r"\bkaleng\b|\bklt\b",
    r"\bsak\b",
    r"\bgallon\b|\bgalon\b",
    r"(?<!\w)x\s*\d",                   # "2x15000" atau "2 x 15000"
    r"\*\s*\d",                         # "2 * 15000"
    r"\bharga\s+\d",
    r"\bqty\b|\bquantity\b",
]

_ITEM_DETAIL_RE = re.compile("|".join(_ITEM_DETAIL_PATTERNS), re.IGNORECASE)

# Pemisah multi-item: koma/titik koma diikuti kata
_MULTI_ITEM_SEP_RE = re.compile(r"[,;]\s*\w")


def _is_summary_input(text: str) -> bool:
    """
    True jika teks adalah input ringkasan (satu total, tanpa detail item).
    False → butuh LLM.
    """
    words = text.strip().split()
    if len(words) > 15:
        return False

    if _ITEM_DETAIL_RE.search(text):
        return False

    # Ada pemisah multi-item DAN angka-angka kecil berbeda (harga satuan)
    if _MULTI_ITEM_SEP_RE.search(text):
        small_nums = [n for n in _extract_all_numbers(text) if n < 500_000]
        if len(small_nums) >= 2:
            return False

    return True


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 5: PUBLIC API
# ──────────────────────────────────────────────────────────────────────────────

_TYPE_DESCRIPTION = {
    "sales":      "Penerimaan Penjualan",
    "purchase":   "Pembelian Barang/Bahan",
    "expense":    "Pengeluaran/Beban Operasional",
    "income":     "Pendapatan Lain-lain",
    "cash_count": "Opname Kas",
    "capital":                 "Setoran Modal",
    "capital_withdrawal":      "Pengembalian Modal",
    "capital_reclassification":"Koreksi Reklasifikasi Modal",
    "customer_deposit":        "Penerimaan Uang Muka / Titipan Pelanggan",
    "customer_withdrawal":     "Pengembalian Titipan Pelanggan",
}


def try_rule_based_parse(text: str) -> Optional[dict]:
    """
    Coba parse teks transaksi tanpa LLM.

    Return dict jika confidence tinggi, atau None → fallback ke LLM.

    Rule HIT jika:
      1. Tipe transaksi terdeteksi (bukan ambigu)
      2. Ada angka valid >= 1000 (setelah resolve shorthand)
      3. Input adalah ringkasan (tidak ada detail item/satuan)

    Rule MISS → LLM jika:
      - Retur/refund (efek jurnal berbeda)
      - Detail satuan item (kg, pcs, @harga, dst)
      - Multi-item dipisah koma
      - Keyword ambigu/bertabrakan
      - Pertanyaan/perintah
      - Teks > 15 kata
    """
    # Normalisasi internal (handle shorthand, Rp, titik ribuan)
    norm = normalize_amount_text(text)
    lower = norm.lower()

    # Deteksi tipe
    t_type = _detect_type(lower)
    if t_type is None:
        return None

    # Ekstrak amount
    total = _extract_total_amount(norm)
    if total == 0:
        return None

    # Pastikan input simpel
    if not _is_summary_input(norm):
        return None

    # Ekstrak tanggal dan metode pembayaran dari teks asli
    transaction_date = _extract_date(text)
    payment_method = _extract_payment_method(text)

    desc = text.strip()[:120] if len(text.strip()) >= 5 else _TYPE_DESCRIPTION.get(t_type, text)

    return {
        "transaction_date": transaction_date,
        "description": desc,
        "total_amount": total,
        "transaction_type": t_type,
        "payment_method": payment_method,
        "items": [],
        "_source": "rule_based",
    }


def build_minimal_prompt(normalized_text: str, today_date: str, coa_context: str = "", catalog_context: str = "") -> tuple:
    """
    Bangun prompt minimal untuk teks kompleks yang tidak tertangani rule-based.

    COA hanya di-inject jika non-empty (coa_context).
    Katalog hanya di-inject jika non-empty (catalog_context).

    Returns:
        (system_instruction, prompt)
    """
    system_instruction = (
        "Anda adalah pakar akuntansi retail SAK EMKM / PSAK. "
        "Ekstrak data dari Smart Note menjadi JSON.\n\n"
        "ATURAN WAJIB:\n"
        "1. KLASIFIKASI RINGKASAN VS DETAIL (PENTING):\n"
        "   - Jika teks bermakna penjualan global, rekapitulasi, total penjualan hari kemarin/hari ini, atau pendapatan global (misal: 'total penjualan kemarin Rp 2.500.000', 'omset hari ini 5 juta', 'pendapatan toko 3jt') TANPA menyebutkan barang-barang ritel secara spesifik, maka transaksi ini adalah TRANSAKSI RINGKASAN.\n"
        "   - Untuk TRANSAKSI RINGKASAN, dilarang keras memecah barang atau membuat item dummy. Properti 'items' HARUS diset kosong: []. Ini penting agar sistem dapat menghitung HPP secara pro-rata otomatis.\n"
        "   - Properti 'items' HANYA boleh diisi jika pengguna secara eksplisit menyebutkan daftar nama barang, jumlah (qty), dan harga satuan yang jelas (misal: '2 sabun @5000, beras 50rb'). PENTING: Anda WAJIB mengekstrak item tersebut meskipun ditulis menyambung dalam satu kalimat tanpa menggunakan format daftar/bullet point (contoh: 'Pembelian Telur 15kg @22700' harus diekstrak sebagai item telur, BUKAN diringkas menjadi items kosong).\n"
        "2. ZERO HALUSINASI: Jika tidak ada rincian barang nyata → items: [].\n"
        "3. KLASIFIKASI SEMANTIK TIPE TRANSAKSI (WHOLE-CONTEXT ECONOMIC INTENT):\n"
        "   Evaluasi SELURUH KALIMAT secara utuh untuk memahami tujuan ekonomi transaksi:\n"
        "   - EXPENSE / OPERATIONAL (Beban Operasional Toko): Bila barang/layanan dibeli untuk DIPAKAI SENDIRI / DIKONSUMSI OPERASIONAL toko (contoh: BBM/Bensin/Pertalite/Pertamax/Solar di SPBU untuk armada/kendaraan toko, Listrik/PLN, Beli Token, Wifi/Internet, Air/PDAM, Makan karyawan, Alat tulis kantor, Sewa tempat). PENTING: Meskipun kalimat diawali kata 'Pembelian' atau 'Beli' (misal: 'Pembelian BBM Pertalite di SPBU', 'Beli bensin 50rb', 'Pembelian token listrik 100rb'), Anda WAJIB mengklasifikasikannya sebagai 'operational' atau 'expense' karena barang tersebut dikonsumsi sendiri untuk operasional toko, BUKAN stok barang dagangan.\n"
        "   - PURCHASE (Pembelian Stok Dagangan / Restock): Bila barang yang dibeli adalah BARANG RETAIL / MATERIAL UNTUK DIJUAL KEMBALI atau diproses menjadi produk jualan toko (contoh: kulakan beras, minyak, rokok, tepung, belanja grosir dari supplier eksternal seperti Kusuma Tk, SUKUN, Indomarco, dll.).\n"
        "   - SALES (Penjualan / Omzet): Bila transaksi merupakan pendapatan/penerimaan dari pembeli/konsumen eceran toko.\n"
        "   - RETUR SUPPLIER / PELANGGAN: 'purchase_return' jika pengembalian barang ke supplier, 'sales_return' jika retur dari pelanggan.\n"
        "   - 'income' HANYA untuk pendapatan non-operasional (bunga bank, hibah, dividen).\n"
        "4. PEMETAAN AKUN COA YANG TEPAT:\n"
        "   - Pengeluaran utilitas toko (seperti 'Belanja Listrik Toko', 'Wifi/Internet', 'Bayar PDAM/Air') WAJIB dikategorikan ke akun 'Beban Listrik, Air & Internet' (atau akun sejenis berkode 6-1301) bila tersedia di daftar COA, bukan ke akun beban lain-lain / beban operasional lainnya.\n"
        "5. Angka shorthand (3jt/500rb/Rp) sudah dinormalisasi sebelum dikirim ke sini.\n"
        "6. Jika ada tanggal eksplisit di teks, gunakan itu. Jika ada kata 'kemarin' atau 'hari kemarin', hitung tanggal kemarin relatif dari today_date. Jika tidak ada tanggal → gunakan today_date.\n"
        "7. Ekstrak satuan barang (seperti kg, pcs, btl, ctn, ltr, rtg) ke dalam properti 'unit' jika ada di teks. Jika tidak ada, gunakan default 'pcs'.\n"
        "8. Standardisasi Barang & Supplier: Prioritaskan penggunaan nama barang dan nama supplier dari KATALOG DATABASE jika bunyinya mirip (koreksi typo).\n"
        "9. PEMISAHAN NAMA BARANG BER-ANGKA DAN KUANTITAS (QTY):\n"
        "   Seringkali nama barang memiliki angka/ukuran (seperti '500g', '10Kg', 'ISI 15') yang bersebelahan dengan jumlah barang (QTY).\n"
        "   - Contoh 1: 'tepung beras 500g 10Kg 12000' -> Nama='tepung beras 500g', Qty=10, Unit='Kg', Harga=12000.\n"
        "   - Contoh 2: 'Beras Obor 10Kg 5pack x 146000' -> Nama='Beras Obor 10Kg', Qty=5, Unit='pack', Harga=146000.\n"
        "   - Contoh 3: 'TONG TJI TEA ISI 15 20 pcs @ 2800' -> Nama='TONG TJI TEA ISI 15', Qty=20, Unit='pcs', Harga=2800.\n"
        "   PANDUAN PENTING: Angka/satuan yang berada paling belakang atau berdekatan dengan lambang harga ('@', 'x', 'Rp') adalah QTY transaksi Anda. Angka yang mendahuluinya adalah bagian dari NAMA BARANG.\n"
        "10. METODE PEMBAYARAN: Jika terdapat kata 'QRIS', 'QR', 'Transfer', 'TF', 'Bank', 'Gopay', 'Ovo', 'Dana', 'ShopeePay', Anda WAJIB mengeset payment_method: 'qris' atau 'transfer'. Ini penting agar sistem secara otomatis mendebit akun Bank (1-1102 / Non-Tunai) bukan Kas Tunai (1-1101).\n"
        "11. DETEKSI UANG MUKA / DP CUSTOMER (PENTING & WAJIB):\n"
        "   - HANYA BERLAKU UNTUK PENJUALAN (SALES): Aturan ini HANYA berlaku jika transaksi adalah PENJUALAN dari pembeli/pelanggan ke kita (contoh: 'Pendapatan DP Uang Muka dari Bu Hariyani', 'Terima DP 500rb dari Pak Budi'). Anda WAJIB mengeset payment_method: 'customer_deposit'.\n"
        "   - DILARANG KERAS PADA PEMBELIAN (PURCHASE): Jika teks adalah nota/faktur pembelian dari supplier (contoh: 'Pembelian di PT. BAHAGIA SUMBER ABADI'), payment_method WAJIB mengikuti cara bayar faktur (contoh: 'cash' atau 'tempo').\n"
        "   - ANTI-SALAH DETEKSI NAMA PRODUK: Singkatan nama varian produk seperti 'EDP' (contoh: 'SOKLIN POWDET DET EDP') BUKAN penanda Down Payment. Jangan terkecoh!"
    )

    coa_section = f"\n{coa_context.strip()}\n" if coa_context.strip() else ""
    catalog_sec = f"\n{catalog_context.strip()}\n" if catalog_context.strip() else ""

    prompt = (
        f"{coa_section}"
        f"{catalog_sec}"
        f"\nTeks Input Transaksi: \"{normalized_text}\"\n"
        f"(today_date = \"{today_date}\" jika tidak ada tanggal di teks)\n\n"
        "Output JSON:\n"
        "{\n"
        "  \"transaction_date\": \"YYYY-MM-DD\",\n"
        "  \"description\": \"string singkat\",\n"
        "  \"total_amount\": number,\n"
        "  \"transaction_type\": \"sales|purchase|expense|operational|income|cash_count|capital|capital_withdrawal|capital_reclassification|customer_deposit|customer_withdrawal|purchase_return|sales_return\",\n"
        "  \"contact_name\": \"nama supplier atau pelanggan (opsional)\",\n"
        "  \"payment_method\": \"cash|transfer|qris|tempo\",\n"
        "  \"due_date\": \"YYYY-MM-DD (jika tempo)\",\n"
        "  \"items\": [\n"
        "    { \"name\": \"string\", \"qty\": number, \"unit\": \"string (kg|pcs|rtg|btl|ctn|dll)\", \"unit_price\": number, \"discount\": number, \"total\": number }\n"
        "  ]\n"
        "}"
    )

    return system_instruction, prompt

