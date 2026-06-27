import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient } from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
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
  const { t, i18n } = useTranslation();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [fromDate, setFromDate]         = useState(formatDateForInput(new Date('2024-01-01')));
  const [toDate, setToDate]             = useState(formatDateForInput(new Date()));
  const [pageSize, setPageSize]         = useState(50);

  // Detail dialog state
  const [selectedTx, setSelectedTx]       = useState<Transaction | null>(null);
  const [detailOpen, setDetailOpen]       = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isEditing, setIsEditing]         = useState(false);
  const [editItems, setEditItems]         = useState<any[]>([]);

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

  const handleViewDetail = useCallback(async (txId: number) => {
    setLoadingDetail(true);
    setDetailOpen(true);
    setIsEditing(false);
    try {
      const data = await fetchClient(`/finance/transactions/${txId}`);
      setSelectedTx(data);
    } catch (err: any) {
      toast.error(t('toast_err_load_journal_detail', { error: err.message || err }));
      setDetailOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  }, [t]);

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

  const startEditing = useCallback(() => {
    if (!selectedTx) return;
    setEditItems(selectedTx.inventory_logs.map((log: any) => ({
      name:         log.product?.name || '',
      qty:          Number(log.quantity),
      unit:         log.product?.unit || 'pcs',
      unit_price:   Number(log.price_per_unit),
      total:        Number(log.quantity) * Number(log.price_per_unit),
      contact_name: log.contact?.name || '',
    })));
    setIsEditing(true);
  }, [selectedTx]);

  const updateEditItem = useCallback((index: number, field: string, value: any) => {
    setEditItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'qty' || field === 'unit_price') {
        next[index].total = Number(next[index].qty) * Number(next[index].unit_price);
      }
      return next;
    });
  }, []);

  const saveEditItems = useCallback(async () => {
    if (!selectedTx) return;
    setLoadingDetail(true);
    try {
      const newTotal = editItems.reduce((acc, item) => acc + Number(item.total), 0);
      await fetchClient(`/finance/transactions/${selectedTx.id}`, {
        method: 'PUT',
        body: JSON.stringify({ description: selectedTx.description, total_amount: newTotal, items: editItems }),
      });
      toast.success(t('toast_success_save_store'));
      setIsEditing(false);
      handleViewDetail(selectedTx.id);
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan perubahan');
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedTx, editItems, t, handleViewDetail, loadTransactions]);

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
                  {filteredTransactions.map((tx) => (
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

      {/* Transaction Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto border-zinc-200 dark:border-zinc-800 p-6">
          <DialogHeader className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <DialogTitle className="text-xl font-bold flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span>{t('dialog_detail_title')}</span>
                {selectedTx && getStatusBadge(selectedTx.status)}
              </div>
              <div className="flex items-center gap-2">
                {selectedTx && selectedTx.status === 'draft' && !isEditing && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('btn_delete_journal')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('confirm_title_delete_journal')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('confirm_desc_delete_journal')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(selectedTx.id)} className="bg-rose-600 hover:bg-rose-700">
                            {t('btn_delete_journal')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Button size="sm" variant="outline" onClick={startEditing} className="h-8 gap-2">
                      <Edit2 className="w-3.5 h-3.5" />
                      {t('btn_edit_items')}
                    </Button>
                  </>
                )}
                {selectedTx && getTxTypeBadge(selectedTx.transaction_type)}
              </div>
            </DialogTitle>
          </DialogHeader>

          {loadingDetail || !selectedTx ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('dialog_loading')}</p>
            </div>
          ) : (
            <div className="space-y-6 pt-4">
              {/* Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-150 dark:border-zinc-800">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <CalendarDays className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_date')}:</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{selectedTx.transaction_date}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <Receipt className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_ref_no')}:</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100 font-bold">{selectedTx.reference_no || '-'}</span>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <Clock className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_created')}:</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{formatDateTime(selectedTx.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 text-xs">
                    <User2 className="w-4 h-4 text-primary/70" />
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_total_amount')}:</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-extrabold text-sm">{formatRp(Number(selectedTx.total_amount))}</span>
                  </div>
                </div>
                {/* Menampilkan Supplier jika ada inventory_logs */}
                {(() => {
                  const contactLog = selectedTx.inventory_logs?.find((l: any) => l.contact);
                  if (!contactLog?.contact) return null;
                  return (
                    <div className="col-span-1 md:col-span-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                      <div className="flex items-center gap-2.5 text-xs">
                        <Users className="w-4 h-4 text-primary/70" />
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{t('label_supplier_customer')}:</span>
                        <span className="text-zinc-900 dark:text-zinc-100 font-bold">{contactLog.contact.name}</span>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 uppercase">
                          {contactLog.contact.contact_type}
                        </Badge>
                      </div>
                    </div>
                  );
                })()}
                <div className="col-span-1 md:col-span-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('label_description')}:</p>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-1 bg-background p-2.5 rounded border border-zinc-100 dark:border-zinc-850">
                    {selectedTx.description}
                  </p>
                </div>
              </div>

              {/* 2. Inventory Logs Table (Real Data) */}
              {selectedTx.inventory_logs && selectedTx.inventory_logs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-md font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-primary" />
                      {t('inventory_detail_title')}
                    </h3>
                    {isEditing && (
                      <Button size="sm" onClick={saveEditItems} disabled={loadingDetail} className="h-8 gap-2 bg-emerald-600 hover:bg-emerald-700">
                        <Save className="w-3.5 h-3.5" />
                        {t('btn_save_changes')}
                      </Button>
                    )}
                  </div>
                  <div className="overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <Table>
                      <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                        <TableRow>
                          <TableHead>{t('column_item_name')}</TableHead>
                          <TableHead className="text-right w-[100px]">{t('column_quantity')}</TableHead>
                          <TableHead className="text-right w-[150px]">{t('column_unit_price')}</TableHead>
                          <TableHead className="text-right w-[150px]">{t('column_subtotal')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!isEditing ? selectedTx.inventory_logs.map((log: any, index: number) => (
                          <TableRow key={index} className="hover:bg-zinc-50/20 dark:hover:bg-zinc-900/10">
                            <TableCell className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                              {log.product?.name || 'Unknown Product'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {log.quantity} {log.product?.unit}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatRp(Number(log.price_per_unit))}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">
                              {formatRp(Number(log.quantity) * Number(log.price_per_unit))}
                            </TableCell>
                          </TableRow>
                        )) : editItems.map((item: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Input 
                                value={item.name} 
                                onChange={(e) => updateEditItem(index, 'name', e.target.value)}
                                className="h-8 text-xs bg-background border-zinc-200"
                              />
                            </TableCell>
                            <TableCell>
                              <Input 
                                type="number"
                                value={item.qty} 
                                onChange={(e) => updateEditItem(index, 'qty', e.target.value)}
                                className="h-8 text-xs text-right bg-background border-zinc-200 font-mono"
                              />
                            </TableCell>
                            <TableCell>
                              <Input 
                                type="number"
                                value={item.unit_price} 
                                onChange={(e) => updateEditItem(index, 'unit_price', e.target.value)}
                                className="h-8 text-xs text-right bg-background border-zinc-200 font-mono"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">
                              {formatRp(item.total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* 3. Raw Journal Logs (Intuitive Flow) */}
              {selectedTx.entries && selectedTx.entries.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-md font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    {t('raw_journal_logs_title')}
                  </h3>
                  <div className="space-y-2 bg-zinc-50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    {selectedTx.entries.map((entry: any, index: number) => {
                      const account = entry.account;
                      const type = account?.account_type;
                      const isDebit = Number(entry.debit) > 0;
                      const amount = isDebit ? entry.debit : entry.credit;
                      
                      let isIncrease = false;
                      if (['asset', 'expense'].includes(type)) {
                        isIncrease = isDebit;
                      } else {
                        isIncrease = !isDebit;
                      }

                      return (
                        <div key={index} className="flex items-center justify-between text-sm py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                          <div className="flex items-center gap-2">
                            <span>{isIncrease ? '🟢' : '🔴'}</span>
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              [{account?.name || 'Unknown Account'}]
                            </span>
                            <span className="text-zinc-500">
                              {isIncrease ? 'bertambah' : 'berkurang'}
                            </span>
                          </div>
                          <div className="font-mono text-xs flex items-center gap-2">
                            <span className={cn("font-bold", isIncrease ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                              {isIncrease ? '+' : '-'}{formatRp(Number(amount))}
                            </span>
                            <span className="text-zinc-400 italic">
                              ({isDebit ? 'Debit' : 'Kredit'})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
