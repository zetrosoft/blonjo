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
import { Search, Package, AlertTriangle, ArrowUpDown, Plus, Minus, RefreshCw, BarChart2, DollarSign } from 'lucide-react';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';

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
}

export default function InventoryControl() {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  
  // Adjustment Modal State
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
        const mapped: Product[] = data.map((p: any) => ({
          id: p.id,
          sku: p.sku || 'N/A',
          name: p.name,
          category: p.category?.name || t('mc_category_general'),
          stock: Number(p.current_stock) || 0,
          uom: p.base_unit || 'pcs',
          purchase_price: Number(p.purchase_price) || 0,
          sell_price: Number(p.sell_price) || 0,
          min_stock_level: Number(p.min_stock_level) || 5,
        }));
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

  const handleOpenAdjust = (product: Product, type: 'in' | 'out') => {
    setSelectedProduct(product);
    setAdjustType(type);
    setAdjustQty('1');
    setAdjustNotes('');
    setIsAdjustOpen(true);
  };

  const handleAdjustStock = async () => {
    if (!selectedProduct) return;
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

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate statistics
  const totalItems = products.length;
  const lowStockItems = products.filter(p => p.stock > 0 && p.stock <= p.min_stock_level).length;
  const outOfStockItems = products.filter(p => p.stock === 0).length;
  const totalInventoryValue = products.reduce((acc, p) => acc + (p.stock * p.purchase_price), 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory Control</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('mc_inv_desc')}
          </p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> {t('mc_btn_refresh')}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{t('mc_total_products')}</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('mc_items_in_catalog')}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border-yellow-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{t('mc_low_stock_items')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lowStockItems}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('mc_below_min_stock')}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{t('mc_out_of_stock_items')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{outOfStockItems}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('mc_requires_purchase')}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{t('mc_total_inv_value')}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatRp(totalInventoryValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('mc_based_on_purchase')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('mc_stock_catalog')}</CardTitle>
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
                    <TableHead className="text-right py-3">{t('mc_col_physical_stock')}</TableHead>
                    <TableHead className="py-3">{t('mc_col_uom')}</TableHead>
                    <TableHead className="text-right py-3">{t('mc_col_purchase_price')}</TableHead>
                    <TableHead className="text-right py-3">{t('mc_col_total_value')}</TableHead>
                    <TableHead className="text-center py-3">{t('mc_col_status')}</TableHead>
                    <TableHead className="text-center w-[160px] py-3">{t('mc_col_stock_action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(p => {
                    const isLow = p.stock > 0 && p.stock <= p.min_stock_level;
                    const isOut = p.stock === 0;
                    
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs py-3 pl-6">{p.sku}</TableCell>
                        <TableCell className="font-medium py-3">{p.name}</TableCell>
                        <TableCell className="py-3">{p.category}</TableCell>
                        <TableCell className="text-right font-semibold py-3">
                          {p.stock}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-3">{p.uom}</TableCell>
                        <TableCell className="text-right font-mono py-3">{formatRp(p.purchase_price)}</TableCell>
                        <TableCell className="text-right font-semibold font-mono py-3">
                          {formatRp(p.stock * p.purchase_price)}
                        </TableCell>
                        <TableCell className="text-center py-3">
                          {isOut ? (
                            <Badge variant="destructive">Out of Stock</Badge>
                          ) : isLow ? (
                            <Badge variant="warning" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Low Stock</Badge>
                          ) : (
                            <Badge variant="success" className="bg-green-500/10 text-green-600 dark:text-green-400">In Stock</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-green-600 hover:bg-green-500/5"
                              onClick={() => { setSelectedProduct(p); setAdjustType('in'); setIsAdjustOpen(true); }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-600 hover:bg-red-500/5"
                              onClick={() => { setSelectedProduct(p); setAdjustType('out'); setIsAdjustOpen(true); }}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* Adjust Stock Dialog */}
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
                  <div className="text-xs text-muted-foreground font-mono">SKU: {selectedProduct.sku} | {t('mc_adjust_current_stock')} {selectedProduct.stock} {selectedProduct.uom}</div>
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
    </div>
  );
}
