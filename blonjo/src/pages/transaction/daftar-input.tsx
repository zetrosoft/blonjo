import { PaginationControls } from '@/components/ui/pagination-controls';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient } from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TransactionDetailDialog } from './components/TransactionDetailDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import { Badge } from '../../components/ui/badge';
import {
  Search, Eye, RefreshCw, CalendarDays, Receipt, Clock, BookOpen,
  ArrowUpRight, ArrowDownRight, User2, Filter, FileDown, FileSpreadsheet,
  Edit2, Save, Trash2, Users, Send,
} from 'lucide-react';
import { cn, formatRp, formatDateTime } from '../../lib/utils';
import { toast } from 'sonner';
import type { Transaction } from './types';


// ── Helper formatters (pure, tidak bergantung hooks) ────────────────────

const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

export default function DaftarInputPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { t, i18n } = useTranslation();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [fromDate, setFromDate]         = useState(formatDateForInput(new Date('2024-01-01')));
  const [toDate, setToDate]             = useState(formatDateForInput(new Date()));
  const [pageSize, setPageSize]         = useState(50);

  // Detail dialog state
  const [detailTxId, setDetailTxId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchClient('/finance/transactions');
      setTransactions(data);
    } catch (err: any) {
      toast.error(t('toast_err_load_transactions', { error: err.message || err }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadTransactions(); }, [pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewDetail = useCallback((txId: number) => {
    setDetailTxId(txId);
    setDetailOpen(true);
  }, []);

  const handlePost = useCallback(async (txId: number) => {
    setLoading(true);
    try {
      await fetchClient(`/finance/transactions/${txId}/post`, { method: 'POST' });
      toast.success('Jurnal berhasil diposting');
      if (detailOpen) setDetailOpen(false);
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'Gagal memposting jurnal');
    } finally {
      setLoading(false);
    }
  }, [detailOpen, loadTransactions]);

  const handleUnpost = useCallback(async (txId: number) => {
    setLoading(true);
    try {
      await fetchClient(`/finance/transactions/${txId}/unpost`, { method: 'POST' });
      toast.success('Posting jurnal berhasil dibatalkan (kembali ke Draft)');
      if (detailOpen) setDetailOpen(false);
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'Gagal membatalkan posting jurnal');
    } finally {
      setLoading(false);
    }
  }, [detailOpen, loadTransactions]);

  const handleDelete = useCallback(async (txId: number) => {
    setLoading(true);
    try {
      await fetchClient(`/finance/transactions/${txId}`, { method: 'DELETE' });
      toast.success('Jurnal berhasil dihapus');
      if (detailOpen) setDetailOpen(false);
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus jurnal');
    } finally {
      setLoading(false);
    }
  }, [detailOpen, loadTransactions]);



  const handleExport = useCallback((format: 'pdf' | 'excel') => {
    toast.success('Ekspor sedang diproses', {
      description: `Data ${format.toUpperCase()} sedang disiapkan berdasarkan filter aktif.`,
    });
  }, []);

  const getTxTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      purchase:    'bg-orange-500/10 text-orange-500 border-orange-500/20',
      sales:       'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      expense:     'bg-rose-500/10 text-rose-500 border-rose-500/20',
      income:      'bg-sky-500/10 text-sky-500 border-sky-500/20',
      operational: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      manual:      'bg-slate-500/10 text-slate-500 border-slate-500/20',
    };
    return (
      <Badge variant="outline" className={cn('capitalize px-2 py-0.5', styles[type] || 'bg-muted text-muted-foreground')}>
        {type.replace('_', ' ')}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft:  'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
      posted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return (
      <Badge variant="outline" className={cn('capitalize px-2 py-0.5 font-bold text-[10px]', styles[status] || 'bg-muted text-muted-foreground')}>
        {t(`status_${status}`)}
      </Badge>
    );
  };

  const filteredTransactions = useMemo(() =>
    transactions
      .filter(tx => {
        const matchSearch = (tx.reference_no?.toLowerCase() || '').includes(searchQuery.toLowerCase())
          || tx.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchType = typeFilter === 'all' || tx.transaction_type === typeFilter;
        const matchDate = tx.transaction_date >= fromDate && tx.transaction_date <= toDate;
        return matchSearch && matchType && matchDate;
      })
      .slice(0, pageSize),
    [transactions, searchQuery, typeFilter, fromDate, toDate, pageSize],
  );
  const paginatedItems = filteredTransactions.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);


  return (
    <div className="w-full max-w-none px-2 md:px-4 lg:px-6 py-6 space-y-6 mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('menu_daftar_input')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            {t('journal_list_card_desc')}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadTransactions} 
          disabled={loading}
          className="flex items-center gap-2 border-zinc-200 dark:border-zinc-800 bg-background/50 backdrop-blur-sm shadow-sm"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          {t('refresh_data')}
        </Button>
      </div>

      {/* Main Table Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 flex flex-col space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <CardTitle className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
              {t('transaction_log_list')}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport('pdf')}
                className="flex items-center gap-2 h-9"
              >
                <FileDown className="w-4 h-4 text-rose-500" />
                {t('export_pdf')}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport('excel')}
                className="flex items-center gap-2 h-9"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                {t('export_excel')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end items-center gap-3 w-full">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder={t('search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background border-zinc-200 dark:border-zinc-800 h-9"
              />
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-background border-zinc-200 dark:border-zinc-800 h-9 text-xs flex-1 sm:w-36"
                title={t('filter_from_date')}
              />
              <span className="text-zinc-400">-</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-background border-zinc-200 dark:border-zinc-800 h-9 text-xs flex-1 sm:w-36"
                title={t('filter_to_date')}
              />
            </div>

            {/* Filter Type */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full sm:w-40 bg-background border border-zinc-200 dark:border-zinc-800 rounded-md text-xs px-3 py-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-primary h-9"
              >
                <option value="all">{t('all_types')}</option>
                <option value="sales">{t('type_sales')}</option>
                <option value="purchase">{t('type_purchase')}</option>
                <option value="expense">{t('type_expense')}</option>
                <option value="income">{t('type_income')}</option>
                <option value="operational">{t('type_operational')}</option>
                <option value="manual">{t('type_manual')}</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('loading_transactions')}</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Receipt className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h3 className="text-md font-semibold text-zinc-700 dark:text-zinc-300">
                {t('no_transactions_found')}
              </h3>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">
                {t('no_transactions_found_desc')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl bg-background/30">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    <TableHead className="w-[100px]">{t('table_date')}</TableHead>
                    <TableHead className="w-[120px]">{t('table_ref_no')}</TableHead>
                    <TableHead className="w-[100px]">{t('table_type')}</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead>{t('table_desc')}</TableHead>
                    <TableHead className="text-right w-[150px]">{t('table_total_amount')}</TableHead>
                    <TableHead className="text-center w-[80px]">{t('table_actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((tx) => (
                    <TableRow 
                      key={tx.id}
                      className="cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
                      onClick={() => handleViewDetail(tx.id)}
                    >
                      <TableCell className="font-medium text-xs font-mono whitespace-nowrap">
                        {tx.transaction_date}
                      </TableCell>
                      <TableCell className="font-semibold text-xs text-primary font-mono whitespace-nowrap">
                        {tx.reference_no || '-'}
                      </TableCell>
                      <TableCell>
                        {getTxTypeBadge(tx.transaction_type)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(tx.status)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm font-medium">
                        {tx.description}
                      </TableCell>
                      <TableCell className="text-right font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                        {formatRp(Number(tx.total_amount))}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {tx.status === 'draft' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  title={t('tooltip_post_journal')}
                                  className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('confirm_title_post_journal')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('confirm_desc_post_journal')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handlePost(tx.id)} className="bg-emerald-600 hover:bg-emerald-700">
                                    {t('btn_post_now')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {tx.status === 'posted' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  title={t('btn_unpost_journal')}
                                  className="h-8 w-8 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('confirm_title_unpost_journal')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('confirm_desc_unpost_journal')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleUnpost(tx.id)} className="bg-orange-600 hover:bg-orange-700">
                                    {t('btn_unpost_journal')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleViewDetail(tx.id)}
                            title={t('view_journal_detail')}
                            className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/5"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
<PaginationControls totalItems={filteredTransactions.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={setRowsPerPage} />

            </div>
          )}
        </CardContent>
        {!loading && filteredTransactions.length > 0 && (
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end items-center gap-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              {t('show_rows')}
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-background border border-zinc-200 dark:border-zinc-800 rounded-md text-xs px-2 py-1 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-primary h-8"
            >
              <option value={20}>{t('rows_count', { count: 20 })}</option>
              <option value={50}>{t('rows_count', { count: 50 })}</option>
              <option value={100}>{t('rows_count', { count: 100 })}</option>
              <option value={250}>{t('rows_count', { count: 250 })}</option>
            </select>
          </div>
        )}
      </Card>

      {/* Transaction Detail Dialog Extracted */}
      <TransactionDetailDialog 
        txId={detailTxId}
        isOpen={detailOpen}
        onOpenChange={setDetailOpen}
        onSuccess={loadTransactions}
      />
    </div>
  );
}
