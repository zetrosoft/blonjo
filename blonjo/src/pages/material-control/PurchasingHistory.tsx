import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, ShoppingCart, Calendar, User, FileText, ChevronDown, ChevronUp, RefreshCw, FileSpreadsheet, ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { fetchClient } from '../../api/client';
import { formatRp } from '../../lib/utils';
import { toast } from 'sonner';

interface PurchaseItem {
  name: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
}

interface Purchase {
  id: number;
  date: string;
  refNo: string;
  supplier: string;
  amount: number;
  status: 'posted' | 'draft';
  description: string;
  items: PurchaseItem[];
}

export default function PurchasingHistory() {
  const { t } = useTranslation();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch all transactions and filter by type 'purchase'
      const data = await fetchClient('/finance/transactions');
      if (Array.isArray(data)) {
        const purchaseTx = data.filter((t: any) => t.transaction_type === 'purchase');
        const mapped: Purchase[] = purchaseTx.map((t: any) => {
          const itemsList: PurchaseItem[] = [];
          
          // Reconstruct items from inventory logs if any
          if (Array.isArray(t.inventory_logs)) {
            t.inventory_logs.forEach((log: any) => {
              itemsList.push({
                name: log.product?.name || 'Produk Masuk',
                qty: Number(log.quantity) || 0,
                unit: log.product?.unit || 'pcs',
                unit_price: Number(log.price_per_unit) || 0,
                total: (Number(log.quantity) || 0) * (Number(log.price_per_unit) || 0)
              });
            });
          }

          // Fallback if no inventory logs (just create one generic item based on transaction total)
          if (itemsList.length === 0) {
            itemsList.push({
              name: t.description || 'Belanja Barang Dagang',
              qty: 1,
              unit: 'lot',
              unit_price: Number(t.total_amount) || 0,
              total: Number(t.total_amount) || 0
            });
          }

          const supplierName = t.inventory_logs?.[0]?.contact?.name || 
                               t.description.match(/di\s+([A-Za-z0-9\s]+)/)?.[1] || 
                               'Supplier Umum';

          return {
            id: t.id,
            date: t.transaction_date,
            refNo: t.reference_no || `PUR-${t.id}`,
            supplier: supplierName,
            amount: Number(t.total_amount) || 0,
            status: t.status,
            description: t.description,
            items: itemsList
          };
        });
        setPurchases(mapped);
      }
    } catch (err) {
      console.error('Failed to load purchases', err);
      toast.error(t('mc_purch_load_failed'));
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter purchases
  const filteredPurchases = purchases.filter(p => {
    return p.supplier.toLowerCase().includes(searchQuery.toLowerCase()) || 
           p.refNo.toLowerCase().includes(searchQuery.toLowerCase()) || 
           p.description.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalSpent = purchases.filter(p => p.status === 'posted').reduce((acc, p) => acc + p.amount, 0);
  const draftSpent = purchases.filter(p => p.status === 'draft').reduce((acc, p) => acc + p.amount, 0);
  const totalPurchases = purchases.length;
  const paginatedPurchases = filteredPurchases.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Purchasing History</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('mc_purch_desc')}
          </p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> {t('mc_btn_refresh')}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{t('mc_total_purchase_posted')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatRp(totalSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('mc_posted_purchase_desc')}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{t('mc_draft_purchase_value')}</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatRp(draftSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('mc_draft_purchase_desc')}</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 to-sky-500/10 border-blue-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{t('mc_purchase_tx_count')}</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalPurchases}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('mc_purchase_tx_count_desc')}</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('mc_purchase_invoice_list')}</CardTitle>
          <div className="flex flex-col gap-3 mt-4 md:flex-row md:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('mc_search_supplier_ref')}
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 border-t">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <RefreshCw className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">{t('mc_loading_purchases')}</p>
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              {t('mc_no_purchases_found')}
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[40px] py-3"></TableHead>
                    <TableHead className="w-[120px] py-3 whitespace-nowrap">{t('mc_col_date')}</TableHead>
                    <TableHead className="w-[150px] py-3">{t('mc_col_ref_no')}</TableHead>
                    <TableHead className="py-3">{t('mc_col_supplier')}</TableHead>
                    <TableHead className="py-3">{t('mc_col_description')}</TableHead>
                    <TableHead className="text-right py-3">{t('mc_col_total_spent')}</TableHead>
                    <TableHead className="text-center w-[120px] py-3">{t('mc_col_status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPurchases.map(p => {
                    const isExpanded = !!expandedRows[p.id];
                    return (
                      <React.Fragment key={p.id}>
                        <TableRow className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleRow(p.id)}>
                          <TableCell className="p-2 text-center">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            <span className="flex items-center gap-1.5 text-sm">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {p.date?.split('T')[0] || p.date}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{p.refNo}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              {p.supplier}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm max-w-[250px] truncate">{p.description}</TableCell>
                          <TableCell className="text-right font-semibold font-mono text-indigo-600 dark:text-indigo-400">
                            {formatRp(p.amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            {p.status === 'posted' ? (
                              <Badge variant="success" className="bg-green-500/10 text-green-600 dark:text-green-400">POSTED</Badge>
                            ) : (
                              <Badge variant="warning" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">DRAFT</Badge>
                            )}
                          </TableCell>
                        </TableRow>
 
                        {/* Collapsible Detail Row */}
                        {isExpanded && (
                          <TableRow className="bg-muted/20 border-t border-b hover:bg-muted/20">
                            <TableCell colSpan={7} className="p-4">
                              <div className="space-y-3 pl-8">
                                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground border-b pb-1">
                                  <FileText className="h-4 w-4" /> {t('mc_purchased_items_detail')}
                                </div>
                                <Table className="border rounded-md bg-card">
                                  <TableHeader className="bg-muted/40">
                                    <TableRow>
                                      <TableHead>{t('mc_col_product_name')}</TableHead>
                                      <TableHead className="text-right w-[100px]">{t('mc_plan_col_qty')}</TableHead>
                                      <TableHead className="w-[100px]">{t('mc_col_uom')}</TableHead>
                                      <TableHead className="text-right w-[150px]">{t('mc_plan_col_unit_price')}</TableHead>
                                      <TableHead className="text-right w-[180px]">{t('mc_plan_col_subtotal')}</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {p.items.map((item, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell className="font-medium text-xs">{item.name}</TableCell>
                                        <TableCell className="text-right font-mono text-xs">{item.qty}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{item.unit}</TableCell>
                                        <TableCell className="text-right font-mono text-xs">{formatRp(item.unit_price)}</TableCell>
                                        <TableCell className="text-right font-semibold font-mono text-xs">{formatRp(item.total)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800">
                <PaginationControls totalItems={filteredPurchases.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
