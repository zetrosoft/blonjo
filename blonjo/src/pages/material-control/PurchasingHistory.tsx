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
      toast.error('Gagal memuat riwayat pembelian dari server');
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
            Riwayat belanja persediaan barang dagangan dari supplier.
          </p>
        </div>
        <Button onClick={loadData} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Aktualkan Data
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Pengeluaran Belanja (Posted)</CardTitle>
            <ShoppingCart className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatRp(totalSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">Pembelian barang dagang yang sudah dijurnal</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Nilai Draft Pembelian</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatRp(draftSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">Menunggu konfirmasi / barang masuk</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 to-sky-500/10 border-blue-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Jumlah Transaksi Belanja</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalPurchases}</div>
            <p className="text-xs text-muted-foreground mt-1">Total nota pembelian tercatat</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Daftar Nota Pembelian</CardTitle>
          <div className="flex flex-col gap-3 mt-4 md:flex-row md:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari Supplier, No Ref, atau Keterangan..."
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative w-full overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="w-[120px]">Tanggal</TableHead>
                  <TableHead className="w-[150px]">No. Referensi</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Total Belanja</TableHead>
                  <TableHead className="text-center w-[120px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-muted-foreground text-sm">Memuat riwayat belanja...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredPurchases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Tidak ada transaksi pembelian yang ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPurchases.map(p => {
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
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-1.5 text-sm">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {p.date}
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
                                  <FileText className="h-4 w-4" /> Rincian Barang yang Dibeli
                                </div>
                                <Table className="border rounded-md bg-card">
                                  <TableHeader className="bg-muted/40">
                                    <TableRow>
                                      <TableHead>Nama Barang</TableHead>
                                      <TableHead className="text-right w-[100px]">Qty</TableHead>
                                      <TableHead className="w-[100px]">Satuan</TableHead>
                                      <TableHead className="text-right w-[150px]">Harga Satuan</TableHead>
                                      <TableHead className="text-right w-[180px]">Total</TableHead>
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
                  })
                )}
              </TableBody>
            </Table>
            <PaginationControls totalItems={filteredPurchases.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
