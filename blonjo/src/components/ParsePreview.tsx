/**
 * ParsePreview — Tampilan hasil parsing transaksi
 * =================================================
 * - Badge akurasi sebaris dengan judul
 * - Tabel item: No | Nama Barang | Jml | Satuan | Harga Satuan | Total Harga
 * - Deskripsi bersih (tanpa angka mentah)
 * - Editable sebelum simpan
 */

import React from 'react';
import { parseNoteText, ParsedTransaction } from '../lib/smartParser';
import { formatRp, formatNumber } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { CheckCircle2, AlertCircle, Pencil, Cpu, Bot, Plus, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchClient } from '../api/client';

interface ParsePreviewProps {
  parsed: ParsedTransaction;
  onUpdate: (updated: Partial<ParsedTransaction>) => void;
  accounts?: any[];
  ocrSource?: 'local' | 'llm' | null;
}

// ─── Confidence badge ───────────────────────
export const CONFIDENCE_MAP = {
  high:   { label: 'Akurasi Tinggi',  icon: CheckCircle2, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  medium: { label: 'Akurasi Sedang',  icon: AlertCircle,  cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  low:    { label: 'Akurasi Rendah',  icon: AlertCircle,  cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
};

export function ParsePreview({ parsed, onUpdate, accounts = [], ocrSource }: ParsePreviewProps) {
  const [products, setProducts] = React.useState<any[]>([]);
  const [uoms, setUoms] = React.useState<any[]>([]);

  // Load products & UOMs for autocomplete
  React.useEffect(() => {
    const loadAutocompleteData = async () => {
      try {
        const prodData = await fetchClient('/inventory/products');
        if (Array.isArray(prodData)) {
          setProducts(prodData);
        }
        const uomData = await fetchClient('/inventory/uoms');
        if (Array.isArray(uomData)) {
          setUoms(uomData);
        }
      } catch (err) {
        console.error('Failed to load autocomplete data in ParsePreview:', err);
      }
    };
    loadAutocompleteData();
  }, []);

  // Normalize, auto-fill unit_price, and auto-fill unit ON INITIAL LOAD
  const initialNormalizedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const rawKey = `${parsed.raw_text}_${parsed.items.length}_${parsed.total_amount}`;
    if (initialNormalizedRef.current === rawKey) return;

    let changed = false;
    let itemsTotalSum = 0;
    const newItems = parsed.items.map(item => {
      let updatedItem = { ...item };
      
      // Normalize price field to unit_price if missing
      const rawPrice = item.unit_price ?? (item as any).price ?? (item as any).harga_satuan ?? (item as any).rate ?? 0;
      
      if (!updatedItem.unit_price || updatedItem.unit_price === 0) {
        if (rawPrice > 0) {
          changed = true;
          updatedItem.unit_price = rawPrice;
        } else if (item.total > 0 && item.qty > 0) {
          changed = true;
          updatedItem.unit_price = item.total / item.qty;
        }
      }
      
      // Re-sync total jika item.total bernilai 0 / salah kalkulasi
      const expectedTotal = updatedItem.qty * updatedItem.unit_price;
      if (expectedTotal > 0 && (!updatedItem.total || updatedItem.total === 0 || Math.abs(updatedItem.total - expectedTotal) > 0.01)) {
        changed = true;
        updatedItem.total = expectedTotal;
      }
      
      // Auto-fill unit if missing
      if (!item.unit || item.unit.trim() === '') {
        changed = true;
        updatedItem.unit = 'pcs';
      }

      itemsTotalSum += (updatedItem.total || 0);
      
      return updatedItem;
    });

    const hasItems = newItems.length > 0;
    const isTotalMismatched = hasItems && itemsTotalSum > 0 && Math.abs((parsed.total_amount || 0) - itemsTotalSum) > 0.01;

    if (changed || isTotalMismatched) {
      initialNormalizedRef.current = rawKey;
      onUpdate({
        items: newItems,
        ...(isTotalMismatched ? { total_amount: itemsTotalSum } : {})
      });
    }
  }, [parsed.raw_text, parsed.items, parsed.total_amount, onUpdate]);

  const updateItem = (idx: number, updatedFields: Partial<typeof parsed.items[0]>) => {
    const newItems = [...parsed.items];
    const item = { ...newItems[idx], ...updatedFields };
    
    // Recalculate item total if qty or price changes
    if ('qty' in updatedFields || 'unit_price' in updatedFields) {
      item.total = (item.qty || 0) * (item.unit_price || 0);
    }
    
    newItems[idx] = item;
    
    // Recalculate transaction grand total
    const newTotal = newItems.reduce((sum, i) => sum + (i.total || 0), 0);
    
    onUpdate({ 
      items: newItems,
      total_amount: newTotal 
    });
  };

  const handleAddItem = () => {
    const newItem = {
      name: '',
      qty: 1,
      unit: 'pcs',
      unit_price: 0,
      total: 0,
      is_manual_correction: true
    };
    
    const newItems = [...parsed.items, newItem];
    const newTotal = newItems.reduce((sum, i) => sum + i.total, 0);
    
    onUpdate({
      items: newItems,
      total_amount: newTotal
    });
  };

  const getAccountName = (entry: any) => {
    // Bab 10.1 ARCHITECTURE.md: UI wajib menampilkan label manusiawi (Code & Name)
    // Jika backend mengirimkan objek account lengkap (hasil perbaikan terbaru)
    if (entry.account && entry.account.name) {
      const code = entry.account.code ? `[${entry.account.code}] ` : '';
      return `${code}${entry.account.name}`;
    }
    
    // Fallback ke pencarian local accounts jika account object tidak ada
    const acc = accounts.find(a => a.id.toString() === entry.account_id.toString());
    if (acc) {
      return `[${acc.code}] ${acc.name}`;
    }
    
    return `Akun ID: ${entry.account_id}`;
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* ── Tipe & Supplier ─────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <div className={cn(
            'flex items-center justify-between px-3 h-9 rounded-md border text-xs font-semibold',
            parsed.type_color
          )}>
            <span>{parsed.type_label}</span>
            {ocrSource && (
              <span className={cn(
                'flex items-center gap-1 text-[10px] font-normal px-1.5 py-0.5 rounded-full border ml-2',
                ocrSource === 'local'
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                  : 'bg-violet-500/10 text-violet-400 border-violet-500/30'
              )}>
                {ocrSource === 'local' ? <Cpu className="w-2.5 h-2.5" /> : <Bot className="w-2.5 h-2.5" />}
                {ocrSource === 'local' ? 'Lokal' : 'AI'}
              </span>
            )}
          </div>
        </div>

        {/* ── Banner Peringatan Duplikasi AI ─── */}
        {((parsed as any).is_duplicate || (parsed as any).duplicate_warning) && (
          <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 flex items-start gap-2.5 animate-in fade-in duration-300">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1">
                ⚠️ Peringatan Duplikasi AI
              </h4>
              <p className="text-xs text-rose-400 dark:text-rose-300 leading-relaxed font-medium">
                {(parsed as any).duplicate_warning || 'Struk fisik ini terdeteksi visual/semantik sudah pernah di-scan atau dicatat di database sebelumnya.'}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Supplier Name</Label>
          <Input
            value={parsed.contact_name || ''}
            onChange={e => onUpdate({ contact_name: e.target.value })}
            className="h-9 text-sm"
            placeholder="Nama supplier..."
          />
        </div>
      </div>

      {/* ── Tanggal & Total ─────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tanggal</Label>
          <Input
            type="date"
            value={parsed.transaction_date}
            onChange={e => onUpdate({ transaction_date: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Total Nominal</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">Rp</span>
            <Input
              type="text"
              value={parsed.total_amount ? formatRp(parsed.total_amount) : ''}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const num = parseInt(raw, 10);
                onUpdate({ total_amount: isNaN(num) ? 0 : num });
              }}
              className="h-9 text-sm pl-7 font-semibold tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* ── Metode Pembayaran & Jatuh Tempo ─── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Metode Pembayaran</Label>
          <Input
            value={parsed.payment_method || ''}
            onChange={e => onUpdate({ payment_method: e.target.value })}
            className="h-9 text-sm"
            placeholder="Misal: cash, transfer, tempo..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Jatuh Tempo (Jika Tempo)</Label>
          <Input
            type="date"
            value={parsed.due_date || ''}
            onChange={e => onUpdate({ due_date: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* ── Deskripsi (bersih) ──────────────── */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Deskripsi</Label>
        <Input
          value={parsed.description}
          onChange={e => onUpdate({ description: e.target.value })}
          className="h-9 text-sm"
          placeholder="Deskripsi transaksi..."
        />
      </div>

      {/* ── Suggested Journal (Otomatis) ────── */}
      {parsed.suggested_entries && parsed.suggested_entries.length > 0 && (
        <div className="space-y-2 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 animate-in zoom-in-95 duration-500">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Jurnal Otomatis Terbentuk
            </Label>
            <span className="text-[9px] text-emerald-500/70 font-medium italic">Berdasarkan Master Data Mapping</span>
          </div>
          <div className="space-y-1.5">
            {parsed.suggested_entries.map((entry: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs border-b border-emerald-500/10 pb-1 last:border-0">
                <span className="text-muted-foreground truncate max-w-[300px]">
                  <span className="font-bold text-foreground">{getAccountName(entry)}</span>
                </span>
                <div className="flex gap-4 tabular-nums">
                  {entry.debit > 0 && <span className="text-emerald-600 font-bold">D: {formatRp(entry.debit)}</span>}
                  {entry.credit > 0 && <span className="text-rose-500 font-bold">K: {formatRp(entry.credit)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabel Item ──────────────────────── */}
      {parsed.items.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Daftar Item ({parsed.items.length})
          </Label>
          <div className="rounded-xl border border-border/50 overflow-x-auto bg-muted/10">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b border-border/50 bg-muted/40">
                  <th className="text-center px-2 py-2 font-semibold text-muted-foreground w-8">No</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Nama Barang</th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-12">Jml</th>
                  <th className="text-center px-2 py-2 font-semibold text-muted-foreground w-14">Satuan</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-28">Harga Satuan</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-28">Total Harga</th>
                </tr>
              </thead>
              <tbody>
                {parsed.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="text-center px-1 py-1 text-muted-foreground font-mono text-[10px]">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <Input
                        value={item.name}
                        list="products-datalist"
                        onChange={e => updateItem(idx, { name: e.target.value })}
                        className="h-7 text-xs border-transparent bg-transparent hover:bg-background focus:bg-background focus:border-primary/50 transition-all p-1"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="text"
                        value={item.qty ? formatNumber(item.qty) : ''}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const num = parseInt(raw, 10);
                          updateItem(idx, { qty: isNaN(num) ? 0 : num });
                        }}
                        className="h-7 text-xs text-right border-transparent bg-transparent hover:bg-background focus:bg-background focus:border-primary/50 transition-all p-1 font-mono"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        value={item.unit || ''}
                        list="uoms-datalist"
                        onChange={e => updateItem(idx, { unit: e.target.value })}
                        placeholder="—"
                        className="h-7 text-xs text-center border-transparent bg-transparent hover:bg-background focus:bg-background focus:border-primary/50 transition-all p-1"
                      />
                    </td>
                    <td className="px-2 py-1 relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-mono pointer-events-none">Rp</span>
                      <Input
                        type="text"
                        value={item.unit_price !== undefined && item.unit_price !== null ? formatNumber(item.unit_price) : ''}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const num = parseInt(raw, 10);
                          updateItem(idx, { unit_price: isNaN(num) ? 0 : num });
                        }}
                        className="h-7 text-xs text-right pl-5 border-transparent bg-transparent hover:bg-background focus:bg-background focus:border-primary/50 transition-all p-1 font-mono"
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                      {formatRp(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* ── Footer total ── */}
              <tfoot>
                <tr className="bg-muted/30 border-t border-border/50">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                    TOTAL
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-sm text-foreground">
                    {formatRp(parsed.items.reduce((s, i) => s + i.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="h-8 text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Item Manual
            </Button>
          </div>
        </div>
      )}

      {/* Datalists for autocomplete */}
      <datalist id="products-datalist">
        {products.map((p, pIdx) => (
          <option key={pIdx} value={p.name} />
        ))}
      </datalist>
      <datalist id="uoms-datalist">
        {uoms.map((u, uIdx) => (
          <option key={uIdx} value={u.code.toLowerCase()} label={u.name} />
        ))}
      </datalist>

      {/* ── Low confidence warning ──────────── */}
      {parsed.confidence === 'low' && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Tipe transaksi tidak terdeteksi otomatis. Gunakan kata kunci seperti
            <em> "belanja", "pendapatan", "gaji", "transfer masuk"</em>, dst.
          </span>
        </div>
      )}

      {/* ── Edit hint ─────────────────────── */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
        <Pencil className="w-3 h-3" />
        Semua field di atas bisa diedit sebelum disimpan
      </div>
    </div>
  );
}
