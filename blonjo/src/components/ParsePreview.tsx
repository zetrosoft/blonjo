/**
 * ParsePreview — Tampilan hasil parsing transaksi
 * =================================================
 * - Badge akurasi sebaris dengan judul
 * - Tabel item: No | Nama Barang | Jml | Satuan | Harga Satuan | Total Harga
 * - Deskripsi bersih (tanpa angka mentah)
 * - Editable sebelum simpan
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseNoteText, ParsedTransaction, TYPE_RULES } from '../lib/smartParser';
import { formatRp, formatNumber } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  CheckCircle2, AlertCircle, Pencil, Cpu, Bot, Plus, 
  RefreshCw, Image as ImageIcon, Trash2, Search, ChevronDown, Package, X 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchClient } from '../api/client';

function getMatchingProducts(query: string, products: any[]): any[] {
  if (!products || products.length === 0) return [];
  const cleanQ = (query || '').toLowerCase().trim();
  if (!cleanQ) return products.slice(0, 15);

  const tokens = cleanQ.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2);

  const scored = products.map(p => {
    const pName = (p.name || '').toLowerCase();
    const pSku = (p.sku || '').toLowerCase();
    const pBarcode = (p.barcode || '').toLowerCase();

    let score = 0;

    // Exact full match or substring
    if (pName.includes(cleanQ)) {
      score += 100;
    }
    if (pSku === cleanQ || pBarcode === cleanQ) {
      score += 120;
    }

    // Token matching
    if (tokens.length > 0) {
      let matchedTokens = 0;
      for (const tok of tokens) {
        if (pName.includes(tok)) {
          matchedTokens++;
          score += 30;
        } else if (pSku.includes(tok)) {
          matchedTokens++;
          score += 15;
        }
      }
      if (matchedTokens === tokens.length) {
        score += 50; // Bonus if all tokens match
      }
    }

    return { product: p, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.product)
    .slice(0, 15);
}

interface ParsePreviewProps {
  parsed: ParsedTransaction;
  onUpdate: (updated: Partial<ParsedTransaction>) => void;
  accounts?: any[];
  ocrSource?: 'local' | 'llm' | null;
}

export function ParsePreview({ parsed, onUpdate, accounts = [], ocrSource }: ParsePreviewProps) {
  const { t } = useTranslation();
  const [products, setProducts] = React.useState<any[]>([]);
  const [uoms, setUoms] = React.useState<any[]>([]);
  const [activeProductDropdownIdx, setActiveProductDropdownIdx] = React.useState<number | null>(null);
  const [activeUomDropdownIdx, setActiveUomDropdownIdx] = React.useState<number | null>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);

  // Click outside to close active dropdowns
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setActiveProductDropdownIdx(null);
        setActiveUomDropdownIdx(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Daftar satuan umum gabungan
  const commonUoms = React.useMemo(() => {
    const base = ['pcs', 'kg', 'dus', 'pack', 'btl', 'karton', 'sak', 'bal', 'lusin', 'gr', 'liter', 'ikat', 'butir', 'renceng'];
    const customCodes = uoms.map(u => (u.code || u.name || '').toLowerCase()).filter(Boolean);
    return Array.from(new Set([...base, ...customCodes]));
  }, [uoms]);

  // Load products & UOMs for autocomplete
  React.useEffect(() => {
    const loadAutocompleteData = async () => {
      try {
        const prodData = await fetchClient('/inventory/products');
        if (Array.isArray(prodData)) {
          setProducts(prodData);
        } else if (prodData && Array.isArray((prodData as any).data)) {
          setProducts((prodData as any).data);
        }
        const uomData = await fetchClient('/inventory/uoms');
        if (Array.isArray(uomData)) {
          setUoms(uomData);
        } else if (uomData && Array.isArray((uomData as any).data)) {
          setUoms((uomData as any).data);
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
    const isTotalMismatched = hasItems && itemsTotalSum > 0 && (!parsed.total_amount || parsed.total_amount === 0);

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

  const handleSelectProduct = (idx: number, prod: any) => {
    const newItems = [...parsed.items];
    const current = newItems[idx];
    
    // Tentukan harga: jika harga yang ada > 0 pertahankan, jika 0 gunakan harga dari master produk
    const buyPrice = prod.buy_price || prod.sell_price || prod.price || 0;
    const resolvedPrice = (current.unit_price && current.unit_price > 0) ? current.unit_price : buyPrice;
    const resolvedUom = prod.uom || prod.unit || current.unit || 'pcs';
    const resolvedQty = current.qty || 1;
    const resolvedTotal = resolvedQty * resolvedPrice;

    newItems[idx] = {
      ...current,
      name: prod.name,
      unit: resolvedUom,
      unit_price: resolvedPrice,
      total: resolvedTotal,
      is_manual_correction: true
    };

    const newTotal = newItems.reduce((sum, i) => sum + (i.total || 0), 0);
    onUpdate({
      items: newItems,
      total_amount: newTotal
    });
    setActiveProductDropdownIdx(null);
  };

  const handleSelectUom = (idx: number, uomCode: string) => {
    updateItem(idx, { unit: uomCode });
    setActiveUomDropdownIdx(null);
  };

  const handleDeleteItem = (idx: number) => {
    const newItems = parsed.items.filter((_, i) => i !== idx);
    const newTotal = newItems.reduce((sum, i) => sum + (i.total || 0), 0);
    onUpdate({
      items: newItems,
      total_amount: newTotal
    });
    setActiveProductDropdownIdx(null);
    setActiveUomDropdownIdx(null);
  };

  const getAccountName = (entry: any) => {
    // Bab 10.1 ARCHITECTURE.md: UI wajib menampilkan label manusiawi (Code & Name)
    // Jika backend mengirimkan objek account lengkap (hasil perbaikan terbaru)
    if (entry.account && entry.account.name) {
      const code = entry.account.code ? `[${entry.account.code}] ` : '';
      return `${code}${t(entry.account.name)}`;
    }
    
    // Fallback ke pencarian local accounts jika account object tidak ada
    const acc = accounts.find(a => a.id.toString() === entry.account_id.toString());
    if (acc) {
      return `[${acc.code}] ${t(acc.name)}`;
    }

    if (entry.account_name) {
      return t(entry.account_name);
    }
    
    return `Akun ID: ${entry.account_id}`;
  };

  const matchedRule = TYPE_RULES.find(r => r.type === parsed.transaction_type);
  const displayTypeLabel = parsed.type_label && parsed.type_label !== 'Pengeluaran'
    ? parsed.type_label
    : (matchedRule?.label || parsed.type_label || 'Transaksi');
  const displayTypeColor = (parsed.type_color && parsed.type_color !== 'rose')
    ? parsed.type_color
    : (matchedRule?.color || 'bg-rose-500/15 text-rose-400 border-rose-500/30');

  return (
    <div ref={tableRef} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* ── Tipe & Supplier ─────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('tx_type')}</Label>
          <div className={cn(
            'flex items-center justify-between px-3 h-9 rounded-md border text-xs font-semibold',
            displayTypeColor
          )}>
            <span>{displayTypeLabel}</span>
            {ocrSource && (
              <span className={cn(
                'flex items-center gap-1 text-[10px] font-normal px-1.5 py-0.5 rounded-full border ml-2',
                ocrSource === 'local'
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                  : 'bg-violet-500/10 text-violet-400 border-violet-500/30'
              )}>
                {ocrSource === 'local' ? <Cpu className="w-2.5 h-2.5" /> : <Bot className="w-2.5 h-2.5" />}
                {ocrSource === 'local' ? t('tx_source_local') : t('tx_source_ai')}
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
                {t('tx_duplicate_warning_title')}
              </h4>
              <p className="text-xs text-rose-400 dark:text-rose-300 leading-relaxed font-medium">
                {(parsed as any).duplicate_warning || t('tx_duplicate_warning_desc')}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('tx_supplier_name')}</Label>
          <Input
            value={parsed.contact_name || ''}
            onChange={e => onUpdate({ contact_name: e.target.value })}
            className="h-9 text-sm"
            placeholder={t('tx_supplier_placeholder')}
          />
        </div>
      </div>

      {/* ── Tanggal & Total ─────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('tx_date')}</Label>
          <Input
            type="date"
            value={parsed.transaction_date}
            onChange={e => onUpdate({ transaction_date: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('tx_total_amount')}</Label>
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
          <Label className="text-xs text-muted-foreground">{t('tx_payment_method')}</Label>
          <Input
            value={parsed.payment_method || ''}
            onChange={e => onUpdate({ payment_method: e.target.value })}
            className="h-9 text-sm"
            placeholder={t('tx_payment_placeholder')}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('tx_due_date')}</Label>
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
        <Label className="text-xs text-muted-foreground">{t('tx_desc')}</Label>
        <Input
          value={parsed.description}
          onChange={e => onUpdate({ description: e.target.value })}
          className="h-9 text-sm"
          placeholder={t('tx_desc_placeholder')}
        />
      </div>

      {/* ── Suggested Journal (Otomatis) ────── */}
      {parsed.suggested_entries && parsed.suggested_entries.length > 0 && (
        <div className="space-y-2 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 animate-in zoom-in-95 duration-500">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              {t('tx_auto_journal_formed')}
            </Label>
            <span className="text-[9px] text-emerald-500/70 font-medium italic">{t('tx_auto_journal_hint')}</span>
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
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              {t('tx_items_list')} ({parsed.items.length})
            </Label>
            <span className="text-[10px] text-muted-foreground">
              {t('tx_autocomplete_hint')}
            </span>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/40">
                  <th className="text-center px-2 py-2 font-semibold text-muted-foreground w-8">{t('tx_col_no')}</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('tx_col_item_name')}</th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-12">{t('tx_col_qty')}</th>
                  <th className="text-center px-2 py-2 font-semibold text-muted-foreground w-20">{t('tx_col_unit')}</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-28">{t('tx_col_unit_price')}</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground w-28">{t('tx_col_total_price')}</th>
                  <th className="text-center px-1 py-2 font-semibold text-muted-foreground w-8"></th>
                </tr>
              </thead>
              <tbody>
                {parsed.items.map((item, idx) => {
                  const filteredProducts = getMatchingProducts(item.name || '', products);

                  const uomQuery = (item.unit || '').toLowerCase().trim();
                  const filteredUoms = commonUoms.filter(u => !uomQuery || u.toLowerCase().includes(uomQuery));

                  const isProductOpen = activeProductDropdownIdx === idx;
                  const isUomOpen = activeUomDropdownIdx === idx;

                  return (
                    <tr key={idx} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="text-center px-1 py-1 text-muted-foreground font-mono text-[10px]">{idx + 1}</td>
                      
                      {/* ── Kolom Nama Barang dengan Interactive Autocomplete Dropdown ── */}
                      <td className="px-2 py-1 relative">
                        <div className="relative flex items-center">
                          <Input
                            value={item.name}
                            onFocus={() => {
                              setActiveUomDropdownIdx(null);
                              setActiveProductDropdownIdx(idx);
                            }}
                            onClick={() => {
                              setActiveUomDropdownIdx(null);
                              setActiveProductDropdownIdx(idx);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Escape' || e.key === 'Enter') {
                                setActiveProductDropdownIdx(null);
                              }
                            }}
                            onChange={e => {
                              updateItem(idx, { name: e.target.value });
                              setActiveProductDropdownIdx(idx);
                            }}
                            placeholder={t('tx_item_placeholder')}
                            className="h-7 text-xs border-transparent bg-transparent hover:bg-background focus:bg-background focus:border-primary/50 transition-all p-1 pr-6"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveUomDropdownIdx(null);
                              setActiveProductDropdownIdx(isProductOpen ? null : idx);
                            }}
                            className="absolute right-1 text-muted-foreground/60 hover:text-foreground p-0.5"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Dropdown Menu Produk Interaktif */}
                        {isProductOpen && (
                          <div className="absolute left-2 top-full mt-1 w-80 max-h-64 overflow-y-auto bg-popover/95 dark:bg-slate-900/95 backdrop-blur-md border border-border shadow-xl rounded-xl z-50 p-1 space-y-0.5 animate-in fade-in-0 zoom-in-95 duration-150">
                            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between border-b border-border/50">
                              <span className="flex items-center gap-1">
                                <Package className="w-3 h-3 text-primary" />
                                {t('tx_select_from_catalog')}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span>{filteredProducts.length} {t('tx_items_count_suffix')}</span>
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveProductDropdownIdx(null);
                                  }}
                                  className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded p-0.5 transition-colors"
                                  title="Tutup Dropdown"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {filteredProducts.length === 0 ? (
                              <div className="px-3 py-2.5 text-center text-xs text-muted-foreground space-y-2">
                                <p>{t('tx_no_products_found')}</p>
                                <p className="text-[10px] text-primary/80 italic">{t('tx_custom_item_hint')}</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[11px] px-2 w-full mt-1 border-primary/30 text-primary hover:bg-primary/10"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setActiveProductDropdownIdx(null);
                                  }}
                                >
                                  ✕ Tutup (Gunakan "{item.name}")
                                </Button>
                              </div>
                            ) : (
                              filteredProducts.map((prod, pIdx) => {
                                const price = prod.buy_price || prod.sell_price || prod.price || 0;
                                return (
                                  <div
                                    key={pIdx}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleSelectProduct(idx, prod);
                                    }}
                                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors text-foreground"
                                  >
                                    <div className="flex flex-col truncate pr-2">
                                      <span className="font-semibold truncate">{prod.name}</span>
                                      {prod.sku && (
                                        <span className="text-[10px] text-muted-foreground font-mono">SKU: {prod.sku}</span>
                                      )}
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block font-mono">
                                        Rp {formatNumber(price)}
                                      </span>
                                      {prod.uom && (
                                        <span className="text-[9px] text-muted-foreground">/{prod.uom}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </td>

                      {/* ── Kolom Jumlah (Qty) ── */}
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

                      {/* ── Kolom Satuan (UOM) dengan Interactive Dropdown ── */}
                      <td className="px-1 py-1 relative">
                        <div className="relative flex items-center">
                          <Input
                            value={item.unit || ''}
                            onFocus={() => {
                              setActiveProductDropdownIdx(null);
                              setActiveUomDropdownIdx(idx);
                            }}
                            onClick={() => {
                              setActiveProductDropdownIdx(null);
                              setActiveUomDropdownIdx(idx);
                            }}
                            onChange={e => {
                              updateItem(idx, { unit: e.target.value });
                              setActiveUomDropdownIdx(idx);
                            }}
                            placeholder="—"
                            className="h-7 text-xs text-center border-transparent bg-transparent hover:bg-background focus:bg-background focus:border-primary/50 transition-all p-1 pr-4 font-medium"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveProductDropdownIdx(null);
                              setActiveUomDropdownIdx(isUomOpen ? null : idx);
                            }}
                            className="absolute right-0.5 text-muted-foreground/60 hover:text-foreground p-0.5"
                          >
                            <ChevronDown className="w-2.5 h-2.5" />
                          </button>
                        </div>

                        {/* Dropdown Pilihan Satuan */}
                        {isUomOpen && (
                          <div className="absolute left-0 top-full mt-1 w-36 max-h-48 overflow-y-auto bg-popover/95 dark:bg-slate-900/95 backdrop-blur-md border border-border shadow-xl rounded-xl z-50 p-1 space-y-0.5 animate-in fade-in-0 zoom-in-95 duration-150">
                            <div className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50">
                              {t('tx_unit_uom_title')}
                            </div>
                            {filteredUoms.map((uCode, uIdx) => (
                              <div
                                key={uIdx}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectUom(idx, uCode);
                                }}
                                className={`px-2 py-1 rounded-md text-xs cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between ${
                                  (item.unit || '').toLowerCase() === uCode ? 'bg-primary/15 text-primary font-bold' : 'text-foreground'
                                }`}
                              >
                                <span>{uCode}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* ── Kolom Harga Satuan ── */}
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
                          className="h-7 text-xs text-right pl-5 border-transparent bg-transparent hover:bg-background focus:bg-background focus:border-primary/50 transition-all p-1 font-mono font-medium"
                        />
                      </td>

                      {/* ── Kolom Total Harga ── */}
                      <td className="px-2 py-1 text-right font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                        {formatRp(item.total)}
                      </td>

                      {/* ── Tombol Hapus Baris ── */}
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(idx)}
                          className="p-1 text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors"
                          title={t('tx_delete_row_title')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Footer total ── */}
              <tfoot>
                <tr className="bg-muted/30 border-t border-border/50">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                    {t('tx_total_label')}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-sm text-foreground">
                    {formatRp(parsed.items.reduce((s, i) => s + i.total, 0))}
                  </td>
                  <td></td>
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
              {t('tx_add_item_manual')}
            </Button>
          </div>
        </div>
      )}

      {/* ── Low confidence warning ──────────── */}
      {parsed.confidence === 'low' && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {t('tx_low_confidence_hint')}
          </span>
        </div>
      )}

      {/* ── Edit hint ─────────────────────── */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
        <Pencil className="w-3 h-3" />
        {t('tx_edit_hint')}
      </div>
    </div>
  );
}
