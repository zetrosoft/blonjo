import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Trash2, AlertTriangle, Plus, RefreshCw, Calendar, Sparkles, LayoutGrid } from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { PaginationControls } from '../../components/ui/pagination-controls';

interface Product {
  id: number;
  sku: string;
  name: string;
  base_unit: string;
}

interface DiscardItem {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  qty: number;
  reason: 'EXPIRED' | 'DAMAGED' | 'SPOILED';
  created_at: string;
}

export default function WasteTracking() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [discards, setDiscards] = useState<DiscardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Form states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [reason, setReason] = useState<'EXPIRED' | 'DAMAGED' | 'SPOILED'>('EXPIRED');
  
  // Search Autocomplete mentions
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load products
      const prodData = await fetchClient('/inventory/products');
      if (Array.isArray(prodData)) {
        setProducts(prodData.map((p: any) => ({
          id: p.id,
          sku: p.sku || 'N/A',
          name: p.name,
          base_unit: p.base_unit || 'pcs'
        })));
      }

      // Load discard logs (API returns list of stock-discards)
      const discardData = await fetchClient('/material-control/stock-discards');
      if (Array.isArray(discardData)) {
        setDiscards(discardData);
      }
    } catch (err) {
      console.error('Failed to load waste data:', err);
      // Mock logs for preview if API fails
      setDiscards([
        { id: 1, product_id: 1, product_name: 'Beras Pandan Wangi 5kg', sku: 'BRS-001', qty: 2, reason: 'DAMAGED', created_at: '2026-07-01' },
        { id: 2, product_id: 2, product_name: 'Mie Instan Goreng', sku: 'MIE-002', qty: 10, reason: 'EXPIRED', created_at: '2026-07-03' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter products for autocomplete
  useEffect(() => {
    if (mentionQuery.trim() === '') {
      setFilteredProducts(products.slice(0, 5));
    } else {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(mentionQuery) || 
        p.sku.toLowerCase().includes(mentionQuery)
      );
      setFilteredProducts(filtered);
    }
  }, [mentionQuery, products]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    
    if (val.startsWith('@')) {
      setShowMention(true);
      setMentionQuery(val.slice(1).toLowerCase());
      setMentionIndex(0);
    } else if (val === '') {
      setShowMention(false);
      setSelectedProduct(null);
    } else {
      setShowMention(false);
    }
  };

  const handleMentionSelect = (prod: Product) => {
    setSelectedProduct(prod);
    setInputText(prod.name);
    setShowMention(false);
  };

  const handleSubmitDiscard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      toast.warning(t('mc_toast_select_product_first'));
      return;
    }
    if (qty <= 0) {
      toast.warning(t('mc_toast_qty_min'));
      return;
    }

    try {
      const payload = {
        product_id: selectedProduct.id,
        qty: Number(qty),
        reason: reason
      };

      const response = await fetchClient('/material-control/stock-discards', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      toast.success(t('mc_toast_discard_success', { name: selectedProduct.name }));
      
      // Clear form
      setSelectedProduct(null);
      setInputText('');
      setQty(1);
      
      // Refresh list
      loadData();
    } catch (err) {
      console.error('Failed to submit discard:', err);
      toast.error('Gagal mencatat pembuangan barang rusak ke server');
    }
  };

  const getReasonColor = (res: string) => {
    switch (res) {
      case 'EXPIRED': return 'bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400';
      case 'DAMAGED': return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400';
      case 'SPOILED': return 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400';
      default: return 'bg-zinc-100 text-zinc-700';
    }
  };

  return (
    <div className="space-y-6 p-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">Waste & Spoilage Tracking</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('mc_waste_desc')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form input */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-rose-500 animate-pulse" />
              {t('mc_waste_record_title')}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('mc_waste_record_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitDiscard} className="space-y-4">
              <div className="space-y-1.5 relative">
                <Label htmlFor="item" className="text-xs font-bold">{t('mc_waste_search_label')}</Label>
                <Input
                  id="item"
                  ref={inputRef}
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder={t('mc_waste_search_placeholder')}
                  className="h-9 text-xs"
                />

                {/* Autocomplete mention dropdown */}
                {showMention && (
                  <div className="absolute left-0 z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-popover p-1 shadow-lg backdrop-blur-md">
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">{t('mc_plan_product_not_found')}</div>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => handleMentionSelect(p)}
                          className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="font-medium truncate mr-2">{p.name}</span>
                          <span className="text-[10px] text-zinc-400 font-mono shrink-0">{p.sku}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {selectedProduct && (
                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-1 duration-200">
                  <div className="space-y-1.5">
                    <Label htmlFor="qty" className="text-xs font-bold">{t('mc_plan_qty_label', { unit: selectedProduct.base_unit })}</Label>
                    <Input
                      id="qty"
                      type="number"
                      min="1"
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reason" className="text-xs font-bold">{t('mc_waste_reason_label')}</Label>
                    <select
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value as any)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="EXPIRED">EXPIRED</option>
                      <option value="DAMAGED">DAMAGED</option>
                      <option value="SPOILED">SPOILED</option>
                    </select>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full font-bold gap-2 text-xs h-9" disabled={!selectedProduct}>
                <Plus className="w-4 h-4" /> {t('mc_waste_btn_submit')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* History table */}
        <div className="lg:col-span-2">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">{t('mc_waste_history_title')}</CardTitle>
                <CardDescription className="text-xs">
                  {t('mc_waste_history_desc')}
                </CardDescription>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={loadData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0 border-t">
              {discards.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <LayoutGrid className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-500">{t('mc_waste_history_empty')}</p>
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                      <TableRow>
                        <TableHead className="py-3 pl-6 whitespace-nowrap">{t('mc_col_date')}</TableHead>
                        <TableHead className="py-3">{t('mc_col_product_name')}</TableHead>
                        <TableHead className="text-right py-3">{t('mc_plan_col_qty')}</TableHead>
                        <TableHead className="text-center py-3">{t('mc_waste_reason_label')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {discards.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-xs flex items-center gap-1.5 py-3 pl-6 whitespace-nowrap">
                             <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                             {d.created_at?.split('T')[0] || d.created_at}
                          </TableCell>
                          <TableCell className="font-medium text-xs py-3">
                            <div>{d.product_name}</div>
                            <span className="text-[10px] text-zinc-400 font-mono">{d.sku}</span>
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold py-3">{d.qty}</TableCell>
                          <TableCell className="text-center py-3">
                            <Badge className={`text-[9px] font-bold ${getReasonColor(d.reason)}`}>
                              {d.reason}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
                    <PaginationControls totalItems={discards.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
