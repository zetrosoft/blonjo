import { formatRp, formatNumber } from './utils';
import { mcpClient } from '../api/mcpClient';

/**
 * Smart Transaction Parser — NLP Engine Lokal v2
 * ================================================
 * @security Input di-sanitize sebelum diproses — XSS safe
 * @version 2.0 — Improved item parsing, correct total, clean description
 */

export type TransactionType =
  | 'purchase'
  | 'sales'
  | 'income'
  | 'operational'
  | 'non_cash_out'
  | 'non_cash_in'
  | 'capital'
  | 'manual'
  | 'cash_count';

export interface ParsedItem {
  name: string;
  qty: number;
  unit: string;       // satuan: kg, pcs, ltr, dll
  unit_price: number;
  total: number;
  contact_name?: string;
}

export interface ParsedTransaction {
  transaction_type: TransactionType;
  type_label: string;
  type_color: string;
  description: string;
  total_amount: number;
  transaction_date: string;
  contact_name?: string; // Tambahkan ini
  contact_address?: string;
  payment_method?: string;
  due_date?: string;
  items: ParsedItem[];
  raw_text: string;
  confidence: 'high' | 'medium' | 'low';
  suggested_entries?: any[];
}

// ─────────────────────────────────────────────
//  KEYWORD MAP
// ─────────────────────────────────────────────
interface TypeRule {
  type: TransactionType;
  label: string;
  color: string;
  keywords: string[];
}

export const TYPE_RULES: TypeRule[] = [
  {
    type: 'purchase',
    label: 'Pengeluaran (Belanja)',
    color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    keywords: ['pembelian', 'purchase', 'belanja', 'beli', 'pembayaran piutang', 'bayar piutang', 'lunas piutang'],
  },
  {
    type: 'sales',
    label: 'Penjualan Barang / Toko',
    color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    keywords: ['penjualan', 'hasil jualan', 'jual', 'sales', 'pos kasir', 'pendapatan hari ini', 'omzet'],
  },
  {
    type: 'income',
    label: 'Pendapatan Non-Usaha / Jasa',
    color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    keywords: ['pendapatan', 'income', 'pembayaran hutang', 'bayar hutang', 'terima pembayaran', 'terima uang'],
  },
  {
    type: 'operational',
    label: 'Pengeluaran Operasional',
    color: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    keywords: ['bbm', 'bensin', 'bahan bakar', 'solar', 'premium', 'transport', 'transportasi', 'ojek', 'taksi', 'grab', 'gojek', 'ongkir', 'uang makan', 'makan siang', 'makan malam', 'konsumsi', 'snack', 'gaji pegawai', 'gaji karyawan', 'upah', 'thr', 'honor', 'bayar listrik', 'listrik', 'pln', 'bayar wifi', 'wifi', 'internet', 'indihome', 'bayar tagihan', 'tagihan', 'iuran', 'langganan', 'pulsa'],
  },
  {
    type: 'non_cash_out',
    label: 'Pengeluaran Non-Tunai',
    color: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    keywords: ['transfer keluar', 'kirim uang', 'transfer ke', 'trf keluar', 'bank', 'atm', 'setor', 'bayar via bank'],
  },
  {
    type: 'non_cash_in',
    label: 'Pendapatan Non-Tunai',
    color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    keywords: ['transfer masuk', 'terima transfer', 'trf masuk', 'qris', 'scan qr', 'gopay', 'ovo', 'dana', 'shopeepay', 'e-wallet'],
  },
  {
    type: 'capital',
    label: 'Modal / Saldo Awal',
    color: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    keywords: ['tambah modal', 'setor modal', 'modal awal', 'tambahan modal', 'investasi', 'inject modal', 'saldo awal', 'saldo akhir', 'saldo bulan'],
  },
  {
    type: 'manual',
    label: 'Manual Journal',
    color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    keywords: ['jurnal', 'manual', 'memo'],
  },
  {
    type: 'cash_count',
    label: 'Opname Kas (Selisih)',
    color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    keywords: ['opname kas', 'tunai hari ini', 'cash on hand', 'uang di tangan', 'uang fisik', 'hitung kas'],
  },
];

// ─────────────────────────────────────────────
//  SMART INDONESIAN NORMALIZER
// ─────────────────────────────────────────────
function normalizeIndonesianSlang(text: string): string {
  return text.toLowerCase()
    .replace(/\bjt\b/g, 'juta')
    .replace(/\brb\b/g, 'ribu')
    .replace(/\bk\b/g, 'ribu')
    .replace(/\bbks\b/g, 'bungkus')
    .replace(/\bbtl\b/g, 'botol')
    .replace(/\bpak\b/g, 'pack')
    .replace(/\bdus\b/g, 'box')
    .replace(/\blbr\b/g, 'lembar')
    .replace(/\btrf\b/g, 'transfer')
    .replace(/\bsdh\b/g, 'sudah')
    .replace(/\btgl\b/g, 'tanggal')
    .replace(/\butk\b/g, 'untuk')
    .replace(/\bdgn\b/g, 'dengan')
    .replace(/\bkrn\b/g, 'karena')
    .replace(/\bbayarnya\b/g, 'bayar')
    .replace(/\bngutang\b/g, 'hutang')
    .replace(/\bjualan\b/g, 'penjualan');
}

// ─────────────────────────────────────────────
//  SANITIZER
// ─────────────────────────────────────────────
function sanitizeText(text: string): string {
  const normalized = normalizeIndonesianSlang(text);
  return normalized
    .replace(/[<>{}]/g, '')
    .substring(0, 5000)
    .trim();
}

// ─────────────────────────────────────────────
//  PARSE ANGKA FORMAT INDONESIA
import { parseUniversalNumber } from './numericHeuristics';

//  "16.000" → 16000  |  "1.500.000" → 1500000
//  "16,5"   → 16.5   |  "800.000"   → 800000
// ─────────────────────────────────────────────
export function parseIDNumber(str: string): number {
  return parseUniversalNumber(str);
}

// ─────────────────────────────────────────────
//  PARSE DENGAN SUFFIX (50rb, 1.5jt, 800k)
// ─────────────────────────────────────────────
export function parseAmountWithSuffix(str: string): number {
  const lower = str.toLowerCase().trim();
  const jutaMatch = lower.match(/^([\d.,]+)\s*(jt|juta)$/);
  if (jutaMatch) return Math.round(parseIDNumber(jutaMatch[1]) * 1_000_000);
  const ribuMatch = lower.match(/^([\d.,]+)\s*(rb|ribu|k)$/);
  if (ribuMatch) return Math.round(parseIDNumber(ribuMatch[1]) * 1_000);
  return parseIDNumber(str);
}

// ─────────────────────────────────────────────
//  SATUAN YANG DIKENALI
// ─────────────────────────────────────────────
const UNITS_RE =
  'kg|gram|gr|g|ltr|liter|lt|ml|pcs|biji|buah|pak|pack|dus|karton|botol|btl|bks|bungkus|pouch|lusin|kodi|lembar|lbr|meter|m|unit|set|porsi|sak|ball|kotak|kaleng|roll|rim|pasang';

// ─────────────────────────────────────────────
//  BARIS YANG HARUS DI-SKIP (header/total)
// ─────────────────────────────────────────────
const SKIP_PATTERN =
  /^(total|subtotal|grand total|bayar|kembalian|diskon|discount|pajak|ppn|dp|uang muka|tanggal|date|keterangan|catatan|no\.?|nomor|transaksi|nota|invoice|struk)/i;

// ─────────────────────────────────────────────
//  CHECK BARIS TANGGAL / JUDUL TRANSAKSI
// ─────────────────────────────────────────────
function isDateLine(line: string): boolean {
  const lower = line.toLowerCase();
  
  // Cocokkan pola tanggal format "22 Mei 2026" atau "22/05/2026" atau "2026-05-22"
  const dateRegex1 = /\b\d{1,2}[-\/\s]+(jan|feb|mar|apr|mei|jun|jul|aug|agu|sep|okt|nov|des)[a-z]*[-\/\s]*(\d{2,4})?\b/i;
  const dateRegex2 = /\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/;
  const dateRegex3 = /\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/;
  
  if (dateRegex1.test(lower) || dateRegex2.test(lower) || dateRegex3.test(lower)) {
    return true;
  }
  
  // Heuristik tambahan: jika di akhir baris adalah angka tahun (2020-2035) dan mengandung kata transaksi
  const yearEndMatch = lower.match(/\b(202\d|203\d)\b$/);
  if (yearEndMatch) {
    if (/pengeluaran|pemasukan|belanja|jurnal|tanggal|date|transaksi/i.test(lower)) {
      return true;
    }
  }
  
  return false;
}

// ─────────────────────────────────────────────
//  EXTRACT ITEMS — Mendukung semua format
// ─────────────────────────────────────────────
export function extractItems(text: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length >= 2);
  let globalContact: string | undefined = undefined;
  
  for (const rawLine of lines) {
    if (rawLine.includes('|') && rawLine.includes('---')) continue;
    if (SKIP_PATTERN.test(rawLine)) continue;
    if (isDateLine(rawLine)) continue;
    
    // 1. Bersihkan noise di awal baris (bullet points, dash, space)
    let lineContent = rawLine.replace(/^[\s•\-\*]+/, '').trim();
    if (lineContent.startsWith('"') || lineContent.startsWith('{') || lineContent.startsWith('}')) continue;
    
    let currentContact: string | undefined = undefined;
    
    // 2. Tanda ":" adalah pemisah struktural (Header Supplier : Daftar Items)
    const colonIdx = lineContent.indexOf(':');
    if (colonIdx > 0 && colonIdx < 80) {
      const leftPart = lineContent.substring(0, colonIdx).trim();
      const rightPart = lineContent.substring(colonIdx + 1).trim();
      
      // Aturan: Cari teks setelah kata 'di' tetapi sebelum tanda ':'
      // Contoh: "Belanja tgl 26/05/2026 di Sales Unilever :" -> "Sales Unilever"
      let supplierCandidate = leftPart;
      
      // Jika ada kata ' di ', ambil hanya teks setelahnya
      const diIdx = supplierCandidate.toLowerCase().lastIndexOf(' di ');
      if (diIdx !== -1) {
        supplierCandidate = supplierCandidate.substring(diIdx + 4).trim();
      }

      // Bersihkan informasi tanggal dari kandidat supplier
      supplierCandidate = supplierCandidate
        .replace(/\btgl\s*\d{1,2}[-\/\s]\d{1,2}[-\/\s]\d{2,4}\b/i, '')
        .replace(/\b\d{1,2}[-\/\s]\d{1,2}[-\/\s]\d{2,4}\b/g, '')
        .replace(/^[\s•\-\*]+/, '')
        .replace(/^(?:supplier|merchant|toko|warung|kios|dari|nama)[\s:]+/i, '')
        .trim();

      if (supplierCandidate && !/^\d/.test(supplierCandidate) && !supplierCandidate.toLowerCase().startsWith('total')) {
        currentContact = supplierCandidate;
        globalContact = supplierCandidate;
      }
      
      // Jika ada isi di kanan, proses sebagai item. Jika tidak, baris ini hanya header supplier.
      if (rightPart.length > 0) {
        lineContent = rightPart;
      } else {
        continue; 
      }
    }

    // 3. Bersihkan sisa kata kerja/keterangan waktu
    lineContent = lineContent
      .replace(/^(?:hari ini|kemarin|besok|tadi)\s+/i, '')
      .replace(/^(?:belanja|beli|bayar|pesan|order)\s+(?:di\s+)?/i, '')
      .replace(/^[\s•\-\*]+/, '') 
      .trim();

    if (lineContent.length < 2) continue;

    // Split items by comma if present
    const segments = lineContent.includes(',') ? lineContent.split(',') : [lineContent];

    for (let segment of segments) {
      segment = segment.trim().replace(/^[\s•\-\*]+/, '');
      if (segment.length < 2) continue;
      
      // Pattern 1: Kecap Bango Manis Botol 12 Btl @ 9.255 dengan diskon 10%
      // Group 1: Name, 2: Qty, 3: Unit, 4: Unit Price, 5: Discount %
      const rxWithDiscount = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNITS_RE})\\s*(?:[xX×@]\\s*)(\\d[\\d.,]*)(?:\\s+(?:dengan\\s+)?(?:disko[n\\.]|disc|diskon)\\s*(\\d+(?:[.,]\\d+)?)\\s*[%])?`, 'i');
      
      const rxClassic = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNITS_RE})\\s*(?:per\\s+(?:${UNITS_RE})?\\s*|[xX×@]\\s*)(\\d[\\d.,]*)(?:\\s*[=]\\s*(\\d[\\d.,]*))?$`, 'i');
      const rxEqual = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNITS_RE})\\s*[=]\\s*(\\d[\\d.,]*)$`, 'i');
      const rxSimple = /^(.+?)\s+(?:total|jumlah|bayar|@)?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|ribu|jt|juta|k))?)$/i;

      let m = segment.match(rxWithDiscount);
      if (m && m[4]) {
        const name = m[1].trim();
        const qty = parseIDNumber(m[2]);
        const unit = m[3].toLowerCase();
        const rawUnitPrice = parseIDNumber(m[4]);
        const discountPct = m[5] ? parseIDNumber(m[5]) : 0;
        
        // Hitung harga setelah diskon (neto)
        const unitPrice = discountPct > 0 
          ? rawUnitPrice - (rawUnitPrice * (discountPct / 100))
          : rawUnitPrice;
          
        items.push({ 
          name, 
          qty, 
          unit, 
          unit_price: unitPrice, 
          total: qty * unitPrice, 
          contact_name: currentContact || globalContact 
        });
        continue;
      }

      m = segment.match(rxClassic);
      if (m) {
         items.push({ 
           name: m[1].trim(), 
           qty: parseIDNumber(m[2]), 
           unit: m[3].toLowerCase(), 
           unit_price: parseIDNumber(m[4]), 
           total: m[5] ? parseIDNumber(m[5]) : parseIDNumber(m[2]) * parseIDNumber(m[4]), 
           contact_name: currentContact || globalContact 
         });
         continue;
      }

      m = segment.match(rxEqual);
      if (m) {
         const qty = parseIDNumber(m[2]);
         const total = parseIDNumber(m[4]);
         items.push({ 
           name: m[1].trim(), 
           qty, 
           unit: m[3].toLowerCase(), 
           unit_price: qty > 0 ? total / qty : 0, 
           total, 
           contact_name: currentContact || globalContact 
         });
         continue;
      }

      m = segment.match(rxSimple);
      if (m) {
         const amount = parseAmountWithSuffix(m[2]);
         if (amount >= 100) {
           items.push({ 
             name: m[1].trim().replace(/^[\s•\-\*@]+/, '').trim(), 
             qty: 1, 
             unit: 'set', 
             unit_price: amount, 
             total: amount, 
             contact_name: currentContact || globalContact 
           });
           continue;
         }
      }
      
      if (segment.length > 2 && !/^\d+$/.test(segment)) {
         items.push({ 
           name: segment.replace(/^[\s•\-\*@]+/, '').trim(), 
           qty: 1, 
           unit: 'set', 
           unit_price: 0, 
           total: 0, 
           contact_name: currentContact || globalContact 
         });
      }
    }
  }
  return items;
}

// ─────────────────────────────────────────────
//  EXTRACT AMOUNT (fallback jika tidak ada items)
// ─────────────────────────────────────────────
export function extractAmount(text: string): number {
  const lower = text.toLowerCase();

  // Pattern: "total 404.000" di akhir baris atau setelah titik dua
  const explicitTotal = text.match(/(?:total|jumlah|bayar)\s*:?\s*(?:rp\.?\s*)?([\d.,]+(?:\s*(?:rb|ribu|jt|juta|k))?)/i);
  if (explicitTotal) return parseAmountWithSuffix(explicitTotal[1]);

  // Suffix: "1.5jt", "500rb"
  const jutaMatch = lower.match(/(\d[\d.,]*)\s*(jt|juta)/);
  if (jutaMatch) return Math.round(parseIDNumber(jutaMatch[1]) * 1_000_000);
  const ribuMatch = lower.match(/(\d[\d.,]*)\s*(rb|ribu|k)\b/);
  if (ribuMatch) return Math.round(parseIDNumber(ribuMatch[1]) * 1_000);

  // "Rp 150.000"
  const rpMatch = text.match(/[Rr][Pp]\.?\s*([\d.,]+)/);
  if (rpMatch) return parseIDNumber(rpMatch[1]);

  // Ambil semua angka, cari yang terbesar
  const allNums = [...text.matchAll(/\b(\d[\d.,]*)\b/g)]
    .map(m => parseIDNumber(m[1]))
    .filter(n => n >= 1000);
  if (allNums.length > 0) return Math.max(...allNums);

  return 0;
}

// ─────────────────────────────────────────────
//  EXTRACT DATE
// ─────────────────────────────────────────────
const MONTHS_ID: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4,
  mei: 5, juni: 6, juli: 7, agustus: 8,
  september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, agu: 8, sep: 9, okt: 10, nov: 11, des: 12, dec: 12,
};

export function extractDate(text: string): string {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const lower = text.toLowerCase();

  if (/hari ini|today/.test(lower)) return todayStr;
  if (/kemarin|yesterday/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  const dmyMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const textDateMatch = lower.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/);
  if (textDateMatch) {
    const [, d, monthStr, y] = textDateMatch;
    const month = MONTHS_ID[monthStr];
    if (month) {
      const year = y || today.getFullYear().toString();
      return `${year}-${String(month).padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  return todayStr;
}

// ─────────────────────────────────────────────
//  GENERATE DESCRIPTION (clean, tanpa angka)
//  Contoh output: "Belanja Gula Pasir, Beras, Minyak Goreng"
// Helper untuk memformat nama item menjadi Sentence Case agar manusiawi
function formatItemName(name: string): string {
  const words = name.split(' ');
  return words.map((w, idx) => {
    const upper = w.toUpperCase();
    if (['BBM', 'PLN', 'WIFI', 'WI-FI', 'QRIS', 'ATM', 'COA', 'SAAS', 'HPP', 'VAT'].includes(upper)) {
      return upper;
    }
    if (idx === 0) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    return w.toLowerCase();
  }).join(' ');
}

// ─────────────────────────────────────────────
function generateDescription(text: string, typeLabel: string, items: ParsedItem[]): string {
  let prefix = '';
  const lower = text.toLowerCase();
  const transaction_date = extractDate(text);
  
  if (typeLabel.includes('Belanja')) prefix = 'Pengeluaran Belanja';
  else if (typeLabel.includes('Operasional')) prefix = 'Pengeluaran Operasional';
  else if (typeLabel.includes('Pemasukan')) prefix = 'Penerimaan / Pendapatan';
  else if (typeLabel.includes('Modal')) prefix = 'Tambah Modal';
  else prefix = typeLabel;

  // Cek jika ada nama toko/supplier (prioritaskan dari item pertama jika ada contact_name)
  let supplier = items.find(i => i.contact_name)?.contact_name || '';
  
  if (!supplier) {
    const lines = text.split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 50) {
        let leftPart = line.substring(0, colonIdx).trim();
        // Aturan: Teks setelah 'di' atau 'ke'
        const diIdx = leftPart.toLowerCase().lastIndexOf(' di ');
        const keIdx = leftPart.toLowerCase().lastIndexOf(' ke ');
        const splitIdx = Math.max(diIdx, keIdx);
        
        if (splitIdx !== -1) {
          supplier = leftPart.substring(splitIdx + 4).trim();
        } else {
          // Bersihkan tanggal dari leftPart jika tidak ada 'di'
          supplier = leftPart
            .replace(/\btgl\s*\d{1,2}[-\/\s]\d{1,2}[-\/\s]\d{2,4}\b/i, '')
            .replace(/\b\d{1,2}[-\/\s]\d{1,2}[-\/\s]\d{2,4}\b/g, '')
            .trim();
        }
        
        // Bersihkan awalan seperti "Supplier:" atau "Toko:"
        supplier = supplier.replace(/^(?:supplier|merchant|toko|warung|kios|dari|nama)[\s:]+/i, '').trim();

        if (supplier && !/^\d/.test(supplier) && !supplier.toLowerCase().startsWith('total')) {
          break;
        } else {
          supplier = ''; // reset jika invalid
        }
      }
    }
  }

  if (items.length > 0) {
    const names = items.slice(0, 3).map(i => formatItemName(i.name));
    const more = items.length > 3 ? ` +${items.length - 3} item lainnya` : '';
    const itemList = names.join(', ') + more;
    
    if (typeLabel.includes('Belanja') || typeLabel.includes('Purchase')) {
      return `Belanja tanggal ${transaction_date} di ${supplier || 'Supplier'}:\n ${itemList}`;
    }
    
    if (supplier) return `${prefix} di ${supplier}: ${itemList}`;
    return `${prefix}: ${itemList}`;
  }

  const cleaned = text
    .split('\n')
    .map(l => l
      .replace(/^[\s•\-\*]+/, '')
      .replace(/[Rr][Pp]\.?\s*[\d.,]+/g, '')
      .replace(/\b\d[\d.,]*\s*(rb|ribu|jt|juta|k)?\b/gi, '')
      .replace(/[@x×=:]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    )
    .find(l => l.length > 3 && !/^\d/.test(l));

  return cleaned ? `${prefix}: ${cleaned}` : typeLabel;
}

// ─────────────────────────────────────────────
//  DETECT TRANSACTION TYPE
// ─────────────────────────────────────────────
export function detectTransactionType(text: string): { rule: TypeRule | null; confidence: 'high' | 'medium' | 'low' } {
  const lower = text.toLowerCase();
  let bestRule: TypeRule | null = null;
  let bestScore = 0;

  for (const rule of TYPE_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += kw.split(' ').length * 2;
      }
    }
    if (score > bestScore) { bestScore = score; bestRule = rule; }
  }

  const confidence =
    bestScore >= 4 ? 'high' :
    bestScore >= 2 ? 'medium' : 'low';

  return { rule: bestRule, confidence };
}

// ─────────────────────────────────────────────
//  MAIN PARSER
// ─────────────────────────────────────────────
export async function parseNoteText(rawText: string): Promise<ParsedTransaction> {
  const text = sanitizeText(rawText);

  let type = 'manual';
  let total_amount = 0;
  let items: ParsedItem[] = [];
  let contact_name = undefined;
  let confidence: 'high' | 'medium' | 'low' = 'low';

  // Fallback Lokal
  const localRule = detectTransactionType(text);
  type = localRule.rule?.type ?? 'manual';
  confidence = localRule.confidence;
  items = extractItems(text);
  total_amount = items.length > 0
    ? items.reduce((sum, i) => sum + i.total, 0)
    : extractAmount(text);
  contact_name = items.find(i => i.contact_name)?.contact_name;

  // Tentukan label dan warna berdasarkan tipe dari JSON atau Lokal
  const rule = TYPE_RULES.find(r => r.type === type);
  const transaction_date = extractDate(text);
  const description = generateDescription(text, rule?.label ?? 'Manual Journal', items);

  return {
    transaction_type: (type as TransactionType),
    type_label: rule?.label ?? 'Manual Journal',
    type_color: rule?.color ?? 'bg-muted text-muted-foreground border-border',
    description,
    total_amount,
    transaction_date,
    contact_name,
    items,
    raw_text: text,
    confidence,
  };
}

