import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { 
  Search, Package, AlertTriangle, Plus, Minus, RefreshCw, DollarSign, 
  AlertOctagon, CheckCircle2, ShoppingCart, ShieldCheck, UserCheck, Eye,
  Lock, Sparkles, TrendingUp
} from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/auth';

interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  stock: number;
  uom: string;
  purchase_price: number;
  sell_price: number;
  min_stock_level: number;
  max_stock_level: number;
}

export default function InventoryControl() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  
  // Role capabilities based on logged-in user
  const role = user?.role || 'cashier';
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isCashier = role === 'cashier';
  
  const canAdjustStock = isAdmin || isManager;
  const canViewFinancials = isAdmin;
  const canViewRestockAdvice = isAdmin || isManager;

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  
  // Adjustment Modal State (Only for Admin / Manager)
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/inventory/products');
      if (Array.isArray(data)) {
        const mapped: Product[] = data.map((p: any) => {
          const min = Number(p.min_stock_level) || 5;
          const max = min * 5 || 50;
          return {
            id: p.id,
            sku: p.sku || 'N/A',
            name: p.name,
            category: p.category?.name || t('mc_category_general'),
            stock: Number(p.current_stock) || 0,
            uom: p.base_unit || 'pcs',
            purchase_price: Number(p.purchase_price) || 0,
            sell_price: Number(p.sell_price) || 0,
            min_stock_level: min,
            max_stock_level: max,
          };
        });
        setProducts(mapped);
        
        // Extract unique categories
        const cats = Array.from(new Set(mapped.map(p => p.category)));
        setCategories(cats);
      }
    } catch (err) {
      console.error('Failed to load products for inventory control', err);
      toast.error(t('mc_toast_load_products_failed'));
      setProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  const handleOpenAdjust = (product: Product, type: 'in' | 'out') => {
    if (!canAdjustStock) {
      toast.error('Akses Dibatasi: Peran Kasir tidak dapat mengubah stok atau harga');
      return;
    }
    setSelectedProduct(product);
    setAdjustType(type);
    setAdjustQty('1');
    setAdjustNotes('');
    setIsAdjustOpen(true);
  };

  const handleAdjustStock = async () => {
    if (!canAdjustStock || !selectedProduct) return;
    const qty = Number(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error(t('mc_toast_adjust_qty_positive'));
      return;
    }

    setIsSubmitting(true);
    try {
      await fetchClient(`/inventory/products/${selectedProduct.sku}/adjust-stock`, {
        method: 'POST',
        body: JSON.stringify({
          qty: adjustType === 'in' ? qty : -qty,
          notes: adjustNotes || t('mc_adjust_default_note')
        })
      });
      toast.success(t('mc_toast_adjust_success'));
      loadData();
      setIsAdjustOpen(false);
    } catch (err: any) {
      console.error('Failed to adjust stock', err);
      toast.error('Gagal melakukan penyesuaian stok di server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoPO = async (product: Product) => {
    try {
      const defaultQty = Math.max(10, product.min_stock_level * 2);
      await fetchClient('/material-control/purchase-plans', {
        method: 'POST',
        body: JSON.stringify({
          items: [{
            product_id: product.id,
            qty: defaultQty,
            unit_price: product.purchase_price,
            subtotal: defaultQty * product.purchase_price
          }]
        })
      });
      toast.success(`Draf Rencana Belanja untuk "${product.name}" berhasil dibuat!`);
    } catch (err) {
      console.error('Failed to auto create PO item', err);
      toast.error('Gagal menambahkan item ke Rencana Belanja');
    }
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate statistics
  const totalItems = products.length;
  const lowStockItems = products.filter(p => p.stock > 0 && p.stock <= p.min_stock_level);
  const outOfStockItems = products.filter(p => p.stock === 0);
  const healthyStockItems = products.filter(p => p.stock > p.min_stock_level);
  const totalInventoryValue = products.reduce((acc, p) => acc + (p.stock * p.purchase_price), 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header Bar with Role Badge */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold tracking-tight">Stock Command Center</h2>
            <Badge 
              variant="outline" 
              className={
                isAdmin 
                  ? "bg-purple-500/10 text-purple-600 border-purple-500/30 font-semibold"
                  : isManager
                  ? "bg-blue-500/10 text-blue-600 border-blue-500/30 font-semibold"
                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-semibold"
              }
            >
              {isAdmin && <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
              {isManager && <UserCheck className="w-3.5 h-3.5 mr-1" />}
              {isCashier && <Eye className="w-3.5 h-3.5 mr-1" />}
              {isAdmin ? 'Owner Focus' : isManager ? 'Manager Focus' : 'Cashier View (Read-Only)'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {isCashier 
              ? 'Pantau stok fisik barang secara real-time untuk pelayanan kasir' 
              : 'Pusat kendali inventaris terpadu: monitoring stok, analisis HPP, & rencana belanja'}
          </p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> {t('mc_btn_refresh')}
        </Button>
      </div>

      {/* ── 1. OWNER FINANCIAL & ASSET INSIGHTS (ADMIN ONLY) ── */}
      {canViewFinancials && (
        <div className="grid gap-4 md:grid-cols-4 animate-in fade-in duration-300">
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">{t('mc_total_products')}</CardTitle>
              <Package className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems} SKU</div>
              <p className="text-xs text-muted-foreground mt-1">{t('mc_items_in_catalog')}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border-yellow-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Stok Kritis (&lt; ROP)</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500 animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lowStockItems.length} SKU</div>
              <p className="text-xs text-muted-foreground mt-1">Perlu pemesanan ulang segera</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Stok Habis (Stockout)</CardTitle>
              <AlertOctagon className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{outOfStockItems.length} SKU</div>
              <p className="text-xs text-muted-foreground mt-1">Potensi kehilangan penjualan</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total Nilai Aset Stok (HPP)</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatRp(totalInventoryValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Berdasarkan HPP Moving Average</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 2. OPERATIONAL RADAR & RESTOCK ADVICE (ADMIN & MANAGER) ── */}
      {canViewRestockAdvice && (lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <Card className="border-amber-500/30 bg-amber-500/5 animate-in slide-in-from-top-2 duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-4 h-4" />
              Rekomendasi Restock &amp; Peringatan Stok Operasional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ditemukan <strong>{lowStockItems.length + outOfStockItems.length} SKU</strong> berada di bawah batas minimum (Reorder Point). Klik untuk membuat draf rencana belanja otomatis:
            </p>
            <div className="flex flex-wrap gap-2">
              {[...outOfStockItems, ...lowStockItems].slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-background border border-amber-500/20 px-3 py-1.5 rounded-lg text-xs">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-muted-foreground font-mono">({p.stock} {p.uom})</span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 text-[11px] text-amber-600 hover:bg-amber-500/10 px-2 gap-1"
                    onClick={() => handleAutoPO(p)}
                  >
                    <ShoppingCart className="w-3 h-3" />
                    ⚡ Restock 1-Klik
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3. CASHIER PHYSICAL STOCK SUMMARY (CASHIER READ-ONLY) ── */}
      {isCashier && (
        <div className="grid gap-4 md:grid-cols-3 animate-in fade-in duration-300">
          <Card className="border-red-500/20 bg-red-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-red-800 dark:text-red-300">Stok Habis</CardTitle>
              <AlertOctagon className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{outOfStockItems.length} SKU</div>
              <p className="text-xs text-muted-foreground mt-1">Barang kosong di rak</p>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Stok Menipis</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lowStockItems.length} SKU</div>
              <p className="text-xs text-muted-foreground mt-1">Segera informasikan ke manajer</p>
            </CardContent>
          </Card>

          <Card className="border-green-500/20 bg-green-500/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-green-800 dark:text-green-300">Stok Aman</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{healthyStockItems.length} SKU</div>
              <p className="text-xs text-muted-foreground mt-1">Stok mencukupi untuk penjualan</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 4. UNIFIED SMART STOCK & INVENTORY TABLE ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Katalog &amp; Pemantauan Stok Terpadu</CardTitle>
          <div className="flex flex-col gap-3 mt-4 md:flex-row md:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('mc_search_sku_name')}
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('mc_category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('mc_all_categories')}</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 border-t">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <RefreshCw className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">{t('mc_loading_stock_catalog')}</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              {t('mc_no_products_found')}
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[120px] py-3 pl-6">{t('mc_sku')}</TableHead>
                    <TableHead className="py-3">{t('mc_col_product_name')}</TableHead>
                    <TableHead className="py-3">{t('mc_col_category')}</TableHead>
                    <TableHead className="text-right py-3">Stok Fisik</TableHead>
                    <TableHead className="py-3">Satuan</TableHead>
                    <TableHead className="w-[180px] py-3 text-center">Kapasitas &amp; Level</TableHead>
                    
                    {/* Financial Columns — Visible Only to Admin */}
                    {canViewFinancials && (
                      <>
                        <TableHead className="text-right py-3">HPP Moving Avg</TableHead>
                        <TableHead className="text-right py-3">Total Nilai Aset</TableHead>
                      </>
                    )}
                    
                    <TableHead className="text-center py-3">{t('mc_col_status')}</TableHead>
                    
                    {/* Action Column — Adjusted by Role */}
                    <TableHead className="text-center w-[160px] py-3">
                      {canAdjustStock ? 'Aksi Stok' : 'Akses'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(p => {
                    const isLow = p.stock > 0 && p.stock <= p.min_stock_level;
                    const isOut = p.stock === 0;
                    const percentage = Math.min(100, Math.round((p.stock / p.max_stock_level) * 100));
                    const minPercentage = Math.round((p.min_stock_level / p.max_stock_level) * 100);
                    
                    let progressColor = "bg-green-500";
                    if (isOut) progressColor = "bg-red-500";
                    else if (isLow) progressColor = "bg-yellow-500";

                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs py-3 pl-6">{p.sku}</TableCell>
                        <TableCell className="font-medium py-3">{p.name}</TableCell>
                        <TableCell className="py-3">{p.category}</TableCell>
                        <TableCell className="text-right font-semibold py-3">
                          {p.stock}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-3">{p.uom}</TableCell>
                        
                        {/* Visual Capacity Bar */}
                        <TableCell className="py-3 text-center px-4">
                          <div className="space-y-1">
                            <div className="relative h-2.5 w-full bg-muted rounded-full overflow-hidden">
                              <div 
                                className="absolute top-0 bottom-0 w-0.5 bg-rose-500/70 z-10" 
                                style={{ left: `${minPercentage}%` }}
                                title={`Min Safety: ${p.min_stock_level} ${p.uom}`}
                              />
                              <div 
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
                              <span>Min: {p.min_stock_level}</span>
                              <span>Max: {p.max_stock_level}</span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Financial Cells — Admin Only */}
                        {canViewFinancials && (
                          <>
                            <TableCell className="text-right font-mono py-3">{formatRp(p.purchase_price)}</TableCell>
                            <TableCell className="text-right font-semibold font-mono py-3">
                              {formatRp(p.stock * p.purchase_price)}
                            </TableCell>
                          </>
                        )}

                        <TableCell className="text-center py-3">
                          {isOut ? (
                            <Badge variant="destructive">Out of Stock</Badge>
                          ) : isLow ? (
                            <Badge variant="warning" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Low Stock</Badge>
                          ) : (
                            <Badge variant="success" className="bg-green-500/10 text-green-600 dark:text-green-400">In Stock</Badge>
                          )}
                        </TableCell>

                        {/* Action Cell */}
                        <TableCell className="text-center py-3">
                          {canAdjustStock ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-green-600 hover:bg-green-500/5"
                                onClick={() => handleOpenAdjust(p, 'in')}
                                title="Tambah Stok (+)"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-red-600 hover:bg-red-500/5"
                                onClick={() => handleOpenAdjust(p, 'out')}
                                title="Kurangi Stok (-)"
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                              <Lock className="w-3 h-3" /> Read-Only
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
                <PaginationControls totalItems={filteredProducts.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust Stock Dialog — Rendered ONLY for Admin / Manager */}
      {canAdjustStock && (
        <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {adjustType === 'in' ? t('mc_adjust_add_title') : t('mc_adjust_sub_title')}
              </DialogTitle>
              <DialogDescription>
                {t('mc_adjust_desc')}
              </DialogDescription>
            </DialogHeader>

            {selectedProduct && (
              <div className="grid gap-4 py-4">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Package className="h-10 w-10 text-primary opacity-60" />
                  <div>
                    <div className="font-semibold text-sm">{selectedProduct.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      SKU: {selectedProduct.sku} | {t('mc_adjust_current_stock')} {selectedProduct.stock} {selectedProduct.uom}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="qty" className="text-right">{t('mc_adjust_qty_label')} ({selectedProduct.uom})</Label>
                  <Input
                    id="qty"
                    type="number"
                    min="1"
                    className="col-span-3"
                    value={adjustQty}
                    onChange={e => setAdjustQty(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="notes" className="text-right">{t('mc_adjust_notes_label')}</Label>
                  <Input
                    id="notes"
                    placeholder={t('mc_adjust_notes_placeholder')}
                    className="col-span-3"
                    value={adjustNotes}
                    onChange={e => setAdjustNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAdjustOpen(false)} disabled={isSubmitting}>
                {t('mc_btn_cancel')}
              </Button>
              <Button onClick={handleAdjustStock} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" /> {t('mc_saving')}
                  </>
                ) : (
                  t('mc_btn_save_adjustment')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
