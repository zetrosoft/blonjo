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
from datetime import datetime
from enum import Enum
from typing import Optional, List


class TransactionClass(str, Enum):
    KAS_GLOBAL = "KAS_GLOBAL"       # Kas, rekonsiliasi, selisih — SKIP pricing rules
    PRODUCT_SALES = "PRODUCT_SALES" # Jual beli barang — butuh pricing rules
    UNKNOWN = "UNKNOWN"             # Fallback — bawa context minimal


PATTERNS_KAS_GLOBAL = [
    r'(?i)(selisih|rekonsiliasi)\s+(uang\s+)?tunai\s*([\d.,]+)?',
    r'(?i)(tambahan|kurang)\s+(uang\s+)?(tunai|kas)\s*([\d.,]+)?',
    r'(?i)(pendapatan|pengeluaran)\s+(tambahan|lain[- ]?lain)\s*([\d.,]+)?',
    r'(?i)(setoran|penarikan)\s+(kas|tunai)\s*([\d.,]+)?',
    r'(?i)^(biaya|bayar)\s+\w+[\s\d.,]+$',
    r'(?i)(modal|gaji|upah|sewa)\s+[\d.,]+',
]


def classify_transaction(text: str) -> TransactionClass:
    normalized = text.lower().strip()
    for pattern in PATTERNS_KAS_GLOBAL:
        if re.search(pattern, normalized):
            return TransactionClass.KAS_GLOBAL
    product_signals = [
        'kg', 'gram', 'gr', 'pcs', 'btl', 'ctn', 'pack', 'ons',
        'liter', 'beli', 'belanja', 'jual', 'jualan', '@', 'per '
    ]
    if any(kw in normalized for kw in product_signals):
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
    "tambah modal", "setor modal",
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
    if any(kw in text_lower for kw in KEYWORDS_CAPITAL):
        return "capital"

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
    "capital":    "Setoran Modal",
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

    # Ekstrak tanggal dari teks asli (sebelum normalisasi angka)
    transaction_date = _extract_date(text)

    desc = text.strip()[:120] if len(text.strip()) >= 5 else _TYPE_DESCRIPTION.get(t_type, text)

    return {
        "transaction_date": transaction_date,
        "description": desc,
        "total_amount": total,
        "transaction_type": t_type,
        "items": [],
        "_source": "rule_based",
    }


def build_minimal_prompt(normalized_text: str, today_date: str, coa_context: str = "") -> tuple:
    """
    Bangun prompt minimal untuk teks kompleks yang tidak tertangani rule-based.

    COA hanya di-inject jika non-empty (coa_context).

    Returns:
        (system_instruction, prompt)
    """
    system_instruction = (
        "Anda adalah pakar akuntansi retail PSAK EMKM. "
        "Ekstrak data dari Smart Note menjadi JSON.\n\n"
        "ATURAN WAJIB:\n"
        "1. KLASIFIKASI RINGKASAN VS DETAIL (PENTING):\n"
        "   - Jika teks bermakna penjualan global, rekapitulasi, total penjualan hari kemarin/hari ini, atau pendapatan global (misal: 'total penjualan kemarin Rp 2.500.000', 'omset hari ini 5 juta', 'pendapatan toko 3jt') TANPA menyebutkan barang-barang ritel secara spesifik, maka transaksi ini adalah TRANSAKSI RINGKASAN.\n"
        "   - Untuk TRANSAKSI RINGKASAN, dilarang keras memecah barang atau membuat item dummy. Properti 'items' HARUS diset kosong: []. Ini penting agar sistem dapat menghitung HPP secara pro-rata otomatis.\n"
        "   - Properti 'items' HANYA boleh diisi jika pengguna secara eksplisit menyebutkan daftar nama barang, jumlah (qty), dan harga satuan yang jelas (misal: '2 sabun @5000, beras 50rb').\n"
        "2. ZERO HALUSINASI: Jika tidak ada rincian barang nyata → items: [].\n"
        "3. Jika terdapat kata 'Pembelian', 'Kulakan', 'Belanja', atau ketika nama toko tenant kita terdaftar sebagai Pelanggan pada nota tagihan supplier → set transaction_type: 'purchase'.\n"
        "4. Jika terdapat kata 'Penjualan', 'Pendapatan', 'Penerimaan' operasional toko kita ke konsumen → set transaction_type: 'sales'.\n"
        "5. 'income' HANYA untuk pendapatan non-operasional (bunga bank, hibah, dividen).\n"
        "6. Angka shorthand (3jt/500rb/Rp) sudah dinormalisasi sebelum dikirim ke sini.\n"
        "7. Jika ada tanggal eksplisit di teks, gunakan itu. Jika tidak → gunakan today_date.\n"
        "8. Ekstrak satuan barang (seperti kg, pcs, btl, ctn, ltr) ke dalam properti 'unit' jika ada di teks. Jika tidak ada, gunakan default 'pcs'."
    )

    coa_section = f"\n{coa_context.strip()}\n" if coa_context.strip() else ""

    prompt = (
        f"{coa_section}"
        f"\nTeks Input Transaksi: \"{normalized_text}\"\n"
        f"(today_date = \"{today_date}\" jika tidak ada tanggal di teks)\n\n"
        "Output JSON:\n"
        "{\n"
        "  \"transaction_date\": \"YYYY-MM-DD\",\n"
        "  \"description\": \"string singkat\",\n"
        "  \"total_amount\": number,\n"
        "  \"transaction_type\": \"sales|purchase|expense|income|cash_count|capital\",\n"
        "  \"items\": [\n"
        "    { \"name\": \"string\", \"qty\": number, \"unit\": \"string (kg|pcs|btl|ctn|dll)\", \"unit_price\": number, \"total\": number }\n"
        "  ]\n"
        "}"
    )

    return system_instruction, prompt
