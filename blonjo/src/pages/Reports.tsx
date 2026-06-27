import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient, { fetchClient } from '../api/client';
import { formatRp, formatDateTime } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  PieChart, BookOpen, Eye, Calendar, DollarSign, Search,
  FileText, RefreshCw, ArrowUpRight, ArrowDownRight, Layers,
  ChevronRight, CalendarDays, Receipt, Clock, User2, ArrowRight,
  TrendingUp, BarChart3, ShieldAlert, Send, Download, Printer,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { ReportHeader } from '../components/ReportHeader';
import { A4Paper } from '../components/A4Paper';

interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
}

interface JournalEntry {
  id: number;
  transaction_id: number;
  account_id: number;
  debit: string | number;
  credit: string | number;
  account?: Account;
}

interface Product {
  id: number;
  name: string;
  unit: string;
}

interface InventoryLog {
  id: number;
  product_id: number;
  quantity: string | number;
  price_per_unit: string | number;
  log_type: 'in' | 'out';
  product?: Product;
  contact?: {
    id: number;
    name: string;
    contact_type: string;
  };
}

interface Transaction {
  id: number;
  transaction_date: string;
  reference_no: string | null;
  description: string;
  transaction_type: string;
  total_amount: string | number;
  status: 'draft' | 'posted';
  created_by_id: number | null;
  created_at: string;
  entries: JournalEntry[];
  inventory_logs: InventoryLog[];
}

export default function Reports() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const isJournalView = location.pathname === '/reports/journals';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Date Filters
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const formatDateISO = (d: Date) => d.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(formatDateISO(firstDay));
  const [endDate, setEndDate] = useState(formatDateISO(today));

  // Selected Transaction for Detail Modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await fetchClient(`/finance/transactions?start_date=${startDate}&end_date=${endDate}`);
      setTransactions(data);
    } catch (err: any) {
      toast.error(t('toast_err_load_transactions', { error: err.message || err }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [isJournalView]);

  const exportToExcel = () => {
    if (transactions.length === 0) return;
    let csvContent = "Tanggal,Referensi,Tipe,Deskripsi,Status,Total\n";
    transactions.forEach(tx => {
      csvContent += `${tx.transaction_date},${tx.reference_no || '-'},${tx.transaction_type},"${tx.description.replace(/"/g, '""')}",${tx.status},${tx.total_amount}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Daftar_Jurnal_${startDate}_ke_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleViewDetail = async (txId: number) => {
    setLoadingDetail(true);
    setDetailOpen(true);
    setShowPrintPreview(false);
    try {
      const data = await fetchClient(`/finance/transactions/${txId}`);
      setSelectedTx(data);
    } catch (err: any) {
      toast.error(t('toast_err_load_journal_detail', { error: err.message || err }));
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleFetchPdf = async () => {
    if (!selectedTx) return;
    try {
      setLoadingDetail(true);
      const currentLang = i18n.language || 'id';
      const pdfRes = await apiClient.get(`/reports/transaction/${selectedTx.id}/pdf?lang=${currentLang}`, { responseType: 'blob' });
      const url = URL.createObjectURL(pdfRes as any);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      setShowPrintPreview(true);
    } catch (err: any) {
      toast.error("Gagal menyiapkan dokumen PDF");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePostJournal = async (tx: Transaction) => {
    try {
      await fetchClient(`/finance/transactions/${tx.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'posted' })
      });
      toast.success('Jurnal berhasil diposting!');
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memposting jurnal');
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    const query = searchQuery.toLowerCase();
    const refNo = tx.reference_no?.toLowerCase() || '';
    const desc = tx.description.toLowerCase();
    const type = tx.transaction_type.toLowerCase();
    return refNo.includes(query) || desc.includes(query) || type.includes(query);
  });

  const getTxTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      purchase: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      sales: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      expense: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      income: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
      operational: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      manual: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    };
    return (
      <Badge variant="outline" className={cn("capitalize px-2 py-0.5", styles[type] || 'bg-muted text-muted-foreground')}>
        {type.replace('_', ' ')}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
      posted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return (
      <Badge variant="outline" className={cn("capitalize px-2 py-0.5 font-bold text-[10px]", styles[status] || 'bg-muted text-muted-foreground')}>
        {t(`status_${status}`)}
      </Badge>
    );
  };

  return (
    <div className="w-full max-w-none px-2 md:px-4 lg:px-6 py-6 space-y-6 mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {isJournalView ? t('reports_journals_title') : t('menu_reports')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            {isJournalView ? t('reports_journals_subtitle') : t('reports_intro_subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" onClick={loadTransactions} className="flex items-center gap-2 border-zinc-200 dark:border-zinc-800 bg-background/50 backdrop-blur-sm shadow-sm">
            <RefreshCw className="w-4 h-4" />
            {t('refresh_data')}
          </Button>
        </div>
      </div>

      {!isJournalView && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Dashboard Intro Cards (Keep existing logic) */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"><Layers className="w-5 h-5 text-primary" />{t('explore_reports_title')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card hover:shadow-md hover:border-primary/30 dark:hover:border-primary/30 transition-all duration-300 flex flex-col group">
                <CardHeader className="space-y-2.5 pb-4">
                  <div className="p-3 bg-primary/10 text-primary w-fit rounded-xl"><BookOpen className="w-6 h-6" /></div>
                  <CardTitle className="text-lg font-bold">{t('reports_hub_journals_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('reports_hub_journals_desc')}</p>
                  <Button onClick={() => navigate('/reports/journals')} className="w-full flex items-center justify-center gap-2 text-xs font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-all mt-4">{t('journal_list_card_btn')}<ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></Button>
                </CardContent>
              </Card>
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card flex flex-col group hover:shadow-md transition-all">
                <CardHeader className="space-y-2.5 pb-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 w-fit rounded-xl"><TrendingUp className="w-6 h-6" /></div>
                  <CardTitle className="text-lg font-bold">{t('reports_hub_pl_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('reports_hub_pl_desc')}</p>
                  <Button onClick={() => navigate('/reports/profit-loss')} variant="outline" className="w-full text-xs font-bold mt-4">{t('view_report_btn') || 'Lihat Laporan'}</Button>
                </CardContent>
              </Card>
              <Card className="border-zinc-200/80 dark:border-zinc-800/80 bg-card flex flex-col group hover:shadow-md transition-all">
                <CardHeader className="space-y-2.5 pb-4">
                  <div className="p-3 bg-sky-500/10 text-sky-500 w-fit rounded-xl"><BarChart3 className="w-6 h-6" /></div>
                  <CardTitle className="text-lg font-bold">{t('reports_hub_bs_title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t('reports_hub_bs_desc')}</p>
                  <Button onClick={() => navigate('/reports/balance-sheet')} variant="outline" className="w-full text-xs font-bold mt-4">{t('view_report_btn') || 'Lihat Laporan'}</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {isJournalView && (
        <div className="space-y-6">
          {/* Interactive HTML Table View */}
          <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-xl border border-border shadow-sm print:hidden">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filter_from_date') || 'Dari Tanggal'}</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filter_to_date') || 'Sampai Tanggal'}</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 w-40" />
            </div>
            <Button onClick={loadTransactions} disabled={loading} size="sm" className="h-9 px-6 font-bold">{t('btn_filter_show') || 'Tampilkan'}</Button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportToExcel} className="h-9 flex items-center gap-2 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm"><Download className="w-4 h-4" />Excel</Button>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input placeholder={t('search_placeholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 border-zinc-200 dark:border-zinc-800" />
              </div>
            </div>
          </div>

          <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-md animate-in fade-in duration-300">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" />
                {t('general_ledger')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20"><RefreshCw className="w-8 h-8 text-primary animate-spin" /><p className="text-sm mt-4 text-zinc-500">Memuat Jurnal...</p></div>
              ) : filteredTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center"><FileText className="w-12 h-12 text-zinc-200" /><p className="text-base font-semibold text-zinc-400 mt-4">Tidak ada data jurnal pada periode ini.</p></div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[110px]">{t('table_date')}</TableHead>
                        <TableHead className="w-[120px]">{t('table_ref_no')}</TableHead>
                        <TableHead className="w-[100px]">{t('table_type')}</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>{t('table_desc')}</TableHead>
                        <TableHead className="text-right w-[150px]">{t('table_total_amount')}</TableHead>
                        <TableHead className="w-[100px] text-center">{t('table_actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((tx) => (
                        <TableRow key={tx.id} className="cursor-pointer hover:bg-muted/30" onClick={() => handleViewDetail(tx.id)}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{tx.transaction_date}</TableCell>
                          <TableCell className="font-bold text-xs text-primary font-mono whitespace-nowrap">{tx.reference_no || '-'}</TableCell>
                          <TableCell>{getTxTypeBadge(tx.transaction_type)}</TableCell>
                          <TableCell>{getStatusBadge(tx.status)}</TableCell>
                          <TableCell className="max-w-xs truncate text-sm font-medium">{tx.description}</TableCell>
                          <TableCell className="text-right font-bold text-zinc-900 dark:text-zinc-100 text-sm">{formatRp(Number(tx.total_amount))}</TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              {tx.status === 'draft' && (
                                <Button variant="outline" size="sm" onClick={() => handlePostJournal(tx)} className="h-8 text-[10px] font-bold px-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white"><Send className="w-3 h-3 mr-1" />Post</Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => handleViewDetail(tx.id)} className="h-8 w-8 text-zinc-500 hover:text-primary"><Eye className="w-4 h-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className={cn(
          "max-h-[90vh] overflow-y-auto border-zinc-200 dark:border-zinc-800 p-0 animate-in fade-in-50 duration-200",
          showPrintPreview ? "max-w-[230mm] bg-zinc-100 dark:bg-zinc-950" : "max-w-3xl"
        )}>
          <DialogHeader className="p-6 pb-0">
             <div className="flex justify-between items-start pr-8">
               <div className="space-y-1">
                 <DialogTitle className="text-xl font-bold">{showPrintPreview ? "Pratinjau PDF Jurnal" : t('dialog_detail_title')}</DialogTitle>
                 <DialogDescription className="text-xs text-muted-foreground">Rincian entri akuntansi untuk transaksi ini.</DialogDescription>
               </div>
               <div className="flex items-center gap-2">
                 {!showPrintPreview && (
                   <Button onClick={handleFetchPdf} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9">
                     <Printer className="w-4 h-4" />
                     {t('btn_print_pdf') || 'Cetak PDF'}
                   </Button>
                 )}
                 {showPrintPreview && (
                   <Button variant="outline" onClick={() => setShowPrintPreview(false)} className="gap-2 font-bold h-9 border-zinc-300">
                     <X className="w-4 h-4" />
                     {t('btn_close_preview') || 'Tutup Preview'}
                   </Button>
                 )}
               </div>
             </div>
          </DialogHeader>

          <div className="p-6">
          {loadingDetail || !selectedTx ? (
            <div className="flex flex-col items-center justify-center py-20"><RefreshCw className="w-8 h-8 text-primary animate-spin" /><p className="text-sm mt-4 text-zinc-500">{t('dialog_loading')}</p></div>
          ) : showPrintPreview ? (
            /* REAL PDF CANVAS VIEW */
            <A4Paper title={`${t('menu_journal_list')} - ${selectedTx.reference_no}`} pdfUrl={pdfUrl || undefined} />
          ) : (
            /* STANDARD INTERACTIVE MODAL VIEW */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-xs">
                    <CalendarDays className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-muted-foreground">{t('label_date')}:</span>
                    <span className="font-mono font-bold">{selectedTx.transaction_date}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs">
                    <Receipt className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-muted-foreground">{t('label_ref_no')}:</span>
                    <span className="font-mono font-black text-primary">{selectedTx.reference_no || '-'}</span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-xs">
                    <Clock className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-muted-foreground">{t('label_created')}:</span>
                    <span>{formatDateTime(selectedTx.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs">
                    <User2 className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-muted-foreground">{t('label_total_amount')}:</span>
                    <span className="font-black text-sm">{formatRp(Number(selectedTx.total_amount))}</span>
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2 pt-2 border-t border-border/50">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">{t('label_description')}:</p>
                  <p className="text-sm font-medium bg-background p-3 rounded-lg border border-border/50">{selectedTx.description}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground"><BookOpen className="w-4 h-4 text-primary" />{t('journal_flow_title')}</h3>
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs uppercase font-bold">{t('column_account_code')}</TableHead>
                        <TableHead className="text-xs uppercase font-bold">{t('column_account_name')}</TableHead>
                        <TableHead className="text-right text-xs uppercase font-bold">{t('column_debit')}</TableHead>
                        <TableHead className="text-right text-xs uppercase font-bold">{t('column_credit')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTx.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-xs">{entry.account?.code || '-'}</TableCell>
                          <TableCell className="text-sm font-medium">{entry.account?.name}</TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", Number(entry.debit) > 0 ? "font-bold text-emerald-600" : "text-muted-foreground")}>{Number(entry.debit) > 0 ? formatRp(Number(entry.debit)) : '-'}</TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", Number(entry.credit) > 0 ? "font-bold text-rose-600" : "text-muted-foreground")}>{Number(entry.credit) > 0 ? formatRp(Number(entry.credit)) : '-'}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-bold border-t-2 border-border">
                        <TableCell colSpan={2} className="text-sm font-bold uppercase">{t('column_total')}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600">{formatRp(selectedTx.entries.reduce((sum, e) => sum + Number(e.debit), 0))}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-rose-600">{formatRp(selectedTx.entries.reduce((sum, e) => sum + Number(e.credit), 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
          </div>
          
          <DialogFooter className="p-6 border-t border-border mt-0">
            <Button onClick={() => setDetailOpen(false)} variant="secondary" className="px-8 font-bold">{t('btn_close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
